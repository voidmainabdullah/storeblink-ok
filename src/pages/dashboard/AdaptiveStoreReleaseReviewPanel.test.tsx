import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  AdaptiveReleaseReviewController,
  AdaptiveReleaseReviewSnapshot,
} from "@/adaptive-commerce/release-review";
import { AdaptiveStoreReleaseReviewPanel } from "./AdaptiveStoreReleaseReviewPanel";

const identity = { storeId: "store-one", installationId: "installation-one", sourceRevision: 3 };

const snapshot = (
  state: "none" | "compiling" | "pending" | "uncomparable" | "accepted" | "rejected" | "current",
): AdaptiveReleaseReviewSnapshot => ({
  kind: "adaptive-release-review-snapshot",
  ...identity,
  currentPointerRevision: state === "current" ? 2 : 1,
  currentPublication: state === "current" ? {
    publicationId: "publication-one",
    installationId: identity.installationId,
    sourceRevision: identity.sourceRevision,
    pointerRevision: 2,
  } : null,
  latestJob: state === "none" ? null : {
    jobId: "job-one",
    state: state === "compiling" ? "compiling" : "succeeded",
    requestedAt: "2026-08-27T00:00:00.000Z",
    completedAt: state === "compiling" ? null : "2026-08-27T00:00:01.000Z",
    error: null,
    published: state === "current",
    isCurrent: state === "current",
    shadow: state === "compiling" ? null : {
      shadowId: "shadow-one",
      status: state === "current" ? "accepted" : state,
      reviewRevision: 1,
      structuralDiff: {
        status: state === "uncomparable" ? "uncomparable" : "different",
        changes: state === "pending" ? [{ path: "storefront.routes.home" }] : [],
        uncomparableRoutes: state === "uncomparable" ? ["home", "product"] : [],
      },
      visualDiff: null,
      reviewedAt: null,
    },
  },
});

const controller = (
  initial: AdaptiveReleaseReviewSnapshot,
  reviewed = snapshot("accepted"),
): AdaptiveReleaseReviewController => ({
  load: vi.fn(async () => initial),
  requestValidation: vi.fn(async () => snapshot("pending")),
  review: vi.fn(async () => reviewed),
  publish: vi.fn(async () => snapshot("current")),
});

describe("AdaptiveStoreReleaseReviewPanel", () => {
  it.each([
    ["none", "Draft needs validation"],
    ["compiling", "Validation in progress"],
    ["pending", "Candidate ready for review"],
    ["uncomparable", "Trusted visual evidence required"],
    ["accepted", "Accepted and ready to publish"],
    ["rejected", "Candidate rejected"],
    ["current", "Published and current"],
  ] as const)("renders the %s release state", async (state, label) => {
    render(
      <AdaptiveStoreReleaseReviewPanel
        identity={identity}
        canPublish={false}
        hasUnsavedChanges={false}
        service={controller(snapshot(state))}
      />,
    );
    expect(await screen.findByText(label)).toBeVisible();
  });

  it("keeps theme.publish separate and confirms acceptance before mutation", async () => {
    const service = controller(snapshot("pending"));
    render(
      <AdaptiveStoreReleaseReviewPanel
        identity={identity}
        canPublish
        hasUnsavedChanges={false}
        service={service}
      />,
    );
    expect(await screen.findByText("1 structural change reported.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Accept candidate" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/does not publish/i)).toBeVisible();
    fireEvent.click(within(dialog).getByRole("button", { name: "Accept candidate" }));
    expect(await screen.findByText("Accepted and ready to publish")).toBeVisible();
    expect(service.review).toHaveBeenCalledWith(expect.objectContaining({
      latestJob: expect.objectContaining({ jobId: "job-one" }),
    }), "accept");
  });

  it("blocks release actions while local changes are unsaved", async () => {
    render(
      <AdaptiveStoreReleaseReviewPanel
        identity={identity}
        canPublish
        hasUnsavedChanges
        service={controller(snapshot("none"))}
      />,
    );
    expect(await screen.findByText("Save this draft before validation")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Validate saved draft" })).not.toBeInTheDocument();
  });
});

