import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createComponentSystem } from "@/document/components";
import { createSceneNode } from "@/engine/scene-graph";
import { createEditorKernel, EngineProvider } from "@/engine/kernel";
import { validateSceneTree } from "@/engine/validation";
import type { SceneTree } from "@/types";
import { ComponentInspector } from "./ComponentInspector";

const fixture = (): SceneTree => {
  const root = createSceneNode({ id: "root", type: "section", name: "Page" }, null);
  const card = createSceneNode({ id: "card", type: "container", name: "Card" }, root.id);
  const title = createSceneNode({
    id: "title",
    type: "text",
    name: "Title",
    props: { text: "Title" },
  }, card.id);
  root.childIds = [card.id];
  card.childIds = [title.id];
  return validateSceneTree({
    rootNodeId: root.id,
    nodes: { [root.id]: root, [card.id]: card, [title.id]: title },
  });
};

const callbacks = () => ({
  onCreate: vi.fn(),
  onUpdateMaster: vi.fn(),
  onCreateVariant: vi.fn(),
  onCreateInstance: vi.fn(),
  onSwapVariant: vi.fn(),
  onResetOverrides: vi.fn(),
  onDetach: vi.fn(),
});

describe("ComponentInspector", () => {
  it("offers component creation for an unmanaged container", () => {
    const scene = fixture();
    const handlers = callbacks();
    render(
      <EngineProvider kernel={createEditorKernel()}>
        <ComponentInspector node={scene.nodes.card} scene={scene} {...handlers} />
      </EngineProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create component" }));
    expect(handlers.onCreate).toHaveBeenCalledOnce();
  });

  it("exposes variant, reset, and detach actions for an instance", () => {
    const components = createComponentSystem();
    let scene = components.createDefinition(fixture(), "card", {
      definitionId: "card-component",
    }).scene;
    const created = components.instantiate(scene, "card-component", "root");
    scene = created.scene;
    const instanceId = created.instanceRootId as string;
    scene = components.applyOverride(scene, instanceId, {
      sourceNodeId: "title",
      scope: "text",
      patch: { props: { text: "Override" } },
    });
    const handlers = callbacks();
    render(
      <EngineProvider kernel={createEditorKernel()}>
        <ComponentInspector node={scene.nodes[instanceId]} scene={scene} {...handlers} />
      </EngineProvider>,
    );

    expect(screen.getByText("1 controlled override")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    fireEvent.click(screen.getByRole("button", { name: "Detach" }));
    expect(handlers.onResetOverrides).toHaveBeenCalledWith(instanceId);
    expect(handlers.onDetach).toHaveBeenCalledWith(instanceId);
  });
});
