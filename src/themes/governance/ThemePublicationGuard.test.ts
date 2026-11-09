import { describe, expect, it, vi } from "vitest";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import { createEngineSceneTheme } from "@/editor/engine/storeSceneAdapter";
import {
  StorefrontPublishingService,
  type StorefrontPublishingGateway,
} from "@/platform/publishing/StorefrontPublishingService";
import {
  getLatestThemePublicationReport,
  themePublicationGuard,
} from "./ThemePublicationGuard";
import { ThemePolicyViolationError } from "./ThemeProductionPolicy";

describe("themePublicationGuard", () => {
  const createGateway = (): StorefrontPublishingGateway => ({
    write: vi.fn<StorefrontPublishingGateway["write"]>(async (_mode, input) => ({
      revision: input.expectedRevision + 1,
      persistedAt: "2026-07-31T00:00:00.000Z",
      concurrency: "atomic",
    })),
  });

  it("blocks an invalid publish before gateway I/O", async () => {
    const gateway = createGateway();
    const service = new StorefrontPublishingService(gateway, {
      guard: themePublicationGuard,
    });

    await expect(
      service.publish({ userId: "merchant-1", document: {} }),
    ).rejects.toBeInstanceOf(ThemePolicyViolationError);

    expect(gateway.write).not.toHaveBeenCalled();
    expect(getLatestThemePublicationReport()).toMatchObject({
      valid: false,
      issues: expect.arrayContaining([
        expect.objectContaining({ code: "document.scene.missing" }),
      ]),
    });
  });

  it("keeps invalid drafts advisory", async () => {
    const gateway = createGateway();
    const service = new StorefrontPublishingService(gateway, {
      guard: themePublicationGuard,
    });

    await expect(
      service.saveDraft({ userId: "merchant-1", document: {} }),
    ).resolves.toMatchObject({ revision: 1 });

    expect(gateway.write).toHaveBeenCalledOnce();
    expect(getLatestThemePublicationReport()).toMatchObject({ valid: false });
  });

  it("publishes a valid built-in Engine document after a rejected publish", async () => {
    const gateway = createGateway();
    const service = new StorefrontPublishingService(gateway, {
      guard: themePublicationGuard,
    });
    const product = {
      id: "product-one",
      name: "Product One",
      image_url: "https://example.com/product.webp",
      price_cents: 25500,
    };
    const document = createEngineSceneTheme(
      buildBasicTemplateScene({}, [product]),
    );

    await expect(
      service.publish({ userId: "merchant-1", document: {} }),
    ).rejects.toBeInstanceOf(ThemePolicyViolationError);
    await expect(
      service.publish({
        userId: "merchant-1",
        document,
        context: { productIds: [product.id] },
      }),
    ).resolves.toMatchObject({ revision: 1 });

    expect(gateway.write).toHaveBeenCalledOnce();
    expect(gateway.write).toHaveBeenCalledWith(
      "publish",
      expect.objectContaining({ expectedRevision: 0, document }),
    );
    expect(getLatestThemePublicationReport()).toMatchObject({ valid: true });
  });
});
