export class DomainValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainValidationError";
  }
}

const reservedHosts = new Set(["localhost", "example.com", "example.net", "example.org"]);
const reservedSuffixes = [".localhost", ".local", ".internal", ".invalid", ".test"];

export const normalizeDomainHostname = (input: string): string => {
  const candidate = input.trim();
  if (!candidate) throw new DomainValidationError("Enter a domain name.");
  let parsed: URL;
  try {
    parsed = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  } catch {
    throw new DomainValidationError("Enter a valid domain name.");
  }
  if (
    parsed.username ||
    parsed.password ||
    parsed.port ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new DomainValidationError(
      "Enter only the domain name without a path, port, query, or credentials.",
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
    throw new DomainValidationError("Enter a public domain name.");
  }
  const invalidLabel = hostname.split(".").some(
    (label) =>
      !label ||
      label.length > 63 ||
      label.startsWith("-") ||
      label.endsWith("-") ||
      !/^[a-z0-9-]+$/.test(label),
  );
  if (invalidLabel) throw new DomainValidationError("Enter a valid domain name.");
  return hostname;
};

export const normalizeDomainSearchName = (input: string): string => {
  const value = input.trim().toLowerCase();
  const withoutExtension = value.split(".")[0];
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(withoutExtension)) {
    throw new DomainValidationError(
      "Use 3-63 letters, numbers, or hyphens without a domain extension.",
    );
  }
  return withoutExtension;
};
