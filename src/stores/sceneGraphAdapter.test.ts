import { afterEach, describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import { sceneStoreCommandGraph } from "./sceneGraphAdapter";
import { useSceneStore } from "./scene.store";

describe("SceneStoreCommandGraph structural sharing", () => {
  afterEach(() => useSceneStore.getState().clearSceneFromEngine());

  it("preserves unaffected node references for selector-level rendering", () => {
    const root = createSceneNode({ id: "root", type: "section", name: "Root" }, null, 1);
    const first = createSceneNode({ id: "first", type: "text", name: "First", props: { text: "A" } }, root.id, 1);
    const second = createSceneNode({ id: "second", type: "text", name: "Second", props: { text: "B" } }, root.id, 1);
    root.childIds = [first.id, second.id];
    sceneStoreCommandGraph.deserializeTree({
      rootNodeId: root.id,
      nodes: { [root.id]: root, [first.id]: first, [second.id]: second },
    });
    const beforeFirst = useSceneStore.getState().nodes[first.id];
    const beforeSecond = useSceneStore.getState().nodes[second.id];

    sceneStoreCommandGraph.updateNode(first.id, { props: { text: "Changed" } });

    expect(useSceneStore.getState().nodes[first.id]).not.toBe(beforeFirst);
    expect(useSceneStore.getState().nodes[second.id]).toBe(beforeSecond);
  });

  it("retains the component library through ordinary node commands", () => {
    const root = createSceneNode({ id: "root", type: "section", name: "Root" }, null, 1);
    const child = createSceneNode({ id: "child", type: "text", name: "Child" }, root.id, 1);
    root.childIds = [child.id];
    const components = {
      version: 1 as const,
      definitions: {},
    };
    sceneStoreCommandGraph.deserializeTree({
      rootNodeId: root.id,
      nodes: { [root.id]: root, [child.id]: child },
      components,
    });

    sceneStoreCommandGraph.updateNode(child.id, { name: "Renamed" });

    expect(sceneStoreCommandGraph.serializeTree().components).toEqual(components);
  });
});
