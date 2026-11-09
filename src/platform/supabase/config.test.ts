import { describe, expect, it } from "vitest";
import {
  defaultSupabaseBrowserConfig,
  resolveSupabaseBrowserConfig,
} from "./config";

describe("Supabase browser configuration", () => {
  it("uses the checked public production config when build variables are absent", () => {
    const config = resolveSupabaseBrowserConfig({
      url: "",
      publishableKey: "  ",
    });

    expect(config).toEqual(defaultSupabaseBrowserConfig);
    expect(config.url).toBe("https://shflnrznleodviqphvfg.supabase.co");
    expect(config.publishableKey).toMatch(/^sb_publishable_[A-Za-z0-9_-]+$/);
  });

  it("preserves trimmed environment overrides", () => {
    expect(resolveSupabaseBrowserConfig({
      url: " https://preview.supabase.co ",
      publishableKey: " sb_publishable_preview ",
    })).toEqual({
      url: "https://preview.supabase.co",
      publishableKey: "sb_publishable_preview",
    });
  });
});
