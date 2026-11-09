import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode, type SceneTree } from "@/types";
import { sceneStoreCommandGraph } from "@/stores/sceneGraphAdapter";
import { useSceneStore } from "@/stores/scene.store";
import { history } from "@/engine/history";
import { createDeleteCommand, createFieldUpdateCommand, createInsertCommand, createTransformCommand, dispatch } from "./index";

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
  const root = createNode({
    id: "root",
    type: "section",
    name: "Root",
    childIds: ["shape"],
    transform: { ...DEFAULT_TRANSFORM, width: 300, height: 200 },
  });
  const shape = createNode({
    id: "shape",
    name: "Shape",
    parentId: "root",
    transform: { ...DEFAULT_TRANSFORM, x: 20, y: 30, width: 80, height: 60 },
  });
  const tree: SceneTree = { rootNodeId: "root", nodes: { root, shape } };
  useSceneStore.getState().replaceSceneFromEngine(tree);
};

describe("command system", () => {
  beforeEach(() => {
    history.clear();
    useSceneStore.getState().clearSceneFromEngine();
    loadScene();
  });

  it("dispatches transform commands through execute and exposes a working undo seam", () => {
    const before = useSceneStore.getState().getNodeSnapshot("shape")?.transform;
    expect(before).toBeDefined();

    const after = { ...before!, x: 96, y: 112, rotation: 15 };
    const command = createTransformCommand("move", [{ nodeId: "shape", before: before!, after }]);
    const startRevision = useSceneStore.getState().revision;

    dispatch(command, { sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.transform).toMatchObject({ x: 96, y: 112, rotation: 15 });
    expect(useSceneStore.getState().revision).toBe(startRevision + 1);

    command.undo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.transform).toMatchObject({ x: 20, y: 30, rotation: 0 });
  });

  it("records dispatches in history and uses execute as the redo fallback", () => {
    const before = useSceneStore.getState().getNodeSnapshot("shape")!.transform;
    const after = { ...before, x: 140 };
    dispatch(createTransformCommand("move", [{ nodeId: "shape", before, after }]), { sceneGraph: sceneStoreCommandGraph });

    history.undo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.transform.x).toBe(20);

    history.redo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.transform.x).toBe(140);
  });

  it("merges rapid transform commands into one undo entry", () => {
    const start = useSceneStore.getState().getNodeSnapshot("shape")!.transform;
    const mid = { ...start, x: 21 };
    const end = { ...start, x: 22 };

    dispatch(createTransformCommand("move", [{ nodeId: "shape", before: start, after: mid }]), { sceneGraph: sceneStoreCommandGraph });
    dispatch(createTransformCommand("move", [{ nodeId: "shape", before: mid, after: end }]), { sceneGraph: sceneStoreCommandGraph });

    expect(useSceneStore.getState().nodes.shape.transform.x).toBe(22);
    history.undo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.transform.x).toBe(20);
  });

  it("delete undo restores the exact original node id", () => {
    dispatch(createDeleteCommand(["shape"]), { sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape).toBeUndefined();

    history.undo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape).toBeDefined();
    expect(useSceneStore.getState().nodes.root.childIds).toEqual(["shape"]);
  });

  it("inserts fresh-id nodes and undoes the insertion", () => {
    const inserted = createNode({
      id: "shape-copy",
      name: "Shape copy",
      parentId: "root",
      transform: { ...DEFAULT_TRANSFORM, x: 40, y: 50, width: 80, height: 60 },
    });

    dispatch(createInsertCommand([inserted], "root"), { sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes["shape-copy"]).toBeDefined();
    expect(useSceneStore.getState().nodes.root.childIds).toEqual(["shape", "shape-copy"]);

    history.undo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes["shape-copy"]).toBeUndefined();

    history.redo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes["shape-copy"]).toBeDefined();
  });

  it("updates generic fields through one field-update command", () => {
    dispatch(createFieldUpdateCommand("shape", "meta.hidden", false, true), { sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.meta.hidden).toBe(true);
    history.undo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.meta.hidden).toBe(false);
  });

  it("updates whole props, style, and transform objects for inspector commits", () => {
    const beforeProps = useSceneStore.getState().nodes.shape.props;
    const beforeStyle = useSceneStore.getState().nodes.shape.style;
    const beforeTransform = useSceneStore.getState().nodes.shape.transform;

    dispatch(createFieldUpdateCommand("shape", "props", beforeProps, { label: "Scene backed" }), { sceneGraph: sceneStoreCommandGraph });
    dispatch(
      createFieldUpdateCommand("shape", "style", beforeStyle, { ...beforeStyle, opacity: 0.5 }),
      { sceneGraph: sceneStoreCommandGraph },
    );
    dispatch(
      createFieldUpdateCommand("shape", "transform", beforeTransform, { ...beforeTransform, x: 144 }),
      { sceneGraph: sceneStoreCommandGraph },
    );

    expect(useSceneStore.getState().nodes.shape.props.label).toBe("Scene backed");
    expect(useSceneStore.getState().nodes.shape.style.opacity).toBe(0.5);
    expect(useSceneStore.getState().nodes.shape.transform.x).toBe(144);
    expect(useSceneStore.getState().nodes.shape.extensions?.props).toBeUndefined();
  });

  it("updates multiple field changes through one field-update command", () => {
    const sibling = createNode({
      id: "sibling",
      name: "Sibling",
      parentId: "root",
      transform: { ...DEFAULT_TRANSFORM, width: 50, height: 50 },
    });
    useSceneStore.getState().replaceSceneFromEngine({
      rootNodeId: "root",
      nodes: {
        ...useSceneStore.getState().nodes,
        root: { ...useSceneStore.getState().nodes.root, childIds: ["shape", "sibling"] },
        sibling,
      },
    });

    dispatch(
      createFieldUpdateCommand("transform.width", [
        { nodeId: "shape", before: 80, after: 140 },
        { nodeId: "sibling", before: 50, after: 140 },
      ]),
      { sceneGraph: sceneStoreCommandGraph },
    );

    expect(useSceneStore.getState().nodes.shape.transform.width).toBe(140);
    expect(useSceneStore.getState().nodes.sibling.transform.width).toBe(140);
    history.undo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.transform.width).toBe(80);
    expect(useSceneStore.getState().nodes.sibling.transform.width).toBe(50);
  });

  it("coalesces rapid updates to the same inspector field into one undo entry", () => {
    const before = useSceneStore.getState().nodes.shape.style;
    const middle = { ...before, opacity: 0.6 };
    const after = { ...before, opacity: 0.25 };

    dispatch(createFieldUpdateCommand("shape", "style", before, middle), {
      sceneGraph: sceneStoreCommandGraph,
    });
    dispatch(createFieldUpdateCommand("shape", "style", middle, after), {
      sceneGraph: sceneStoreCommandGraph,
    });

    expect(useSceneStore.getState().nodes.shape.style.opacity).toBe(0.25);
    history.undo({ sceneGraph: sceneStoreCommandGraph });
    expect(useSceneStore.getState().nodes.shape.style.opacity).toBe(before.opacity);
    expect(history.canUndo()).toBe(false);
  });
});
