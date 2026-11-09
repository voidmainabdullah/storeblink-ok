import { z } from "zod";
import { legacyNavigationTarget } from "@/content/menus";
import { cloneSceneTree, createSceneNode } from "@/engine/scene-graph";
import { responsiveSystem } from "@/layout/responsive";
import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import { DEFAULT_TRANSFORM, type SceneNode, type SceneTree } from "@/types";
import {
  THEME_FUNCTIONALITY_EXTENSION_KEY,
  type ThemeFunctionalityAudit,
  type ThemeFunctionalitySettings,
  type ThemeProductCarouselGroup,
} from "./types";

const settingsSchema = z.object({
  version: z.literal(1),
  productCarousel: z.object({
    enabled: z.boolean(),
    loop: z.boolean(),
  }),
  search: z.object({
    enabled: z.boolean(),
    predictive: z.boolean(),
    maximumSuggestions: z.coerce.number().int().min(1).max(12),
  }),
  categories: z.object({
    enabled: z.boolean(),
    showButtons: z.boolean(),
    showDropdown: z.boolean(),
  }),
});

export const DEFAULT_THEME_FUNCTIONALITY_SETTINGS: ThemeFunctionalitySettings = {
  version: 1,
  productCarousel: { enabled: true, loop: true },
  search: { enabled: true, predictive: true, maximumSuggestions: 6 },
  categories: { enabled: true, showButtons: true, showDropdown: true },
};

const breakpoints: ResponsiveBreakpoint[] = ["desktop", "tablet", "mobile"];

const descendants = (scene: SceneTree, rootId: string): SceneNode[] => {
  const result: SceneNode[] = [];
  const visit = (nodeId: string) => {
    const node = scene.nodes[nodeId];
    if (!node) return;
    result.push(node);
    node.childIds.forEach(visit);
  };
  visit(rootId);
  return result;
};

const closestSection = (scene: SceneTree, node: SceneNode): SceneNode | null => {
  let current = node.parentId ? scene.nodes[node.parentId] : undefined;
  while (current) {
    if (current.type === "section") return current;
    current = current.parentId ? scene.nodes[current.parentId] : undefined;
  }
  return null;
};

const productGroups = (scene: SceneTree): Map<string, SceneNode[]> => {
  const groups = new Map<string, SceneNode[]>();
  Object.values(scene.nodes).forEach((node) => {
    if (node.extensions?.blockType !== "product-card") return;
    const section = closestSection(scene, node);
    if (!section) return;
    const cards = groups.get(section.id) ?? [];
    if (!cards.some((card) => card.id === node.id)) cards.push(node);
    groups.set(section.id, cards);
  });
  groups.forEach((cards) => cards.sort((left, right) =>
    left.transform.y === right.transform.y
      ? left.transform.x - right.transform.x
      : left.transform.y - right.transform.y,
  ));
  return groups;
};

const buttonLabel = (node: SceneNode): string =>
  String(node.props.label ?? node.props.text ?? node.name).trim().toLowerCase();

const safeId = (value: string): string => value.replace(/[^a-zA-Z0-9_-]/g, "-");

const textColorFor = (scene: SceneTree, section: SceneNode): string => {
  const text = descendants(scene, section.id).find((node) =>
    node.type === "text" && typeof node.props.color === "string",
  );
  return String(text?.props.color ?? "#111111");
};

const responsiveControlLayout = (
  section: SceneNode,
  slot: "category" | "previous" | "next",
): SceneNode["layout"] => ({
  mode: "absolute",
  responsive: Object.fromEntries(breakpoints.map((breakpoint) => {
    const width = responsiveSystem.resolveNode(section, breakpoint).transform.width;
    const controlWidth = slot === "category" ? 132 : 44;
    const right = slot === "next" ? 16 : slot === "previous" ? 68 : 128;
    return [breakpoint, {
      transform: {
        ...DEFAULT_TRANSFORM,
        x: Math.max(12, width - right - controlWidth),
        y: 18,
        width: controlWidth,
        height: 44,
      },
    }];
  })),
});

const addControl = (
  scene: SceneTree,
  section: SceneNode,
  slot: "category" | "previous" | "next",
  itemIds: string[],
): SceneNode => {
  const id = `theme-function-${safeId(section.id)}-${slot}`;
  const color = textColorFor(scene, section);
  const label = slot === "category" ? "Categories" : slot === "previous" ? "Previous" : "Next";
  const node = createSceneNode({
    id,
    type: "button",
    name: `${section.name} ${label}`,
    props: {
      label: slot === "previous" ? "‹" : slot === "next" ? "›" : label,
      ariaLabel: label,
      background: "transparent",
      color,
      border: `1px solid ${color}`,
      fontSize: slot === "category" ? 13 : 24,
      fontWeight: 600,
    },
    transform: {
      x: 0,
      y: 18,
      width: slot === "category" ? 132 : 44,
      height: 44,
      zIndex: Math.max(1, ...section.childIds.map((id) => scene.nodes[id]?.transform.zIndex ?? 0)) + 1,
    },
    layout: responsiveControlLayout(section, slot),
    style: {
      opacity: 1,
      cornerRadius: 999,
      fills: [],
      strokes: [],
      effects: [],
    },
    extensions: {
      structured: true,
      editorKind: "block",
      blockType: slot === "category" ? "category-trigger" : "carousel-control",
      action: slot === "category" ? "open-category-menu" : "step-node-set",
      ...(slot === "category" ? {} : {
        direction: slot === "previous" ? -1 : 1,
        targetNodeIds: itemIds,
      }),
      carouselSectionId: section.id,
      minimumInteractionTarget: 44,
      generatedBy: "ThemeFunctionalitySystem",
    },
  }, section.id);
  scene.nodes[id] = node;
  section.childIds.push(id);
  return node;
};

const normalizeInteractiveNode = (node: SceneNode): void => {
  if (node.type !== "button" && node.type !== "svg") return;
  const label = buttonLabel(node);
  const extensions = { ...(node.extensions ?? {}) };
  if (!extensions.action && /search/.test(label)) extensions.action = "open-search";
  if (!extensions.action && /categor/.test(label)) extensions.action = "open-category-menu";

  if (node.type === "button" && !extensions.navigationTarget) {
    const legacyDestination = node.props.href ?? node.props.url ?? node.props.destination;
    const target = legacyNavigationTarget(legacyDestination);
    if (target) extensions.navigationTarget = target;
  }
  node.extensions = extensions;
};

export class ThemeFunctionalitySystem {
  getSettings(scene: SceneTree): ThemeFunctionalitySettings {
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    const parsed = settingsSchema.safeParse(
      root?.extensions?.[THEME_FUNCTIONALITY_EXTENSION_KEY],
    );
    return parsed.success
      ? parsed.data as ThemeFunctionalitySettings
      : structuredClone(DEFAULT_THEME_FUNCTIONALITY_SETTINGS);
  }

  ensureScene(scene: SceneTree): SceneTree {
    const next = cloneSceneTree(scene);
    const root = next.rootNodeId ? next.nodes[next.rootNodeId] : undefined;
    if (!root) return next;
    const settings = this.getSettings(next);
    root.extensions = {
      ...(root.extensions ?? {}),
      [THEME_FUNCTIONALITY_EXTENSION_KEY]: settings,
    };
    Object.values(next.nodes).forEach(normalizeInteractiveNode);

    if (!settings.productCarousel.enabled && !settings.categories.enabled) return next;
    const groups = productGroups(next);
    Object.values(next.nodes)
      .filter((node) =>
        node.extensions?.generatedBy === "ThemeFunctionalitySystem" &&
        typeof node.extensions?.carouselSectionId === "string" &&
        !groups.has(node.extensions.carouselSectionId),
      )
      .forEach((node) => {
        if (node.parentId && next.nodes[node.parentId]) {
          next.nodes[node.parentId].childIds = next.nodes[node.parentId].childIds
            .filter((childId) => childId !== node.id);
        }
        delete next.nodes[node.id];
      });
    groups.forEach((cards, sectionId) => {
      const section = next.nodes[sectionId];
      if (!section) return;
      const itemIds = cards.map((card) => card.id);
      section.extensions = {
        ...(section.extensions ?? {}),
        productCarousel: {
          enabled: settings.productCarousel.enabled,
          loop: settings.productCarousel.loop,
          itemIds,
        },
      };
      cards.forEach((card, index) => {
        card.extensions = {
          ...(card.extensions ?? {}),
          carouselSectionId: section.id,
          carouselIndex: index,
        };
      });
      const sectionNodes = descendants(next, section.id);
      const controls = sectionNodes.filter((node) => node.type === "button");
      const previous = controls.find((node) =>
        node.extensions?.action === "step-node-set" && node.extensions?.direction === -1,
      );
      const following = controls.find((node) =>
        node.extensions?.action === "step-node-set" && node.extensions?.direction !== -1,
      );
      const categories = controls.find((node) => node.extensions?.action === "open-category-menu");
      if (settings.productCarousel.enabled && cards.length > 1) {
        if (previous) {
          previous.extensions = {
            ...(previous.extensions ?? {}),
            targetNodeIds: itemIds,
            direction: -1,
            carouselSectionId: section.id,
          };
        } else addControl(next, section, "previous", itemIds);
        if (following) {
          following.extensions = {
            ...(following.extensions ?? {}),
            targetNodeIds: itemIds,
            direction: 1,
            carouselSectionId: section.id,
          };
        } else addControl(next, section, "next", itemIds);
      } else {
        [previous, following]
          .filter((node): node is SceneNode =>
            node?.extensions?.generatedBy === "ThemeFunctionalitySystem",
          )
          .forEach((node) => {
            section.childIds = section.childIds.filter((childId) => childId !== node.id);
            delete next.nodes[node.id];
          });
      }
      if (settings.categories.enabled && !categories) {
        addControl(next, section, "category", itemIds);
      }
    });
    return next;
  }

  audit(scene: SceneTree): ThemeFunctionalityAudit {
    const carousels: ThemeProductCarouselGroup[] = [];
    productGroups(scene).forEach((cards, sectionId) => {
      const controls = descendants(scene, sectionId).filter((node) => node.type === "button");
      carousels.push({
        sectionId,
        itemIds: cards.map((card) => card.id),
        previousControlId: controls.find((node) =>
          node.extensions?.action === "step-node-set" && node.extensions?.direction === -1,
        )?.id ?? null,
        nextControlId: controls.find((node) =>
          node.extensions?.action === "step-node-set" && node.extensions?.direction !== -1,
        )?.id ?? null,
        categoryControlId: controls.find((node) =>
          node.extensions?.action === "open-category-menu",
        )?.id ?? null,
      });
    });
    const buttons = Object.values(scene.nodes).filter((node) => node.type === "button");
    const actionableButtons = buttons.filter((node) => Boolean(
      node.extensions?.action || node.extensions?.navigationTarget || node.extensions?.productId,
    ));
    return {
      settings: this.getSettings(scene),
      carousels,
      actionableButtons,
      inactiveButtons: buttons.filter((node) => !actionableButtons.includes(node)),
    };
  }
}

export const themeFunctionalitySystem = new ThemeFunctionalitySystem();
