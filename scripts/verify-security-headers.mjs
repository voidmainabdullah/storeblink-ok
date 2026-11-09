import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const headerPath = resolve(process.cwd(), "public", "_headers");
const source = readFileSync(headerPath, "utf8");

const requiredHeaders = [
  "Content-Security-Policy:",
  "Strict-Transport-Security:",
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy:",
  "Permissions-Policy:",
  "X-Frame-Options: DENY",
];

const requiredCspDirectives = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "connect-src 'self' data: https://challenges.cloudflare.com https://cloudflareinsights.com",
  "frame-src https://challenges.cloudflare.com",
  "form-action 'self'",
  "upgrade-insecure-requests",
];

const missing = [...requiredHeaders, ...requiredCspDirectives].filter(
  (entry) => !source.includes(entry),
);

if (missing.length > 0) {
  console.error(`Security header verification failed. Missing: ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Security header verification passed (${requiredHeaders.length} headers, ${requiredCspDirectives.length} CSP directives).`);
