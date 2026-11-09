const invalidCanonical = (message: string): never => {
  throw new Error(`INVALID_CANONICAL: ${message}`);
};

const originCache = new Map<string, string>();

export const normalizeCanonicalOrigin = (value: string): string => {
  const cached = originCache.get(value);
  if (cached) return cached;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalidCanonical("The primary origin is not a URL.");
  }
  if (url.protocol !== "https:") return invalidCanonical("HTTPS is required.");
  if (url.username || url.password || url.search || url.hash) {
    return invalidCanonical("Credentials, query strings, and fragments are not allowed.");
  }
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
  const normalized = `${url.origin}${path}`;
  if (originCache.size >= 100) originCache.delete(originCache.keys().next().value!);
  originCache.set(value, normalized);
  originCache.set(normalized, normalized);
  return normalized;
};

export const canonicalUrlForRoute = (canonicalOrigin: string, route: string): string => {
  const origin = normalizeCanonicalOrigin(canonicalOrigin);
  if (!route.startsWith("/") || route.startsWith("//")) {
    return invalidCanonical("Resource routes must be root-relative.");
  }
  if (
    route.includes("?") || route.includes("#") || route.includes("\\") ||
    route.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    return invalidCanonical("Resource routes cannot contain queries, fragments, or traversal.");
  }
  return route === "/" ? origin : `${origin}${route}`;
};

export class CanonicalUrlService {
  resolve(input: {
    canonicalOrigin: string;
    route: string;
    canonicalMode: "automatic" | "custom";
    customCanonicalUrl?: string | null;
  }): string {
    const automatic = canonicalUrlForRoute(input.canonicalOrigin, input.route);
    if (input.canonicalMode === "automatic") return automatic;
    if (!input.customCanonicalUrl) return invalidCanonical("Custom canonical URL is missing.");
    const custom = new URL(input.customCanonicalUrl);
    if (custom.protocol !== "https:" || custom.username || custom.password || custom.hash) {
      return invalidCanonical("Custom canonical URLs must be absolute HTTPS URLs.");
    }
    // URL serializes a bare origin with a trailing slash, while automatic root
    // canonicals intentionally use the normalized origin. Keep both modes on
    // the same representation so a self-canonical homepage remains eligible.
    return custom.pathname === "/" && !custom.search
      ? custom.origin
      : custom.toString();
  }

  isOwnedByPrimaryOrigin(url: string, canonicalOrigin: string): boolean {
    try {
      const normalizedOrigin = normalizeCanonicalOrigin(canonicalOrigin);
      return url === normalizedOrigin || url.startsWith(`${normalizedOrigin}/`);
    } catch {
      return false;
    }
  }
}

export const canonicalUrlService = new CanonicalUrlService();
