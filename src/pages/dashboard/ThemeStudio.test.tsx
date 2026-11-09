import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { loadThemeStudioDiagnostics } from "@/adaptive-commerce/studio";
import ThemeStudio from "./ThemeStudio";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    currentStore: { id: "store-1", name: "Demo Store", handle: "demo-store" },
  }),
}));

describe("ThemeStudio", () => {
  it("shows evidence-backed package, route, token, primitive, and surface boundaries", async () => {
    const diagnosticsLoader: typeof loadThemeStudioDiagnostics = (input) =>
      loadThemeStudioDiagnostics({
        ...input,
        dependencies: {
          runtimeResolver: {
            resolve: async () => ({ runtime: "legacy", reason: "missing" }),
          },
        },
      });
    render(<MemoryRouter><ThemeStudio diagnosticsLoader={diagnosticsLoader} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Reference compile verified" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Theme Studio", level: 1 })).toBeVisible();
    expect(screen.getByText("Diagnostics + review proposals")).toBeVisible();
    expect(
      screen.getByText(/planning proposals never edit, install, or publish/i),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Store" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Design" })).toBeVisible();
    expect(screen.getAllByRole("heading", { name: "Theme Studio" })).toHaveLength(2);
    expect(screen.getByText("StoreBlink Adaptive Commerce")).toBeVisible();
    expect(screen.getByText("8/8")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Token tiers" })).toBeVisible();
    expect(screen.getByRole("list", { name: "Responsive primitives" })).toHaveTextContent("Anchor");
    expect(screen.getByText("No runtime assignment found")).toBeVisible();
    const brief = screen.getByRole("textbox", { name: "Store brief" });
    const createProposal = screen.getByRole("button", { name: "Create proposal" });
    expect(brief).toBeVisible();
    expect(createProposal).toBeDisabled();
    fireEvent.change(brief, { target: { value: "A calm editorial fashion storefront" } });
    expect(createProposal).toBeEnabled();
    expect(screen.queryByRole("button", { name: /publish|install|apply/i })).not.toBeInTheDocument();
  });

  it("shows a truthful failure state without a readiness claim", async () => {
    const diagnosticsLoader: typeof loadThemeStudioDiagnostics = (input) =>
      loadThemeStudioDiagnostics({
        ...input,
        dependencies: {
          compile: () => { throw new Error("Compiler worker is offline"); },
          runtimeResolver: { resolve: async () => ({ runtime: "legacy", reason: "missing" }) },
        },
      });
    render(<MemoryRouter><ThemeStudio diagnosticsLoader={diagnosticsLoader} /></MemoryRouter>);

    expect(await screen.findByRole("heading", { name: "Reference compile blocked" })).toBeVisible();
    expect(screen.getByText("Compiler worker is offline")).toBeVisible();
    expect(screen.queryByText("Reference compile verified")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Run checks again" })).toBeEnabled());
  });
});
