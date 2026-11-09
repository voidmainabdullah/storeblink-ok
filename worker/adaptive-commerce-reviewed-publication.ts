import { createClient } from "@supabase/supabase-js";
import {
  createReviewedPublicationWorkerHandler,
  ReviewedShadowPublicationService,
  SupabaseTrustedReviewedPublicationGateway,
  type SupabaseRpcClient,
} from "../src/adaptive-commerce/server";

export type AdaptiveReviewedPublicationWorkerEnv = Readonly<{
  ADAPTIVE_REVIEWED_PUBLICATION_WORKER_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}>;

type ReviewedHandler = (request: Request) => Promise<Response>;
type ReviewedHandlerFactory = (env: AdaptiveReviewedPublicationWorkerEnv) => ReviewedHandler;

const required = (value: string | undefined, label: string): string => {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new Error(`${label} is not configured.`);
  return normalized;
};

export const createAdaptiveReviewedPublicationHandler: ReviewedHandlerFactory = (env) => {
  const secret = required(
    env.ADAPTIVE_REVIEWED_PUBLICATION_WORKER_SECRET,
    "ADAPTIVE_REVIEWED_PUBLICATION_WORKER_SECRET",
  );
  const supabaseUrl = required(env.SUPABASE_URL, "SUPABASE_URL");
  const serviceRoleKey = required(env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const gateway = new SupabaseTrustedReviewedPublicationGateway(
    client as unknown as SupabaseRpcClient,
  );
  return createReviewedPublicationWorkerHandler({
    secret,
    service: new ReviewedShadowPublicationService(gateway),
  });
};

export const handleAdaptiveReviewedPublicationRequest = async (
  request: Request,
  env: AdaptiveReviewedPublicationWorkerEnv,
  factory: ReviewedHandlerFactory = createAdaptiveReviewedPublicationHandler,
): Promise<Response> => {
  try {
    return await factory(env)(request);
  } catch (error) {
    console.error("Reviewed adaptive publication worker is unavailable", {
      message: error instanceof Error ? error.message : "Unknown configuration error",
    });
    return new Response(JSON.stringify({ error: "Reviewed publication unavailable" }), {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }
};
