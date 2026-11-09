import { createClient } from "@supabase/supabase-js";
import process from "node:process";
import {
  getSavedEngineScene,
  getSupabaseConfig,
  validateEngineScene,
} from "./engine-scene-migration-utils.mjs";

const pageSize = 100;

const main = async () => {
  const { url, serviceKey } = getSupabaseConfig();
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const failures = [];
  let checked = 0;

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,store_slug,theme")
      .range(from, to);
    if (error) throw error;

    for (const profile of data ?? []) {
      checked += 1;
      try {
        const scene = getSavedEngineScene(profile.theme);
        if (!scene) throw new Error("theme.engine_scene is missing.");
        validateEngineScene(scene);
      } catch (sceneError) {
        failures.push({
          id: profile.id,
          store_slug: profile.store_slug,
          error: sceneError instanceof Error ? sceneError.message : String(sceneError),
        });
      }
    }

    if (!data || data.length < pageSize) break;
  }

  const result = { ok: failures.length === 0, checked, failures };
  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
