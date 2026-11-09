import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { AuthPlatformError, mapAuthError } from "./auth.errors";
import {
  STORE_CAPABILITIES,
  type DashboardBootstrap,
  type StoreCapability,
} from "./auth.types";

const capabilitySchema = z.enum(STORE_CAPABILITIES);
const bootstrapSchema = z.object({
  profile: z.object({
    id: z.string().uuid(),
    full_name: z.string().nullable().optional(),
    business_name: z.string().nullable().optional(),
    onboarding_completed: z.boolean().optional(),
  }),
  store: z.object({
    id: z.string().uuid(),
    name: z.string(),
    handle: z.string(),
    status: z.enum(["draft", "published", "suspended", "archived"]),
    currency: z.string(),
    locale: z.string(),
    timezone: z.string(),
  }).nullable(),
  membership: z.object({
    store_id: z.string().uuid(),
    user_id: z.string().uuid(),
    role: z.enum(["owner", "admin", "designer", "catalog_manager", "support", "viewer"]),
    status: z.enum(["invited", "active", "suspended", "revoked"]),
  }).nullable(),
  capabilities: z.array(capabilitySchema),
});

type CacheEntry = { expiresAt: number; value: DashboardBootstrap };

export class PermissionService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly ttlMs = 30_000,
  ) {}

  async getDashboardBootstrap(
    userId: string,
    preferredStoreId?: string | null,
    force = false,
  ): Promise<DashboardBootstrap> {
    const key = `${userId}:${preferredStoreId ?? "current"}`;
    const cached = this.cache.get(key);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

    const result = await this.client.rpc("get_dashboard_bootstrap", {
      p_store_id: preferredStoreId ?? undefined,
    });
    if (result.error) throw mapAuthError(result.error);

    const parsed = bootstrapSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new AuthPlatformError("STORE_ACCESS_DENIED", { cause: parsed.error });
    }
    if (parsed.data.membership && parsed.data.membership.status !== "active") {
      throw new AuthPlatformError("STORE_MEMBERSHIP_REVOKED");
    }

    const value: DashboardBootstrap = {
      profile: {
        id: parsed.data.profile.id,
        fullName: parsed.data.profile.full_name ?? null,
        businessName: parsed.data.profile.business_name ?? null,
        onboardingCompleted: parsed.data.profile.onboarding_completed ?? false,
      },
      store: parsed.data.store
        ? {
            id: parsed.data.store.id,
            name: parsed.data.store.name,
            handle: parsed.data.store.handle,
            status: parsed.data.store.status,
            currency: parsed.data.store.currency,
            locale: parsed.data.store.locale,
            timezone: parsed.data.store.timezone,
          }
        : null,
      membership: parsed.data.membership
        ? {
            storeId: parsed.data.membership.store_id,
            userId: parsed.data.membership.user_id,
            role: parsed.data.membership.role,
            status: parsed.data.membership.status,
          }
        : null,
      capabilities: parsed.data.capabilities,
    };
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    return value;
  }

  clear(userId?: string): void {
    if (!userId) {
      this.cache.clear();
      return;
    }
    [...this.cache.keys()]
      .filter((key) => key.startsWith(`${userId}:`))
      .forEach((key) => this.cache.delete(key));
  }

  can(bootstrap: DashboardBootstrap | null, capability: StoreCapability): boolean {
    return Boolean(
      bootstrap?.membership?.status === "active" &&
      bootstrap.capabilities.includes(capability),
    );
  }

  require(bootstrap: DashboardBootstrap | null, capability: StoreCapability): void {
    if (!this.can(bootstrap, capability)) {
      throw new AuthPlatformError("STORE_ACCESS_DENIED");
    }
  }
}
