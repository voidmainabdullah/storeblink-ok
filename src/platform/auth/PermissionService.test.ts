import { describe, expect, it, vi } from "vitest";
import { PermissionService } from "./PermissionService";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STORE_ID = "22222222-2222-4222-8222-222222222222";

const bootstrap = (role = "owner", status = "active", capabilities = ["theme.read", "theme.edit"]) => ({
  profile: {
    id: USER_ID,
    full_name: "Merchant",
    business_name: "Store",
    onboarding_completed: true,
  },
  store: {
    id: STORE_ID,
    name: "Store",
    handle: "store",
    status: "draft",
    currency: "USD",
    locale: "en",
    timezone: "UTC",
  },
  membership: { store_id: STORE_ID, user_id: USER_ID, role, status },
  capabilities,
});

describe("PermissionService", () => {
  it("caches a validated bootstrap and evaluates capabilities", async () => {
    const rpc = vi.fn(async () => ({ data: bootstrap(), error: null }));
    const service = new PermissionService({ rpc } as any, 30_000);
    const first = await service.getDashboardBootstrap(USER_ID, STORE_ID);
    const second = await service.getDashboardBootstrap(USER_ID, STORE_ID);

    expect(first).toEqual(second);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(service.can(first, "theme.edit")).toBe(true);
    expect(service.can(first, "billing.manage")).toBe(false);
  });

  it("keeps viewer authorization read-only", async () => {
    const service = new PermissionService({
      rpc: vi.fn(async () => ({
        data: bootstrap("viewer", "active", ["theme.read", "catalog.read", "orders.read"]),
        error: null,
      })),
    } as any);
    const value = await service.getDashboardBootstrap(USER_ID, STORE_ID);

    expect(service.can(value, "catalog.read")).toBe(true);
    expect(service.can(value, "catalog.edit")).toBe(false);
    expect(() => service.require(value, "catalog.edit")).toThrowError(
      expect.objectContaining({ code: "STORE_ACCESS_DENIED" }),
    );
  });

  it("rejects revoked membership state and maps server revocation errors", async () => {
    const revoked = new PermissionService({
      rpc: vi.fn(async () => ({ data: bootstrap("designer", "revoked"), error: null })),
    } as any);
    await expect(revoked.getDashboardBootstrap(USER_ID, STORE_ID)).rejects.toMatchObject({
      code: "STORE_MEMBERSHIP_REVOKED",
    });

    const denied = new PermissionService({
      rpc: vi.fn(async () => ({ data: null, error: { code: "42501", message: "Store membership revoked" } })),
    } as any);
    await expect(denied.getDashboardBootstrap(USER_ID, STORE_ID)).rejects.toMatchObject({
      code: "STORE_MEMBERSHIP_REVOKED",
    });
  });
});
