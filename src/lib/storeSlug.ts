import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { buildBasicTemplateScene } from "@/editor/engine/engineTemplates";
import { createEngineSceneTheme } from "@/editor/engine/storeSceneAdapter";
import type { Json } from "@/integrations/supabase/types";

export const slugifyStoreName = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export const fallbackBusinessName = (user?: User | null) => {
  const metaName = typeof user?.user_metadata?.business_name === "string" ? user.user_metadata.business_name : "";
  const fullName = typeof user?.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "";
  return metaName || fullName || user?.email?.split("@")[0] || "My Store";
};

export const buildUniqueStoreSlug = async (label: string, ownerId?: string) => {
  const base = slugifyStoreName(label) || "store";
  for (let i = 0; i < 25; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabase.from("profiles").select("id").eq("store_slug", candidate).maybeSingle();
    if (!data || data.id === ownerId) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
};

export const ensureUserProfile = async (user: User, preferredName?: string) => {
  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) throw readError;
  if (existing) return existing;

  const businessName = preferredName?.trim() || fallbackBusinessName(user);
  const initialTheme = createEngineSceneTheme(buildBasicTemplateScene({ business_name: businessName }, []));
  const { data: created, error: insertError } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      full_name: typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : null,
      business_name: businessName,
      store_slug: await buildUniqueStoreSlug(businessName, user.id),
      theme: initialTheme as unknown as Json,
    })
    .select("*")
    .single();
  if (insertError) throw insertError;
  return created;
};
