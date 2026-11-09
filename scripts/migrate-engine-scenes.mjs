import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import {
  buildStoreSceneTree,
  createEngineSceneTheme,
  getSavedEngineScene,
  getSupabaseConfig,
} from "./engine-scene-migration-utils.mjs";

const pageSize = 100;
const dryRun = process.argv.includes("--dry-run");

const fetchProfiles = async (supabase) => {
  const profiles = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,business_name,store_slug,store_tagline,store_about,store_color,store_banner_url,theme")
      .range(from, to);
    if (error) throw error;
    profiles.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return profiles;
};

const fetchItems = async (supabase, userId) => {
  const { data, error } = await supabase
    .from("items")
    .select("id,name,category")
    .eq("user_id", userId)
    .limit(200);
  if (error) throw error;
  return data ?? [];
};

const main = async () => {
  const { url, serviceKey } = getSupabaseConfig();
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const profiles = await fetchProfiles(supabase);
  let migrated = 0;
  let alreadyScene = 0;

  for (const profile of profiles) {
    if (getSavedEngineScene(profile.theme)) {
      alreadyScene += 1;
      continue;
    }
    const items = await fetchItems(supabase, profile.id);
    const scene = buildStoreSceneTree(profile, items);
    const theme = createEngineSceneTheme(scene);
    migrated += 1;

    if (!dryRun) {
      const { error } = await supabase.from("profiles").update({ theme }).eq("id", profile.id);
      if (error) throw new Error(`Failed to migrate profile ${profile.id}: ${error.message}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        checked: profiles.length,
        alreadyScene,
        migrated,
      },
      null,
      2,
    ),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
