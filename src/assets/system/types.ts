import type { SceneTree } from "@/types";

export const ASSET_LIBRARY_EXTENSION_KEY = "assetLibrary";

export type ImageAssetFormat = "png" | "jpeg" | "webp" | "avif" | "gif" | "svg";
export type AssetVisibility = "public" | "original" | "private" | "temporary";
export type AssetBucket =
  | "storefront-assets"
  | "merchant-originals"
  | "merchant-private"
  | "temp-uploads";
export type AssetUploadStatus = "pending" | "uploading" | "ready" | "failed" | "deleted";

export type StoredAssetLocation = Readonly<{
  bucket: AssetBucket;
  path: string;
  publicUrl?: string;
}>;

export type ImageAssetRecord = {
  id: string;
  kind: "image";
  originalName: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
  aspectRatio: number;
  format: ImageAssetFormat;
  mimeType?: string;
  bytes?: number;
  contentHash?: string;
  altText: string;
  storage?: StoredAssetLocation;
  // Read-only compatibility for existing scenes. New uploads never set this.
  originalSource?: string;
  createdAt: number;
  updatedAt: number;
};

export type SceneAssetLibrary = {
  version: 2;
  items: Record<string, ImageAssetRecord>;
};

export type AssetImportOptions = {
  altText?: string;
  maxBytes?: number;
};

export type AssetUploadProgress = Readonly<{
  assetId: string | null;
  bytesUploaded: number;
  bytesTotal: number;
  percentage: number;
  phase: "validating" | "preparing" | "uploading" | "finalizing" | "complete";
}>;

export type UploadImageInput = Readonly<{
  file: File;
  storeId?: string;
  visibility?: AssetVisibility;
  altText?: string;
  maxBytes?: number;
  signal?: AbortSignal;
  onProgress?: (progress: AssetUploadProgress) => void;
}>;

export type PersistedAssetRecord = Readonly<{
  id: string;
  storeId: string;
  ownerId: string;
  bucket: AssetBucket;
  path: string;
  kind: "image" | "svg" | "video" | "document";
  mimeType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  aspectRatio: number | null;
  altText: string | null;
  focalX: number | null;
  focalY: number | null;
  contentHash: string;
  status: AssetUploadStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export type AssetUploadResult = Readonly<{
  asset: PersistedAssetRecord;
  sceneAsset: ImageAssetRecord;
  url: string;
  srcSet: string;
}>;

export interface AssetSystemAPI {
  getLibrary(scene: SceneTree): SceneAssetLibrary;
  getImage(scene: SceneTree, assetId: string | null | undefined): ImageAssetRecord | null;
  upsertImage(scene: SceneTree, asset: ImageAssetRecord): SceneTree;
  removeImage(scene: SceneTree, assetId: string): SceneTree;
}

export class AssetValidationError extends Error {
  readonly code:
    | "unsupported-type"
    | "file-too-large"
    | "invalid-svg"
    | "invalid-image";

  constructor(code: AssetValidationError["code"], message: string) {
    super(message);
    this.name = "AssetValidationError";
    this.code = code;
  }
}
