import { z } from "zod";
import {
  cloneSceneNode,
  cloneSceneTree,
  generateNodeId,
} from "@/engine/scene-graph";
import { responsiveSystem } from "@/layout/responsive";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { SceneNode, SceneTree } from "@/types";
import {
  legacyNavigationTarget,
  normalizeMenuTarget,
  resolveMenuTarget,
} from "./RuntimeLinkResolver";
import type {
  MenuTarget,
  ResolvedMenuLink,
  SceneNavigationDocument,
  SceneNavigationItem,
  StorefrontLinkContext,
} from "./types";

export const SCENE_NAVIGATION_EXTENSION_KEY = "navigation";

const breakpoints: ResponsiveBreakpoint[] = ["desktop", "tablet", "mobile"];

export const menuTargetSchema = z.object({
  type: z.enum([
    "route",
    "home",
    "catalog",
    "page",
    "product",
    "collection",
    "blog",
    "search",
    "account",
    "external",
    "email",
    "phone",
    "section",
  ]),
  entityId: z.string().optional(),
  value: z.string().optional(),
  routeKey: z.enum([
    "home",
    "products",
    "about",
    "contact",
    "search",
    "account",
    "cart",
    "checkout",
  ]).optional(),
  sectionId: z.string().optional(),
});

const visibilitySchema = z.object({
  desktop: z.boolean(),
  tablet: z.boolean(),
  mobile: z.boolean(),
});

const navigationItemSchema = z.object({
  id: z.string().trim().min(1),
  label: z.string(),
  target: menuTargetSchema,
  parentId: z.string().nullable(),
  sortOrder: z.number().int(),
  openInNewTab: z.boolean(),
  isVisible: z.boolean(),
  visibility: visibilitySchema,
  icon: z.object({
    library: z.string(),
    name: z.string(),
    color: z.string(),
    size: z.number().finite(),
  }).nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const documentSchema = z.object({
  version: z.literal(1),
  items: z.array(navigationItemSchema),
});

const defaultItems = (): SceneNavigationItem[] => [
  ["home", "Home", "home"],
  ["products", "Products", "products"],
  ["about", "About us", "about"],
  ["contact", "Contact", "contact"],
].map(([id, label, routeKey], sortOrder) => ({
  id,
  label,
  target: { type: "route", routeKey } as MenuTarget,
  parentId: null,
  sortOrder,
  openInNewTab: false,
  isVisible: true,
  visibility: { desktop: true, tablet: true, mobile: true },
}));

export const createDefaultStoreNavigationDocument = (): SceneNavigationDocument => ({
  version: 1,
  items: defaultItems(),
});

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const targetIdentity = (target: MenuTarget): string => {
  const normalized = normalizeMenuTarget(target);
  if (normalized.type === "route") return normalized.routeKey ?? "route";
  if (normalized.type === "section") {
    return `section:${normalized.sectionId ?? ""}`;
  }
  if (normalized.entityId) {
    return `${normalized.type}:${normalized.entityId}`;
  }
  if (normalized.value) return `${normalized.type}:${normalized.value}`;
  return normalized.type;
};

const navigationTargetForNode = (node: SceneNode): MenuTarget | null =>
  legacyNavigationTarget(node.extensions?.navigationTarget);

const nodeNavigationId = (node: SceneNode, target: MenuTarget): string => {
  const explicit = node.extensions?.navigationKey;
  return typeof explicit === "string" && explicit.trim()
    ? explicit.trim()
    : targetIdentity(target);
};

const nodeLabel = (node: SceneNode): string =>
  String(node.props.label ?? node.props.text ?? node.name)
    .replace(/^\+\s*/, "")
    .trim();

const isInsideMobileMenu = (scene: SceneTree, node: SceneNode): boolean => {
  let current = node.parentId ? scene.nodes[node.parentId] : undefined;
  while (current) {
    if (
      current.extensions?.runtimeVisibility === "mobile-menu" ||
      current.extensions?.blockType === "mobile-menu" ||
      current.extensions?.chromeSlot === "mobile-menu"
    ) {
      return true;
    }
    current = current.parentId ? scene.nodes[current.parentId] : undefined;
  }
  return false;
};

const isNavigationNode = (scene: SceneTree, node: SceneNode): boolean =>
  Boolean(
    navigationTargetForNode(node) &&
    (
      node.extensions?.blockType === "navigation-link" ||
      node.extensions?.chromeSlot === "nav-link" ||
      isInsideMobileMenu(scene, node)
    ),
  );

const discoveredDocument = (scene: SceneTree): SceneNavigationDocument => {
  const candidates = Object.values(scene.nodes)
    .filter((node) => isNavigationNode(scene, node))
    .sort((left, right) => {
      const leftMirror = isInsideMobileMenu(scene, left) ? 1 : 0;
      const rightMirror = isInsideMobileMenu(scene, right) ? 1 : 0;
      if (leftMirror !== rightMirror) return leftMirror - rightMirror;
      return left.transform.y === right.transform.y
        ? left.transform.x - right.transform.x
        : left.transform.y - right.transform.y;
    });
  const byIdentity = new Map<string, SceneNavigationItem>();
  candidates.forEach((node) => {
    const target = navigationTargetForNode(node);
    if (!target) return;
    const id = nodeNavigationId(node, target);
    if (byIdentity.has(id)) return;
    byIdentity.set(id, {
      id,
      label: nodeLabel(node) || id,
      target: normalizeMenuTarget(target),
      parentId: null,
      sortOrder: byIdentity.size,
      openInNewTab: node.extensions?.openInNewTab === true,
      isVisible: true,
      visibility: { desktop: true, tablet: true, mobile: true },
      metadata: { migratedFromNodeId: node.id },
    });
  });
  return {
    version: 1,
    items: byIdentity.size ? [...byIdentity.values()] : defaultItems(),
  };
};

const normalizeDocument = (
  document: SceneNavigationDocument,
): SceneNavigationDocument => {
  const seen = new Set<string>();
  const items = document.items
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((item) => {
      const target = normalizeMenuTarget(item.target);
      const legacyId = targetIdentity(target);
      const id =
        item.id.startsWith("page:") &&
        (legacyId === "about" || legacyId === "contact")
          ? legacyId
          : item.id;
      return {
        ...structuredClone(item),
        id,
        target,
      };
    })
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .map((item, sortOrder) => ({ ...item, sortOrder }));
  return { version: 1, items };
};

const orderedNavigationItems = (
  items: SceneNavigationItem[],
): SceneNavigationItem[] => {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map<string | null, SceneNavigationItem[]>();
  items.forEach((item) => {
    const parentId =
      item.parentId && item.parentId !== item.id && byId.has(item.parentId)
        ? item.parentId
        : null;
    const siblings = children.get(parentId) ?? [];
    siblings.push(item);
    siblings.sort((left, right) => left.sortOrder - right.sortOrder);
    children.set(parentId, siblings);
  });
  const ordered: SceneNavigationItem[] = [];
  const visited = new Set<string>();
  const visit = (item: SceneNavigationItem) => {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    ordered.push(item);
    (children.get(item.id) ?? []).forEach(visit);
  };
  (children.get(null) ?? []).forEach(visit);
  items
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .forEach(visit);
  return ordered;
};

const initialSurfaceVisibility = (
  node: SceneNode,
): Record<ResponsiveBreakpoint, boolean> => {
  const stored = recordValue(node.extensions?.navigationSurfaceVisibility);
  if (
    stored &&
    breakpoints.every((breakpoint) => typeof stored[breakpoint] === "boolean")
  ) {
    return stored as Record<ResponsiveBreakpoint, boolean>;
  }
  return Object.fromEntries(
    breakpoints.map((breakpoint) => [
      breakpoint,
      !responsiveSystem.resolveNode(node, breakpoint).meta.hidden,
    ]),
  ) as Record<ResponsiveBreakpoint, boolean>;
};

const applyItemToNode = (
  node: SceneNode,
  item: SceneNavigationItem,
): void => {
  const surfaceVisibility = initialSurfaceVisibility(node);
  node.name = `${item.label} link`;
  node.props = {
    ...node.props,
    label: item.label,
    ...(item.icon ? { iconConfig: structuredClone(item.icon) } : {}),
  };
  if (!item.icon) {
    const nextProps = { ...node.props };
    delete nextProps.iconConfig;
    node.props = nextProps;
  }
  node.extensions = {
    ...(node.extensions ?? {}),
    navigationKey: item.id,
    navigationTarget: structuredClone(item.target),
    openInNewTab: item.openInNewTab,
    navigationSurfaceVisibility: surfaceVisibility,
  };
  const responsive = recordValue(node.layout.responsive) ?? {};
  node.meta = {
    ...node.meta,
    hidden: !(
      item.isVisible &&
      item.visibility.desktop &&
      surfaceVisibility.desktop
    ),
  };
  node.layout = {
    ...node.layout,
    responsive: Object.fromEntries(
      breakpoints.map((breakpoint) => {
        const override = recordValue(responsive[breakpoint]) ?? {};
        return [
          breakpoint,
          {
            ...override,
            meta: {
              ...(recordValue(override.meta) ?? {}),
              hidden: !(
                item.isVisible &&
                item.visibility[breakpoint] &&
                surfaceVisibility[breakpoint]
              ),
            },
          },
        ];
      }),
    ),
  };
};

const navigationSurfaceGroups = (scene: SceneTree): SceneNode[][] => {
  const byParent = new Map<string, SceneNode[]>();
  Object.values(scene.nodes).forEach((node) => {
    if (!node.parentId || !isNavigationNode(scene, node)) return;
    const nodes = byParent.get(node.parentId) ?? [];
    nodes.push(node);
    byParent.set(node.parentId, nodes);
  });
  return [...byParent.values()];
};

const surfacePosition = (
  nodes: SceneNode[],
  index: number,
  breakpoint: ResponsiveBreakpoint,
): Pick<SceneNode["transform"], "x" | "y"> => {
  const frames = nodes
    .map((node) => responsiveSystem.resolveNode(node, breakpoint).transform)
    .sort((left, right) =>
      Math.abs(left.x - right.x) >= Math.abs(left.y - right.y)
        ? left.x - right.x
        : left.y - right.y,
    );
  if (!frames.length) return { x: 0, y: 0 };
  if (frames[index]) return { x: frames[index].x, y: frames[index].y };
  const first = frames[0];
  const last = frames.at(-1) ?? first;
  const previous = frames.at(-2);
  const horizontal =
    Math.abs(last.x - first.x) >= Math.abs(last.y - first.y);
  const inferredStep = previous
    ? horizontal
      ? last.x - previous.x
      : last.y - previous.y
    : horizontal
      ? last.width + 12
      : last.height + 8;
  const extra = index - frames.length + 1;
  return horizontal
    ? { x: last.x + inferredStep * extra, y: last.y }
    : { x: last.x, y: last.y + inferredStep * extra };
};

const setSurfacePosition = (
  node: SceneNode,
  position: Pick<SceneNode["transform"], "x" | "y">,
  breakpoint: ResponsiveBreakpoint,
): void => {
  if (breakpoint === "desktop") {
    node.transform = { ...node.transform, ...position };
  }
  const responsive = recordValue(node.layout.responsive) ?? {};
  const override = recordValue(responsive[breakpoint]) ?? {};
  const transform = recordValue(override.transform) ?? {};
  node.layout = {
    ...node.layout,
    responsive: {
      ...responsive,
      [breakpoint]: {
        ...override,
        transform: {
          ...transform,
          ...position,
        },
      },
    },
  };
};

const cloneNavigationSubtree = (
  scene: SceneTree,
  sourceId: string,
  parentId: string,
): SceneNode => {
  const source = scene.nodes[sourceId];
  if (!source) throw new Error("Navigation surface prototype is missing.");
  const cloneRecursively = (
    node: SceneNode,
    nextParentId: string,
  ): SceneNode => {
    const cloned = cloneSceneNode(node);
    cloned.id = generateNodeId("navigation");
    cloned.parentId = nextParentId;
    cloned.childIds = node.childIds
      .map((childId) => scene.nodes[childId])
      .filter((child): child is SceneNode => Boolean(child))
      .map((child) => cloneRecursively(child, cloned.id).id);
    scene.nodes[cloned.id] = cloned;
    return cloned;
  };
  return cloneRecursively(source, parentId);
};

const removeSubtree = (scene: SceneTree, nodeId: string): void => {
  const node = scene.nodes[nodeId];
  if (!node) return;
  node.childIds.forEach((childId) => removeSubtree(scene, childId));
  delete scene.nodes[nodeId];
};

const materializeSurface = (
  scene: SceneTree,
  surfaceNodes: SceneNode[],
  items: SceneNavigationItem[],
): void => {
  const parentId = surfaceNodes[0]?.parentId;
  const parent = parentId ? scene.nodes[parentId] : undefined;
  if (!parent || !surfaceNodes.length) return;
  const orderedItems = orderedNavigationItems(items);
  const available = new Map<string, SceneNode[]>();
  surfaceNodes.forEach((node) => {
    const target = navigationTargetForNode(node);
    if (!target) return;
    const id = nodeNavigationId(node, target);
    const identities = new Set([id, targetIdentity(target)]);
    identities.forEach((identity) => {
      const nodes = available.get(identity) ?? [];
      if (!nodes.includes(node)) nodes.push(node);
      available.set(identity, nodes);
    });
  });
  const used = new Set<string>();
  const renderedNodes = orderedItems.map((item) => {
    const match = [
      ...(available.get(item.id) ?? []),
      ...(available.get(targetIdentity(item.target)) ?? []),
    ].find((node) => !used.has(node.id));
    const node =
      match ??
      cloneNavigationSubtree(scene, surfaceNodes[0].id, parent.id);
    used.add(node.id);
    applyItemToNode(node, item);
    return node;
  });
  surfaceNodes
    .filter((node) => !used.has(node.id))
    .forEach((node) => removeSubtree(scene, node.id));
  breakpoints.forEach((breakpoint) => {
    renderedNodes.forEach((node, index) => {
      setSurfacePosition(
        node,
        surfacePosition(surfaceNodes, index, breakpoint),
        breakpoint,
      );
    });
  });
  const surfaceIds = new Set(surfaceNodes.map((node) => node.id));
  const firstIndex = parent.childIds.findIndex((id) => surfaceIds.has(id));
  const retained = parent.childIds.filter((id) => !surfaceIds.has(id));
  retained.splice(
    firstIndex >= 0 ? firstIndex : retained.length,
    0,
    ...renderedNodes.map((node) => node.id),
  );
  parent.childIds = retained;
};

export type ResolvedSceneNavigationItem = {
  item: SceneNavigationItem;
  link: ResolvedMenuLink;
};

export type NavigationTargetValidation =
  | { valid: true; target: MenuTarget }
  | { valid: false; message: string };

export class NavigationSystem {
  validateTarget(input: unknown): NavigationTargetValidation {
    const parsed = menuTargetSchema.safeParse(input);
    if (!parsed.success) {
      return {
        valid: false,
        message: parsed.error.issues[0]?.message ?? "The destination is invalid.",
      };
    }
    const target = normalizeMenuTarget(parsed.data as MenuTarget);
    if (target.type === "route" && !target.routeKey) {
      return { valid: false, message: "Choose an internal store route." };
    }
    if (
      ["product", "collection", "page"].includes(target.type) &&
      !target.entityId?.trim()
    ) {
      return { valid: false, message: "Choose a destination." };
    }
    if (target.type === "section" && !target.sectionId?.trim()) {
      return {
        valid: false,
        message: "Enter the target section instance ID.",
      };
    }
    if (
      ["external", "email", "phone"].includes(target.type) &&
      !target.value?.trim()
    ) {
      return { valid: false, message: "Enter a destination value." };
    }
    if (
      target.type === "external" ||
      target.type === "email" ||
      target.type === "phone"
    ) {
      const resolved = resolveMenuTarget(target, { storeSlug: "validation" });
      if (resolved.broken) {
        return {
          valid: false,
          message: resolved.reason ?? "The destination is invalid.",
        };
      }
    }
    return { valid: true, target };
  }

  getDocument(scene: SceneTree): SceneNavigationDocument {
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    const parsed = documentSchema.safeParse(
      root?.extensions?.[SCENE_NAVIGATION_EXTENSION_KEY],
    );
    return normalizeDocument(
      parsed.success
        ? structuredClone(parsed.data) as SceneNavigationDocument
        : discoveredDocument(scene),
    );
  }

  ensureScene(scene: SceneTree): SceneTree {
    return this.applyDocument(scene, this.getDocument(scene));
  }

  applyDocument(
    scene: SceneTree,
    document: SceneNavigationDocument,
  ): SceneTree {
    const validated = normalizeDocument(
      documentSchema.parse(document) as SceneNavigationDocument,
    );
    const next = cloneSceneTree(scene);
    const root = next.rootNodeId ? next.nodes[next.rootNodeId] : undefined;
    if (!root) throw new Error("Navigation requires a Scene Graph root.");
    root.extensions = {
      ...(root.extensions ?? {}),
      [SCENE_NAVIGATION_EXTENSION_KEY]: structuredClone(validated),
    };
    navigationSurfaceGroups(next).forEach((surface) =>
      materializeSurface(next, surface, validated.items),
    );
    return next;
  }

  synchronizeNode(scene: SceneTree, nodeId: string): SceneTree {
    const node = scene.nodes[nodeId];
    const target = node ? navigationTargetForNode(node) : null;
    if (!node || !target) return cloneSceneTree(scene);
    const document = this.getDocument(scene);
    const id = nodeNavigationId(node, target);
    const hasExplicitKey =
      typeof node.extensions?.navigationKey === "string" &&
      Boolean(node.extensions.navigationKey.trim());
    const index = document.items.findIndex((item) =>
      item.id === id ||
      (!hasExplicitKey && targetIdentity(item.target) === targetIdentity(target)),
    );
    const nextItem: SceneNavigationItem = {
      ...(index >= 0
        ? document.items[index]
        : {
            id,
            parentId: null,
            sortOrder: document.items.length,
            openInNewTab: false,
            isVisible: true,
            visibility: { desktop: true, tablet: true, mobile: true },
          }),
      id,
      label: nodeLabel(node) || id,
      target: normalizeMenuTarget(target),
      icon:
        node.props.iconConfig && typeof node.props.iconConfig === "object"
          ? structuredClone(node.props.iconConfig) as SceneNavigationItem["icon"]
          : null,
      openInNewTab: node.extensions?.openInNewTab === true,
    };
    if (index >= 0) document.items[index] = nextItem;
    else document.items.push(nextItem);
    return this.applyDocument(scene, document);
  }

  removeItem(scene: SceneTree, itemId: string): SceneTree {
    const document = this.getDocument(scene);
    const item = document.items.find((candidate) => candidate.id === itemId);
    if (!item) return cloneSceneTree(scene);
    const removedIds = new Set<string>([itemId]);
    let foundChild = true;
    while (foundChild) {
      foundChild = false;
      document.items.forEach((candidate) => {
        if (
          candidate.parentId &&
          removedIds.has(candidate.parentId) &&
          !removedIds.has(candidate.id)
        ) {
          removedIds.add(candidate.id);
          foundChild = true;
        }
      });
    }
    document.items = document.items
      .filter((candidate) => !removedIds.has(candidate.id))
      .map((candidate, sortOrder) => ({ ...candidate, sortOrder }));
    const next = cloneSceneTree(scene);
    Object.values(next.nodes).forEach((node) => {
      const target = navigationTargetForNode(node);
      if (!target) return;
      const nodeId = nodeNavigationId(node, target);
      if (
        !removedIds.has(nodeId) &&
        !(
          nodeId === itemId ||
          targetIdentity(target) === targetIdentity(item.target)
        )
      ) return;
      if (node.parentId && next.nodes[node.parentId]) {
        next.nodes[node.parentId].childIds = next.nodes[node.parentId].childIds
          .filter((childId) => childId !== node.id);
      }
      removeSubtree(next, node.id);
    });
    return this.applyDocument(next, document);
  }

  resolve(
    scene: SceneTree,
    context: StorefrontLinkContext,
  ): ResolvedSceneNavigationItem[] {
    const sectionIds = new Set(
      Object.values(scene.nodes)
        .filter((node) => node.type === "section")
        .map((node) => {
          const instanceId = node.extensions?.sectionInstanceId;
          return typeof instanceId === "string" && instanceId.trim()
            ? instanceId
            : node.id;
        }),
    );
    return orderedNavigationItems(this.getDocument(scene).items)
      .map((item) => ({
        item,
        link: resolveMenuTarget(item.target, {
          ...context,
          sectionIds: context.sectionIds ?? sectionIds,
        }),
      }));
  }
}

export const navigationSystem = new NavigationSystem();
