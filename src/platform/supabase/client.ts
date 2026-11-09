import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  assertSafeBrowserSupabaseKey,
  isOpaquePublishableKey,
  supabaseBrowserConfig,
} from "./config";

let browserClient: SupabaseClient<Database> | null = null;

const createSupabaseFetch = (supabaseKey: string): typeof fetch =>
  (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // Opaque publishable keys are API keys, not JWT bearer tokens.
    if (
      isOpaquePublishableKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };

export const getSupabaseBrowserClient = (): SupabaseClient<Database> => {
  if (browserClient) return browserClient;
  const { url, publishableKey } = supabaseBrowserConfig;
  if (!url || !publishableKey) {
    throw new Error("Supabase browser configuration is missing.");
  }
  assertSafeBrowserSupabaseKey(publishableKey);

  browserClient = createClient<Database>(
    url,
    publishableKey,
    {
      global: { fetch: createSupabaseFetch(publishableKey) },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce",
        ...(typeof window !== "undefined" ? { storage: window.localStorage } : {}),
      },
    },
  );
  return browserClient;
};

export const hasCreatedSupabaseBrowserClient = () => browserClient !== null;

// Compatibility facade. Importing this value is side-effect free; the single
// client is created only when a Supabase operation is actually requested.
export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, property) {
    const client = getSupabaseBrowserClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export { assertSafeBrowserSupabaseKey, supabaseBrowserConfig } from "./config";
