import type { StorefrontRuntimeAssignment } from "@/adaptive-commerce/runtime";
import { StorefrontRumReporter } from "./StorefrontRumReporter";

const HASH = `sha256:${"a".repeat(64)}`;
const adaptiveAssignment: StorefrontRuntimeAssignment = {
  runtime: "adaptive",
  reason: "assigned",
  storeId: "store-1",
  cohortBucket: 91,
  publicationId: "publication-1",
  publicationRevision: 2,
  artifactHash: HASH,
  artifact: { schemaVersion: 1, artifactHash: HASH },
};

describe("StorefrontRumReporter", () => {
  it("emits only bounded runtime metadata and metric values", async () => {
    const sent: unknown[] = [];
    const reporter = new StorefrontRumReporter({
      handle: "Demo-Store",
      routeType: "product",
      assignment: adaptiveAssignment,
      transport: (payload) => { sent.push(payload); },
    });
    await reporter.reportMetric("LCP", 1840);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      handle: "demo-store",
      routeType: "product",
      runtime: "adaptive",
      cohortBucket: 91,
      artifactHash: HASH,
      publicationId: "publication-1",
      metric: "LCP",
      value: 1840,
      errorCode: null,
    });
    expect(Object.keys(sent[0] as object).sort()).toEqual([
      "artifactHash", "cohortBucket", "errorCode", "eventId", "handle",
      "metric", "publicationId", "routeType", "runtime", "value",
    ]);
  });

  it("reports a normalized code without error messages or stacks", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const reporter = new StorefrontRumReporter({
      handle: "demo",
      routeType: "home",
      assignment: adaptiveAssignment,
      transport: (payload) => { sent.push(payload); },
    });
    await reporter.reportRenderError("invalid message with spaces user@example.com");
    expect(sent[0]).toMatchObject({
      metric: "render-error",
      value: 1,
      errorCode: "STOREFRONT_RENDER_FAILED",
    });
    expect(JSON.stringify(sent[0])).not.toContain("example.com");
  });

  it("does not report an unavailable or unassigned legacy runtime", async () => {
    const sent: unknown[] = [];
    const reporter = new StorefrontRumReporter({
      handle: "demo",
      routeType: "home",
      assignment: { runtime: "legacy", reason: "unavailable" },
      transport: (payload) => { sent.push(payload); },
    });
    expect(reporter.isReportable()).toBe(false);
    await reporter.reportMetric("CLS", 0.02);
    expect(sent).toEqual([]);
  });

  it("registers all three Core Web Vitals and stops callbacks on cleanup", async () => {
    const callbacks = new Map<string, (metric: { name: "LCP" | "CLS" | "INP"; value: number }) => void>();
    const sent: Array<Record<string, unknown>> = [];
    const reporter = new StorefrontRumReporter({
      handle: "demo",
      routeType: "home",
      assignment: adaptiveAssignment,
      transport: (payload) => { sent.push(payload); },
      loadVitals: async () => ({
        onCLS: (callback) => callbacks.set("CLS", callback as never),
        onINP: (callback) => callbacks.set("INP", callback as never),
        onLCP: (callback) => callbacks.set("LCP", callback as never),
      }),
    });
    const stop = await reporter.startCoreWebVitals();
    callbacks.get("CLS")?.({ name: "CLS", value: 0.04 });
    callbacks.get("INP")?.({ name: "INP", value: 170 });
    callbacks.get("LCP")?.({ name: "LCP", value: 2100 });
    await Promise.resolve();
    expect(sent.map((sample) => sample.metric)).toEqual(["CLS", "INP", "LCP"]);
    stop();
    callbacks.get("LCP")?.({ name: "LCP", value: 2500 });
    expect(sent).toHaveLength(3);
  });
});
