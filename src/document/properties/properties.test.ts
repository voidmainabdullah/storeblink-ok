import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode, type SceneTree } from "@/types";
import { sceneStoreCommandGraph, sceneStoreGraph } from "@/stores/sceneGraphAdapter";
import { useSceneStore } from "@/stores/scene.store";
import type { Command } from "@/engine/command";
import { createPropertyEngine } from "./engine";
import { createPropertyRegistry, registerDefaultStyleProperties } from "./registry";

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

const loadScene = () => {
  const root = createNode({ id: "root", type: "section", name: "Root", childIds: ["shape", "sibling"] });
  const shape = createNode({ id: "shape", parentId: "root", transform: { ...DEFAULT_TRANSFORM, width: 80, height: 60 } });
  const sibling = createNode({ id: "sibling", parentId: "root", transform: { ...DEFAULT_TRANSFORM, width: 100, height: 60 } });
  const tree: SceneTree = { rootNodeId: "root", nodes: { root, shape, sibling } };
  useSceneStore.getState().replaceSceneFromEngine(tree);
};

describe("property registry and engine", () => {
  beforeEach(() => {
    useSceneStore.getState().clearSceneFromEngine();
    loadScene();
  });

  it("registers schemas and falls back to shared schemas for unknown element types", () => {
    const registry = createPropertyRegistry();
    registerDefaultStyleProperties(registry);
    registry.register("text", {
      key: "props.text",
      group: "typography",
      editor: "text",
      defaultValue: "",
      validate: (value) => typeof value === "string",
    });

    expect(registry.getSchema("shape", "transform.width")?.key).toBe("transform.width");
    expect(registry.getSchema("text", "props.text")?.key).toBe("props.text");
  });

  it("reads current values and mixed multi-selection state", () => {
    const engine = createPropertyEngine();
    expect(engine.read("shape", "transform.width")).toBe(80);
    expect(engine.readMixed(["shape", "sibling"], "transform.width")).toEqual({ value: 80, mixed: true });
    expect(engine.readMixed(["shape", "sibling"], "transform.height")).toEqual({ value: 60, mixed: false });
  });

  it("rejects invalid values before dispatch and leaves scene state unchanged", () => {
    const onDispatch = vi.fn();
    const engine = createPropertyEngine({
      readContext: { sceneGraph: sceneStoreGraph },
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      onDispatch,
    });

    expect(() => engine.write(["shape"], "transform.width", -10)).toThrow(/Invalid value/);
    expect(onDispatch).not.toHaveBeenCalled();
    expect(useSceneStore.getState().nodes.shape.transform.width).toBe(80);
  });

  it("writes multi-selection properties as one command with per-node changes", () => {
    const commands: Command[] = [];
    const engine = createPropertyEngine({
      readContext: { sceneGraph: sceneStoreGraph },
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      onDispatch: (command, ctx) => {
        commands.push(command);
        command.execute(ctx);
      },
    });

    engine.write(["shape", "sibling"], "transform.width", 120);

    expect(commands).toHaveLength(1);
    expect((commands[0].payload as { changes: unknown[] }).changes).toHaveLength(2);
    expect(useSceneStore.getState().nodes.shape.transform.width).toBe(120);
    expect(useSceneStore.getState().nodes.sibling.transform.width).toBe(120);
  });
});
