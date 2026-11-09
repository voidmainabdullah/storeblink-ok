import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Adaptive planner Edge boundary", () => {
  const source = readFileSync(
    resolve(process.cwd(), "supabase/functions/plan-adaptive-storefront/index.ts"),
    "utf8",
  );

  it("is authenticated, AAL2 and merchant theme-edit capability scoped", () => {
    expect(source).toContain('userClient.auth.getUser(token)');
    expect(source).toContain('p_capability: "theme.edit"');
    expect(source).toContain('decodeAal(token) !== "aal2"');
    expect(source).not.toContain("LOVABLE_API_KEY");
  });

  it("uses only certified IDs and an explicit compiler reject/re-plan loop", () => {
    expect(source).toContain("MAX_ATTEMPTS = 3");
    expect(source).toContain("validateCandidate(candidate, catalog)");
    expect(source).toContain("compilerPreflight(storeId, validated.plan)");
    expect(source).toContain("priorRejections");
    expect(source).toContain("Never output CSS, colors, spacing, or coordinates");
  });

  it("returns proposals for merchant review and records only an intent hash", () => {
    expect(source).toContain('status: "proposed", reviewRequired: true');
    expect(source).toContain("intent_hash: intentHash");
    expect(source).toContain("sha256(intent)");
    expect(source).not.toContain("intent_text");
  });
});
