// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edge = readFileSync(
  "supabase/functions/publish-reviewed-adaptive-storefront/index.ts",
  "utf8",
);
const worker = readFileSync("worker/index.ts", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");

describe("reviewed publication boundaries", () => {
  it("keeps the browser-to-Worker publication handoff identity-only", () => {
    expect(edge).toContain('const allowedKeys = new Set(["storeId", "jobId", "expectedPointerRevision"]);');
    expect(edge).toContain('p_capability: "theme.publish"');
    expect(edge).toContain("body: JSON.stringify(publication)");
    expect(edge).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(edge).not.toMatch(/publication\.(?:artifact|artifactHash|compilerVersion)/);
  });

  it("registers the authenticated Edge function and protected Worker route", () => {
    expect(config).toMatch(/\[functions\.publish-reviewed-adaptive-storefront\]\s+verify_jwt = false/);
    expect(worker).toContain('/.storeblink/internal/adaptive-publication/publish-reviewed');
    expect(worker).toContain("handleAdaptiveReviewedPublicationRequest(request, env)");
  });
});

