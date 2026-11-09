import type { NodeId, SceneNode, SceneTree } from "@/types";

export type DynamicProductRecord = {
  id: string | number;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  image_url?: string | null;
  images?: unknown;
  price_cents?: number | null;
  original_price_cents?: number | null;
  stock?: number | null;
};

export type DynamicStoreRecord = {
  name?: string | null;
  tagline?: string | null;
  about?: string | null;
  cartCount?: number | null;
};

export type DynamicSourceData = {
  products?: DynamicProductRecord[];
  store?: DynamicStoreRecord;
  currency?: string;
};

export type DynamicBinding = {
  source: "product" | "store";
  field: string;
  target: "text" | "label" | "src" | "alt";
  productId?: string | number;
  format?: "currency";
};

export type DynamicSourceSystemAPI = {
  resolveNode(node: SceneNode, data: DynamicSourceData): SceneNode;
};

export type ProductReferenceChange = {
  nodeId: NodeId;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
};

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const productReferenceId = (node: SceneNode | undefined): string | null => {
  const value = node?.extensions?.productId;
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

export const productReferenceSlot = (node: SceneNode | undefined): string | null => {
  const value = node?.extensions?.productSlotId;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
};

export const updateProductReferenceExtensions = (
  extensions: SceneNode["extensions"],
  productId: string | number | null | undefined,
  productSlotId?: string | null,
): Record<string, unknown> => {
  const next = { ...(extensions ?? {}) };
  const normalizedProductId =
    productId === undefined || productId === null ? "" : String(productId).trim();
  const normalizedSlotId = typeof productSlotId === "string" ? productSlotId.trim() : "";

  if (normalizedProductId) next.productId = normalizedProductId;
  else delete next.productId;

  if (normalizedSlotId) next.productSlotId = normalizedSlotId;

  const binding = recordValue(next.dynamicBinding);
  if (binding?.source === "product") {
    const nextBinding = { ...binding };
    if (normalizedProductId) nextBinding.productId = normalizedProductId;
    else delete nextBinding.productId;
    next.dynamicBinding = nextBinding;
  }

  return next;
};

const subtreeNodeIds = (scene: SceneTree, rootNodeId: NodeId): NodeId[] => {
  const ids: NodeId[] = [];
  const visit = (nodeId: NodeId) => {
    const node = scene.nodes[nodeId];
    if (!node) return;
    ids.push(nodeId);
    node.childIds.forEach(visit);
  };
  visit(rootNodeId);
  return ids;
};

export const productReferenceScopeNodeIds = (
  scene: SceneTree,
  anchorNodeId: NodeId,
): NodeId[] => {
  const anchor = scene.nodes[anchorNodeId];
  if (!anchor) return [];
  const slotId = productReferenceSlot(anchor);
  if (!slotId) return subtreeNodeIds(scene, anchorNodeId);
  return Object.values(scene.nodes)
    .filter((node) => productReferenceSlot(node) === slotId)
    .map((node) => node.id);
};

export const createProductReferenceChanges = (
  scene: SceneTree,
  anchorNodeId: NodeId,
  productId: string | number | null | undefined,
): ProductReferenceChange[] =>
  productReferenceScopeNodeIds(scene, anchorNodeId).flatMap((nodeId) => {
    const node = scene.nodes[nodeId];
    if (!node) return [];
    const before = node.extensions ?? {};
    const after = updateProductReferenceExtensions(
      before,
      productId,
      productReferenceSlot(node) ?? productReferenceSlot(scene.nodes[anchorNodeId]),
    );
    return JSON.stringify(before) === JSON.stringify(after)
      ? []
      : [{ nodeId, before, after }];
  });

export const synchronizeProductReference = (
  scene: SceneTree,
  nodeIds: NodeId[],
  productId: string | number | null | undefined,
  productSlotId: string,
): void => {
  nodeIds.forEach((nodeId) => {
    const node = scene.nodes[nodeId];
    if (!node) return;
    node.extensions = updateProductReferenceExtensions(
      node.extensions,
      productId,
      productSlotId,
    );
  });
};

export const synchronizeProductReferenceSubtree = (
  scene: SceneTree,
  rootNodeId: NodeId,
  productId: string | number | null | undefined,
  productSlotId = rootNodeId,
): void => {
  synchronizeProductReference(
    scene,
    subtreeNodeIds(scene, rootNodeId),
    productId,
    productSlotId,
  );
};

const bindingForNode = (node: SceneNode): DynamicBinding | null => {
  const binding = node.extensions?.dynamicBinding;
  if (!binding || typeof binding !== "object") return null;
  const candidate = binding as Partial<DynamicBinding>;
  if (
    (candidate.source !== "product" && candidate.source !== "store") ||
    typeof candidate.field !== "string" ||
    !["text", "label", "src", "alt"].includes(String(candidate.target))
  ) {
    return null;
  }
  return candidate as DynamicBinding;
};

const firstImage = (product: DynamicProductRecord): string | null => {
  if (typeof product.image_url === "string" && product.image_url.trim()) return product.image_url;
  if (Array.isArray(product.images)) {
    for (const entry of product.images) {
      if (typeof entry === "string" && entry.trim()) return entry;
      if (entry && typeof entry === "object") {
        const candidate = (entry as { url?: unknown; src?: unknown }).url ??
          (entry as { url?: unknown; src?: unknown }).src;
        if (typeof candidate === "string" && candidate.trim()) return candidate;
      }
    }
  }
  return null;
};

const productValue = (product: DynamicProductRecord, field: string): unknown => {
  if (field === "image" || field === "image_url") return firstImage(product);
  return product[field as keyof DynamicProductRecord];
};

const storeValue = (store: DynamicStoreRecord | undefined, field: string): unknown => {
  if (!store) return undefined;
  if (field === "business_name") return store.name;
  if (field === "store_tagline") return store.tagline;
  if (field === "store_about") return store.about;
  if (field === "cart_count") return store.cartCount;
  return store[field as keyof DynamicStoreRecord];
};

const formatValue = (value: unknown, binding: DynamicBinding, currency = "USD"): string => {
  if (binding.format === "currency") {
    const cents = Number(value);
    if (!Number.isFinite(cents)) return "";
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  }
  return value === null || value === undefined ? "" : String(value);
};

export class DynamicSourceSystem implements DynamicSourceSystemAPI {
  resolveNode(node: SceneNode, data: DynamicSourceData): SceneNode {
    const binding = bindingForNode(node);
    if (!binding) return node;

    const rawValue =
      binding.source === "product"
        ? productValue(
            data.products?.find((product) => String(product.id) === String(binding.productId)) ?? { id: "" },
            binding.field,
          )
        : storeValue(data.store, binding.field);
    const value = binding.target === "src" ? rawValue : formatValue(rawValue, binding, data.currency);
    if (value === undefined || value === null || value === "") {
      return {
        ...node,
        props: { ...node.props, dynamicSourceMissing: true },
      };
    }
    return {
      ...node,
      props: {
        ...node.props,
        [binding.target]: value,
        dynamicSourceMissing: false,
      },
    };
  }
}

export const dynamicSourceSystem = new DynamicSourceSystem();
