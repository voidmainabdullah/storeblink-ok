import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { semanticPath } from "@/adaptive-commerce/contracts";
import type { AdaptivePlannerProposal } from "@/adaptive-commerce/ai";
import { ThemeStudioPlannerPanel } from "./ThemeStudioPlannerPanel";

const HASH = `sha256:${"a".repeat(64)}`;

const proposal: AdaptivePlannerProposal = {
  status: "proposed",
  reviewRequired: true,
  plan: {
    kind: "adaptive-commerce-plan",
    schemaVersion: 1,
    storeKit: { id: "atelier", version: "1.0.0", integrity: HASH },
    presetId: "warm-editorial",
    variantSelections: [{
      path: semanticPath("home.hero"),
      componentId: "hero",
      variantId: "editorial",
    }],
    contentMappings: [],
  },
  audit: { intentHash: HASH, attempts: 2 },
};

describe("ThemeStudioPlannerPanel", () => {
  it("keeps a validated proposal separate from install and publish", async () => {
    const planner = vi.fn(async () => proposal);
    render(<ThemeStudioPlannerPanel storeId="store-1" planner={planner} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Store brief" }), {
      target: { value: "A calm editorial storefront" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create proposal" }));

    expect(await screen.findByLabelText("Adaptive proposal review")).toBeVisible();
    expect(screen.getByText("atelier@1.0.0")).toBeVisible();
    expect(screen.getByText("No storefront changes have been made.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /install|publish|apply/i })).not.toBeInTheDocument();
    await waitFor(() => expect(planner).toHaveBeenCalledWith({
      storeId: "store-1",
      intent: "A calm editorial storefront",
    }));
  });

  it("shows a safe failure without retaining a stale proposal", async () => {
    const planner = vi.fn(async () => { throw new Error("No certified plan passed compiler checks."); });
    render(<ThemeStudioPlannerPanel storeId="store-1" planner={planner} />);

    fireEvent.change(screen.getByRole("textbox", { name: "Store brief" }), {
      target: { value: "Unsafe custom CSS storefront" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create proposal" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No certified plan passed compiler checks.");
    expect(screen.queryByLabelText("Adaptive proposal review")).not.toBeInTheDocument();
  });
});
