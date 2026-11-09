import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const policy = JSON.parse(
  readFileSync(resolve(root, "config", "production-audit-policy.json"), "utf8"),
);
const expiry = new Date(`${policy.expiresOn}T23:59:59.999Z`);

if (!Number.isFinite(expiry.getTime()) || Date.now() > expiry.getTime()) {
  console.error(`Production audit policy expired on ${policy.expiresOn}. Re-audit dependencies before release.`);
  process.exit(1);
}

const collectSourceFiles = (directory) =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return collectSourceFiles(path);
    return /\.(?:ts|tsx|js|jsx|mjs)$/.test(entry) ? [path] : [];
  });

const prohibitedRouterServerApis = [
  /from\s+["']react-router\/(?:server|rsc)/,
  /\bcreateRequestHandler\b/,
  /\bServerRouter\b/,
  /\bRSCStaticRouter\b/,
  /\bunstable_(?:RSC|ServerAction)/,
];
const serverApiHits = collectSourceFiles(resolve(root, "src")).flatMap((path) => {
  const source = readFileSync(path, "utf8");
  return prohibitedRouterServerApis.some((pattern) => pattern.test(source))
    ? [path.replace(`${root}\\`, "")]
    : [];
});

if (serverApiHits.length > 0) {
  console.error(`The React Router RSC audit exception is invalid because server APIs were found in: ${serverApiHits.join(", ")}`);
  process.exit(1);
}

const installedRouter = JSON.parse(
  readFileSync(resolve(root, "node_modules", "react-router", "package.json"), "utf8"),
).version;
const routerPolicy = policy.exceptions["react-router"];
if (installedRouter !== routerPolicy.version) {
  console.error(`React Router version ${installedRouter} does not match audited policy version ${routerPolicy.version}.`);
  process.exit(1);
}

const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error("Production audit must run through npm so the npm CLI path is available.");
  process.exit(1);
}
const audit = spawnSync(process.execPath, [npmCli, "audit", "--omit=dev", "--json"], {
  cwd: root,
  encoding: "utf8",
});
if (audit.error || !audit.stdout?.trim()) {
  console.error("npm audit could not be executed.", audit.error ?? audit.stderr);
  process.exit(1);
}
let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  console.error("npm audit returned an invalid JSON report.");
  console.error(audit.stdout);
  process.exit(1);
}
const vulnerabilities = report.vulnerabilities ?? {};
const routerVulnerability = vulnerabilities["react-router"];
const allowedUrls = new Set(
  routerPolicy.advisories.map((advisory) => `https://github.com/advisories/${advisory}`),
);
const routerAdvisories = Array.isArray(routerVulnerability?.via)
  ? routerVulnerability.via.filter((entry) => entry && typeof entry === "object")
  : [];
const unexpectedRouterAdvisories = routerAdvisories.filter(
  (entry) => !allowedUrls.has(entry.url),
);
const unexpectedPackages = Object.keys(vulnerabilities).filter(
  (name) => name !== "react-router" && name !== "react-router-dom",
);
const domVia = vulnerabilities["react-router-dom"]?.via ?? [];
const domOnlyReferencesRouter =
  Array.isArray(domVia) && domVia.every((entry) => entry === "react-router");

if (
  unexpectedPackages.length > 0 ||
  unexpectedRouterAdvisories.length > 0 ||
  (vulnerabilities["react-router-dom"] && !domOnlyReferencesRouter)
) {
  console.error("Production dependency audit failed with advisories outside the reviewed exception.");
  console.error(audit.stdout);
  process.exit(1);
}

if (Object.keys(vulnerabilities).length === 0) {
  console.log("Production dependency audit passed with no vulnerabilities.");
} else {
  console.log(
    `Production dependency audit passed with one reviewed SPA-inapplicable advisory (${routerPolicy.advisories.join(", ")}); exception expires ${policy.expiresOn}.`,
  );
}
