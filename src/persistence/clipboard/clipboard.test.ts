import { beforeEach, describe, expect, it } from "vitest";
import { createSceneGraph } from "@/engine/scene-graph";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode, type SceneTree } from "@/types";
import { clear, cloneWithFreshIds, copy, getContent, hasContent } from "./index";

const createNode = (overrides: Partial<SceneNode>): SceneNode => ({
  id: "node",
  type: "shape",
  name: "Node",
  parentId: null,
  childIds: [],
  props: {},
  style: DEFAULT_STYLE,
  layout: DEFAULT_LAYOUT,
  transform: DEFAULT_TRANSFORM,
  meta: { locked: false, hidden: false, createdAt: 1, updatedAt: 1 },
  ...overrides,
});

const createTree = (): SceneTree => {
  const root = createNode({ id: "root", type: "section", name: "Root", childIds: ["shape"] });
  const shape = createNode({ id: "shape", parentId: "root", childIds: ["label"] });
  const label = createNode({ id: "label", type: "text", name: "Label", parentId: "shape" });
  return { rootNodeId: "root", nodes: { root, shape, label } };
};

describe("clipboard system", () => {
  beforeEach(() => clear());

  it("copies a serialized subtree without dispatching a command", () => {
    const graph = createSceneGraph({ initialTree: createTree() });
    copy(["shape"], { sceneGraph: graph });
    expect(hasContent()).toBe(true);
    expect(getContent()?.map((node) => node.id)).toEqual(["shape", "label"]);
  });

  it("freshens ids and remaps internal parent-child references for paste/duplicate", () => {
    const graph = createSceneGraph({ initialTree: createTree() });
    copy(["shape"], { sceneGraph: graph });
    const fresh = cloneWithFreshIds(getContent()!, (source) => `${source.id}-copy`);
    expect(fresh.map((node) => node.id)).toEqual(["shape-copy", "label-copy"]);
    expect(fresh[0].childIds).toEqual(["label-copy"]);
    expect(fresh[1].parentId).toBe("shape-copy");
  });
});
