import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { sanitizeSvg } from "./svgSanitizer";
import { AssetPlatformError, mapAssetError } from "./asset.errors";
import { AssetUploadService, type PreparedAssetUpload } from "./AssetUploadService";
import { AssetUrlResolver } from "./AssetUrlResolver";
import type {
  AssetUploadProgress,
  AssetUploadResult,
  ImageAssetFormat,
  ImageAssetRecord,
  PersistedAssetRecord,
  UploadImageInput,
} from "./types";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const MIME_FORMATS: Record<string, ImageAssetFormat> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

const preparedSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  bucket: z.enum(["storefront-assets", "merchant-originals", "merchant-private", "temp-uploads"]),
  path: z.string().min(1),
  status: z.enum(["pending", "uploaded"]).default("pending"),
});
const assetSchema = z.object({
  id: z.string().uuid(),
  store_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  bucket: preparedSchema.shape.bucket,
  path: z.string().min(1),
  kind: z.enum(["image", "svg", "video", "document"]),
  mime_type: z.string(),
  bytes: z.number().nonnegative(),
  width: z.number().positive().nullable(),
  height: z.number().positive().nullable(),
  aspect_ratio: z.coerce.number().positive().nullable(),
  alt_text: z.string().nullable(),
  focal_x: z.coerce.number().nullable(),
  focal_y: z.coerce.number().nullable(),
  content_hash: z.string(),
  status: z.enum(["pending", "uploading", "ready", "failed", "deleted"]),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

type PreparedImage = Readonly<{
  file: File;
  format: ImageAssetFormat;
  width: number;
  height: number;
  aspectRatio: number;
  contentHash: string;
}>;

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

const readFileArrayBuffer = (file: File): Promise<ArrayBuffer> => {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer
      ? resolve(reader.result)
      : reject(new AssetPlatformError("ASSET_INVALID_TYPE"));
    reader.onerror = () => reject(reader.error ?? new AssetPlatformError("ASSET_INVALID_TYPE"));
    reader.readAsArrayBuffer(file);
  });
};

const readFileText = (file: File): Promise<string> => {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new AssetPlatformError("ASSET_INVALID_TYPE"));
    reader.onerror = () => reject(reader.error ?? new AssetPlatformError("ASSET_INVALID_TYPE"));
    reader.readAsText(file);
  });
};

const sha256 = async (file: File) => {
  if (!globalThis.crypto?.subtle) throw new AssetPlatformError("ASSET_UPLOAD_FAILED");
  return toHex(await globalThis.crypto.subtle.digest("SHA-256", await readFileArrayBuffer(file)));
};

const measureRaster = (file: File): Promise<{ width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const source = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(source);
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (width > 0 && height > 0) resolve({ width, height });
      else reject(new AssetPlatformError("ASSET_INVALID_TYPE"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(source);
      reject(new AssetPlatformError("ASSET_INVALID_TYPE"));
    };
    image.src = source;
  });

export const prepareImageFile = async (file: File, maxBytes = DEFAULT_MAX_BYTES): Promise<PreparedImage> => {
  if (file.size <= 0 || file.size > maxBytes) throw new AssetPlatformError("ASSET_TOO_LARGE");
  const format = MIME_FORMATS[file.type.toLowerCase()];
  if (!format) throw new AssetPlatformError("ASSET_INVALID_TYPE");

  let uploadFile = file;
  let dimensions: { width: number; height: number; aspectRatio?: number };
  if (format === "svg") {
    try {
      const sanitized = sanitizeSvg(await readFileText(file));
      uploadFile = new File([sanitized.markup], file.name, {
        type: "image/svg+xml",
        lastModified: file.lastModified,
      });
      dimensions = sanitized;
    } catch (error) {
      throw new AssetPlatformError("ASSET_INVALID_TYPE", { cause: error });
    }
  } else {
    dimensions = await measureRaster(uploadFile);
  }
  return {
    file: uploadFile,
    format,
    width: dimensions.width,
    height: dimensions.height,
    aspectRatio: dimensions.aspectRatio ?? dimensions.width / dimensions.height,
    contentHash: await sha256(uploadFile),
  };
};

const parseAsset = (value: unknown): PersistedAssetRecord => {
  const row = assetSchema.parse(value);
  return {
    id: row.id,
    storeId: row.store_id,
    ownerId: row.owner_id,
    bucket: row.bucket,
    path: row.path,
    kind: row.kind,
    mimeType: row.mime_type,
    bytes: row.bytes,
    width: row.width,
    height: row.height,
    aspectRatio: row.aspect_ratio,
    altText: row.alt_text,
    focalX: row.focal_x,
    focalY: row.focal_y,
    contentHash: row.content_hash,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
};

export class AssetManager {
  private storeId: string | null = null;
  private readonly uploader: AssetUploadService;
  private readonly urls: AssetUrlResolver;

  constructor(
    private readonly client: SupabaseClient<Database>,
    options: {
      uploader?: AssetUploadService;
      urlResolver?: AssetUrlResolver;
      projectUrl: string;
      publishableKey: string;
    },
  ) {
    this.uploader = options.uploader ?? new AssetUploadService(client, options.projectUrl, options.publishableKey);
    this.urls = options.urlResolver ?? new AssetUrlResolver(client);
  }

  setStoreContext(storeId: string | null): void {
    this.storeId = storeId;
  }

  async uploadImage(input: UploadImageInput): Promise<AssetUploadResult> {
    const storeId = input.storeId ?? this.storeId;
    if (!storeId) throw new AssetPlatformError("ASSET_PERMISSION_DENIED");
    input.onProgress?.({ assetId: null, bytesUploaded: 0, bytesTotal: input.file.size, percentage: 0, phase: "validating" });
    const preparedFile = await prepareImageFile(input.file, input.maxBytes);
    if (input.signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");

    input.onProgress?.({ assetId: null, bytesUploaded: 0, bytesTotal: preparedFile.file.size, percentage: 0, phase: "preparing" });
    const prepared = await this.prepareRemote({
      storeId,
      file: preparedFile.file,
      format: preparedFile.format,
      contentHash: preparedFile.contentHash,
      visibility: input.visibility ?? "public",
      altText: input.altText ?? input.file.name.replace(/\.[^.]+$/, ""),
    });

    try {
      if (prepared.status !== "uploaded") {
        await this.uploader.upload({
          prepared,
          file: preparedFile.file,
          contentType: preparedFile.file.type,
          signal: input.signal,
          onProgress: input.onProgress,
        });
      }
      input.onProgress?.({ assetId: prepared.id, bytesUploaded: preparedFile.file.size, bytesTotal: preparedFile.file.size, percentage: 100, phase: "finalizing" });
      const asset = await this.finalizeRemote(prepared.id, preparedFile);
      const url = await this.urls.resolve(asset);
      const sceneAsset: ImageAssetRecord = {
        id: asset.id,
        kind: "image",
        originalName: input.file.name,
        intrinsicWidth: asset.width ?? preparedFile.width,
        intrinsicHeight: asset.height ?? preparedFile.height,
        aspectRatio: asset.aspectRatio ?? preparedFile.aspectRatio,
        format: preparedFile.format,
        mimeType: asset.mimeType,
        bytes: asset.bytes,
        contentHash: asset.contentHash,
        altText: asset.altText ?? input.altText ?? input.file.name.replace(/\.[^.]+$/, ""),
        storage: {
          bucket: asset.bucket,
          path: asset.path,
          ...(asset.bucket === "storefront-assets" ? { publicUrl: url } : {}),
        },
        createdAt: Date.parse(asset.createdAt),
        updatedAt: Date.parse(asset.updatedAt),
      };
      input.onProgress?.({ assetId: prepared.id, bytesUploaded: preparedFile.file.size, bytesTotal: preparedFile.file.size, percentage: 100, phase: "complete" });
      return { asset, sceneAsset, url, srcSet: this.urls.srcSet(asset) };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        await this.failAndCleanup(prepared).catch(() => undefined);
        throw error;
      }
      const mapped = mapAssetError(error);
      // Keep resumable/retryable uploads pending. Removing their immutable
      // object here can destroy a concurrent transfer using the same hash/path.
      if (!mapped.retryable) {
        await this.failAndCleanup(prepared).catch(() => undefined);
      }
      throw mapped;
    }
  }

  async replaceImage(previousAssetId: string, input: UploadImageInput): Promise<AssetUploadResult> {
    const result = await this.uploadImage(input);
    const retired = await this.callRpc("retire_asset", {
      p_asset_id: previousAssetId,
    });
    if (retired.error) throw mapAssetError(retired.error);
    return result;
  }

  private async prepareRemote(input: {
    storeId: string;
    file: File;
    format: ImageAssetFormat;
    contentHash: string;
    visibility: NonNullable<UploadImageInput["visibility"]>;
    altText: string;
  }): Promise<PreparedAssetUpload> {
    const result = await this.callRpc("prepare_asset_upload", {
      p_store_id: input.storeId,
      p_filename: input.file.name,
      p_kind: input.format === "svg" ? "svg" : "image",
      p_mime_type: input.file.type,
      p_bytes: input.file.size,
      p_content_hash: input.contentHash,
      p_visibility: input.visibility,
      p_alt_text: input.altText,
    });
    if (result.error) throw mapAssetError(result.error);
    const parsed = preparedSchema.parse(result.data);
    return {
      id: parsed.id,
      storeId: parsed.store_id,
      bucket: parsed.bucket,
      path: parsed.path,
      status: parsed.status,
    };
  }

  private async finalizeRemote(assetId: string, file: PreparedImage): Promise<PersistedAssetRecord> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const result = await this.callRpc("finalize_asset_upload", {
        p_asset_id: assetId,
        p_width: file.width,
        p_height: file.height,
        p_aspect_ratio: file.aspectRatio,
        p_focal_x: 0.5,
        p_focal_y: 0.5,
      });
      if (!result.error) return parseAsset(result.data);
      lastError = result.error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
    throw mapAssetError(lastError);
  }

  private async failAndCleanup(prepared: PreparedAssetUpload): Promise<void> {
    await this.client.storage.from(prepared.bucket).remove([prepared.path]).catch(() => undefined);
    await this.callRpc("fail_asset_upload", { p_asset_id: prepared.id });
  }

  private callRpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }> {
    // SupabaseClient.rpc reads this.rest internally. Calling a detached method
    // loses the client receiver and crashes before a network request is made.
    return this.client.rpc(name as never, args as never) as unknown as Promise<{
      data: unknown;
      error: unknown;
    }>;
  }
}
