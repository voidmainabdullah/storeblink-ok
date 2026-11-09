import { createSceneNode, generateNodeId } from "@/engine/scene-graph";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import type { NodeId, SceneNode, SceneTree } from "@/types";
import type { StoreSceneItem, StoreSceneProfile } from "@/editor/engine/storeSceneAdapter";
import {
  CANONICAL_SECTION_TYPES,
  type CanonicalSectionType,
} from "@/theme-engine/contracts";
import { sectionRegistry } from "./SectionRegistry";
import type { BlockDefinition, SectionDefinition } from "./types";

const uniqueSuffix = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const canonicalTypes = new Set<string>(CANONICAL_SECTION_TYPES);

const sectionAliases: Record<string, string[]> = {
  "site-header": ["site-header", "header"],
  "site-footer": ["site-footer", "footer"],
  "immersive-product-hero": ["immersive-product-hero", "hero"],
  "featured-product-collection": [
    "featured-product-collection",
    "product-grid",
  ],
  "featured-collection": ["featured-collection", "product-grid"],
  "image-with-text": ["image-with-text", "rich-text"],
  "brand-story": ["brand-story", "rich-text"],
  "testimonial-grid": ["testimonial-grid", "customer-stories"],
  testimonials: ["testimonials", "customer-stories"],
  "promotional-marquee": ["promotional-marquee", "announcement-marquee"],
};

const sourceSectionTypes = (sectionType: string): string[] =>
  sectionAliases[sectionType] ?? [sectionType];

const cloneSubtree = (
  scene: SceneTree,
  sourceId: NodeId,
  parentId: NodeId,
  targetSectionType?: string,
  suffix = uniqueSuffix(),
): SceneNode[] => {
  const ids: NodeId[] = [];
  const collect = (nodeId: NodeId) => {
    const node = scene.nodes[nodeId];
    if (!node) return;
    ids.push(nodeId);
    node.childIds.forEach(collect);
  };
  collect(sourceId);
  const idMap = new Map(ids.map((id) => [id, `${id}-${suffix}`]));
  const now = Date.now();
  const sourceSectionType = scene.nodes[sourceId]?.extensions?.sectionType;
  return ids.map((id) => {
    const source = scene.nodes[id];
    const clone = structuredClone(source);
    clone.id = idMap.get(id) as string;
    clone.parentId = id === sourceId ? parentId : source.parentId ? idMap.get(source.parentId) ?? parentId : parentId;
    clone.childIds = source.childIds.map((childId) => idMap.get(childId) as string);
    clone.meta = { ...clone.meta, locked: false, hidden: false, createdAt: now, updatedAt: now };
    if (
      targetSectionType &&
      sourceSectionType &&
      clone.extensions?.sectionType === sourceSectionType
    ) {
      clone.extensions = {
        ...(clone.extensions ?? {}),
        sectionType: targetSectionType,
        ...(canonicalTypes.has(targetSectionType)
          ? { canonicalSectionType: targetSectionType as CanonicalSectionType }
          : {}),
      };
    }
    if (id === sourceId && clone.extensions?.editorKind === "section") {
      clone.extensions = {
        ...(clone.extensions ?? {}),
        global: false,
        sectionScope: "local",
        sectionInstanceId: clone.id,
      };
    }
    return clone;
  });
};

const genericSectionBlocks: Record<string, string[]> = {
  "announcement-marquee": [
    "announcement-item",
    "announcement-item",
    "announcement-item",
  ],
  "promotional-marquee": [
    "announcement-item",
    "announcement-item",
    "announcement-item",
  ],
  "editorial-intro": ["eyebrow", "heading", "paragraph", "image"],
  "craftsmanship-features": ["heading", "paragraph", "feature-item", "feature-item"],
  "customer-stories": ["heading", "testimonial", "testimonial"],
  "testimonial-grid": ["heading", "testimonial", "testimonial"],
  testimonials: ["heading", "testimonial", "testimonial"],
  newsletter: ["heading", "paragraph", "button"],
  contact: ["heading", "contact-information", "paragraph"],
  about: ["heading", "paragraph", "image"],
  "custom-content": ["heading", "paragraph", "button"],
  faq: ["heading", "paragraph", "paragraph"],
  "logo-list": ["heading", "image", "image", "image"],
  "video-banner": ["heading", "paragraph", "button"],
  "collection-list": ["heading", "feature-item", "feature-item", "feature-item"],
};

const transform = (
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
) => ({
  x,
  y,
  width,
  height,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  skewX: 0,
  skewY: 0,
  transformOrigin: [0.5, 0.5] as [number, number],
  zIndex,
});

const createGenericBlockNode = (
  definition: BlockDefinition,
  sectionType: string,
  parentId: NodeId,
  index: number,
): SceneNode => {
  const imageLike = definition.elementType === "image";
  const buttonLike = definition.elementType === "button";
  const containerLike = definition.elementType === "container";
  const announcementItem = definition.type === "announcement-item";
  const desktop = transform(
    0,
    0,
    imageLike ? 460 : buttonLike ? 180 : containerLike ? 520 : announcementItem ? 180 : 540,
    imageLike ? 280 : buttonLike ? 48 : containerLike ? 120 : announcementItem ? 24 : 54,
    index + 2,
  );
  return createSceneNode(
    {
      id: generateNodeId(definition.elementType.replace("custom:", "custom-")),
      type: definition.elementType,
      name: definition.name,
      props: structuredClone(definition.defaultProps),
      transform: desktop,
      layout: {
        mode: "absolute",
        sizing: {
          width: {
            mode: buttonLike || announcementItem ? "hug" : "fill",
            ...(buttonLike || announcementItem ? { min: buttonLike ? 44 : 24 } : {}),
          },
          height: imageLike
            ? { mode: "minmax", value: 280, min: 180, max: 520 }
            : buttonLike
              ? { mode: "fixed", value: 48, min: 44 }
              : containerLike
                ? { mode: "minmax", value: 120, min: 44 }
                : { mode: "hug", min: 12 },
        },
        autoLayout: { order: index, position: "flow" },
        responsiveIntent: {
          width: buttonLike || announcementItem ? "hug" : "fill",
          height: imageLike ? "minmax" : buttonLike ? "fixed" : "hug",
          narrowBehavior: imageLike || containerLike ? "stack" : "wrap",
          overflow: "wrap",
          preserveAspectRatio: imageLike,
          ...(definition.elementType === "text" ? { minimumReadableSize: 12 } : {}),
        },
      },
      style: {
        fills:
          definition.defaultStyle?.fills ??
          (imageLike || containerLike
            ? [{ type: "solid", color: "#f1f1ef" }]
            : []),
        strokes: definition.defaultStyle?.strokes ?? [],
        effects: definition.defaultStyle?.effects ?? [],
        opacity: definition.defaultStyle?.opacity ?? 1,
        cornerRadius:
          definition.defaultStyle?.cornerRadius ??
          (imageLike || containerLike || buttonLike ? 8 : undefined),
      },
      extensions: {
        editorKind: "block",
        structured: true,
        sectionType,
        blockType: definition.type,
        ...(definition.type === "navigation-link"
          ? { navigationTarget: { type: "route", routeKey: "home" } }
          : {}),
      },
    },
    parentId,
  );
};

const createGenericSectionNodes = (
  definition: SectionDefinition,
  parentId: NodeId,
): SceneNode[] => {
  const compact =
    definition.type === "announcement-marquee" ||
    definition.type === "promotional-marquee";
  const height = compact ? 42 : 440;
  const section = createSceneNode(
    {
      id: generateNodeId("section"),
      type: "section",
      name: definition.name,
      props: {
        overflow: "hidden",
        ...(compact
          ? {
              enabled: true,
              speed: { base: 48, tablet: 44, mobile: 38 },
              direction: "left",
              pauseOnHover: true,
              pauseWhenOffscreen: true,
              textColor: "#ffffff",
              fontSize: { base: 13, tablet: 12, mobile: 11 },
              fontWeight: 650,
              letterSpacing: { base: 1, tablet: 0.8, mobile: 0.6 },
              horizontalPadding: { base: 24, tablet: 20, mobile: 16 },
              itemGap: { base: 56, tablet: 44, mobile: 32 },
              separator: "\u2022",
            }
          : {}),
      },
      transform: transform(0, 0, 1200, height, 1),
      layout: {
        mode: compact ? "horizontal" : "vertical",
        sizing: {
          width: { mode: "fill" },
          height: compact
            ? { mode: "fixed", value: height, min: 38 }
            : { mode: "hug", min: 120 },
        },
        autoLayout: {
          padding: compact ? 12 : 56,
          gap: compact ? 40 : 18,
          alignment: compact ? "center" : "stretch",
          distribution: compact ? "space-around" : "start",
          wrap: compact,
        },
        responsiveIntent: {
          width: "fill",
          height: compact ? "fixed" : "hug",
          narrowBehavior: compact ? "wrap" : "stack",
          overflow: compact ? "clip" : "wrap",
        },
      },
      style: {
        fills: [
          {
            type: "solid",
            color: compact ? "#171717" : "#ffffff",
          },
        ],
        strokes: [],
        effects: [],
        opacity: 1,
      },
      extensions: {
        editorKind: "section",
        structured: true,
        sectionType: definition.type,
        ...(canonicalTypes.has(definition.type)
          ? { canonicalSectionType: definition.type as CanonicalSectionType }
          : {}),
        schemaVersion: 1,
        responsiveDefaultsInitialized: true,
        global: false,
        sectionScope: "local",
      },
    },
    parentId,
  );
  section.extensions = {
    ...(section.extensions ?? {}),
    sectionInstanceId: section.id,
  };
  const requestedBlocks =
    genericSectionBlocks[definition.type] ??
    definition.defaultBlocks;
  const blocks = requestedBlocks
    .map((blockType, index) => {
      const blockDefinition = definition.blocks[blockType];
      return blockDefinition
        ? createGenericBlockNode(
            blockDefinition,
            definition.type,
            section.id,
            index,
          )
        : null;
    })
    .filter((node): node is SceneNode => Boolean(node));
  section.childIds = blocks.map((node) => node.id);
  return [section, ...blocks];
};

const findSectionSource = (
  scene: SceneTree | undefined,
  sectionType: string,
): SceneNode | undefined => {
  if (!scene) return undefined;
  const aliases = new Set(sourceSectionTypes(sectionType));
  return Object.values(scene.nodes).find(
    (node) =>
      node.extensions?.editorKind === "section" &&
      aliases.has(String(node.extensions?.sectionType ?? "")),
  );
};

export const createSectionPresetNodes = (
  sectionType: string,
  parentId: NodeId,
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
  activeScene?: SceneTree,
): SceneNode[] => {
  const definition = sectionRegistry.getSection(sectionType);
  if (!definition) throw new Error(`Section ${sectionType} is not registered.`);
  const activeSource = findSectionSource(activeScene, sectionType);
  const fallbackScene = activeSource
    ? null
    : buildBasicTemplateScene(profile, items);
  const sourceScene = activeSource
    ? activeScene ?? null
    : findSectionSource(fallbackScene ?? undefined, sectionType)
      ? fallbackScene
      : null;
  const source = sourceScene
    ? findSectionSource(sourceScene, sectionType)
    : undefined;
  return source && sourceScene
    ? cloneSubtree(sourceScene, source.id, parentId, sectionType)
    : createGenericSectionNodes(definition, parentId);
};

export const createBlockPresetNodes = (
  sectionType: string,
  blockType: string,
  parentId: NodeId,
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
  activeScene?: SceneTree,
): SceneNode[] => {
  const definition = sectionRegistry.getSection(sectionType);
  if (!definition?.blocks[blockType]) {
    throw new Error(`${blockType} is not registered for ${sectionType}.`);
  }
  const hasBlock = (candidate: SceneTree | undefined) =>
    Boolean(
      candidate &&
      Object.values(candidate.nodes).some(
        (node) =>
          node.extensions?.editorKind === "block" &&
          node.extensions?.sectionType === sectionType &&
          node.extensions?.blockType === blockType,
      ),
    );
  const fallbackScene = hasBlock(activeScene)
    ? null
    : buildBasicTemplateScene(profile, items);
  const sourceScene = hasBlock(activeScene)
    ? activeScene ?? null
    : hasBlock(fallbackScene ?? undefined)
      ? fallbackScene
      : null;
  if (!sourceScene) {
    return [
      createGenericBlockNode(
        definition.blocks[blockType],
        sectionType,
        parentId,
        0,
      ),
    ];
  }
  const source = Object.values(sourceScene.nodes).find(
    (node) =>
      node.extensions?.editorKind === "block" &&
      node.extensions?.sectionType === sectionType &&
      node.extensions?.blockType === blockType,
  );
  return source
    ? cloneSubtree(sourceScene, source.id, parentId, sectionType)
    : [
        createGenericBlockNode(
          definition.blocks[blockType],
          sectionType,
          parentId,
          0,
        ),
      ];
};
