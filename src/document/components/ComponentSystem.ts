import { cloneSceneNode, cloneSceneTree, generateNodeId } from "@/engine/scene-graph";
import { validateSceneTree } from "@/engine/validation";
import type {
  ComponentDefinition,
  ComponentDefinitionTree,
  ComponentInstanceData,
  ComponentLibrary,
  ComponentNodeOverride,
  ComponentOverridePatch,
  ComponentOverrideScope,
  SceneNode,
  SceneTree,
} from "@/types";
import type {
  ComponentImpact,
  ComponentSceneResult,
  ComponentSystemAPI,
  CreateComponentOptions,
  InstantiateComponentOptions,
} from "./types";

const DEFAULT_VARIANT_ID = "default";
const COMPONENT_SOURCE_KEY = "componentSourceNodeId";
const COMPONENT_INSTANCE_KEY = "componentInstanceId";
const COMPONENT_ROLE_KEY = "componentRole";
const COMPONENT_DEFINITION_KEY = "componentDefinitionId";

const TEXT_KEYS = ["text", "content", "label", "placeholder"] as const;
const IMAGE_KEYS = [
  "src",
  "assetId",
  "objectFit",
  "fit",
  "alt",
  "focalPoint",
  "imageAdjustments",
  "overlayColor",
  "overlayOpacity",
] as const;
const LINK_PROP_KEYS = ["href", "url", "path", "target", "rel", "label"] as const;
const LINK_EXTENSION_KEYS = ["navigationKey", "action", "linkTarget"] as const;
const PRODUCT_PROP_KEYS = ["productId", "collectionId"] as const;
const PRODUCT_EXTENSION_KEYS = ["productId", "collectionId", "dynamicBinding"] as const;

const emptyLibrary = (): ComponentLibrary => ({ version: 1, definitions: {} });

const deepEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const own = (record: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const pickChanged = (
  current: Record<string, unknown>,
  source: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  keys.forEach((key) => {
    if (!own(current, key) && !own(source, key)) return;
    if (!deepEqual(current[key], source[key])) result[key] = structuredClone(current[key]);
  });
  return result;
};

const nonEmpty = (record: Record<string, unknown> | undefined): boolean =>
  Boolean(record && Object.keys(record).length);

const cleanComponentExtensions = (
  value: SceneNode["extensions"],
): SceneNode["extensions"] => {
  if (!value) return undefined;
  const extensions = structuredClone(value);
  delete extensions[COMPONENT_SOURCE_KEY];
  delete extensions[COMPONENT_INSTANCE_KEY];
  delete extensions[COMPONENT_ROLE_KEY];
  delete extensions[COMPONENT_DEFINITION_KEY];
  return Object.keys(extensions).length ? extensions : undefined;
};

const cleanComponentMeta = (node: SceneNode): SceneNode["meta"] => {
  const meta = { ...node.meta };
  delete meta.componentId;
  delete meta.componentInstance;
  return meta;
};

const collectSubtreeIds = (scene: SceneTree, rootId: string): string[] => {
  const ids: string[] = [];
  const visiting = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) throw new Error(`Cycle detected while reading component source ${nodeId}.`);
    const node = scene.nodes[nodeId];
    if (!node) throw new Error(`Component source node ${nodeId} does not exist.`);
    visiting.add(nodeId);
    ids.push(nodeId);
    node.childIds.forEach(visit);
    visiting.delete(nodeId);
  };
  visit(rootId);
  return ids;
};

const extractDefinitionTree = (scene: SceneTree, rootId: string): ComponentDefinitionTree => {
  const ids = collectSubtreeIds(scene, rootId);
  const nestedInstance = ids.find((id) => scene.nodes[id].meta.componentInstance);
  if (nestedInstance) {
    throw new Error("Detach nested component instances before creating a component definition.");
  }
  const nodes = Object.fromEntries(ids.map((id) => {
    const source = scene.nodes[id];
    const node = cloneSceneNode(source);
    node.meta = cleanComponentMeta(node);
    node.extensions = cleanComponentExtensions(node.extensions);
    if (id === rootId) {
      node.parentId = null;
      node.transform = { ...node.transform, x: 0, y: 0, zIndex: 0 };
    }
    return [id, node];
  }));
  return validateSceneTree({ rootNodeId: rootId, nodes }) as ComponentDefinitionTree;
};

const nodesByPath = (tree: ComponentDefinitionTree): Map<string, SceneNode> => {
  const result = new Map<string, SceneNode>();
  const visit = (nodeId: string, path: string): void => {
    const node = tree.nodes[nodeId];
    if (!node) return;
    result.set(path, node);
    node.childIds.forEach((childId, index) => visit(childId, `${path}.${index}`));
  };
  visit(tree.rootNodeId, "0");
  return result;
};

const alignVariantTree = (
  base: ComponentDefinitionTree,
  candidate: ComponentDefinitionTree,
): ComponentDefinitionTree => {
  const basePaths = nodesByPath(base);
  const candidatePaths = nodesByPath(candidate);
  const idMap = new Map<string, string>();
  candidatePaths.forEach((node, path) => {
    const baseNode = basePaths.get(path);
    const compatible = baseNode && baseNode.type === node.type;
    idMap.set(node.id, compatible ? baseNode.id : node.id);
  });
  const nodes = Object.fromEntries([...candidatePaths.values()].map((source) => {
    const node = cloneSceneNode(source);
    node.id = idMap.get(source.id) ?? source.id;
    node.parentId = source.parentId ? idMap.get(source.parentId) ?? source.parentId : null;
    node.childIds = source.childIds.map((childId) => idMap.get(childId) ?? childId);
    return [node.id, node];
  }));
  return validateSceneTree({
    rootNodeId: idMap.get(candidate.rootNodeId) ?? candidate.rootNodeId,
    nodes,
  }) as ComponentDefinitionTree;
};

const sourceTreeFor = (
  scene: SceneTree,
  definitionId: string,
  variantId?: string,
): { definition: ComponentDefinition; tree: ComponentDefinitionTree; variantId: string } => {
  const definition = scene.components?.definitions[definitionId];
  if (!definition) throw new Error(`Component definition ${definitionId} does not exist.`);
  const resolvedVariantId = variantId ?? definition.defaultVariantId;
  const variant = definition.variants[resolvedVariantId];
  if (!variant) throw new Error(`Component variant ${resolvedVariantId} does not exist.`);
  return { definition, tree: variant.tree, variantId: resolvedVariantId };
};

const instanceDataFor = (node: SceneNode): ComponentInstanceData => {
  const data = node.meta.componentInstance;
  if (!data || node.meta.componentId !== data.componentDefinitionId) {
    throw new Error(`${node.name} is not a managed component instance.`);
  }
  return structuredClone(data);
};

const insertChild = (parent: SceneNode, childId: string, index = parent.childIds.length): void => {
  const safeIndex = Math.max(0, Math.min(index, parent.childIds.length));
  parent.childIds.splice(safeIndex, 0, childId);
};

const applyPatch = (node: SceneNode, patch: ComponentOverridePatch): SceneNode => ({
  ...node,
  props: patch.props ? { ...node.props, ...structuredClone(patch.props) } : node.props,
  style: patch.style ? { ...node.style, ...structuredClone(patch.style) } : node.style,
  meta: patch.meta ? { ...node.meta, ...patch.meta } : node.meta,
  extensions: patch.extensions
    ? { ...(node.extensions ?? {}), ...structuredClone(patch.extensions) }
    : node.extensions,
});

const sanitizeOverride = (override: ComponentNodeOverride): ComponentNodeOverride => {
  const patch: ComponentOverridePatch = {};
  if (override.scope === "text") {
    const props = pickChanged(override.patch.props ?? {}, {}, TEXT_KEYS);
    if (nonEmpty(props)) patch.props = props;
  }
  if (override.scope === "image") {
    const props = pickChanged(override.patch.props ?? {}, {}, IMAGE_KEYS);
    if (nonEmpty(props)) patch.props = props;
    if (override.patch.style?.fills) patch.style = { fills: structuredClone(override.patch.style.fills) };
  }
  if (override.scope === "link") {
    const props = pickChanged(override.patch.props ?? {}, {}, LINK_PROP_KEYS);
    const extensions = pickChanged(override.patch.extensions ?? {}, {}, LINK_EXTENSION_KEYS);
    if (nonEmpty(props)) patch.props = props;
    if (nonEmpty(extensions)) patch.extensions = extensions;
  }
  if (override.scope === "product-binding") {
    const props = pickChanged(override.patch.props ?? {}, {}, PRODUCT_PROP_KEYS);
    const extensions = pickChanged(override.patch.extensions ?? {}, {}, PRODUCT_EXTENSION_KEYS);
    if (nonEmpty(props)) patch.props = props;
    if (nonEmpty(extensions)) patch.extensions = extensions;
  }
  if (override.scope === "visibility" && typeof override.patch.meta?.hidden === "boolean") {
    patch.meta = { hidden: override.patch.meta.hidden };
  }
  if (!patch.props && !patch.style && !patch.meta && !patch.extensions) {
    throw new Error(`Component ${override.scope} override contains no supported values.`);
  }
  return { sourceNodeId: override.sourceNodeId, scope: override.scope, patch };
};

const upsertOverride = (
  overrides: ComponentNodeOverride[],
  next: ComponentNodeOverride,
): ComponentNodeOverride[] => [
  ...overrides.filter((entry) =>
    entry.sourceNodeId !== next.sourceNodeId || entry.scope !== next.scope,
  ),
  structuredClone(next),
];

const sourceMapForInstance = (scene: SceneTree, rootId: string): Map<string, string> => {
  const map = new Map<string, string>();
  collectSubtreeIds(scene, rootId).forEach((physicalId) => {
    const node = scene.nodes[physicalId];
    const sourceId = String(node.extensions?.[COMPONENT_SOURCE_KEY] ?? "");
    if (sourceId) map.set(sourceId, physicalId);
  });
  return map;
};

const scopedDiffs = (
  source: SceneNode,
  current: SceneNode,
): ComponentNodeOverride[] => {
  const result: ComponentNodeOverride[] = [];
  const add = (scope: ComponentOverrideScope, patch: ComponentOverridePatch) => {
    if (patch.props || patch.style || patch.meta || patch.extensions) {
      result.push({ sourceNodeId: source.id, scope, patch });
    }
  };

  const textProps = pickChanged(current.props, source.props, TEXT_KEYS);
  if (nonEmpty(textProps)) add("text", { props: textProps });

  const imageProps = pickChanged(current.props, source.props, IMAGE_KEYS);
  const imageStyle = !deepEqual(current.style.fills, source.style.fills) &&
    (source.type === "image" || current.type === "image")
    ? { fills: structuredClone(current.style.fills) }
    : undefined;
  if (nonEmpty(imageProps) || imageStyle) add("image", {
    ...(nonEmpty(imageProps) ? { props: imageProps } : {}),
    ...(imageStyle ? { style: imageStyle } : {}),
  });

  const linkProps = pickChanged(current.props, source.props, LINK_PROP_KEYS);
  const linkExtensions = pickChanged(
    current.extensions ?? {},
    source.extensions ?? {},
    LINK_EXTENSION_KEYS,
  );
  if (nonEmpty(linkProps) || nonEmpty(linkExtensions)) add("link", {
    ...(nonEmpty(linkProps) ? { props: linkProps } : {}),
    ...(nonEmpty(linkExtensions) ? { extensions: linkExtensions } : {}),
  });

  const productProps = pickChanged(current.props, source.props, PRODUCT_PROP_KEYS);
  const productExtensions = pickChanged(
    current.extensions ?? {},
    source.extensions ?? {},
    PRODUCT_EXTENSION_KEYS,
  );
  if (nonEmpty(productProps) || nonEmpty(productExtensions)) add("product-binding", {
    ...(nonEmpty(productProps) ? { props: productProps } : {}),
    ...(nonEmpty(productExtensions) ? { extensions: productExtensions } : {}),
  });

  if (current.meta.hidden !== source.meta.hidden) {
    add("visibility", { meta: { hidden: current.meta.hidden } });
  }
  return result;
};

export class ComponentSystem implements ComponentSystemAPI {
  createDefinition(
    input: SceneTree,
    nodeId: string,
    options: CreateComponentOptions = {},
  ): ComponentSceneResult {
    const scene = cloneSceneTree(input);
    const source = scene.nodes[nodeId];
    if (!source) throw new Error(`Component source node ${nodeId} does not exist.`);
    if (!source.parentId) throw new Error("The scene root cannot become a reusable component.");
    if (source.meta.componentInstance) throw new Error("Detach the instance before creating a definition.");
    const definitionId = options.definitionId ?? generateNodeId("component");
    const variantId = options.defaultVariantId ?? DEFAULT_VARIANT_ID;
    const library = scene.components ? structuredClone(scene.components) : emptyLibrary();
    if (library.definitions[definitionId]) throw new Error(`Component ${definitionId} already exists.`);
    const now = Date.now();
    const definition: ComponentDefinition = {
      id: definitionId,
      name: options.name?.trim() || source.name,
      defaultVariantId: variantId,
      variants: {
        [variantId]: {
          id: variantId,
          name: "Default",
          tree: extractDefinitionTree(scene, nodeId),
        },
      },
      masterNodeId: nodeId,
      createdAt: now,
      updatedAt: now,
    };
    library.definitions[definitionId] = definition;
    scene.components = library;
    source.extensions = {
      ...(source.extensions ?? {}),
      [COMPONENT_ROLE_KEY]: "definition",
      [COMPONENT_DEFINITION_KEY]: definitionId,
    };
    return { scene: validateSceneTree(scene), definition: structuredClone(definition) };
  }

  createVariant(
    input: SceneTree,
    definitionId: string,
    sourceNodeId: string,
    inputVariant: { id?: string; name: string },
  ): ComponentSceneResult {
    const scene = cloneSceneTree(input);
    if (scene.components) scene.components = structuredClone(scene.components);
    const definition = scene.components?.definitions[definitionId];
    if (!definition) throw new Error(`Component definition ${definitionId} does not exist.`);
    const variantId = inputVariant.id ?? generateNodeId("variant");
    if (definition.variants[variantId]) throw new Error(`Component variant ${variantId} already exists.`);
    const candidate = extractDefinitionTree(scene, sourceNodeId);
    const baseTree = definition.variants[definition.defaultVariantId].tree;
    definition.variants[variantId] = {
      id: variantId,
      name: inputVariant.name.trim() || "Variant",
      tree: alignVariantTree(baseTree, candidate),
    };
    definition.updatedAt = Date.now();
    return { scene: validateSceneTree(scene), definition: structuredClone(definition) };
  }

  instantiate(
    input: SceneTree,
    definitionId: string,
    parentId: string,
    options: InstantiateComponentOptions = {},
  ): ComponentSceneResult {
    const scene = cloneSceneTree(input);
    const parent = scene.nodes[parentId];
    if (!parent) throw new Error(`Component parent ${parentId} does not exist.`);
    const { tree, variantId } = sourceTreeFor(scene, definitionId, options.variantId);
    const sourceIds = collectSubtreeIds(tree as SceneTree, tree.rootNodeId);
    const idMap = new Map(sourceIds.map((sourceId) => [
      sourceId,
      generateNodeId(tree.nodes[sourceId].type.replace("custom:", "custom-")),
    ]));
    const rootId = idMap.get(tree.rootNodeId) as string;
    const now = Date.now();
    sourceIds.forEach((sourceId) => {
      const source = tree.nodes[sourceId];
      const node = cloneSceneNode(source);
      node.id = idMap.get(sourceId) as string;
      node.parentId = sourceId === tree.rootNodeId
        ? parentId
        : idMap.get(source.parentId as string) ?? rootId;
      node.childIds = source.childIds.map((childId) => idMap.get(childId) as string);
      node.meta = {
        ...cleanComponentMeta(node),
        createdAt: now,
        updatedAt: now,
        ...(sourceId === tree.rootNodeId
          ? {
              componentId: definitionId,
              componentInstance: {
                componentDefinitionId: definitionId,
                variantId,
                overrides: [],
                detached: false as const,
              },
            }
          : {}),
      };
      node.extensions = {
        ...(cleanComponentExtensions(node.extensions) ?? {}),
        [COMPONENT_SOURCE_KEY]: sourceId,
        [COMPONENT_INSTANCE_KEY]: rootId,
        [COMPONENT_ROLE_KEY]: sourceId === tree.rootNodeId ? "instance" : "instance-child",
      };
      if (sourceId === tree.rootNodeId) {
        node.transform = {
          ...node.transform,
          x: options.x ?? source.transform.x,
          y: options.y ?? source.transform.y,
          zIndex: options.zIndex ?? source.transform.zIndex,
        };
      }
      scene.nodes[node.id] = node;
    });
    insertChild(parent, rootId, options.index);
    return { scene: validateSceneTree(scene), instanceRootId: rootId };
  }

  updateDefinition(input: SceneTree, definitionId: string, variantId?: string): ComponentSceneResult {
    const scene = cloneSceneTree(input);
    if (scene.components) scene.components = structuredClone(scene.components);
    const definition = scene.components?.definitions[definitionId];
    if (!definition) throw new Error(`Component definition ${definitionId} does not exist.`);
    const sourceNodeId = definition.masterNodeId;
    if (!sourceNodeId || !scene.nodes[sourceNodeId]) {
      throw new Error(`Component ${definition.name} has no editable master in this scene.`);
    }
    const resolvedVariantId = variantId ?? definition.defaultVariantId;
    const existing = definition.variants[resolvedVariantId];
    if (!existing) throw new Error(`Component variant ${resolvedVariantId} does not exist.`);
    const nextTree = extractDefinitionTree(scene, sourceNodeId);
    if (deepEqual(existing.tree, nextTree)) {
      return { scene: validateSceneTree(scene), definition: structuredClone(definition) };
    }
    definition.variants[resolvedVariantId] = {
      ...existing,
      tree: nextTree,
    };
    definition.updatedAt = Date.now();
    return {
      scene: this.propagate(scene, definitionId),
      definition: structuredClone(definition),
    };
  }

  refreshDefinitionsFromMasters(input: SceneTree): SceneTree {
    let scene = cloneSceneTree(input);
    Object.values(scene.components?.definitions ?? {}).forEach((definition) => {
      const master = definition.masterNodeId ? scene.nodes[definition.masterNodeId] : undefined;
      if (master?.extensions?.[COMPONENT_ROLE_KEY] === "definition") {
        scene = this.updateDefinition(scene, definition.id).scene;
      }
    });
    return scene;
  }

  propagate(input: SceneTree, definitionId: string): SceneTree {
    const scene = cloneSceneTree(input);
    const instanceIds = Object.values(scene.nodes)
      .filter((node) => node.meta.componentInstance?.componentDefinitionId === definitionId)
      .map((node) => node.id);
    instanceIds.forEach((instanceId) => {
      this.syncInstanceMutable(scene, instanceId);
    });
    return validateSceneTree(scene);
  }

  propagateAll(input: SceneTree): SceneTree {
    const scene = cloneSceneTree(input);
    const instanceIds = Object.values(scene.nodes)
      .filter((node) => Boolean(node.meta.componentInstance))
      .map((node) => node.id);
    instanceIds.forEach((instanceId) => {
      this.syncInstanceMutable(scene, instanceId);
    });
    return validateSceneTree(scene);
  }

  applyOverride(
    input: SceneTree,
    instanceRootId: string,
    rawOverride: ComponentNodeOverride,
  ): SceneTree {
    const scene = cloneSceneTree(input);
    const root = scene.nodes[instanceRootId];
    if (!root) throw new Error(`Component instance ${instanceRootId} does not exist.`);
    const data = instanceDataFor(root);
    const { tree } = sourceTreeFor(scene, data.componentDefinitionId, data.variantId);
    if (!tree.nodes[rawOverride.sourceNodeId]) {
      throw new Error(`Component source node ${rawOverride.sourceNodeId} does not exist in ${data.variantId}.`);
    }
    const override = sanitizeOverride(rawOverride);
    data.overrides = upsertOverride(data.overrides, override);
    root.meta = { ...root.meta, componentInstance: data, updatedAt: Date.now() };
    this.syncInstanceMutable(scene, instanceRootId);
    return validateSceneTree(scene);
  }

  resetOverrides(
    input: SceneTree,
    instanceRootId: string,
    filter: { sourceNodeId?: string; scope?: ComponentOverrideScope } = {},
  ): SceneTree {
    const scene = cloneSceneTree(input);
    const root = scene.nodes[instanceRootId];
    if (!root) throw new Error(`Component instance ${instanceRootId} does not exist.`);
    const data = instanceDataFor(root);
    data.overrides = data.overrides.filter((entry) => {
      if (filter.sourceNodeId && entry.sourceNodeId !== filter.sourceNodeId) return true;
      if (filter.scope && entry.scope !== filter.scope) return true;
      return false;
    });
    root.meta = { ...root.meta, componentInstance: data, updatedAt: Date.now() };
    this.syncInstanceMutable(scene, instanceRootId);
    return validateSceneTree(scene);
  }

  captureOverrides(input: SceneTree, instanceRootId?: string): SceneTree {
    const scene = cloneSceneTree(input);
    const instanceIds = instanceRootId
      ? [instanceRootId]
      : Object.values(scene.nodes)
          .filter((node) => Boolean(node.meta.componentInstance))
          .map((node) => node.id);
    instanceIds.forEach((rootId) => {
      const root = scene.nodes[rootId];
      if (!root) return;
      const data = instanceDataFor(root);
      const { tree } = sourceTreeFor(scene, data.componentDefinitionId, data.variantId);
      const sourceMap = sourceMapForInstance(scene, rootId);
      const captured: ComponentNodeOverride[] = [];
      Object.values(tree.nodes).forEach((source) => {
        const physicalId = sourceMap.get(source.id);
        const current = physicalId ? scene.nodes[physicalId] : undefined;
        if (current) captured.push(...scopedDiffs(source, current));
      });
      root.meta = {
        ...root.meta,
        componentInstance: { ...data, overrides: captured },
        updatedAt: Date.now(),
      };
      this.syncInstanceMutable(scene, rootId);
    });
    return validateSceneTree(scene);
  }

  swapVariant(input: SceneTree, instanceRootId: string, variantId: string): SceneTree {
    const scene = cloneSceneTree(input);
    const root = scene.nodes[instanceRootId];
    if (!root) throw new Error(`Component instance ${instanceRootId} does not exist.`);
    const data = instanceDataFor(root);
    const { tree } = sourceTreeFor(scene, data.componentDefinitionId, variantId);
    data.variantId = variantId;
    data.overrides = data.overrides.filter((entry) => Boolean(tree.nodes[entry.sourceNodeId]));
    root.meta = { ...root.meta, componentInstance: data, updatedAt: Date.now() };
    this.syncInstanceMutable(scene, instanceRootId);
    return validateSceneTree(scene);
  }

  detach(input: SceneTree, instanceRootId: string): SceneTree {
    const scene = cloneSceneTree(input);
    const root = scene.nodes[instanceRootId];
    if (!root) throw new Error(`Component instance ${instanceRootId} does not exist.`);
    instanceDataFor(root);
    collectSubtreeIds(scene, instanceRootId).forEach((nodeId) => {
      const node = scene.nodes[nodeId];
      node.meta = { ...cleanComponentMeta(node), updatedAt: Date.now() };
      node.extensions = cleanComponentExtensions(node.extensions);
    });
    return validateSceneTree(scene);
  }

  getInstanceRootId(scene: SceneTree, nodeId: string): string | null {
    const node = scene.nodes[nodeId];
    if (!node) return null;
    if (node.meta.componentInstance) return node.id;
    const rootId = node.extensions?.[COMPONENT_INSTANCE_KEY];
    return typeof rootId === "string" && scene.nodes[rootId]?.meta.componentInstance
      ? rootId
      : null;
  }

  getImpact(
    definitionId: string,
    pages: ReadonlyArray<{ pageId: string; scene: SceneTree }>,
  ): ComponentImpact {
    const affected = pages.flatMap(({ pageId, scene }) => {
      const instanceIds = Object.values(scene.nodes)
        .filter((node) => node.meta.componentInstance?.componentDefinitionId === definitionId)
        .map((node) => node.id);
      return instanceIds.length ? [{ pageId, instanceIds }] : [];
    });
    return {
      definitionId,
      instanceCount: affected.reduce((sum, page) => sum + page.instanceIds.length, 0),
      pageCount: affected.length,
      pages: affected,
    };
  }

  assertScene(scene: SceneTree): void {
    validateSceneTree(scene);
    Object.values(scene.components?.definitions ?? {}).forEach((definition) => {
      Object.values(definition.variants).forEach((variant) => {
        validateSceneTree({
          rootNodeId: variant.tree.rootNodeId,
          nodes: variant.tree.nodes,
        });
      });
    });
    Object.values(scene.nodes).forEach((node) => {
      if (!node.meta.componentInstance) return;
      const data = instanceDataFor(node);
      const { tree } = sourceTreeFor(scene, data.componentDefinitionId, data.variantId);
      const sourceMap = sourceMapForInstance(scene, node.id);
      Object.keys(tree.nodes).forEach((sourceId) => {
        if (!sourceMap.has(sourceId)) {
          throw new Error(`Component instance ${node.id} is missing source node ${sourceId}.`);
        }
      });
    });
  }

  private syncInstanceMutable(scene: SceneTree, instanceRootId: string): void {
    const currentRoot = scene.nodes[instanceRootId];
    if (!currentRoot) throw new Error(`Component instance ${instanceRootId} does not exist.`);
    const data = instanceDataFor(currentRoot);
    const { tree } = sourceTreeFor(scene, data.componentDefinitionId, data.variantId);
    const existingMap = sourceMapForInstance(scene, instanceRootId);
    existingMap.set(tree.rootNodeId, instanceRootId);
    const sourceIds = collectSubtreeIds(tree as SceneTree, tree.rootNodeId);
    const idMap = new Map(sourceIds.map((sourceId) => [
      sourceId,
      existingMap.get(sourceId) ?? generateNodeId(tree.nodes[sourceId].type.replace("custom:", "custom-")),
    ]));
    const currentIds = collectSubtreeIds(scene, instanceRootId);
    const parentId = currentRoot.parentId;
    const rootPlacement = structuredClone(currentRoot.transform);
    const rootResponsive = structuredClone(currentRoot.layout.responsive);
    const now = Date.now();

    currentIds.forEach((nodeId) => {
      if (nodeId !== instanceRootId) delete scene.nodes[nodeId];
    });

    sourceIds.forEach((sourceId) => {
      const source = tree.nodes[sourceId];
      let node = cloneSceneNode(source);
      const physicalId = idMap.get(sourceId) as string;
      node.id = physicalId;
      node.parentId = sourceId === tree.rootNodeId
        ? parentId
        : idMap.get(source.parentId as string) ?? instanceRootId;
      node.childIds = source.childIds.map((childId) => idMap.get(childId) as string);
      node.meta = {
        ...cleanComponentMeta(node),
        createdAt: scene.nodes[physicalId]?.meta.createdAt ?? now,
        updatedAt: now,
        ...(sourceId === tree.rootNodeId
          ? { componentId: data.componentDefinitionId, componentInstance: structuredClone(data) }
          : {}),
      };
      node.extensions = {
        ...(cleanComponentExtensions(node.extensions) ?? {}),
        [COMPONENT_SOURCE_KEY]: sourceId,
        [COMPONENT_INSTANCE_KEY]: instanceRootId,
        [COMPONENT_ROLE_KEY]: sourceId === tree.rootNodeId ? "instance" : "instance-child",
      };
      if (sourceId === tree.rootNodeId) {
        node.transform = rootPlacement;
        if (rootResponsive) node.layout = { ...node.layout, responsive: rootResponsive };
      }
      scene.nodes[physicalId] = node;
    });

    data.overrides.forEach((override) => {
      const physicalId = idMap.get(override.sourceNodeId);
      if (!physicalId || !scene.nodes[physicalId]) return;
      scene.nodes[physicalId] = applyPatch(scene.nodes[physicalId], override.patch);
    });
  }
}

export const createComponentSystem = (): ComponentSystemAPI => new ComponentSystem();

export const componentSystem = createComponentSystem();
