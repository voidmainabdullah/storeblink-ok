import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { AssetCache } from "./AssetCache";
import { mapAssetError } from "./asset.errors";
import type { AssetBucket, PersistedAssetRecord } from "./types";

export const IMAGE_PRESET_WIDTHS = [96, 320, 640, 960, 1440, 1920] as const;
export type ImagePresetWidth = (typeof IMAGE_PRESET_WIDTHS)[number];

const isPublicBucket = (bucket: AssetBucket) => bucket === "storefront-assets";

export class AssetUrlResolver {
  constructor(
    private readonly client: SupabaseClient<Database>,
    private readonly signedUrlCache = new AssetCache<string>(),
  ) {}

  getPublicUrl(bucket: AssetBucket, path: string, width?: number): string {
    const options = width
      ? { transform: { width, quality: 82, resize: "contain" as const } }
      : undefined;
    return this.client.storage.from(bucket).getPublicUrl(path, options).data.publicUrl;
  }

  async resolve(asset: PersistedAssetRecord, width?: number): Promise<string> {
    if (isPublicBucket(asset.bucket)) return this.getPublicUrl(asset.bucket, asset.path, width);
    const key = `${asset.bucket}:${asset.path}:${width ?? "original"}`;
    const cached = this.signedUrlCache.get(key);
    if (cached) return cached;
    const expiresIn = 3600;
    const signed = await this.client.storage.from(asset.bucket).createSignedUrl(
      asset.path,
      expiresIn,
      width ? { transform: { width, quality: 82, resize: "contain" } } : undefined,
    );
    if (signed.error || !signed.data.signedUrl) throw mapAssetError(signed.error);
    this.signedUrlCache.set(key, signed.data.signedUrl, Date.now() + (expiresIn - 120) * 1000);
    return signed.data.signedUrl;
  }

  srcSet(asset: PersistedAssetRecord): string {
    if (!isPublicBucket(asset.bucket)) return "";
    return IMAGE_PRESET_WIDTHS
      .map((width) => `${this.getPublicUrl(asset.bucket, asset.path, width)} ${width}w`)
      .join(", ");
  }
}
