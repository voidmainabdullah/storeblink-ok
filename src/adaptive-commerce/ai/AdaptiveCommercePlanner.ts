import { artifactHashFor } from "@/adaptive-commerce/compiler/sha256";
import type { AdaptiveCommercePlan } from "./planSchema";
import { adaptiveCommercePlanSchema } from "./planSchema";
import type {
  AdaptivePlanAttempt,
  AdaptivePlanAudit,
  AdaptivePlannerProvider,
  AdaptivePlanRejection,
  AdaptivePlanValidation,
  PlannerCatalog,
} from "./types";

export type AdaptiveCommercePlannerOptions = Readonly<{
  maxAttempts?: number;
  validateCompiledPlan: (plan: AdaptiveCommercePlan) => Promise<AdaptivePlanValidation> | AdaptivePlanValidation;
}>;

export type AdaptivePlannerResult =
  | Readonly<{ ok: true; plan: AdaptiveCommercePlan; audit: AdaptivePlanAudit }>
  | Readonly<{ ok: false; audit: AdaptivePlanAudit; rejections: readonly AdaptivePlanRejection[] }>;

const clone = <T>(value: T): T => structuredClone(value);
const refKey = (ref: { id: string; version: string; integrity: string }) =>
  `${ref.id}@${ref.version}#${ref.integrity}`;

const schemaRejections = (candidate: unknown): {
  plan: AdaptiveCommercePlan | null;
  rejections: AdaptivePlanRejection[];
} => {
  const parsed = adaptiveCommercePlanSchema.safeParse(candidate);
  if (parsed.success) return { plan: parsed.data as AdaptiveCommercePlan, rejections: [] };
  return {
    plan: null,
    rejections: parsed.error.issues.map((issue) => ({
      code: "plan.schema",
      path: issue.path.length ? issue.path.join(".") : null,
      message: issue.message,
    })),
  };
};

const catalogRejections = (
  plan: AdaptiveCommercePlan,
  catalog: PlannerCatalog,
): AdaptivePlanRejection[] => {
  const selection = catalog.storeKits.find((entry) => refKey(entry.storeKit) === refKey(plan.storeKit));
  if (!selection) {
    return [{
      code: "plan.store-kit.unknown",
      path: "storeKit",
      message: "The selected StoreKit is not in the certified planner catalog.",
    }];
  }
  const rejections: AdaptivePlanRejection[] = [];
  if (plan.presetId !== null && !selection.presetIds.includes(plan.presetId)) {
    rejections.push({
      code: "plan.preset.unknown",
      path: "presetId",
      message: `Preset ${plan.presetId} is not certified for the selected StoreKit.`,
    });
  }
  plan.variantSelections.forEach((variant, index) => {
    if (!selection.componentVariants[variant.componentId]?.includes(variant.variantId)) {
      rejections.push({
        code: "plan.variant.unknown",
        path: `variantSelections.${index}`,
        message: `Variant ${variant.componentId}/${variant.variantId} is not certified for the selected StoreKit.`,
      });
    }
  });
  return rejections;
};

export class AdaptiveCommercePlanner {
  private readonly maxAttempts: number;

  constructor(
    private readonly provider: AdaptivePlannerProvider,
    private readonly options: AdaptiveCommercePlannerOptions,
  ) {
    this.maxAttempts = Math.min(3, Math.max(1, Math.floor(options.maxAttempts ?? 3)));
  }

  async plan(intent: string, catalog: PlannerCatalog): Promise<AdaptivePlannerResult> {
    const normalizedIntent = intent.replace(/\s+/g, " ").trim().slice(0, 2_000);
    const intentHash = artifactHashFor({ intent: normalizedIntent });
    const attempts: AdaptivePlanAttempt[] = [];
    let priorRejections: AdaptivePlanRejection[] = [];

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let candidate: unknown;
      try {
        candidate = await this.provider.generate({
          intent: normalizedIntent,
          catalog: clone(catalog),
          attempt,
          priorRejections: clone(priorRejections),
        });
      } catch {
        priorRejections = [{
          code: "plan.provider.unavailable",
          path: null,
          message: "The planning provider did not return a candidate.",
        }];
        attempts.push({ attempt, candidate: null, rejections: clone(priorRejections) });
        continue;
      }

      const schema = schemaRejections(candidate);
      priorRejections = schema.rejections;
      if (schema.plan) {
        priorRejections = catalogRejections(schema.plan, catalog);
        if (priorRejections.length === 0) {
          const compiled = await this.options.validateCompiledPlan(clone(schema.plan));
          priorRejections = compiled.valid
            ? []
            : compiled.rejections.map((rejection) => ({ ...rejection }));
        }
      }
      attempts.push({
        attempt,
        candidate: schema.plan ? clone(schema.plan) : null,
        rejections: clone(priorRejections),
      });
      if (schema.plan && priorRejections.length === 0) {
        return {
          ok: true,
          plan: clone(schema.plan),
          audit: Object.freeze({
            schemaVersion: 1,
            intentHash,
            outcome: "accepted",
            attempts: clone(attempts),
          }),
        };
      }
    }

    return {
      ok: false,
      rejections: clone(priorRejections),
      audit: Object.freeze({
        schemaVersion: 1,
        intentHash,
        outcome: "exhausted",
        attempts: clone(attempts),
      }),
    };
  }
}
