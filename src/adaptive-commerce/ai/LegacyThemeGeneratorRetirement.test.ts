import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("legacy raw theme generator retirement", () => {
  const overview = readFileSync(
    resolve(process.cwd(), "src/pages/dashboard/Overview.tsx"),
    "utf8",
  );
  const legacyEndpoint = readFileSync(
    resolve(process.cwd(), "supabase/functions/generate-store-theme/index.ts"),
    "utf8",
  );

  it("keeps the active dashboard on a review-only certified proposal", () => {
    expect(overview).toContain("planAdaptiveStorefront");
    expect(overview).toContain("No storefront changes were made");
    expect(overview).not.toContain('functions.invoke("generate-store-theme"');
    expect(overview).not.toContain("buildStoreSceneTree");
    expect(overview).not.toContain("createEngineSceneTheme");
    expect(overview).not.toContain("saveGeneratedDraft");
  });

  it("fails closed for older raw-generator clients", () => {
    expect(legacyEndpoint).toContain("LEGACY_THEME_GENERATOR_RETIRED");
    expect(legacyEndpoint).toContain("status: 410");
    expect(legacyEndpoint).not.toContain("LOVABLE_API_KEY");
    expect(legacyEndpoint).not.toContain("ai.gateway.lovable.dev");
  });
});
