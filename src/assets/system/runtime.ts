import { getSupabaseBrowserClient, supabaseBrowserConfig } from "@/platform/supabase/client";
import { AssetManager } from "./AssetManager";

let manager: AssetManager | null = null;

export const getAssetManager = (): AssetManager => {
  if (!manager) {
    manager = new AssetManager(getSupabaseBrowserClient(), {
      projectUrl: supabaseBrowserConfig.url,
      publishableKey: supabaseBrowserConfig.publishableKey,
    });
  }
  return manager;
};
