import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, DEFAULT_STYLE, DEFAULT_TRANSFORM, type SceneNode, type SceneTree } from "@/types";
import { sceneStoreCommandGraph, sceneStoreGraph } from "@/stores/sceneGraphAdapter";
import { useSceneStore } from "@/stores/scene.store";
import { useTransformStore } from "@/stores/transform.store";
import { useResponsiveStore } from "@/stores/responsive.store";
import { responsiveSystem } from "@/layout/responsive";
import { assetSystem } from "@/assets/system";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import {
  themeChromeNodeSlot,
  themeChromeSystem,
} from "@/theme-engine/chrome";
import { createTransformSystem } from "./state";

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
    childIds: ["shape", "sibling"],
    transform: { ...DEFAULT_TRANSFORM, width: 300, height: 200 },
  });
  const shape = createNode({
    id: "shape",
    name: "Shape",
    parentId: "root",
    transform: { ...DEFAULT_TRANSFORM, x: 20, y: 30, width: 80, height: 60, zIndex: 2 },
  });
  const sibling = createNode({
    id: "sibling",
    name: "Sibling",
    parentId: "root",
    transform: { ...DEFAULT_TRANSFORM, x: 60, y: 30, width: 80, height: 60, zIndex: 9 },
  });
  const tree: SceneTree = { rootNodeId: "root", nodes: { root, shape, sibling } };
  useSceneStore.getState().replaceSceneFromEngine(tree);
};

describe("transform system", () => {
  beforeEach(() => {
    useSceneStore.getState().clearSceneFromEngine();
    useTransformStore.getState().clearTransformFromTransformSystem();
    useResponsiveStore.setState({ activeBreakpoint: "desktop" });
    loadScene();
  });

  it("keeps scene.store untouched during live preview and commits one command at gesture end", () => {
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });
    const startRevision = useSceneStore.getState().revision;

    transform.beginTransform(["shape"], "move");
    transform.updateTransform({ x: 13, y: 17 });
    transform.flushPreview();

    expect(useSceneStore.getState().revision).toBe(startRevision);
    expect(useSceneStore.getState().nodes.shape.transform).toMatchObject({ x: 20, y: 30 });
    expect(useTransformStore.getState().previewTransforms.shape).toMatchObject({ x: 33, y: 47 });

    transform.commitTransform();
    expect(useSceneStore.getState().revision).toBe(startRevision + 1);
    expect(useSceneStore.getState().nodes.shape.transform).toMatchObject({ x: 33, y: 47 });
    expect(useTransformStore.getState().previewTransforms).toEqual({});
  });

  it("cancels preview without mutating scene.store", () => {
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });
    const startRevision = useSceneStore.getState().revision;

    transform.beginTransform(["shape"], "move");
    transform.updateTransform({ x: 40, y: 40 });
    transform.flushPreview();
    transform.cancelTransform();

    expect(useSceneStore.getState().revision).toBe(startRevision);
    expect(useSceneStore.getState().nodes.shape.transform).toMatchObject({ x: 20, y: 30 });
    expect(useTransformStore.getState().previewTransforms).toEqual({});
  });

  it("temporarily elevates active transforms without mutating scene z-index or history state", () => {
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });
    const startRevision = useSceneStore.getState().revision;
    const originalShapeZ = useSceneStore.getState().nodes.shape.transform.zIndex;
    const originalSiblingZ = useSceneStore.getState().nodes.sibling.transform.zIndex;

    transform.beginTransform(["shape"], "move");

    const elevation = useTransformStore.getState().interactionElevation;
    expect(elevation?.activeNodeIds).toEqual(["shape"]);
    expect(elevation?.originalZIndex.shape).toBe(originalShapeZ);
    expect(elevation?.elevatedZIndex.shape).toBeGreaterThan(originalSiblingZ);
    expect(useSceneStore.getState().nodes.shape.transform.zIndex).toBe(originalShapeZ);
    expect(useSceneStore.getState().revision).toBe(startRevision);

    transform.commitTransform();

    expect(useTransformStore.getState().interactionElevation).toBeNull();
    expect(useSceneStore.getState().revision).toBe(startRevision);
    expect(useSceneStore.getState().nodes.shape.transform.zIndex).toBe(originalShapeZ);
    expect(useSceneStore.getState().nodes.sibling.transform.zIndex).toBe(originalSiblingZ);
  });

  it("scales text font size when a text node is resized", () => {
    const text = createNode({
      id: "text",
      type: "text",
      name: "Text",
      parentId: "root",
      props: { text: "Resize me", fontSize: 20 },
      transform: { ...DEFAULT_TRANSFORM, x: 20, y: 110, width: 160, height: 40 },
    });
    useSceneStore.setState((state) => ({
      ...state,
      nodes: {
        ...state.nodes,
        root: { ...state.nodes.root, childIds: [...state.nodes.root.childIds, "text"] },
        text,
      },
      revision: state.revision + 1,
    }));
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });

    transform.beginTransform(["text"], "resize");
    transform.updateTransform({ nodes: { text: { width: 180, height: 80 } } });
    transform.flushPreview();
    transform.commitTransform();

    expect(useSceneStore.getState().nodes.text.transform).toMatchObject({ width: 180, height: 80 });
    expect(useSceneStore.getState().nodes.text.props.fontSize).toBe(40);
  });

  it("commits responsive transforms only to the active breakpoint", () => {
    const responsiveScene = responsiveSystem.ensureSceneOverrides({
      rootNodeId: useSceneStore.getState().rootNodeId,
      nodes: useSceneStore.getState().nodes,
    });
    useSceneStore.getState().replaceSceneFromEngine(responsiveScene);
    responsiveSystem.activate("mobile");
    const beforeBase = useSceneStore.getState().nodes.shape.transform;
    const beforeDesktop = responsiveSystem.resolveNode(useSceneStore.getState().nodes.shape, "desktop").transform;
    const beforeMobile = responsiveSystem.resolveNode(useSceneStore.getState().nodes.shape, "mobile").transform;
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });

    transform.beginTransform(["shape"], "move");
    transform.updateTransform({ x: 15, y: 10 });
    transform.flushPreview();
    transform.commitTransform();

    const stored = useSceneStore.getState().nodes.shape;
    expect(stored.transform).toEqual(beforeBase);
    expect(responsiveSystem.resolveNode(stored, "desktop").transform).toEqual(beforeDesktop);
    expect(responsiveSystem.resolveNode(stored, "mobile").transform.x).toBeCloseTo(beforeMobile.x + 15);
  });

  it("commits logo move and resize previews and preserves them after theme reconciliation", () => {
    let logoScene = buildBasicTemplateScene({}, []);
    logoScene = assetSystem.upsertImage(logoScene, {
      id: "transform-logo",
      kind: "image",
      originalSource: "data:image/png;base64,LOGO",
      originalName: "logo.png",
      intrinsicWidth: 400,
      intrinsicHeight: 100,
      aspectRatio: 4,
      format: "png",
      altText: "Logo",
      createdAt: 1,
      updatedAt: 1,
    });
    const settings = themeChromeSystem.getSettings(logoScene);
    settings.logo.assetId = "transform-logo";
    logoScene = themeChromeSystem.applySettings(logoScene, settings);
    useSceneStore.getState().replaceSceneFromEngine(logoScene);
    responsiveSystem.activate("desktop");
    const logo = Object.values(useSceneStore.getState().nodes).find(
      (node) => themeChromeNodeSlot(node) === "logo",
    )!;
    const initial = responsiveSystem.resolveNode(logo, "desktop").transform;
    const initialMobile = responsiveSystem.resolveNode(logo, "mobile").transform;
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });

    transform.beginTransform([logo.id], "move");
    transform.updateTransform({ x: 61, y: 17 });
    transform.flushPreview();
    expect(useTransformStore.getState().previewTransforms[logo.id]).toMatchObject({
      x: initial.x + 61,
      y: initial.y + 17,
    });
    transform.commitTransform();

    transform.beginTransform([logo.id], "resize");
    transform.updateTransform({
      nodes: {
        [logo.id]: {
          width: 280,
          height: 70,
        },
      },
    });
    transform.flushPreview();
    transform.commitTransform();

    const stored = useSceneStore.getState().nodes[logo.id];
    const committed = responsiveSystem.resolveNode(stored, "desktop").transform;
    expect(responsiveSystem.hasManualTransform(stored, "desktop")).toBe(true);
    expect(committed).toMatchObject({
      x: initial.x + 61,
      y: initial.y + 17,
      width: 280,
      height: 70,
    });
    const committedMobile = responsiveSystem.resolveNode(stored, "mobile").transform;
    expect(stored.extensions?.responsiveTransformPolicy).toBe("linked-anchor");
    expect(committedMobile.width).not.toBeCloseTo(initialMobile.width);
    expect(committedMobile.x).not.toBeCloseTo(initialMobile.x);

    const reconciled = themeChromeSystem.ensureScene(
      sceneStoreGraph.serializeTree(),
    );
    expect(
      responsiveSystem.resolveNode(reconciled.nodes[logo.id], "desktop")
        .transform,
    ).toEqual(committed);
  });

  it("commits mixed responsive and base nodes atomically in one multi-selection transform", () => {
    const responsiveScene = responsiveSystem.ensureSceneOverrides({
      rootNodeId: useSceneStore.getState().rootNodeId,
      nodes: useSceneStore.getState().nodes,
    });
    responsiveScene.nodes.sibling.layout = DEFAULT_LAYOUT;
    useSceneStore.getState().replaceSceneFromEngine(responsiveScene);
    responsiveSystem.activate("mobile");
    const shapeBase = useSceneStore.getState().nodes.shape.transform;
    const shapeMobile = responsiveSystem.resolveNode(useSceneStore.getState().nodes.shape, "mobile").transform;
    const siblingBase = useSceneStore.getState().nodes.sibling.transform;
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });

    transform.beginTransform(["shape", "sibling"], "move");
    transform.updateTransform({ x: 12, y: 9 });
    transform.flushPreview();
    transform.commitTransform();

    const stored = useSceneStore.getState().nodes;
    expect(stored.shape.transform).toEqual(shapeBase);
    expect(responsiveSystem.resolveNode(stored.shape, "mobile").transform).toMatchObject({
      x: shapeMobile.x + 12,
      y: shapeMobile.y + 9,
    });
    expect(stored.sibling.transform).toMatchObject({
      x: siblingBase.x + 12,
      y: siblingBase.y + 9,
    });
  });

  it("treats mapped resize patches as absolute values from gesture start", () => {
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });

    transform.beginTransform(["shape"], "resize");
    for (let frame = 1; frame <= 500; frame += 1) {
      transform.updateTransform({
        nodes: {
          shape: {
            x: 20 + frame * 0.25,
            y: 30 + frame * 0.125,
            width: 80 + frame,
            height: 60 + frame * 0.5,
          },
        },
      });
      transform.flushPreview();
    }

    expect(useTransformStore.getState().previewTransforms.shape).toMatchObject({
      x: 145,
      y: 92.5,
      width: 580,
      height: 310,
    });
    expect(useSceneStore.getState().nodes.shape.transform).toMatchObject({ x: 20, y: 30, width: 80, height: 60 });

    transform.commitTransform();
    expect(useSceneStore.getState().nodes.shape.transform).toMatchObject({
      x: 145,
      y: 92.5,
      width: 580,
      height: 310,
    });
  });

  it("publishes one atomic preview source to renderer/overlay subscribers", () => {
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });
    const published: Array<Readonly<Record<string, unknown>>> = [];
    const unsubscribe = transform.subscribePreview((transforms) => published.push(transforms));

    transform.beginTransform(["shape"], "resize");
    transform.updateTransform({ nodes: { shape: { x: 20, y: 30, width: 120, height: 90 } } });
    transform.flushPreview();

    expect(published).toHaveLength(1);
    expect(published[0].shape).toMatchObject({ x: 20, y: 30, width: 120, height: 90 });
    unsubscribe();
  });

  it("suppresses duplicate preview publications", () => {
    const transform = createTransformSystem({
      sceneGraph: sceneStoreGraph,
      commandContext: { sceneGraph: sceneStoreCommandGraph },
      gridSize: 1000,
      snapThreshold: 0,
    });
    let publications = 0;
    const unsubscribe = transform.subscribePreview(() => publications += 1);

    transform.beginTransform(["shape"], "resize");
    const samePatch = { nodes: { shape: { x: 20, y: 30, width: 100, height: 75 } } };
    transform.updateTransform(samePatch);
    transform.flushPreview();
    transform.updateTransform(samePatch);
    transform.flushPreview();

    expect(publications).toBe(1);
    unsubscribe();
  });

});
