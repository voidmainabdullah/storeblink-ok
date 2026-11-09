import { z } from "zod";
import { cloneSceneTree } from "@/engine/scene-graph";
import { sanitizeSvgDataUrl } from "@/engine/validation";
import type { SceneTree } from "@/types";
import { svgDataUrl } from "./svgSanitizer";
import {
  ASSET_LIBRARY_EXTENSION_KEY,
  AssetValidationError,
  type AssetSystemAPI,
  type ImageAssetRecord,
  type SceneAssetLibrary,
} from "./types";

const storageSchema = z.object({
  bucket: z.enum(["storefront-assets", "merchant-originals", "merchant-private", "temp-uploads"]),
  path: z.string().trim().min(1),
  publicUrl: z.string().url().optional(),
});

const imageAssetSchema = z.object({
  id: z.string().trim().min(1),
  kind: z.literal("image"),
  originalName: z.string(),
  intrinsicWidth: z.number().finite().positive(),
  intrinsicHeight: z.number().finite().positive(),
  aspectRatio: z.number().finite().positive(),
  format: z.enum(["png", "jpeg", "webp", "avif", "gif", "svg"]),
  mimeType: z.string().optional(),
  bytes: z.number().finite().nonnegative().optional(),
  contentHash: z.string().optional(),
  altText: z.string(),
  storage: storageSchema.optional(),
  originalSource: z.string().trim().min(1).optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
}).refine((asset) => Boolean(asset.storage || asset.originalSource), {
  message: "Asset must contain a durable storage reference or a legacy source.",
});

const assetLibrarySchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  items: z.record(imageAssetSchema),
});

const emptyLibrary = (): SceneAssetLibrary => ({ version: 2, items: {} });

const normalizePersistedAsset = (value: unknown): ImageAssetRecord => {
  const asset = imageAssetSchema.parse(value) as ImageAssetRecord;
  if (asset.format !== "svg" || !asset.originalSource?.startsWith("data:image/svg+xml")) {
    return asset.storage ? { ...asset, originalSource: undefined } : asset;
  }
  try {
    const sanitized = sanitizeSvgDataUrl(asset.originalSource);
    return {
      ...asset,
      originalSource: svgDataUrl(sanitized.markup),
      intrinsicWidth: sanitized.width,
      intrinsicHeight: sanitized.height,
      aspectRatio: sanitized.aspectRatio,
    };
  } catch (error) {
    throw new AssetValidationError(
      "invalid-svg",
      error instanceof Error ? error.message : "The stored SVG asset is invalid.",
    );
  }
};

export const getAssetSource = (asset: ImageAssetRecord | null | undefined): string | null =>
  asset?.storage?.publicUrl ?? asset?.originalSource ?? null;

export class AssetSystem implements AssetSystemAPI {
  getLibrary(scene: SceneTree): SceneAssetLibrary {
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    const parsed = assetLibrarySchema.safeParse(root?.extensions?.[ASSET_LIBRARY_EXTENSION_KEY]);
    if (!parsed.success) return emptyLibrary();
    return {
      version: 2,
      items: Object.fromEntries(
        Object.entries(parsed.data.items).map(([id, asset]) => [id, normalizePersistedAsset(asset)]),
      ),
    };
  }

  getImage(scene: SceneTree, assetId: string | null | undefined): ImageAssetRecord | null {
    if (!assetId) return null;
    return this.getLibrary(scene).items[assetId] ?? null;
  }

  upsertImage(scene: SceneTree, asset: ImageAssetRecord): SceneTree {
    const validated = normalizePersistedAsset(asset);
    const next = cloneSceneTree(scene);
    const root = next.rootNodeId ? next.nodes[next.rootNodeId] : undefined;
    if (!root) throw new AssetValidationError("invalid-image", "The scene has no root node.");
    const library = this.getLibrary(next);
    library.items[validated.id] = structuredClone(validated);
    root.extensions = { ...(root.extensions ?? {}), [ASSET_LIBRARY_EXTENSION_KEY]: library };
    return next;
  }

  removeImage(scene: SceneTree, assetId: string): SceneTree {
    const next = cloneSceneTree(scene);
    const root = next.rootNodeId ? next.nodes[next.rootNodeId] : undefined;
    if (!root) return next;
    const library = this.getLibrary(next);
    delete library.items[assetId];
    root.extensions = { ...(root.extensions ?? {}), [ASSET_LIBRARY_EXTENSION_KEY]: library };
    return next;
  }
}

export const assetSystem = new AssetSystem();
