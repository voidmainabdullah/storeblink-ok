import { describe, expect, it, vi } from "vitest";
import {
  handleAdaptiveReviewedPublicationRequest,
  type AdaptiveReviewedPublicationWorkerEnv,
} from "../../../worker/adaptive-commerce-reviewed-publication";

const env: AdaptiveReviewedPublicationWorkerEnv = {
  ADAPTIVE_REVIEWED_PUBLICATION_WORKER_SECRET: "reviewed-publication-secret-123456789",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

describe("adaptive reviewed publication Worker route", () => {
  it("delegates the original protected request to the reviewed handler", async () => {
    const request = new Request("https://storeblink.com/.storeblink/internal/adaptive-publication/publish-reviewed", {
      method: "POST",
      body: "{}",
    });
    const handler = vi.fn(async () => new Response(JSON.stringify({ pointerRevision: 3 }), { status: 200 }));
    const factory = vi.fn(() => handler);
    const response = await handleAdaptiveReviewedPublicationRequest(request, env, factory);

    expect(response.status).toBe(200);
    expect(factory).toHaveBeenCalledWith(env);
    expect(handler).toHaveBeenCalledWith(request);
  });

  it("fails closed when trusted Worker configuration cannot be constructed", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await handleAdaptiveReviewedPublicationRequest(
      new Request("https://storeblink.com/internal", { method: "POST" }),
      {},
      () => { throw new Error("missing configuration"); },
    );
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Reviewed publication unavailable" });
    expect(consoleError).toHaveBeenCalledWith(
      "Reviewed adaptive publication worker is unavailable",
      { message: "missing configuration" },
    );
    consoleError.mockRestore();
  });
});
