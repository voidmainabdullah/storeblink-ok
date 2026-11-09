import { cloneSceneNode, cloneSceneTree } from "@/engine/scene-graph";
import { validateSceneTree } from "@/engine/validation";
import { LayoutEngine, layoutEngine } from "@/layout/engine";
import {
  RESPONSIVE_BREAKPOINTS,
  ResponsiveSystem,
  responsiveSystem,
} from "@/layout/responsive";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { NodeId, SceneNode, SceneTree, TransformData } from "@/types";

export type StructuredLayoutSystemAPI = {
  isStructuredScene(scene: SceneTree): boolean;
  usesAuthoredResponsiveLayout(scene: SceneTree): boolean;
  reflowScene(scene: SceneTree): SceneTree;
  reorderNode(scene: SceneTree, nodeId: NodeId, targetIndex: number): SceneTree;
};

const breakpoints = Object.keys(RESPONSIVE_BREAKPOINTS) as ResponsiveBreakpoint[];

const structuredKind = (node: SceneNode | undefined): string | null => {
  const value = node?.extensions?.editorKind;
  return typeof value === "string" ? value : null;
};

const authoredResponsiveLayout = (scene: SceneTree): boolean => {
  const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
  return root?.extensions?.structuredLayoutPolicy === "authored-responsive";
};

const updateBreakpointTransform = (
  responsive: ResponsiveSystem,
  node: SceneNode,
  breakpoint: ResponsiveBreakpoint,
  patch: Partial<TransformData>,
): SceneNode => {
  if (responsive.hasManualTransform(node, breakpoint)) return node;
  const resolved = responsive.resolveNode(node, breakpoint);
  return {
    ...node,
    layout: responsive.updateLayout(node, breakpoint, {
      transform: { ...resolved.transform, ...patch },
    }),
    ...(breakpoint === "desktop" ? { transform: { ...resolved.transform, ...patch } } : {}),
  };
};

const reflowContentGroup = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  section: SceneNode,
  group: string,
  starts: Record<ResponsiveBreakpoint, { y: number; gap: number }>,
) => {
  const blocks = section.childIds
    .map((id) => scene.nodes[id])
    .filter((node): node is SceneNode => Boolean(node && node.extensions?.flowGroup === group));
  breakpoints.forEach((breakpoint) => {
    let y = starts[breakpoint].y;
    blocks.forEach((block) => {
      const current = scene.nodes[block.id];
      const resolved = responsive.resolveNode(current, breakpoint);
      scene.nodes[block.id] = updateBreakpointTransform(responsive, current, breakpoint, { y });
      if (!resolved.meta.hidden) y += resolved.transform.height + starts[breakpoint].gap;
    });
  });
};

const visibleStructuredBlocks = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  section: SceneNode,
  breakpoint: ResponsiveBreakpoint,
) =>
  section.childIds
    .map((id) => scene.nodes[id])
    .filter(
      (node): node is SceneNode =>
        Boolean(
          node &&
          node.extensions?.editorKind === "block" &&
          !responsive.resolveNode(node, breakpoint).meta.hidden,
        ),
    );

const reflowMobileStack = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  section: SceneNode,
  options: { startY: number; gap: number; reverseMedia: boolean },
): number => {
  const blocks = visibleStructuredBlocks(responsive, scene, section, "mobile");
  const ordered = options.reverseMedia
    ? [...blocks].sort((left, right) => Number(right.type === "image") - Number(left.type === "image"))
    : blocks;
  let y = options.startY;
  ordered.forEach((block) => {
    const current = scene.nodes[block.id];
    const resolved = responsive.resolveNode(current, "mobile");
    const height =
      block.type === "button"
        ? Math.max(48, resolved.transform.height)
        : block.type === "image"
          ? Math.max(260, resolved.transform.height)
          : resolved.transform.height;
    scene.nodes[block.id] = updateBreakpointTransform(responsive, current, "mobile", {
      x: 24,
      y,
      width: 342,
      height,
    });
    y += height + options.gap;
  });
  return y + 24;
};

const resolvedContentBottom = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  section: SceneNode,
  breakpoint: ResponsiveBreakpoint,
  minimumHeight: number,
): number => {
  const bottom = section.childIds.reduce((largest, childId) => {
    const child = scene.nodes[childId];
    if (!child) return largest;
    const resolved = responsive.resolveNode(child, breakpoint);
    if (resolved.meta.hidden) return largest;
    return Math.max(largest, resolved.transform.y + resolved.transform.height);
  }, 0);
  return Math.max(minimumHeight, bottom + (breakpoint === "mobile" ? 28 : 42));
};

const setSectionHeight = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  section: SceneNode,
  breakpoint: ResponsiveBreakpoint,
  height: number,
) => {
  const current = scene.nodes[section.id];
  scene.nodes[section.id] = updateBreakpointTransform(responsive, current, breakpoint, { height });
};

const reflowAuthoredSections = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  root: SceneNode,
  sections: SceneNode[],
): void => {
  breakpoints.forEach((breakpoint) => {
    let y = 0;
    sections.forEach((section) => {
      const current = scene.nodes[section.id];
      const resolved = responsive.resolveNode(current, breakpoint);
      if (resolved.meta.hidden) return;
      const targetY = responsive.hasManualTransform(current, breakpoint)
        ? resolved.transform.y
        : y;
      scene.nodes[section.id] = updateBreakpointTransform(
        responsive,
        current,
        breakpoint,
        { y: targetY },
      );
      y = Math.max(y, targetY) + resolved.transform.height;
    });
    const currentRoot = scene.nodes[root.id];
    scene.nodes[root.id] = updateBreakpointTransform(
      responsive,
      currentRoot,
      breakpoint,
      { height: Math.max(1, y) },
    );
  });
};

const reflowAuthoredNavigationSurfaces = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
): void => {
  Object.values(scene.nodes).forEach((surface) => {
    const config = surface.extensions?.navigationSurfaceLayout;
    if (!config || typeof config !== "object") return;
    const surfaceConfig = config as Record<string, unknown>;
    if (surfaceConfig.mode !== "vertical-list") return;
    const links = surface.childIds
      .map((id) => scene.nodes[id])
      .filter(
        (node): node is SceneNode =>
          Boolean(node?.extensions?.navigationTarget),
      );
    if (!links.length) return;
    (["tablet", "mobile"] as const).forEach((breakpoint) => {
      const breakpointConfig = surfaceConfig[breakpoint];
      if (!breakpointConfig || typeof breakpointConfig !== "object") return;
      const values = breakpointConfig as Record<string, unknown>;
      const paddingTop = Math.max(0, Number(values.paddingTop ?? 16));
      const gap = Math.max(0, Number(values.gap ?? 8));
      let y = paddingTop;
      links.forEach((link) => {
        const current = scene.nodes[link.id];
        const resolved = responsive.resolveNode(current, breakpoint);
        const targetY = responsive.hasManualTransform(current, breakpoint)
          ? resolved.transform.y
          : y;
        scene.nodes[link.id] = updateBreakpointTransform(
          responsive,
          current,
          breakpoint,
          { y: targetY },
        );
        y = Math.max(y, targetY) + resolved.transform.height + gap;
      });
      const currentSurface = scene.nodes[surface.id];
      const resolvedSurface = responsive.resolveNode(currentSurface, breakpoint);
      scene.nodes[surface.id] = updateBreakpointTransform(
        responsive,
        currentSurface,
        breakpoint,
        { height: Math.max(resolvedSurface.transform.height, y + paddingTop - gap) },
      );
    });
  });
};

const syncHeaderNavigation = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  section: SceneNode,
) => {
  if (section.extensions?.sectionType !== "header") return;
  const links = section.childIds
    .map((id) => scene.nodes[id])
    .filter(
      (node): node is SceneNode =>
        Boolean(
          node &&
          node.extensions?.editorKind === "block" &&
          node.extensions?.blockType === "navigation-link",
        ),
    );
  if (!links.length) return;

  const layoutLinks = (
    breakpoint: "desktop" | "tablet",
    start: number,
    end: number,
  ) => {
    const gap = breakpoint === "desktop" ? 8 : 5;
    const width = Math.max(52, Math.min(106, (end - start - gap * (links.length - 1)) / links.length));
    links.forEach((link, index) => {
      let current = scene.nodes[link.id];
      const resolved = responsive.resolveNode(current, breakpoint);
      current = updateBreakpointTransform(responsive, current, breakpoint, {
        x: start + index * (width + gap),
        y: breakpoint === "desktop" ? 29 : 25,
        width,
        height: 38,
      });
      current.layout = responsive.updateLayout(current, breakpoint, {
        props: { fontSize: Math.min(Number(resolved.props.fontSize ?? 14), width < 72 ? 12 : 14) },
        meta: { ...resolved.meta, hidden: false },
      });
      scene.nodes[link.id] = current;
    });
  };
  layoutLinks("desktop", 380, 974);
  layoutLinks("tablet", 214, 620);

  links.forEach((link) => {
    const resolved = responsive.resolveNode(scene.nodes[link.id], "mobile");
    scene.nodes[link.id].layout = responsive.updateLayout(scene.nodes[link.id], "mobile", {
      meta: { ...resolved.meta, hidden: true },
    });
  });

  const drawer = section.childIds
    .map((id) => scene.nodes[id])
    .find((node) => node?.extensions?.runtimeVisibility === "mobile-menu");
  if (!drawer) return;
  const obsoleteIds = drawer.childIds.filter((childId) => {
    const child = scene.nodes[childId];
    return child?.extensions?.mobileNavigationMirror === true || childId.startsWith("basic-mobile-");
  });
  obsoleteIds.forEach((nodeId) => delete scene.nodes[nodeId]);
  drawer.childIds = drawer.childIds.filter((childId) => !obsoleteIds.includes(childId));

  links.forEach((link, index) => {
    let mirror = cloneSceneNode(scene.nodes[link.id]);
    mirror.id = `${link.id}--mobile`;
    mirror.name = `${link.name} mobile`;
    mirror.parentId = drawer.id;
    mirror.childIds = [];
    mirror.extensions = {
      ...(mirror.extensions ?? {}),
      editorKind: "internal",
      structured: false,
      selectable: false,
      mobileNavigationMirror: true,
    };
    mirror.props = {
      ...mirror.props,
      background: "#f6f6f4",
      color: "#171717",
      border: "0",
      fontSize: 16,
      fontWeight: 650,
    };
    mirror = updateBreakpointTransform(responsive, mirror, "desktop", { x: 0, y: 0, width: 1, height: 1 });
    mirror.layout = responsive.updateLayout(mirror, "desktop", {
      meta: { hidden: true, locked: false },
    });
    mirror = updateBreakpointTransform(responsive, mirror, "tablet", {
      x: 16,
      y: 18 + index * 56,
      width: 736,
      height: 48,
      zIndex: index + 2,
    });
    mirror.layout = responsive.updateLayout(mirror, "tablet", {
      meta: { hidden: false, locked: false },
    });
    mirror = updateBreakpointTransform(responsive, mirror, "mobile", {
      x: 16,
      y: 18 + index * 56,
      width: 334,
      height: 48,
      zIndex: index + 2,
    });
    mirror.layout = responsive.updateLayout(mirror, "mobile", {
      meta: { hidden: false, locked: false },
    });
    scene.nodes[mirror.id] = mirror;
    drawer.childIds.push(mirror.id);
  });
  scene.nodes[drawer.id] = updateBreakpointTransform(
    responsive,
    scene.nodes[drawer.id],
    "mobile",
    { height: Math.max(96, links.length * 56 + 36) },
  );
  scene.nodes[drawer.id] = updateBreakpointTransform(
    responsive,
    scene.nodes[drawer.id],
    "tablet",
    { height: Math.max(96, links.length * 56 + 36) },
  );
};

const reflowProductCards = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  section: SceneNode,
) => {
  const cards = section.childIds
    .map((id) => scene.nodes[id])
    .filter((node): node is SceneNode => node?.extensions?.blockType === "product-card");
  breakpoints.forEach((breakpoint) => {
    let currentSection = scene.nodes[section.id];
    if (
      breakpoint !== "desktop" &&
      currentSection.extensions?.responsiveDefaultsInitialized !== true &&
      !responsive.hasExplicitOverride(currentSection, breakpoint, "props", "columns")
    ) {
      currentSection = {
        ...currentSection,
        layout: responsive.updateLayout(currentSection, breakpoint, {
          props: { columns: breakpoint === "tablet" ? 2 : 1 },
        }),
      };
      scene.nodes[section.id] = currentSection;
    }
    const resolvedSection = responsive.resolveNode(currentSection, breakpoint);
    const requestedColumns = Math.max(1, Math.min(5, Number(resolvedSection.props.columns ?? 4)));
    const columns = requestedColumns;
    const horizontalPadding = breakpoint === "desktop" ? 48 : breakpoint === "tablet" ? 28 : 24;
    const top = breakpoint === "desktop" ? 164 : breakpoint === "tablet" ? 160 : 144;
    const availableWidth = responsive.getSceneWidth(scene, breakpoint) - horizontalPadding * 2;
    const gap = breakpoint === "desktop" ? 24 : breakpoint === "tablet" ? 20 : 16;
    const cardWidth = (availableWidth - gap * (columns - 1)) / columns;
    const cardHeight = breakpoint === "desktop" ? 424 : breakpoint === "tablet" ? 292 : 246;
    let visibleIndex = 0;
    cards.forEach((card) => {
      const current = scene.nodes[card.id];
      const resolved = responsive.resolveNode(current, breakpoint);
      const index = visibleIndex;
      const patch = {
        x: horizontalPadding + (index % columns) * (cardWidth + gap),
        y: top + Math.floor(index / columns) * (cardHeight + gap),
        width: cardWidth,
        height: cardHeight,
      };
      const widthRatio = cardWidth / Math.max(1, resolved.transform.width);
      const heightRatio = cardHeight / Math.max(1, resolved.transform.height);
      current.childIds.forEach((childId) => {
        const child = scene.nodes[childId];
        if (!child) return;
        const resolvedChild = responsive.resolveNode(child, breakpoint);
        scene.nodes[childId] = updateBreakpointTransform(responsive, child, breakpoint, {
          x: resolvedChild.transform.x * widthRatio,
          y: resolvedChild.transform.y * heightRatio,
          width: Math.max(1, resolvedChild.transform.width * widthRatio),
          height: Math.max(1, resolvedChild.transform.height * heightRatio),
        });
      });
      scene.nodes[card.id] = updateBreakpointTransform(responsive, current, breakpoint, patch);
      if (!resolved.meta.hidden) visibleIndex += 1;
    });
    const rows = Math.max(1, Math.ceil(visibleIndex / columns));
    const contentHeight = top + rows * cardHeight + Math.max(0, rows - 1) * gap + 76;
    setSectionHeight(
      responsive,
      scene,
      section,
      breakpoint,
      Math.max(resolvedSection.transform.height, contentHeight),
    );
  });
  scene.nodes[section.id].extensions = {
    ...(scene.nodes[section.id].extensions ?? {}),
    responsiveDefaultsInitialized: true,
  };
};

const reflowSectionBlocks = (
  responsive: ResponsiveSystem,
  scene: SceneTree,
  section: SceneNode,
) => {
  const sectionType = section.extensions?.sectionType;
  if (sectionType === "hero") {
    reflowContentGroup(responsive, scene, section, "content", {
      desktop: { y: 80, gap: 14 },
      tablet: { y: 70, gap: 14 },
      mobile: { y: 40, gap: 12 },
    });
    const mobileSection = responsive.resolveNode(scene.nodes[section.id], "mobile");
    const mobileHeight = reflowMobileStack(responsive, scene, section, {
      startY: 40,
      gap: 14,
      reverseMedia: Boolean(mobileSection.props.reverseOnMobile),
    });
    setSectionHeight(responsive, scene, section, "mobile", mobileHeight);
    setSectionHeight(
      responsive,
      scene,
      section,
      "desktop",
      resolvedContentBottom(responsive, scene, section, "desktop", 620),
    );
    setSectionHeight(
      responsive,
      scene,
      section,
      "tablet",
      resolvedContentBottom(responsive, scene, section, "tablet", 680),
    );
  }
  if (sectionType === "rich-text") {
    reflowContentGroup(responsive, scene, section, "story-content", {
      desktop: { y: 76, gap: 18 },
      tablet: { y: 70, gap: 18 },
      mobile: { y: 354, gap: 18 },
    });
    const mobileHeight = reflowMobileStack(responsive, scene, section, {
      startY: 24,
      gap: 18,
      reverseMedia: false,
    });
    setSectionHeight(responsive, scene, section, "mobile", mobileHeight);
    setSectionHeight(
      responsive,
      scene,
      section,
      "desktop",
      resolvedContentBottom(responsive, scene, section, "desktop", 400),
    );
    setSectionHeight(
      responsive,
      scene,
      section,
      "tablet",
      resolvedContentBottom(responsive, scene, section, "tablet", 450),
    );
  }
  if (sectionType === "product-grid") reflowProductCards(responsive, scene, section);
};

export class StructuredLayoutSystem implements StructuredLayoutSystemAPI {
  constructor(
    private readonly responsive: ResponsiveSystem = responsiveSystem,
    private readonly genericLayout: LayoutEngine = layoutEngine,
  ) {}

  isStructuredScene(scene: SceneTree): boolean {
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    return root?.extensions?.structuredPage === true;
  }

  usesAuthoredResponsiveLayout(scene: SceneTree): boolean {
    return authoredResponsiveLayout(scene);
  }

  reflowScene(scene: SceneTree): SceneTree {
    if (!this.isStructuredScene(scene) || !scene.rootNodeId) return cloneSceneTree(scene);
    let next = cloneSceneTree(scene);
    const initialRoot = next.nodes[next.rootNodeId as NodeId];
    const initialSections = initialRoot.childIds
      .map((id) => next.nodes[id])
      .filter((node): node is SceneNode => structuredKind(node) === "section");

    if (this.usesAuthoredResponsiveLayout(next)) {
      reflowAuthoredNavigationSurfaces(this.responsive, next);
      reflowAuthoredSections(this.responsive, next, initialRoot, initialSections);
      return validateSceneTree(next);
    }

    initialRoot.layout = {
      ...initialRoot.layout,
      mode: "vertical",
      sizing: {
        ...(initialRoot.layout.sizing ?? {}),
        width: { mode: "fill" },
        height: { mode: "hug", min: 1 },
      },
      autoLayout: {
        ...(initialRoot.layout.autoLayout ?? {}),
        padding: 0,
        gap: 0,
        alignment: "stretch",
        distribution: "start",
      },
      responsiveIntent: {
        ...(initialRoot.layout.responsiveIntent ?? {}),
        width: "fill",
        height: "hug",
        narrowBehavior: "stack",
        overflow: "visible",
      },
    };
    initialSections.forEach((section, index) => {
      const current = next.nodes[section.id];
      current.layout = {
        ...current.layout,
        sizing: {
          width: current.layout.sizing?.width ?? { mode: "fill" },
          height: current.layout.sizing?.height ?? { mode: "fixed" },
        },
        autoLayout: {
          ...(current.layout.autoLayout ?? {}),
          order: index,
          position: "flow",
        },
        responsiveIntent: {
          ...(current.layout.responsiveIntent ?? {}),
          width: current.layout.responsiveIntent?.width ?? "fill",
          height: current.layout.responsiveIntent?.height ?? "fixed",
        },
      };
    });

    initialSections.forEach((section) => {
      syncHeaderNavigation(this.responsive, next, next.nodes[section.id]);
      reflowSectionBlocks(this.responsive, next, next.nodes[section.id]);
    });

    next = this.genericLayout.reflowScene(next);
    return validateSceneTree(next);
  }

  reorderNode(scene: SceneTree, nodeId: NodeId, targetIndex: number): SceneTree {
    const next = cloneSceneTree(scene);
    const node = next.nodes[nodeId];
    if (!node?.parentId) throw new Error(`Node ${nodeId} cannot be reordered.`);
    const parent = next.nodes[node.parentId];
    if (!parent) throw new Error(`Parent ${node.parentId} does not exist.`);
    const currentIndex = parent.childIds.indexOf(nodeId);
    if (currentIndex < 0) throw new Error(`Node ${nodeId} is not a child of ${parent.id}.`);
    const siblings = parent.childIds.filter((id) => id !== nodeId);
    const safeIndex = Math.max(0, Math.min(targetIndex, siblings.length));
    parent.childIds = [...siblings.slice(0, safeIndex), nodeId, ...siblings.slice(safeIndex)];
    return this.reflowScene(next);
  }
}

export const structuredLayoutSystem = new StructuredLayoutSystem(responsiveSystem, layoutEngine);
