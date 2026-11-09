import { describe, expect, it, vi } from "vitest";
import type { StoreKitInstallationStageCommit } from "./lifecycleContracts";
import {
  SupabaseStoreKitInstallationActivationGateway,
  SupabaseStoreKitInstallationRevisionGateway,
  SupabaseStoreKitInstallationStageGateway,
  type InstallationRevisionQueryBuilder,
} from "./SupabaseStoreKitInstallationGateway";

describe("Supabase StoreKit installation gateways", () => {
  it("maps only canonical source into the staging RPC", async () => {
    const rpc = vi.fn(async (_name: string, _args?: Readonly<Record<string, unknown>>) => ({
      data: { ok: true }, error: null,
    }));
    const gateway = new SupabaseStoreKitInstallationStageGateway({ rpc });
    const commit = {
      kind: "store-kit-installation-stage",
      storeId: "store-one",
      storeKit: { id: "kit", version: "1.0.0", lockfile: {} },
      designTokens: { presetId: null, overrides: [] },
      baseDocument: {},
      merchantPatches: [],
      commerceBindings: [],
      expectedInstallationRevision: 0,
      idempotencyKey: "stage-one",
    } as unknown as StoreKitInstallationStageCommit;
    await gateway.stageAtomic(commit);
    expect(rpc).toHaveBeenCalledWith("stage_adaptive_store_kit_installation", expect.objectContaining({
      p_store_id: "store-one",
      p_design_tokens: { presetId: null, overrides: [] },
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_artifact");
  });

  it("maps both source identities and accepted shadow into server activation", async () => {
    const rpc = vi.fn(async (_name: string, _args?: Readonly<Record<string, unknown>>) => ({
      data: { ok: true }, error: null,
    }));
    const gateway = new SupabaseStoreKitInstallationActivationGateway({ rpc });
    await gateway.activateAtomic({
      storeId: "store-one",
      installationId: "installation-one",
      acceptedShadowId: "shadow-one",
      expectedInstallationRevision: 2,
      expectedSourceRevision: 3,
      expectedStageSourceHash: `sha256:${"a".repeat(64)}`,
      expectedPointerRevision: 4,
      artifact: {
        artifactHash: `sha256:${"b".repeat(64)}`,
        compilerVersion: "1.0.0",
      },
    } as never);
    expect(rpc).toHaveBeenCalledWith("activate_adaptive_store_kit_installation", expect.objectContaining({
      p_shadow_id: "shadow-one",
      p_expected_source_revision: 3,
      p_expected_source_hash: `sha256:${"a".repeat(64)}`,
      p_expected_pointer_revision: 4,
    }));
  });

  it("loads the latest RLS-visible installation revision for optimistic staging", async () => {
    const builder = {} as InstallationRevisionQueryBuilder;
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: { revision: 6 }, error: null }));
    const from = vi.fn(() => builder);

    const revision = await new SupabaseStoreKitInstallationRevisionGateway({ from })
      .loadCurrentRevision("store-one");

    expect(revision).toBe(6);
    expect(from).toHaveBeenCalledWith("adaptive_store_kit_installations");
    expect(builder.eq).toHaveBeenCalledWith("store_id", "store-one");
    expect(builder.order).toHaveBeenCalledWith("revision", { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(1);
  });

  it("uses revision zero only when no authorized installation exists", async () => {
    const builder = {} as InstallationRevisionQueryBuilder;
    builder.select = () => builder;
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.maybeSingle = async () => ({ data: null, error: null });

    await expect(new SupabaseStoreKitInstallationRevisionGateway({ from: () => builder })
      .loadCurrentRevision("store-one")).resolves.toBe(0);
  });
});
