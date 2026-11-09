import { DomainApiError } from "./errors.ts";

const reservedSuffixes = [".localhost", ".local", ".internal", ".invalid", ".test"];
const reservedHosts = new Set(["localhost", "example.com", "example.net", "example.org"]);

export const normalizeHostname = (input: unknown): string => {
  if (typeof input !== "string") {
    throw new DomainApiError("INVALID_DOMAIN", "Enter a valid domain name.", 422);
  }
  const candidate = input.trim();
  if (!candidate || candidate.length > 2048) {
    throw new DomainApiError("INVALID_DOMAIN", "Enter a valid domain name.", 422);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  } catch {
    throw new DomainApiError("INVALID_DOMAIN", "Enter a valid domain name.", 422);
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new DomainApiError(
      "INVALID_DOMAIN",
      "Enter only the domain name without a path, port, query, or credentials.",
      422,
    );
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (
    hostname.length < 4 ||
    hostname.length > 253 ||
    !hostname.includes(".") ||
    !/^[a-z0-9.-]+$/.test(hostname) ||
    reservedHosts.has(hostname) ||
    reservedSuffixes.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new DomainApiError("INVALID_DOMAIN", "Enter a public domain name.", 422);
  }
  const labels = hostname.split(".");
  if (
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-") ||
        !/^[a-z0-9-]+$/.test(label),
    )
  ) {
    throw new DomainApiError("INVALID_DOMAIN", "Enter a valid domain name.", 422);
  }
  return hostname;
};

export const requireUuid = (input: unknown, field: string): string => {
  if (
    typeof input !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)
  ) {
    throw new DomainApiError("INVALID_REQUEST", `${field} is invalid.`, 422);
  }
  return input;
};
