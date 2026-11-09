import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { throwIfSupabaseError } from "@/platform/supabase/normalizeError";

const staffRoleSchema = z.enum(["support", "operations", "infra_admin", "security_admin"]);

const platformStaffAccessSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  role: staffRoleSchema,
  active: z.literal(true),
});

const platformDomainCountsSchema = z.object({
  stores: z.coerce.number().int().nonnegative(),
  domains: z.coerce.number().int().nonnegative(),
  activeDomains: z.coerce.number().int().nonnegative(),
  actionRequiredDomains: z.coerce.number().int().nonnegative(),
  pendingSslDomains: z.coerce.number().int().nonnegative(),
  pendingVerifications: z.coerce.number().int().nonnegative(),
  queuedJobs: z.coerce.number().int().nonnegative(),
  failedJobs: z.coerce.number().int().nonnegative(),
  pendingPurchases: z.coerce.number().int().nonnegative(),
  activeTransfers: z.coerce.number().int().nonnegative(),
  connectedGoogleAccounts: z.coerce.number().int().nonnegative(),
});

const platformDomainOverviewSchema = z.object({
  generatedAt: z.string(),
  staffRole: staffRoleSchema,
  counts: platformDomainCountsSchema,
  recentDomains: z.array(z.object({
    id: z.string().uuid(),
    hostname: z.string(),
    storeId: z.string().uuid(),
    storeName: z.string(),
    status: z.string(),
    dnsStatus: z.string(),
    sslStatus: z.string(),
    updatedAt: z.string(),
  })),
});

export type PlatformStaffAccess = Readonly<z.infer<typeof platformStaffAccessSchema>>;
export type PlatformDomainOverview = Readonly<z.infer<typeof platformDomainOverviewSchema>>;

export class PlatformAdminService {
  private rpc(name: string): Promise<{ data: unknown; error: unknown }> {
    return supabase.rpc(name as never) as unknown as Promise<{
      data: unknown;
      error: unknown;
    }>;
  }

  async getAccess(): Promise<PlatformStaffAccess> {
    const result = await this.rpc("get_platform_staff_access");
    throwIfSupabaseError(result.error, "Loading platform staff access failed");
    return platformStaffAccessSchema.parse(result.data);
  }

  async getDomainOverview(): Promise<PlatformDomainOverview> {
    const result = await this.rpc("get_platform_domain_overview");
    throwIfSupabaseError(result.error, "Loading platform domain operations failed");
    return platformDomainOverviewSchema.parse(result.data);
  }
}

export const platformAdminService = new PlatformAdminService();

export const platformAdminQueryKeys = {
  access: (userId: string) => ["platform-admin", "access", userId] as const,
  domainOverview: ["platform-admin", "domain-overview"] as const,
};
