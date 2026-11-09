import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createBuiltInAdaptiveCommerceCatalog,
  createBuiltInStoreDefinition,
} from "@/adaptive-commerce/fixtures";
import type {
  AdaptiveAuthoringGateway,
  AdaptiveAuthoringSource,
} from "@/adaptive-commerce/authoring";
import type {
  LegacyAdaptiveStoreKitUpgradeController,
  StoreKitInstallationStageResult,
} from "@/adaptive-commerce/installation";
import { MyStore } from "./MyStore";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    bootstrap: {
      profile: { businessName: "Demo Company" },
    },
    currentStore: {
      id: "store-one",
      name: "Demo Store",
      handle: "demo-store",
      locale: "en-US",
      currency: "USD",
    },
    hasCapability: (capability: string) => capability === "theme.edit",
  }),
}));
vi.mock("./EngineEditor", () => ({
  default: ({ headerActions }: { headerActions?: React.ReactNode }) => (
    <div><span>Legacy engine editor</span>{headerActions}</div>
  ),
}));
vi.mock("@/engine/kernel", () => ({
  createEditorKernel: () => ({}),
  EngineProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/persistence/project-save-load", () => ({
  editorSessionCache: { get: () => null },
}));
vi.mock("./AdaptiveStoreEditor", () => ({
  AdaptiveStoreEditor: ({ canEdit }: { canEdit: boolean }) => (
    <div>Adaptive store editor {canEdit ? "editable" : "read-only"}</div>
  ),
}));

const source = (
  installationId?: string,
  installationStatus: "staged" | "active" = "active",
): AdaptiveAuthoringSource => {
  const catalog = createBuiltInAdaptiveCommerceCatalog();
  const createdDefinition = createBuiltInStoreDefinition(undefined, "store-one");
  const storeDefinition = installationId
    ? { ...createdDefinition, installationId }
    : createdDefinition;
  return {
    kind: "adaptive-storefront-authoring-source",
    storeId: "store-one",
    installationId: storeDefinition.installationId,
    installationStatus,
    installationRevision: 1,
    sourceRevision: 1,
    sourceHash: `sha256:${"a".repeat(64)}`,
    baseRevisionRowId: "base-one",
    storeDefinition,
    merchantPatches: [],
    catalog: {
      designPack: catalog.designPack,
      componentLibrary: catalog.componentLibrary,
      blueprints: [...catalog.blueprints],
    },
    publishedSourceRevision: null,
    reviewState: "review-needed",
  };
};

const gateway = (load: AdaptiveAuthoringGateway["load"]): AdaptiveAuthoringGateway => ({
  load,
  save: vi.fn(),
});

const stageResult = (): StoreKitInstallationStageResult => ({
  kind: "store-kit-installation-stage-result",
  outcome: "staged",
  idempotencyKey: "upgrade-attempt-one",
  installation: {
    kind: "staged-store-kit-installation",
    id: "installation-one",
    storeId: "store-one",
    storeKitId: "storeblink-adaptive-commerce",
    storeKitVersion: "1.0.0",
    resolvedLockfile: createBuiltInAdaptiveCommerceCatalog().storeKit.lockfile,
    presetId: "clean-neutral",
    baseRevisionId: "base-row-one",
    baseDocumentRevisionId: "legacy-upgrade-storeblink-adaptive-commerce-v1",
    sourceRevision: 1,
    sourceHash: `sha256:${"a".repeat(64)}`,
    status: "staged",
    revision: 1,
    installedAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
  },
});

const upgrade = (
  stage: LegacyAdaptiveStoreKitUpgradeController["stage"] = vi.fn(async () => stageResult()),
): LegacyAdaptiveStoreKitUpgradeController => ({
  listReleasedOptions: () => [{
    id: "storeblink-adaptive-commerce",
    version: "1.0.0",
    name: "StoreBlink Adaptive Commerce",
    description: "Complete certified storefront source.",
    presetId: "clean-neutral",
    routeCount: 8,
  }],
  stage,
});

describe("MyStore editor assignment", () => {
  it("opens the adaptive editor only after the server returns a real adaptive source", async () => {
    render(<MyStore authoringGateway={gateway(async () => source())} />);
    expect(await screen.findByText("Adaptive store editor editable")).toBeVisible();
    expect(screen.queryByText("Legacy engine editor")).not.toBeInTheDocument();
  });

  it("keeps the legacy editor as the confirmed no-adaptive-source path", async () => {
    render(<MyStore authoringGateway={gateway(async () => null)} upgradeController={upgrade()} />);
    expect(await screen.findByText("Legacy engine editor")).toBeVisible();
    expect(screen.getByRole("button", { name: /adaptive upgrade/i })).toBeVisible();
    expect(screen.queryByText(/Adaptive store editor/)).not.toBeInTheDocument();
  });

  it("opens neither editor when assignment verification fails", async () => {
    render(<MyStore authoringGateway={gateway(async () => { throw new Error("network unavailable"); })} />);
    expect(await screen.findByRole("heading", { name: "Store editor unavailable" })).toBeVisible();
    expect(screen.getByText(/active storefront assignment is unknown/i)).toBeVisible();
    expect(screen.queryByText("Legacy engine editor")).not.toBeInTheDocument();
    expect(screen.queryByText(/Adaptive store editor/)).not.toBeInTheDocument();
  });

  it("switches to the Adaptive editor only after review-only staging returns the exact source", async () => {
    const load = vi.fn<AdaptiveAuthoringGateway["load"]>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(source("installation-one", "staged"));
    const stage = vi.fn<LegacyAdaptiveStoreKitUpgradeController["stage"]>(
      async () => stageResult(),
    );
    render(
      <MyStore
        authoringGateway={gateway(load)}
        upgradeController={upgrade(stage)}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /adaptive upgrade/i }));
    expect(screen.getByText(/live storefront stays unchanged/i)).toBeVisible();
    expect(screen.getByText(/does not compile/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /stage storeblink adaptive commerce for review/i }));

    expect(await screen.findByText("Adaptive store editor editable")).toBeVisible();
    expect(stage).toHaveBeenCalledTimes(1);
    expect(stage.mock.calls[0][0]).toMatchObject({
      storeKitId: "storeblink-adaptive-commerce",
      merchant: {
        storeId: "store-one",
        storeName: "Demo Store",
        businessName: "Demo Company",
      },
    });
    expect(screen.queryByText("Legacy engine editor")).not.toBeInTheDocument();
  });
});
