import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { createSceneGraph } from "@/engine/scene-graph";
import { createCommandManager, createSceneReplaceCommand } from "@/engine/command";
import { createHistoryManager } from "@/engine/history";
import { validateSceneTree } from "@/engine/validation";
import type { SceneNode, SceneTree } from "@/types";
import { createComponentSystem } from "./ComponentSystem";

const node = (
  id: string,
  type: SceneNode["type"],
  name: string,
  parentId: string | null,
  x: number,
  y: number,
  width: number,
  height: number,
): SceneNode => createSceneNode({
  id,
  type,
  name,
  transform: { x, y, width, height },
  props: type === "text" ? { text: name, fontSize: 18 } : {},
}, parentId, 1);

const fixture = (): SceneTree => {
  const root = node("root", "section", "Page", null, 0, 0, 1200, 900);
  const card = node("card", "container", "Product card", root.id, 40, 40, 320, 220);
  const title = node("card-title", "text", "Master title", card.id, 20, 18, 280, 42);
  const image = node("card-image", "image", "Product image", card.id, 20, 70, 280, 120);
  image.props = { src: "/master.webp", alt: "Master" };
  card.childIds = [title.id, image.id];

  const horizontal = node("horizontal", "container", "Horizontal card", root.id, 40, 340, 520, 150);
  const horizontalTitle = node("horizontal-title", "text", "Horizontal title", horizontal.id, 190, 20, 300, 40);
  const horizontalImage = node("horizontal-image", "image", "Horizontal image", horizontal.id, 20, 20, 150, 110);
  horizontalImage.props = { src: "/horizontal.webp", alt: "Horizontal" };
  horizontal.childIds = [horizontalTitle.id, horizontalImage.id];
  root.childIds = [card.id, horizontal.id];
  return validateSceneTree({
    rootNodeId: root.id,
    nodes: Object.fromEntries([root, card, title, image, horizontal, horizontalTitle, horizontalImage]
      .map((entry) => [entry.id, entry])),
  });
};

const instanceNodeForSource = (scene: SceneTree, instanceRootId: string, sourceId: string) =>
  Object.values(scene.nodes).find((candidate) =>
    candidate.extensions?.componentInstanceId === instanceRootId &&
    candidate.extensions?.componentSourceNodeId === sourceId,
  );

describe("ComponentSystem", () => {
  it("creates a definition and a physical editable instance", () => {
    const components = createComponentSystem();
    const defined = components.createDefinition(fixture(), "card", {
      definitionId: "product-card",
      name: "Product card",
    });
    const instantiated = components.instantiate(defined.scene, "product-card", "root", {
      x: 640,
      y: 80,
    });
    const instanceId = instantiated.instanceRootId as string;
    const instance = instantiated.scene.nodes[instanceId];

    expect(instance.meta.componentId).toBe("product-card");
    expect(instance.meta.componentInstance).toMatchObject({
      componentDefinitionId: "product-card",
      variantId: "default",
      detached: false,
    });
    expect(instance.transform.x).toBe(640);
    expect(instance.transform.y).toBe(80);
    expect(instanceNodeForSource(instantiated.scene, instanceId, "card-title")?.props.text)
      .toBe("Master title");
    components.assertScene(instantiated.scene);
  });

  it("propagates structural master updates while retaining scoped content overrides", () => {
    const components = createComponentSystem();
    const defined = components.createDefinition(fixture(), "card", {
      definitionId: "product-card",
    });
    const instantiated = components.instantiate(defined.scene, "product-card", "root", {
      x: 640,
      y: 80,
    });
    const instanceId = instantiated.instanceRootId as string;
    const edited = structuredClone(instantiated.scene);
    const instanceTitle = instanceNodeForSource(edited, instanceId, "card-title") as SceneNode;
    instanceTitle.props.text = "Merchant title";
    const captured = components.captureOverrides(edited, instanceId);

    captured.nodes["card-title"].props.text = "Updated master title";
    captured.nodes["card-title"].transform.width = 240;
    const propagated = components.updateDefinition(captured, "product-card").scene;
    const updatedTitle = instanceNodeForSource(propagated, instanceId, "card-title") as SceneNode;

    expect(updatedTitle.props.text).toBe("Merchant title");
    expect(updatedTitle.transform.width).toBe(240);
    expect(propagated.nodes[instanceId].transform).toMatchObject({ x: 640, y: 80 });
    expect(propagated.nodes[instanceId].meta.componentInstance?.overrides).toHaveLength(1);
  });

  it("keeps compatible overrides through a variant swap and can reset them", () => {
    const components = createComponentSystem();
    let scene = components.createDefinition(fixture(), "card", {
      definitionId: "product-card",
    }).scene;
    scene = components.createVariant(scene, "product-card", "horizontal", {
      id: "horizontal",
      name: "Horizontal",
    }).scene;
    const instantiated = components.instantiate(scene, "product-card", "root");
    const instanceId = instantiated.instanceRootId as string;
    scene = components.applyOverride(instantiated.scene, instanceId, {
      sourceNodeId: "card-title",
      scope: "text",
      patch: { props: { text: "Instance title", fontSize: 999 } },
    });
    scene = components.swapVariant(scene, instanceId, "horizontal");

    expect(instanceNodeForSource(scene, instanceId, "card-title")?.props.text).toBe("Instance title");
    expect(instanceNodeForSource(scene, instanceId, "card-title")?.props.fontSize).toBe(18);
    scene = components.resetOverrides(scene, instanceId, { scope: "text" });
    expect(instanceNodeForSource(scene, instanceId, "card-title")?.props.text).toBe("Horizontal title");
  });

  it("detaches into a valid independent subtree and reports cross-page impact", () => {
    const components = createComponentSystem();
    const defined = components.createDefinition(fixture(), "card", {
      definitionId: "product-card",
    });
    const first = components.instantiate(defined.scene, "product-card", "root");
    const second = components.instantiate(first.scene, "product-card", "root");
    const firstId = first.instanceRootId as string;
    const secondId = second.instanceRootId as string;
    const impact = components.getImpact("product-card", [
      { pageId: "home", scene: second.scene },
      { pageId: "catalog", scene: first.scene },
    ]);
    const detached = components.detach(second.scene, firstId);

    expect(impact).toMatchObject({ instanceCount: 3, pageCount: 2 });
    expect(detached.nodes[firstId].meta.componentId).toBeUndefined();
    expect(detached.nodes[firstId].meta.componentInstance).toBeUndefined();
    expect(detached.nodes[secondId].meta.componentInstance).toBeDefined();
    expect(components.getInstanceRootId(detached, firstId)).toBeNull();
    components.assertScene(detached);
  });

  it("undoes and redoes master propagation as one command", () => {
    const components = createComponentSystem();
    let before = components.createDefinition(fixture(), "card", {
      definitionId: "product-card",
    }).scene;
    const instantiated = components.instantiate(before, "product-card", "root");
    before = instantiated.scene;
    const instanceId = instantiated.instanceRootId as string;
    const edited = structuredClone(before);
    edited.nodes["card-title"].props.text = "Master v2";
    const after = components.updateDefinition(edited, "product-card").scene;
    const graph = createSceneGraph({ initialTree: before });
    const history = createHistoryManager();
    const commands = createCommandManager({ historyManager: history });
    const context = { sceneGraph: graph };

    commands.dispatch(createSceneReplaceCommand(before, after, "Update product card"), context);
    expect(instanceNodeForSource(graph.serializeTree(), instanceId, "card-title")?.props.text)
      .toBe("Master v2");
    expect(history.getSnapshot().undoDepth).toBe(1);

    history.undo(context);
    expect(instanceNodeForSource(graph.serializeTree(), instanceId, "card-title")?.props.text)
      .toBe("Master title");
    history.redo(context);
    expect(instanceNodeForSource(graph.serializeTree(), instanceId, "card-title")?.props.text)
      .toBe("Master v2");
  });
});
