import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createBuiltInAdaptiveCommerceCatalog } from "@/adaptive-commerce/fixtures";
import type {
  LegacyAdaptiveStoreKitUpgradeController,
  StoreKitInstallationStageResult,
} from "@/adaptive-commerce/installation";
import { LegacyAdaptiveStoreKitUpgradeEntry } from "./LegacyAdaptiveStoreKitUpgradeEntry";

const result = (): StoreKitInstallationStageResult => ({
  kind: "store-kit-installation-stage-result",
  outcome: "staged",
  idempotencyKey: "stable-upgrade-key",
  installation: {
    kind: "staged-store-kit-installation",
    id: "installation-one",
    storeId: "store-one",
    storeKitId: "basic",
    storeKitVersion: "1.0.0",
    resolvedLockfile: createBuiltInAdaptiveCommerceCatalog().themeStoreKits.basic.lockfile,
    presetId: "basic",
    baseRevisionId: "base-row-one",
    baseDocumentRevisionId: "legacy-upgrade-basic-v1",
    sourceRevision: 1,
    sourceHash: `sha256:${"a".repeat(64)}`,
    status: "staged",
    revision: 1,
    installedAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  },
});

const merchant = {
  storeId: "store-one",
  storeName: "Demo Store",
  storeHandle: "demo-store",
  locale: "en-US",
  currency: "USD",
  businessName: "Demo Company",
} as const;

const controller = (
  stage: LegacyAdaptiveStoreKitUpgradeController["stage"],
): LegacyAdaptiveStoreKitUpgradeController => ({
  listReleasedOptions: () => [{
    id: "basic",
    version: "1.0.0",
    name: "Basic",
    description: "A certified, complete StoreKit.",
    presetId: "basic",
    routeCount: 8,
  }],
  stage,
});

afterEach(() => window.localStorage.clear());

describe("LegacyAdaptiveStoreKitUpgradeEntry", () => {
  it("is review-only until a theme editor explicitly stages the source", async () => {
    const stage = vi.fn<LegacyAdaptiveStoreKitUpgradeController["stage"]>(async () => result());
    render(
      <LegacyAdaptiveStoreKitUpgradeEntry
        merchant={merchant}
        canEdit
        controller={controller(stage)}
        onStaged={vi.fn(async () => undefined)}
        createIdempotencyKey={() => "stable-upgrade-key"}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /adaptive upgrade/i }));
    expect(stage).not.toHaveBeenCalled();
    expect(screen.getByText(/complete route coverage \(8\/8\)/i)).toBeVisible();
    expect(screen.getByText(/live storefront stays unchanged/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /stage basic for review/i }));
    await waitFor(() => expect(stage).toHaveBeenCalledTimes(1));
  });

  it("reuses the same idempotency key when post-stage source verification must retry", async () => {
    const stage = vi.fn<LegacyAdaptiveStoreKitUpgradeController["stage"]>(async () => result());
    const onStaged = vi.fn()
      .mockRejectedValueOnce(new Error("source unavailable"))
      .mockResolvedValueOnce(undefined);
    const createKey = vi.fn(() => "stable-upgrade-key");
    render(
      <LegacyAdaptiveStoreKitUpgradeEntry
        merchant={merchant}
        canEdit
        controller={controller(stage)}
        onStaged={onStaged}
        createIdempotencyKey={createKey}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /adaptive upgrade/i }));
    const stageButton = screen.getByRole("button", { name: /stage basic for review/i });
    fireEvent.click(stageButton);
    expect(await screen.findByRole("alert")).toHaveTextContent(/source was staged/i);
    fireEvent.click(stageButton);

    await waitFor(() => expect(stage).toHaveBeenCalledTimes(2));
    expect(stage.mock.calls.map(([input]) => input.idempotencyKey))
      .toEqual(["stable-upgrade-key", "stable-upgrade-key"]);
    expect(createKey).toHaveBeenCalledTimes(1);
  });

  it("starts a new idempotent attempt when merchant source data changes", async () => {
    const stage = vi.fn<LegacyAdaptiveStoreKitUpgradeController["stage"]>(
      async () => { throw new Error("network unavailable"); },
    );
    const createKey = vi.fn()
      .mockReturnValueOnce("profile-one-key")
      .mockReturnValueOnce("profile-two-key");
    const first = render(
      <LegacyAdaptiveStoreKitUpgradeEntry
        merchant={merchant}
        canEdit
        controller={controller(stage)}
        onStaged={vi.fn(async () => undefined)}
        createIdempotencyKey={createKey}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /adaptive upgrade/i }));
    fireEvent.click(screen.getByRole("button", { name: /stage basic for review/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/network unavailable/i);
    first.unmount();

    render(
      <LegacyAdaptiveStoreKitUpgradeEntry
        merchant={{ ...merchant, storeName: "Renamed Store" }}
        canEdit
        controller={controller(stage)}
        onStaged={vi.fn(async () => undefined)}
        createIdempotencyKey={createKey}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /adaptive upgrade/i }));
    fireEvent.click(screen.getByRole("button", { name: /stage basic for review/i }));
    await waitFor(() => expect(stage).toHaveBeenCalledTimes(2));

    expect(stage.mock.calls.map(([input]) => input.idempotencyKey))
      .toEqual(["profile-one-key", "profile-two-key"]);
    expect(createKey).toHaveBeenCalledTimes(2);
  });
});
