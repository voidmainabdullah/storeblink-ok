import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.110.6";
import { DomainApiError } from "./errors.ts";
import { requireUuid } from "./hostname.ts";

export type DomainRequestContext = {
  user: User;
  userClient: SupabaseClient;
  serviceClient: SupabaseClient;
  storeId: string;
};

const requireEnvironment = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new DomainApiError("SERVER_CONFIGURATION_ERROR", "Domain service is not configured.", 503);
  return value;
};

export const createDomainContext = async (
  request: Request,
  storeIdValue: unknown,
  requireAal2 = true,
): Promise<DomainRequestContext> => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new DomainApiError("AUTH_REQUIRED", "Sign in to manage domains.", 401);
  }
  const supabaseUrl = requireEnvironment("SUPABASE_URL");
  const anonKey = requireEnvironment("SUPABASE_ANON_KEY");
  const serviceKey = requireEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const storeId = requireUuid(storeIdValue, "storeId");
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const token = authorization.slice("Bearer ".length);
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData.user) {
    throw new DomainApiError("AUTH_REQUIRED", "Your session is no longer valid.", 401);
  }
  const { data: allowed, error: authorizationError } = await userClient.rpc(
    "authorize_domain_management",
    { p_store_id: storeId, p_require_aal2: requireAal2 },
  );
  if (authorizationError || allowed !== true) {
    if (requireAal2 && !authorizationError) {
      const { data: allowedAtAal1, error: aal1AuthorizationError } = await userClient.rpc(
        "authorize_domain_management",
        { p_store_id: storeId, p_require_aal2: false },
      );
      if (!aal1AuthorizationError && allowedAtAal1 === true) {
        throw new DomainApiError(
          "AAL2_REQUIRED",
          "Complete two-step verification before managing domains.",
          403,
          "complete_mfa",
        );
      }
    }
    throw new DomainApiError(
      "DOMAIN_ACCESS_DENIED",
      "You do not have access to this store's domains.",
      403,
    );
  }
  return { user: userData.user, userClient, serviceClient, storeId };
};

export const isCronRequest = (request: Request): boolean => {
  const expected = Deno.env.get("DOMAIN_CRON_SECRET") ?? "";
  const supplied = request.headers.get("x-storeblink-cron-secret") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index);
  }
  return difference === 0;
};

export const createServiceClient = (): SupabaseClient =>
  createClient(
    requireEnvironment("SUPABASE_URL"),
    requireEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
