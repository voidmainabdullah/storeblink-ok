import { getAssetManager } from "@/assets/system";

/** Compatibility adapter. Durable uploads are owned exclusively by AssetManager. */
export async function uploadImage(
  _legacyBucket: "product-images" | "store-banners",
  storeId: string,
  file: File
): Promise<string> {
  const result = await getAssetManager().uploadImage({
    file,
    storeId,
    visibility: "public",
    altText: file.name.replace(/\.[^.]+$/, ""),
  });
  return result.url;
}
