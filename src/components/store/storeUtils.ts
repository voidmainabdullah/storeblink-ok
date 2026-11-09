// Shared catalog presentation helpers. Values come from persisted product data.
export const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Pick the cover image: first of images[] if present, else legacy image_url. */
export const coverImage = (it: { images?: any; image_url?: string | null }): string | null => {
  if (Array.isArray(it.images) && it.images.length > 0 && typeof it.images[0] === "string") return it.images[0];
  return it.image_url ?? null;
};

/** Full gallery list: images[] first, then the legacy image_url field. */
export const galleryImages = (it: { images?: any; image_url?: string | null }): string[] => {
  const arr: string[] = Array.isArray(it.images) ? it.images.filter((x: any) => typeof x === "string" && x) : [];
  if (arr.length > 0) return arr;
  if (it.image_url) return [it.image_url];
  return [];
};
