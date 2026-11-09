import { z } from "zod";
import { storefrontCache } from "@/platform/caching";
import { publicSupabaseRpc } from "@/platform/supabase/publicRest";

const domainResolutionSchema = z.object({
  storeId: z.string().uuid(),
  storeHandle: z.string().min(1),
  requestedHostname: z.string().min(1),
  primaryHostname: z.string().min(1),
  redirectRequired: z.boolean(),
});

export type PublicDomainResolution = z.infer<typeof domainResolutionSchema>;

const configuredPlatformHosts = new Set(
  String(import.meta.env.VITE_PLATFORM_HOSTS ?? "storeblink.com")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);

export const normalizeRequestHostname = (hostname: string) =>
  hostname.trim().toLowerCase().replace(/\.$/, "");

export const isPlatformHostname = (hostname: string): boolean => {
  const normalized = normalizeRequestHostname(hostname);
  return (
    (import.meta.env.DEV && (
      normalized === "localhost" ||
      normalized === "127.0.0.1" ||
      normalized === "::1"
    )) ||
    configuredPlatformHosts.has(normalized) ||
    (import.meta.env.DEV && (
      normalized.endsWith(".vercel.app") ||
      normalized.endsWith(".netlify.app") ||
      normalized.endsWith(".lovable.app")
    ))
  );
};

export class PublicDomainResolver {
  async resolve(hostname: string): Promise<PublicDomainResolution | null> {
    const normalized = normalizeRequestHostname(hostname);
    if (!normalized || isPlatformHostname(normalized)) return null;
    return storefrontCache.getOrLoad(
      `storefront:domain:${normalized}`,
      async () => {
        const response = await publicSupabaseRpc<unknown>(
          "resolve_public_storefront_by_domain",
          { p_hostname: normalized },
        );
        const parsed = domainResolutionSchema.safeParse(response.data);
        return parsed.success ? parsed.data : null;
      },
      { tags: [`storefront:domain:${normalized}`], ttlMs: 30_000 },
    );
  }
}

export const publicDomainResolver = new PublicDomainResolver();
