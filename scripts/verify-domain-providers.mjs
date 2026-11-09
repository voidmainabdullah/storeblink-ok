import { readFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";

const parseEnv = (source) => Object.fromEntries(
  source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      return [
        line.slice(0, separator).trim(),
        line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2"),
      ];
    }),
);

const envPath = process.argv[2] ?? ".env";
const env = {
  ...parseEnv(await readFile(envPath, "utf8")),
  ...process.env,
};

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
};

const fetchJson = async (url, init = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = await response.json().catch(() => null);
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
};

const platformHosts = (env.VITE_PLATFORM_HOSTS ?? "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const expectedZone = env.DOMAIN_PLATFORM_ZONE?.trim().toLowerCase()
  || platformHosts.find((hostname) => !hostname.startsWith("www.") && !hostname.startsWith("app."));

if (!expectedZone) {
  check("platform zone", false, "Set DOMAIN_PLATFORM_ZONE or VITE_PLATFORM_HOSTS.");
}

const configuredOrigins = (env.APP_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const validOrigins = configuredOrigins.length > 0 && configuredOrigins.every((value) => {
  try {
    const url = new URL(value);
    return url.origin === value && ["https:", "http:"].includes(url.protocol);
  } catch {
    return false;
  }
});
check(
  "allowed origins",
  validOrigins,
  validOrigins ? `${configuredOrigins.length} exact origin(s) configured.` : "Use exact URL origins without paths or trailing slashes.",
);

const enabledTransactionFlags = [
  "HOSTINGER_INCLUDED_DOMAIN_CLAIM_ENABLED",
  "HOSTINGER_PAID_DOMAIN_PURCHASE_ENABLED",
  "HOSTINGER_INCLUDED_TRANSFER_ENABLED",
].filter((name) => env[name]?.trim().toLowerCase() === "true");
check(
  "registrar safety flags",
  enabledTransactionFlags.length === 0,
  enabledTransactionFlags.length === 0
    ? "All state-changing registrar workflows are disabled."
    : `Disable unaccepted workflows: ${enabledTransactionFlags.join(", ")}.`,
);

const hostingerToken = env.HOSTINGER_API_TOKEN?.trim();
if (!hostingerToken) {
  check("Hostinger authentication", false, "HOSTINGER_API_TOKEN is missing.");
} else {
  const headers = {
    Authorization: `Bearer ${hostingerToken}`,
    "Content-Type": "application/json",
  };
  try {
    const availability = await fetchJson(
      "https://developers.hostinger.com/api/domains/v1/availability",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          domain: "storeblink-readiness-check",
          tlds: ["com"],
          with_alternatives: false,
        }),
      },
    );
    check(
      "Hostinger domain search",
      availability.response.ok && Array.isArray(availability.body),
      availability.response.ok ? "Availability API is reachable." : `Provider returned HTTP ${availability.response.status}.`,
    );

    const catalog = await fetchJson(
      "https://developers.hostinger.com/api/billing/v1/catalog?category=DOMAIN&name=.COM*",
      { headers },
    );
    check(
      "Hostinger catalog",
      catalog.response.ok && Array.isArray(catalog.body),
      catalog.response.ok ? "Domain catalog API is reachable." : `Provider returned HTTP ${catalog.response.status}.`,
    );
  } catch (error) {
    check("Hostinger provider", false, error instanceof Error ? error.message : "Network request failed.");
  }
}

const cloudflareToken = env.CLOUDFLARE_API_TOKEN?.trim();
const cloudflareZoneId = env.CLOUDFLARE_ZONE_ID?.trim();
if (!cloudflareToken || !cloudflareZoneId) {
  check("Cloudflare configuration", false, "CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID are required.");
} else {
  const headers = { Authorization: `Bearer ${cloudflareToken}` };
  const baseUrl = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(cloudflareZoneId)}`;
  try {
    const zone = await fetchJson(baseUrl, { headers });
    const zoneName = typeof zone.body?.result?.name === "string"
      ? zone.body.result.name.toLowerCase()
      : null;
    check(
      "Cloudflare SaaS zone",
      zone.response.ok && zone.body?.success === true && zoneName === expectedZone,
      zone.response.ok && zoneName === expectedZone
        ? "Zone ID matches the configured platform zone."
        : zone.response.ok
          ? "Zone ID belongs to a different zone."
          : `Provider returned HTTP ${zone.response.status}.`,
    );

    const customHostnames = await fetchJson(`${baseUrl}/custom_hostnames?per_page=5`, { headers });
    check(
      "Cloudflare Custom Hostnames permission",
      customHostnames.response.ok && customHostnames.body?.success === true,
      customHostnames.response.ok
        ? "Custom Hostnames API is authorized."
        : `Provider returned HTTP ${customHostnames.response.status}; grant Zone SSL and Certificates Edit.`,
    );

    const fallback = await fetchJson(`${baseUrl}/custom_hostnames/fallback_origin`, { headers });
    const fallbackActive = fallback.response.ok
      && fallback.body?.success === true
      && fallback.body?.result?.status === "active";
    check(
      "Cloudflare fallback origin",
      fallbackActive,
      fallbackActive
        ? "Fallback origin is active."
        : fallback.response.ok
          ? `Fallback origin status is ${fallback.body?.result?.status ?? "unknown"}.`
          : `Provider returned HTTP ${fallback.response.status}.`,
    );
  } catch (error) {
    check("Cloudflare provider", false, error instanceof Error ? error.message : "Network request failed.");
  }
}

const cnameTarget = env.CUSTOM_HOSTNAME_CNAME_TARGET?.trim().toLowerCase();
if (!cnameTarget) {
  check("managed CNAME target", false, "CUSTOM_HOSTNAME_CNAME_TARGET is missing.");
} else {
  try {
    await lookup(cnameTarget);
    check("managed CNAME target", true, "Target resolves publicly.");
  } catch {
    check("managed CNAME target", false, "Target does not resolve publicly.");
  }
}

for (const result of results) {
  console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name}: ${result.detail}`);
}

const failures = results.filter((result) => !result.ok);
if (failures.length > 0) {
  console.error(`Domain provider readiness failed (${failures.length} check${failures.length === 1 ? "" : "s"}).`);
  process.exit(1);
}

console.log("Domain provider readiness passed. Transaction flags remain disabled pending acceptance tests.");
