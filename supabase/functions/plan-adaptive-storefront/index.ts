import { createClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  corsHeaders,
  jsonResponse,
  readJsonObject,
} from "../_shared/domain/http.ts";

type JsonObject = Record<string, unknown>;
type Rejection = { code: string; path: string | null; message: string };

const MAX_ATTEMPTS = 3;
const CONTENT_SOURCES = [
  "store.name",
  "store.tagline",
  "store.about",
  "store.logo",
  "catalog.featured-products",
  "catalog.featured-collections",
  "catalog.recommendations",
] as const;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)/;
const hashPattern = /^sha256:[a-f0-9]{64}$/;
const pathPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const recordOf = (value: unknown): JsonObject | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;

const environment = (name: string): string => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new PlannerHttpError("PLANNER_NOT_CONFIGURED", "Adaptive planning is not configured.", 503);
  return value;
};

class PlannerHttpError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

const errorResponse = (request: Request, error: unknown): Response => {
  const normalized = error instanceof PlannerHttpError
    ? error
    : new PlannerHttpError("PLANNER_FAILED", "Adaptive planning could not be completed.", 500);
  return jsonResponse(request, { error: { code: normalized.code, message: normalized.message } }, normalized.status);
};

const decodeAal = (token: string): string | null => {
  try {
    const encoded = token.split(".")[1];
    const normalized = encoded.replace(/-/g, "+").replace(/_/g, "/")
      .padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    return recordOf(JSON.parse(atob(normalized)))?.aal as string ?? null;
  } catch {
    return null;
  }
};

const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
};

type CatalogEntry = {
  storeKit: { id: string; version: string; integrity: string };
  presetIds: string[];
  componentVariants: Record<string, string[]>;
};

const loadCatalog = async (serviceClient: ReturnType<typeof createClient>): Promise<CatalogEntry[]> => {
  const [{ data: kits, error: kitError }, { data: packs, error: packError }, { data: libraries, error: libraryError }] =
    await Promise.all([
      serviceClient.from("adaptive_store_kit_versions")
        .select("store_kit_id,version,integrity_hash,design_pack_id,design_pack_version,component_library_id,component_library_version,definition")
        .eq("status", "released"),
      serviceClient.from("adaptive_design_pack_versions")
        .select("design_pack_id,version,definition")
        .eq("status", "released"),
      serviceClient.from("adaptive_component_library_versions")
        .select("component_library_id,version,definition")
        .eq("status", "released"),
    ]);
  if (kitError || packError || libraryError) {
    throw new PlannerHttpError("CATALOG_UNAVAILABLE", "The certified theme catalog is unavailable.", 503);
  }
  return (kits ?? []).flatMap((kit) => {
    if (!idPattern.test(kit.store_kit_id) || !versionPattern.test(kit.version) || !hashPattern.test(kit.integrity_hash)) return [];
    const pack = (packs ?? []).find((candidate) => candidate.design_pack_id === kit.design_pack_id && candidate.version === kit.design_pack_version);
    const library = (libraries ?? []).find((candidate) => candidate.component_library_id === kit.component_library_id && candidate.version === kit.component_library_version);
    if (!pack || !library) return [];
    const packDefinition = recordOf(pack.definition);
    const presets = Array.isArray(packDefinition?.presets) ? packDefinition.presets : [];
    const presetIds = presets.flatMap((preset) => {
      const id = recordOf(preset)?.id;
      return typeof id === "string" && idPattern.test(id) ? [id] : [];
    });
    const libraryDefinition = recordOf(library.definition);
    const components = recordOf(libraryDefinition?.components) ?? {};
    const componentVariants = Object.fromEntries(Object.entries(components).flatMap(([componentId, raw]) => {
      if (!idPattern.test(componentId)) return [];
      const variants = Array.isArray(recordOf(raw)?.variants) ? recordOf(raw)?.variants as unknown[] : [];
      const ids = variants.flatMap((variant) => {
        const id = recordOf(variant)?.id;
        return typeof id === "string" && idPattern.test(id) ? [id] : [];
      });
      return ids.length ? [[componentId, ids]] : [];
    }));
    return [{
      storeKit: { id: kit.store_kit_id, version: kit.version, integrity: kit.integrity_hash },
      presetIds,
      componentVariants,
    }];
  });
};

const validateCandidate = (candidate: unknown, catalog: CatalogEntry[]): { plan: JsonObject | null; rejections: Rejection[] } => {
  const plan = recordOf(candidate);
  const reject = (code: string, path: string | null, message: string): Rejection => ({ code, path, message });
  if (!plan) return { plan: null, rejections: [reject("plan.schema", null, "Planner output must be an object.")] };
  const allowedKeys = new Set(["kind", "schemaVersion", "storeKit", "presetId", "variantSelections", "contentMappings"]);
  if (Object.keys(plan).some((key) => !allowedKeys.has(key))) {
    return { plan: null, rejections: [reject("plan.schema", null, "Raw style fields and unknown properties are forbidden.")] };
  }
  const storeKit = recordOf(plan.storeKit);
  const selected = catalog.find((entry) => entry.storeKit.id === storeKit?.id &&
    entry.storeKit.version === storeKit?.version && entry.storeKit.integrity === storeKit?.integrity);
  if (plan.kind !== "adaptive-commerce-plan" || plan.schemaVersion !== 1 || !selected) {
    return { plan: null, rejections: [reject("plan.store-kit.unknown", "storeKit", "Select an exact certified StoreKit version.")] };
  }
  if (plan.presetId !== null && (typeof plan.presetId !== "string" || !selected.presetIds.includes(plan.presetId))) {
    return { plan: null, rejections: [reject("plan.preset.unknown", "presetId", "Select a certified contrast-checked preset.")] };
  }
  if (!Array.isArray(plan.variantSelections) || !Array.isArray(plan.contentMappings) || plan.variantSelections.length > 64 || plan.contentMappings.length > 64) {
    return { plan: null, rejections: [reject("plan.schema", null, "Planner selections are missing or exceed their bounded size.")] };
  }
  const rejections: Rejection[] = [];
  const targets = new Set<string>();
  plan.variantSelections.forEach((raw, index) => {
    const variant = recordOf(raw);
    const path = variant?.path;
    const componentId = variant?.componentId;
    const variantId = variant?.variantId;
    if (typeof path !== "string" || !pathPattern.test(path) || typeof componentId !== "string" ||
      typeof variantId !== "string" || !selected.componentVariants[componentId]?.includes(variantId)) {
      rejections.push(reject("plan.variant.unknown", `variantSelections.${index}`, "Select a certified component variant and semantic path."));
    } else if (targets.has(path)) {
      rejections.push(reject("plan.path.duplicate", `variantSelections.${index}.path`, "A semantic target can be selected only once."));
    } else targets.add(path);
  });
  const mappingTargets = new Set<string>();
  plan.contentMappings.forEach((raw, index) => {
    const mapping = recordOf(raw);
    if (typeof mapping?.target !== "string" || !pathPattern.test(mapping.target) ||
      typeof mapping.source !== "string" || !CONTENT_SOURCES.includes(mapping.source as typeof CONTENT_SOURCES[number])) {
      rejections.push(reject("plan.mapping.unknown", `contentMappings.${index}`, "Use an allow-listed content mapping."));
    } else if (mappingTargets.has(mapping.target)) {
      rejections.push(reject("plan.path.duplicate", `contentMappings.${index}.target`, "A content target can be mapped only once."));
    } else mappingTargets.add(mapping.target);
  });
  return { plan: rejections.length ? null : plan, rejections };
};

const compilerPreflight = async (storeId: string, plan: JsonObject): Promise<Rejection[]> => {
  const url = new URL(environment("ADAPTIVE_COMPILER_PREFLIGHT_URL"));
  if (url.protocol !== "https:") throw new PlannerHttpError("PLANNER_NOT_CONFIGURED", "Adaptive planning is not configured.", 503);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${environment("ADAPTIVE_COMPILER_SERVICE_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "validate-plan", storeId, plan }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return [{ code: "compile.preflight.unavailable", path: null, message: "The compiler preflight was unavailable." }];
  const payload = recordOf(await response.json());
  if (payload?.valid === true) return [];
  return Array.isArray(payload?.rejections)
    ? payload.rejections.slice(0, 20).map((value) => {
      const rejection = recordOf(value);
      return {
        code: typeof rejection?.code === "string" ? rejection.code.slice(0, 80) : "compile.plan.rejected",
        path: typeof rejection?.path === "string" ? rejection.path.slice(0, 160) : null,
        message: typeof rejection?.message === "string" ? rejection.message.slice(0, 240) : "The compiler rejected this plan.",
      };
    })
    : [{ code: "compile.plan.rejected", path: null, message: "The compiler rejected this plan." }];
};

const providerCandidate = async (
  intent: string,
  catalog: CatalogEntry[],
  priorRejections: Rejection[],
  constraints: JsonObject,
): Promise<unknown> => {
  const gateway = new URL(environment("ADAPTIVE_AI_GATEWAY_URL"));
  if (gateway.protocol !== "https:") throw new PlannerHttpError("PLANNER_NOT_CONFIGURED", "Adaptive planning is not configured.", 503);
  const tool = {
    type: "function",
    function: {
      name: "plan_adaptive_storefront",
      description: "Select only certified StoreBlink IDs. Never output CSS, colors, spacing, or coordinates.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { const: "adaptive-commerce-plan" },
          schemaVersion: { const: 1 },
          storeKit: {
            type: "object",
            additionalProperties: false,
            properties: { id: { type: "string" }, version: { type: "string" }, integrity: { type: "string" } },
            required: ["id", "version", "integrity"],
          },
          presetId: { type: ["string", "null"] },
          variantSelections: {
            type: "array", maxItems: 64,
            items: {
              type: "object", additionalProperties: false,
              properties: { path: { type: "string" }, componentId: { type: "string" }, variantId: { type: "string" } },
              required: ["path", "componentId", "variantId"],
            },
          },
          contentMappings: {
            type: "array", maxItems: 64,
            items: {
              type: "object", additionalProperties: false,
              properties: { target: { type: "string" }, source: { type: "string", enum: CONTENT_SOURCES } },
              required: ["target", "source"],
            },
          },
        },
        required: ["kind", "schemaVersion", "storeKit", "presetId", "variantSelections", "contentMappings"],
      },
    },
  };
  const response = await fetch(gateway, {
    method: "POST",
    headers: { Authorization: `Bearer ${environment("ADAPTIVE_AI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: environment("ADAPTIVE_AI_MODEL"),
      messages: [
        {
          role: "system",
          content: "You are StoreBlink's constrained commerce planner. Choose exact IDs from the supplied certified catalog. Never invent IDs, raw tokens, colors, CSS, coordinates, or layout values. Respond only through the tool.",
        },
        {
          role: "user",
          content: JSON.stringify({ intent, catalog, constraints, priorRejections }),
        },
      ],
      tools: [tool],
      tool_choice: { type: "function", function: { name: "plan_adaptive_storefront" } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 429) throw new PlannerHttpError("PLANNER_RATE_LIMITED", "Adaptive planning is busy. Try again shortly.", 429);
  if (response.status === 402) throw new PlannerHttpError("PLANNER_ENTITLEMENT_REQUIRED", "Adaptive planning is not enabled for this workspace.", 402);
  if (!response.ok) throw new PlannerHttpError("PLANNER_PROVIDER_UNAVAILABLE", "The planning provider is unavailable.", 503);
  const payload = recordOf(await response.json());
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const message = recordOf(recordOf(choices[0])?.message);
  const calls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  const args = recordOf(recordOf(calls[0])?.function)?.arguments;
  if (typeof args !== "string" || args.length > 50_000) return null;
  try { return JSON.parse(args); } catch { return null; }
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== "POST") return jsonResponse(request, { error: { code: "METHOD_NOT_ALLOWED", message: "POST is required." } }, 405);
  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new PlannerHttpError("AUTH_REQUIRED", "Sign in to create an adaptive design proposal.", 401);
    const token = authorization.slice(7);
    const body = await readJsonObject(request);
    const storeId = typeof body.storeId === "string" ? body.storeId : "";
    const intent = typeof body.intent === "string" ? body.intent.replace(/\s+/g, " ").trim().slice(0, 2_000) : "";
    if (!uuidPattern.test(storeId) || intent.length < 3) throw new PlannerHttpError("INVALID_REQUEST", "A store and a short planning brief are required.", 400);

    const supabaseUrl = environment("SUPABASE_URL");
    const userClient = createClient(supabaseUrl, environment("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const serviceClient = createClient(supabaseUrl, environment("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [{ data: userData, error: userError }, { data: allowed, error: allowedError }] = await Promise.all([
      userClient.auth.getUser(token),
      userClient.rpc("has_store_capability", { p_store_id: storeId, p_capability: "theme.edit" }),
    ]);
    if (userError || !userData.user) throw new PlannerHttpError("AUTH_REQUIRED", "Your session is no longer valid.", 401);
    if (allowedError || allowed !== true) throw new PlannerHttpError("THEME_EDIT_DENIED", "Theme editing access is required.", 403);
    if (decodeAal(token) !== "aal2") throw new PlannerHttpError("AAL2_REQUIRED", "Complete two-step verification before planning a theme.", 403);

    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { count } = await serviceClient.from("adaptive_ai_plan_audits")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId)
      .gte("created_at", since);
    if ((count ?? 0) >= 10) throw new PlannerHttpError("PLANNER_RATE_LIMITED", "Adaptive planning is busy. Try again shortly.", 429);
    const [catalog, itemResult] = await Promise.all([
      loadCatalog(serviceClient),
      serviceClient.from("items").select("id,image_url,images").eq("store_id", storeId).eq("is_published", true).limit(500),
    ]);
    if (!catalog.length) throw new PlannerHttpError("CATALOG_UNAVAILABLE", "No released StoreKits are available.", 503);
    const items = itemResult.data ?? [];
    const imageCount = items.filter((item) => Boolean(item.image_url) || (Array.isArray(item.images) && item.images.length > 0)).length;
    const constraints = { productCount: items.length, productsWithImages: imageCount, rtlRequested: /\b(arabic|rtl|right-to-left)\b/i.test(intent) };
    const attempts: JsonObject[] = [];
    let rejections: Rejection[] = [];
    let accepted: JsonObject | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const candidate = await providerCandidate(intent, catalog, rejections, constraints);
      const validated = validateCandidate(candidate, catalog);
      rejections = validated.rejections;
      if (validated.plan) rejections = await compilerPreflight(storeId, validated.plan);
      attempts.push({ attempt, candidate: validated.plan, rejections });
      if (validated.plan && !rejections.length) {
        accepted = validated.plan;
        break;
      }
    }
    const intentHash = await sha256(intent);
    const outcome = accepted ? "accepted" : "exhausted";
    const { error: auditError } = await serviceClient.from("adaptive_ai_plan_audits").insert({
      store_id: storeId,
      intent_hash: intentHash,
      attempts,
      final_plan: accepted,
      outcome,
      created_by: userData.user.id,
    });
    if (auditError) throw new PlannerHttpError("PLANNER_AUDIT_FAILED", "The planning audit could not be recorded.", 503);
    if (!accepted) return jsonResponse(request, { status: "rejected", reviewRequired: true, rejections }, 422);
    return jsonResponse(request, { status: "proposed", reviewRequired: true, plan: accepted, audit: { intentHash, attempts: attempts.length } });
  } catch (error) {
    console.error("Adaptive storefront planning failed", { code: error instanceof PlannerHttpError ? error.code : "PLANNER_FAILED" });
    return errorResponse(request, error);
  }
});
