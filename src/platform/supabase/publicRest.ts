import { assertSafeBrowserSupabaseKey, supabaseBrowserConfig } from "./config";

export class PublicSupabaseRestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "PublicSupabaseRestError";
  }
}

export type PublicRestResult<T> = Readonly<{
  data: T;
  headers: Headers;
}>;

export const publicSupabaseRequest = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<PublicRestResult<T>> => {
  const { url, publishableKey } = supabaseBrowserConfig;
  if (!url || !publishableKey) throw new Error("Public storefront configuration is missing.");
  assertSafeBrowserSupabaseKey(publishableKey);
  const headers = new Headers(init.headers);
  headers.set("apikey", publishableKey);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${url}/rest/v1/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers,
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) as unknown : null;
  if (!response.ok) {
    const details = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
    throw new PublicSupabaseRestError(
      typeof details.message === "string" ? details.message : "Public storefront request failed.",
      response.status,
      typeof details.code === "string" ? details.code : undefined,
    );
  }
  return { data: payload as T, headers: response.headers };
};

export const publicSupabaseRpc = <T>(name: string, args: Record<string, unknown>) =>
  publicSupabaseRequest<T>(`rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
