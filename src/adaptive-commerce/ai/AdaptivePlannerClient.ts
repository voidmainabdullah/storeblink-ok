import { getSupabaseBrowserClient } from "@/platform/supabase/client";
import { supabaseBrowserConfig } from "@/platform/supabase/config";
import { adaptiveCommercePlanSchema, type AdaptiveCommercePlan } from "./planSchema";

export type AdaptivePlannerProposal = Readonly<{
  status: "proposed";
  reviewRequired: true;
  plan: AdaptiveCommercePlan;
  audit: Readonly<{ intentHash: string; attempts: number }>;
}>;

export type AdaptivePlannerClientDependencies = Readonly<{
  getAccessToken?: () => Promise<string | null>;
  fetch?: typeof globalThis.fetch;
  endpoint?: string;
}>;

const defaultAccessToken = async (): Promise<string | null> => {
  const { data, error } = await getSupabaseBrowserClient().auth.getSession();
  if (error) throw new Error("Your adaptive planning session could not be verified.");
  return data.session?.access_token ?? null;
};

const recordOf = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const planAdaptiveStorefront = async (
  input: Readonly<{ storeId: string; intent: string }>,
  dependencies: AdaptivePlannerClientDependencies = {},
): Promise<AdaptivePlannerProposal> => {
  const intent = input.intent.replace(/\s+/g, " ").trim();
  if (!input.storeId.trim() || intent.length < 3 || intent.length > 2_000) {
    throw new Error("Add a short, specific store brief before creating a proposal.");
  }
  const token = await (dependencies.getAccessToken ?? defaultAccessToken)();
  if (!token) throw new Error("Sign in again before using adaptive planning.");
  const endpoint = dependencies.endpoint ??
    `${supabaseBrowserConfig.url.replace(/\/+$/, "")}/functions/v1/plan-adaptive-storefront`;
  const request = dependencies.fetch ?? globalThis.fetch;
  const response = await request(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseBrowserConfig.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ storeId: input.storeId, intent }),
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const payload = recordOf(await response.json().catch(() => null));
  if (!response.ok) {
    const error = recordOf(payload?.error);
    throw new Error(typeof error?.message === "string"
      ? error.message
      : "Adaptive planning could not create a safe proposal.");
  }
  const parsed = adaptiveCommercePlanSchema.safeParse(payload?.plan);
  const audit = recordOf(payload?.audit);
  if (
    payload?.status !== "proposed" || payload.reviewRequired !== true || !parsed.success ||
    typeof audit?.intentHash !== "string" || typeof audit.attempts !== "number"
  ) {
    throw new Error("The planning service returned an invalid proposal.");
  }
  return Object.freeze({
    status: "proposed",
    reviewRequired: true,
    plan: parsed.data as AdaptiveCommercePlan,
    audit: Object.freeze({ intentHash: audit.intentHash, attempts: audit.attempts }),
  });
};
