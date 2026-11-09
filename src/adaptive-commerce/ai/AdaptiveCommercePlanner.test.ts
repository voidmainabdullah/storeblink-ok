import { AdaptiveCommercePlanner } from "./AdaptiveCommercePlanner";
import type { AdaptiveCommercePlan } from "./planSchema";
import { semanticPath } from "@/adaptive-commerce/contracts";

const HASH = `sha256:${"a".repeat(64)}`;
const catalog = {
  storeKits: [{
    storeKit: { id: "atelier", version: "1.0.0", integrity: HASH },
    presetIds: ["warm-editorial"],
    componentVariants: { hero: ["editorial", "split"] },
  }],
} as const;

const validPlan: AdaptiveCommercePlan = {
  kind: "adaptive-commerce-plan",
  schemaVersion: 1,
  storeKit: catalog.storeKits[0].storeKit,
  presetId: "warm-editorial",
  variantSelections: [{
    path: semanticPath("home.hero"),
    componentId: "hero",
    variantId: "editorial",
  }],
  contentMappings: [{ target: semanticPath("home.hero.title"), source: "store.tagline" }],
};

describe("AdaptiveCommercePlanner", () => {
  it("rejects unknown IDs and gives the provider a bounded re-plan", async () => {
    const requests: unknown[] = [];
    const provider = {
      generate: async (request: { attempt: number }) => {
        requests.push(request);
        return request.attempt === 1
          ? { ...validPlan, presetId: "raw-neon-preset" }
          : validPlan;
      },
    };
    const planner = new AdaptiveCommercePlanner(provider, {
      validateCompiledPlan: () => ({ valid: true, rejections: [] }),
    });
    const result = await planner.plan("A calm editorial fashion store", catalog);
    expect(result.ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect((requests[1] as { priorRejections: Array<{ code: string }> }).priorRejections[0].code)
      .toBe("plan.preset.unknown");
    expect(result.audit.attempts).toHaveLength(2);
  });

  it("rejects raw style fields instead of accepting generated CSS or colors", async () => {
    const planner = new AdaptiveCommercePlanner({
      generate: async () => ({ ...validPlan, accent: "#ff00ff", css: "*{display:none}" }),
    }, {
      maxAttempts: 1,
      validateCompiledPlan: () => ({ valid: true, rejections: [] }),
    });
    const result = await planner.plan("Make it loud", catalog);
    expect(result.ok).toBe(false);
    if ("rejections" in result) expect(result.rejections[0].code).toBe("plan.schema");
  });

  it("re-plans after deterministic compiler rejection", async () => {
    let attempt = 0;
    const planner = new AdaptiveCommercePlanner({ generate: async () => {
      attempt += 1;
      return attempt === 1
        ? { ...validPlan, variantSelections: [{ ...validPlan.variantSelections[0], variantId: "split" }] }
        : validPlan;
    } }, {
      validateCompiledPlan: (plan) => plan.variantSelections[0]?.variantId === "split"
        ? { valid: false, rejections: [{ code: "compile.media.required", path: "home.hero", message: "A gallery image is required." }] }
        : { valid: true, rejections: [] },
    });
    const result = await planner.plan("Use a gallery when possible", catalog);
    expect(result.ok).toBe(true);
    expect(result.audit.attempts[0].rejections[0].code).toBe("compile.media.required");
  });

  it("fails closed after at most three invalid attempts", async () => {
    let calls = 0;
    const planner = new AdaptiveCommercePlanner({
      generate: async () => {
        calls += 1;
        return { ...validPlan, storeKit: { ...validPlan.storeKit, id: "unknown" } };
      },
    }, {
      maxAttempts: 99,
      validateCompiledPlan: () => ({ valid: true, rejections: [] }),
    });
    const result = await planner.plan("Anything", catalog);
    expect(result.ok).toBe(false);
    expect(calls).toBe(3);
    expect(result.audit.outcome).toBe("exhausted");
    expect(result.audit.attempts).toHaveLength(3);
  });
});
