import type { User } from "@supabase/supabase-js";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { StoreSceneItem } from "@/editor/engine/storeSceneAdapter";
import { throwIfSupabaseError } from "@/platform/supabase/normalizeError";

export type EditorStoreProfile = Readonly<{
  id: string;
  business_name: string | null;
  store_tagline: string | null;
  store_about: string | null;
  store_color: string | null;
  store_banner_url: string | null;
  store_slug: string;
  theme: unknown;
  theme_draft: unknown;
  theme_published: unknown;
  theme_revision: number;
  categories: readonly string[];
}>;

export type EditorStoreLoadResult = Readonly<{
  profile: EditorStoreProfile;
  items: readonly StoreSceneItem[];
}>;

const editorStoreSchema = z.object({
  id: z.string().uuid(),
  business_name: z.string().nullable(),
  store_tagline: z.string().nullable(),
  store_about: z.string().nullable(),
  store_color: z.string().nullable(),
  store_banner_url: z.string().nullable(),
  store_slug: z.string(),
  theme: z.unknown().nullable(),
  theme_draft: z.unknown().nullable(),
  theme_published: z.unknown().nullable(),
  theme_revision: z.coerce.number().nonnegative(),
  categories: z.array(z.string()).default([]),
});

const generatedDraftResultSchema = z.object({
  revision: z.coerce.number().nonnegative(),
  persisted_at: z.string(),
});

export type SaveGeneratedDraftInput = Readonly<{
  storeId: string;
  document: Record<string, unknown>;
  expectedRevision: number;
  businessName: string;
  storeTagline: string | null;
  storeAbout: string | null;
  storeColor: string | null;
  storeBannerUrl: string | null;
}>;

export class EditorStoreDataService {
  async load(_user: User, storeId: string): Promise<EditorStoreLoadResult> {
    const storeResult = await supabase.rpc(
      "get_editor_store_document" as never,
      { p_store_id: storeId } as never,
    ) as unknown as { data: unknown; error: unknown };
    throwIfSupabaseError(storeResult.error, "Loading the editor document failed");
    const profile = editorStoreSchema.parse(storeResult.data);

    const { data: itemRows, error: itemError } = await supabase
      .from("items")
      .select("id, name, category, description, image_url, images, price_cents, original_price_cents, stock, is_published, sold_count, created_at")
      .eq("store_id", storeId)
      .limit(200);
    throwIfSupabaseError(itemError, "Loading the editor product catalog failed");

    return {
      profile: {
        id: profile.id,
        business_name: profile.business_name,
        store_tagline: profile.store_tagline,
        store_about: profile.store_about,
        store_color: profile.store_color,
        store_banner_url: profile.store_banner_url,
        store_slug: profile.store_slug ?? "",
        theme: profile.theme,
        theme_draft: profile.theme_draft,
        theme_published: profile.theme_published,
        theme_revision: Number(profile.theme_revision ?? 0),
        categories: profile.categories,
      },
      items: (itemRows ?? []) as StoreSceneItem[],
    };
  }

  async saveGeneratedDraft(input: SaveGeneratedDraftInput): Promise<{
    revision: number;
    persistedAt: string;
  }> {
    const result = await supabase.rpc("save_generated_storefront_draft" as never, {
      p_store_id: input.storeId,
      p_document: input.document,
      p_expected_revision: input.expectedRevision,
      p_business_name: input.businessName,
      p_store_tagline: input.storeTagline,
      p_store_about: input.storeAbout,
      p_store_color: input.storeColor,
      p_store_banner_url: input.storeBannerUrl,
    } as never) as unknown as { data: unknown; error: unknown };
    throwIfSupabaseError(result.error, "Saving the generated storefront failed");
    const parsed = generatedDraftResultSchema.parse(result.data);
    return { revision: parsed.revision, persistedAt: parsed.persisted_at };
  }
}

export const createEditorStoreDataService = () => new EditorStoreDataService();
