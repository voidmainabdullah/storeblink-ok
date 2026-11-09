import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc },
}));

import { PlatformAdminService } from "./PlatformAdminService";

const USER_ID = "11111111-1111-4111-8111-111111111111";

describe("PlatformAdminService", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("loads only the current staff access projection", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        userId: USER_ID,
        email: "abdullahx.ext@gmail.com",
        role: "security_admin",
        active: true,
      },
      error: null,
    });

    const service = new PlatformAdminService();
    await expect(service.getAccess()).resolves.toMatchObject({
      userId: USER_ID,
      role: "security_admin",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_platform_staff_access");
  });

  it("validates the protected domain overview response", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        generatedAt: "2026-08-10T12:00:00.000Z",
        staffRole: "security_admin",
        counts: {
          stores: 1,
          domains: 0,
          activeDomains: 0,
          actionRequiredDomains: 0,
          pendingSslDomains: 0,
          pendingVerifications: 0,
          queuedJobs: 0,
          failedJobs: 0,
          pendingPurchases: 0,
          activeTransfers: 0,
          connectedGoogleAccounts: 0,
        },
        recentDomains: [],
      },
      error: null,
    });

    const service = new PlatformAdminService();
    await expect(service.getDomainOverview()).resolves.toMatchObject({
      staffRole: "security_admin",
      counts: { stores: 1, domains: 0 },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("get_platform_domain_overview");
  });

  it("preserves database authorization errors", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "Platform staff access required" },
    });

    const service = new PlatformAdminService();
    await expect(service.getAccess()).rejects.toMatchObject({
      code: "42501",
      message: expect.stringContaining("Platform staff access required"),
    });
  });
});
