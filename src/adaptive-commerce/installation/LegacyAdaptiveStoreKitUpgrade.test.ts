import { describe, expect, it, vi } from "vitest";
import { STOREFRONT_RESOURCE_TYPES } from "@/adaptive-commerce/contracts";
import { createBuiltInAdaptiveCommerceCatalog } from "@/adaptive-commerce/fixtures";
import type { StoreKitInstallationStageGateway } from "./StoreKitInstallationService";
import {
  DefaultLegacyAdaptiveStoreKitUpgradeController,
  createLegacyAdaptiveStoreKitStageRequest,
  type LegacyAdaptiveMerchantProfile,
} from "./LegacyAdaptiveStoreKitUpgrade";

const merchant: LegacyAdaptiveMerchantProfile = {
  storeId: "store-one",
  storeName: "Northwind Goods",
  storeHandle: "northwind-goods",
  locale: "en-GB",
  currency: "GBP",
  businessName: "Northwind Trading",
};

describe("legacy Adaptive StoreKit upgrade staging", () => {
  it("materializes merchant-aware canonical source for all eight routes", () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const request = createLegacyAdaptiveStoreKitStageRequest(
      catalog.storeKit,
      {
        merchant,
        storeKitId: catalog.storeKit.id,
        idempotencyKey: "upgrade-attempt-one",
        requestedAt: "2026-08-26T00:00:00.000Z",
      },
      4,
    );

    expect(Object.keys(catalog.storeKit.lockfile.blueprints).sort())
      .toEqual([...STOREFRONT_RESOURCE_TYPES].sort());
    expect(request.expectedInstallationRevision).toBe(4);
    expect(request.baseDocument.values["global.store-name"]).toBe("Northwind Goods");
    expect(request.baseDocument.values["global.store-handle"]).toBe("northwind-goods");
    expect(request.baseDocument.values["home.hero.description"])
      .toBe("Discover products from Northwind Trading.");
    STOREFRONT_RESOURCE_TYPES.forEach((route) => {
      const prefix = route === "404" ? "not-found" : route;
      expect(request.baseDocument.collections).toHaveProperty(`${prefix}.sections`);
    });
    expect(request.merchantPatches).toEqual([]);
    expect(request.commerceBindings).toEqual([]);
  });

  it("reads the optimistic revision before using the existing staging service", async () => {
    const catalog = createBuiltInAdaptiveCommerceCatalog();
    const stageAtomic = vi.fn<StoreKitInstallationStageGateway["stageAtomic"]>(async (commit) => ({
      kind: "store-kit-installation-stage-result",
      outcome: "staged",
      idempotencyKey: commit.idempotencyKey,
      installation: {
        kind: "staged-store-kit-installation",
        id: "installation-one",
        storeId: commit.storeId,
        storeKitId: commit.storeKit.id,
        storeKitVersion: commit.storeKit.version,
        resolvedLockfile: commit.storeKit.lockfile,
        presetId: commit.designTokens.presetId,
        baseRevisionId: "base-row-one",
        baseDocumentRevisionId: commit.baseDocument.revisionId,
        sourceRevision: 1,
        sourceHash: `sha256:${"a".repeat(64)}`,
        status: "staged",
        revision: commit.expectedInstallationRevision + 1,
        installedAt: "2026-08-26T00:00:00.000Z",
        updatedAt: "2026-08-26T00:00:00.000Z",
      },
    }));
    const loadCurrentRevision = vi.fn(async () => 7);
    const controller = new DefaultLegacyAdaptiveStoreKitUpgradeController({
      registry: catalog.registry,
      releasedStoreKits: catalog.storeKits,
      stageGateway: { stageAtomic },
      revisionGateway: { loadCurrentRevision },
    });

    const result = await controller.stage({
      merchant,
      storeKitId: "basic",
      idempotencyKey: "upgrade-attempt-two",
      requestedAt: "2026-08-26T00:00:00.000Z",
    });

    expect(loadCurrentRevision).toHaveBeenCalledWith("store-one");
    expect(stageAtomic).toHaveBeenCalledTimes(1);
    expect(stageAtomic.mock.calls[0][0]).toMatchObject({
      storeId: "store-one",
      expectedInstallationRevision: 7,
      storeKit: { id: "basic", version: "1.0.0" },
    });
    expect(result.installation.status).toBe("staged");
    expect(Object.keys(controller).some((key) => /compile|activate|publish|shadow/i.test(key)))
      .toBe(false);
  });
});
