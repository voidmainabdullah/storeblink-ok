import { describe, expect, it, vi } from "vitest";
import {
  isConfirmedOnboardingBootstrap,
  OnboardingService,
  type OnboardingCompletion,
} from "./OnboardingService";
import type { DashboardBootstrap } from "./auth.types";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const STORE_ID = "22222222-2222-4222-8222-222222222222";

const rpcResult = {
  profile: {
    id: USER_ID,
    business_name: "Nova Store",
    onboarding_completed: true,
  },
  store: { id: STORE_ID, name: "Nova Store", handle: "nova-store" },
  membership: {
    store_id: STORE_ID,
    user_id: USER_ID,
    role: "owner",
    status: "active",
  },
};

describe("OnboardingService", () => {
  it("uses the atomic RPC and validates its tenant result", async () => {
    const rpc = vi.fn(async () => ({ data: rpcResult, error: null }));
    const service = new OnboardingService({ rpc } as any);
    const result = await service.complete({
      businessName: "Nova Store",
      requestedHandle: "nova-store",
      storeTemplate: "basic",
      storeColor: "#5669ff",
      theme: { engine_scene: { version: 1 } },
      businessType: "retail",
      categories: ["Home", "Office"],
    });

    expect(result).toEqual({
      profileId: USER_ID,
      storeId: STORE_ID,
      storeHandle: "nova-store",
    });
    expect(rpc).toHaveBeenCalledWith("complete_store_onboarding", {
      p_business_name: "Nova Store",
      p_requested_handle: "nova-store",
      p_store_template: "basic",
      p_store_color: "#5669ff",
      p_theme: { engine_scene: { version: 1 } },
      p_business_type: "retail",
      p_categories: ["Home", "Office"],
    });
  });

  it("rejects false completion and cross-tenant responses", async () => {
    const incomplete = new OnboardingService({
      rpc: vi.fn(async () => ({
        data: {
          ...rpcResult,
          profile: { ...rpcResult.profile, onboarding_completed: false },
        },
        error: null,
      })),
    } as any);
    await expect(incomplete.complete({
      businessName: "Nova Store",
      requestedHandle: "nova-store",
      storeTemplate: "basic",
      storeColor: "#5669ff",
      theme: {},
      businessType: "retail",
      categories: ["Home"],
    })).rejects.toMatchObject({ code: "AUTH_UNKNOWN" });

    const mismatched = new OnboardingService({
      rpc: vi.fn(async () => ({
        data: {
          ...rpcResult,
          membership: { ...rpcResult.membership, store_id: USER_ID },
        },
        error: null,
      })),
    } as any);
    await expect(mismatched.complete({
      businessName: "Nova Store",
      requestedHandle: "nova-store",
      storeTemplate: "basic",
      storeColor: "#5669ff",
      theme: {},
      businessType: "retail",
      categories: ["Home"],
    })).rejects.toMatchObject({ code: "STORE_ACCESS_DENIED" });
  });
});

describe("isConfirmedOnboardingBootstrap", () => {
  const completion: OnboardingCompletion = {
    profileId: USER_ID,
    storeId: STORE_ID,
    storeHandle: "nova-store",
  };
  const bootstrap: DashboardBootstrap = {
    profile: {
      id: USER_ID,
      fullName: "Merchant",
      businessName: "Nova Store",
      onboardingCompleted: true,
    },
    store: {
      id: STORE_ID,
      name: "Nova Store",
      handle: "nova-store",
      status: "draft",
      currency: "USD",
      locale: "en",
      timezone: "UTC",
    },
    membership: {
      storeId: STORE_ID,
      userId: USER_ID,
      role: "owner",
      status: "active",
    },
    capabilities: [],
  };

  it("allows redirect only after the fresh bootstrap proves completion", () => {
    expect(isConfirmedOnboardingBootstrap(completion, USER_ID, bootstrap)).toBe(true);
    expect(isConfirmedOnboardingBootstrap(completion, USER_ID, {
      ...bootstrap,
      profile: { ...bootstrap.profile, onboardingCompleted: false },
    })).toBe(false);
    expect(isConfirmedOnboardingBootstrap(completion, USER_ID, {
      ...bootstrap,
      membership: null,
    })).toBe(false);
  });
});
