import type { SceneNode } from "@/types";

export type StorefrontActionIntent =
  | { type: "toggle-mobile-menu" }
  | { type: "open-cart" }
  | { type: "open-account" }
  | { type: "open-search" }
  | { type: "open-category-menu" }
  | { type: "add-to-cart" }
  | { type: "toggle-wishlist" }
  | { type: "browse-products"; query: string | null }
  | { type: "scroll-to-node"; targetNodeId: string }
  | {
      type: "step-node-set";
      targetNodeIds: string[];
      direction: -1 | 1;
      groupId: string;
    };

const asTrimmedString = (value: unknown, maxLength = 160): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim().slice(0, maxLength);
  return normalized || null;
};

const asNodeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => asTrimmedString(entry, 128))
        .filter((entry): entry is string => Boolean(entry)),
    ),
  ).slice(0, 24);
};

export class StorefrontActionSystem {
  resolve(node: SceneNode | undefined): StorefrontActionIntent | null {
    const action = asTrimmedString(node?.extensions?.action, 64);
    switch (action) {
      case "toggle-mobile-menu":
      case "open-cart":
      case "open-account":
      case "open-search":
      case "open-category-menu":
      case "add-to-cart":
      case "toggle-wishlist":
        return { type: action };
      case "browse-products":
        return {
          type: action,
          query: asTrimmedString(node?.extensions?.query, 120),
        };
      case "scroll-to-node": {
        const targetNodeId = asTrimmedString(
          node?.extensions?.targetNodeId,
          128,
        );
        return targetNodeId ? { type: action, targetNodeId } : null;
      }
      case "step-node-set": {
        const targetNodeIds = asNodeIds(node?.extensions?.targetNodeIds);
        if (!targetNodeIds.length) return null;
        return {
          type: action,
          targetNodeIds,
          direction: node?.extensions?.direction === -1 ? -1 : 1,
          groupId:
            asTrimmedString(node?.extensions?.carouselSectionId, 128) ??
            targetNodeIds.join("|"),
        };
      }
      default:
        return null;
    }
  }
}

export const storefrontActionSystem = new StorefrontActionSystem();
