import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createBuiltInAdaptiveCommerceCatalog,
  createBuiltInStoreDefinition,
} from "@/adaptive-commerce/fixtures";
import type {
  AdaptiveAuthoringGateway,
  AdaptiveAuthoringSaveRequest,
  AdaptiveAuthoringSaveResult,
  AdaptiveAuthoringSource,
} from "@/adaptive-commerce/authoring";
import { AdaptiveStoreEditor } from "./AdaptiveStoreEditor";
import type {
  AdaptiveReleaseReviewController,
  AdaptiveReleaseReviewSnapshot,
} from "@/adaptive-commerce/release-review";

const makeSource = (revision = 1): AdaptiveAuthoringSource => {
  const catalog = createBuiltInAdaptiveCommerceCatalog();
  const storeDefinition = createBuiltInStoreDefinition(undefined, "store-one");
  return {
    kind: "adaptive-storefront-authoring-source",
    storeId: "store-one",
    installationId: storeDefinition.installationId,
    installationStatus: "active",
    installationRevision: 1,
    sourceRevision: revision,
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

const releaseSnapshot = (source: AdaptiveAuthoringSource): AdaptiveReleaseReviewSnapshot => ({
  kind: "adaptive-release-review-snapshot",
  storeId: source.storeId,
  installationId: source.installationId,
  sourceRevision: source.sourceRevision,
  currentPointerRevision: 0,
  currentPublication: null,
  latestJob: null,
});

const releaseReview = (source: AdaptiveAuthoringSource): AdaptiveReleaseReviewController => ({
  load: vi.fn(() => new Promise<AdaptiveReleaseReviewSnapshot>(() => {})),
  requestValidation: vi.fn(async () => releaseSnapshot(source)),
  review: vi.fn(async () => releaseSnapshot(source)),
  publish: vi.fn(async () => releaseSnapshot(source)),
});

describe("AdaptiveStoreEditor", () => {
  it("routes semantic edits through command history and sends one revision-checked draft save", async () => {
    let request: AdaptiveAuthoringSaveRequest | null = null;
    const gateway: AdaptiveAuthoringGateway = {
      save: vi.fn(async (next): Promise<AdaptiveAuthoringSaveResult> => {
        request = next;
        return {
          kind: "adaptive-storefront-authoring-save-result" as const,
          outcome: "saved" as const,
          storeId: next.storeId,
          installationId: next.installationId,
          sourceRevision: 2,
          sourceHash: `sha256:${"b".repeat(64)}`,
          patchId: "patch-one",
          reviewState: "review-needed" as const,
          compileJobEnqueued: false as const,
        };
      }),
      load: vi.fn(async () => ({
        ...makeSource(2),
        sourceHash: `sha256:${"b".repeat(64)}`,
      })),
    };
    const initialSource = makeSource();
    render(<AdaptiveStoreEditor source={initialSource} storeName="Demo Store" canEdit canPublish={false} gateway={gateway} releaseReviewService={releaseReview(initialSource)} />);

    const heading = screen.getByLabelText("Heading");
    fireEvent.change(heading, { target: { value: "Autumn essentials" } });
    fireEvent.blur(heading);
    expect(screen.getByRole("button", { name: "Undo last change" })).toBeEnabled();
    expect(screen.getByTestId("adaptive-draft-canvas")).toHaveTextContent("Autumn essentials");

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Changes saved for review. Nothing was published.")).toBeVisible();
    expect(request).toMatchObject({
      storeId: "store-one",
      expectedSourceRevision: 1,
      operations: [{ op: "set", target: "home.hero.heading", value: "Autumn essentials" }],
    });
    expect(request!.idempotencyKey).toMatch(/^authoring-/);
    expect(gateway.save).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /publish|install|apply/i })).not.toBeInTheDocument();
  });

  it("keeps all merchant mutation controls read-only without theme.edit", async () => {
    const gateway: AdaptiveAuthoringGateway = { load: vi.fn(), save: vi.fn() };
    const initialSource = makeSource();
    render(<AdaptiveStoreEditor source={initialSource} storeName="Demo Store" canEdit={false} canPublish={false} gateway={gateway} releaseReviewService={releaseReview(initialSource)} />);
    expect(screen.getByText(/Read-only access/)).toBeVisible();
    expect(screen.getByLabelText("Heading")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Hide Hero/i })).toBeDisabled();
    await waitFor(() => expect(gateway.save).not.toHaveBeenCalled());
  });

  it("does not let a merchant hide the final visible section on a route", () => {
    const gateway: AdaptiveAuthoringGateway = { load: vi.fn(), save: vi.fn() };
    const initialSource = makeSource();
    render(<AdaptiveStoreEditor source={initialSource} storeName="Demo Store" canEdit canPublish={false} gateway={gateway} releaseReviewService={releaseReview(initialSource)} />);
    expect(screen.getByText(/must keep at least one certified section visible/i)).toBeVisible();
    const initialHideButtons = screen.getAllByRole("button", { name: /^Hide / });
    expect(initialHideButtons.length).toBeGreaterThan(1);
    fireEvent.click(initialHideButtons[0]);
    const finalHideButton = screen.getByRole("button", { name: /^Hide / });
    expect(finalHideButton).toBeDisabled();
    fireEvent.click(finalHideButton);
    expect(screen.getAllByRole("button", { name: /^Hide / })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Show / })).toHaveLength(initialHideButtons.length - 1);
    expect(screen.getByText("Structural draft preview")).toBeVisible();
    expect(screen.getByText(/not pixel-accurate/i)).toBeVisible();
  });
});
