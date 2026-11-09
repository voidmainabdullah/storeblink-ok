import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ENGINE_SCENE_TEMPLATES } from "@/editor/engine/engineTemplates";
import { EngineTemplatePanel } from "./EngineTemplatePanel";

describe("EngineTemplatePanel", () => {
  it("renders available themes in manifest catalog order without engine terminology", () => {
    render(
      <EngineTemplatePanel
        templates={ENGINE_SCENE_TEMPLATES}
        activeTemplateId="basic"
        applyingTemplateId={null}
        onApply={() => undefined}
        activePageName="Home"
      />,
    );

    expect(screen.getByText("4 themes available")).toBeInTheDocument();
    expect(screen.getByText("For Home")).toBeInTheDocument();
    expect(screen.queryByText(/installed themes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scene graph/i)).not.toBeInTheDocument();
    const templateCards = document.querySelectorAll("[data-template-id]");
    expect([...templateCards].map((node) => node.getAttribute("data-template-id"))).toEqual([
      "noir-chrono",
      "spark-fashion",
      "atelier",
      "basic",
    ]);
    expect(
      document.querySelector('[data-template-id="basic"]'),
    ).toHaveAttribute("data-template-active", "true");
    expect(screen.getByRole("button", { name: "Basic Store is current" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Review Basic Store/i })).not.toBeInTheDocument();
  });

  it("reviews an inactive theme before applying it to the named current page", () => {
    const onApply = vi.fn();
    render(
      <EngineTemplatePanel
        templates={ENGINE_SCENE_TEMPLATES}
        activeTemplateId="basic"
        applyingTemplateId={null}
        onApply={onApply}
        activePageName="Home"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View Atelier theme details" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Apply Atelier to Home?")).toBeInTheDocument();
    expect(screen.getByText(/replaces the editable design for/i)).toHaveTextContent("Home only");
    expect(screen.getByText(/Other store pages and storefront routes are not changed/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply to Home" }));
    expect(onApply).toHaveBeenCalledWith("atelier");
  });

  it("blocks theme review when the current package cannot migrate every page safely", () => {
    const onApply = vi.fn();
    const reason =
      "The current theme package cannot migrate every page safely while this store has custom pages, so nothing was changed.";
    render(
      <EngineTemplatePanel
        templates={ENGINE_SCENE_TEMPLATES}
        activeTemplateId="basic"
        applyingTemplateId={null}
        onApply={onApply}
        activePageName="Home"
        applicationBlockedReason={reason}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(reason);
    const atelierDetails = screen.getByRole("button", {
      name: "View Atelier theme details",
    });
    expect(atelierDetails).toBeDisabled();
    fireEvent.click(atelierDetails);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("exposes publication recovery as an explicit validated restore action", () => {
    const onRestore = vi.fn();
    render(
      <EngineTemplatePanel
        templates={ENGINE_SCENE_TEMPLATES}
        activeTemplateId="basic"
        applyingTemplateId={null}
        onApply={() => undefined}
        recoveryPoints={[{
          id: "server:recovery-one",
          sourceId: "recovery-one",
          source: "server",
          revision: 12,
          createdAt: "2026-07-29T00:00:00.000Z",
          label: "Published revision",
        }]}
        onRestore={onRestore}
      />,
    );

    expect(screen.getByText("Revision 12")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(onRestore).toHaveBeenCalledWith("server:recovery-one");
  });
});
