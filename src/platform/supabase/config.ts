type SupabaseBrowserConfig = {
  url: string;
  publishableKey: string;
};

// Supabase publishable keys are intentionally safe to expose in browser
// bundles. Keeping the production public config here prevents a valid build
// from becoming unusable when a deployment runner omits optional Vite vars.
export const defaultSupabaseBrowserConfig = Object.freeze<SupabaseBrowserConfig>({
  url: "https://shflnrznleodviqphvfg.supabase.co",
  publishableKey: "sb_publishable_KPcEaMiQQtdmBKCS3X5d-Q_Qho96l0p",
});

const normalize = (value: string | undefined) => value?.trim() || undefined;

export const resolveSupabaseBrowserConfig = (
  configured: Partial<SupabaseBrowserConfig>,
): Readonly<SupabaseBrowserConfig> => Object.freeze({
  url: normalize(configured.url) ?? defaultSupabaseBrowserConfig.url,
  publishableKey:
    normalize(configured.publishableKey) ??
    defaultSupabaseBrowserConfig.publishableKey,
});

export const isOpaquePublishableKey = (value: string) =>
  value.startsWith("sb_publishable_");

const decodeJwtPayload = (value: string): Record<string, unknown> | null => {
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const assertSafeBrowserSupabaseKey = (value: string): void => {
  if (!value || value.startsWith("sb_secret_")) {
    throw new Error("A Supabase publishable key is required in browser code.");
  }
  const payload = decodeJwtPayload(value);
  if (payload?.role === "service_role") {
    throw new Error("A Supabase service-role key must never be used in browser code.");
  }
};

export const supabaseBrowserConfig = resolveSupabaseBrowserConfig({
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as
    | string
    | undefined,
});
