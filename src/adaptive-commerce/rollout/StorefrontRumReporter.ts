import type { Metric } from "web-vitals";
import { supabaseBrowserConfig } from "@/platform/supabase/config";
import type { StorefrontRuntimeAssignment } from "@/adaptive-commerce/runtime";

export const STOREFRONT_RUM_ROUTE_TYPES = [
  "home",
  "product",
  "collection",
  "page",
  "blog",
  "cart",
  "search",
  "404",
] as const;

export type StorefrontRumRouteType = (typeof STOREFRONT_RUM_ROUTE_TYPES)[number];
type CoreMetricName = "LCP" | "CLS" | "INP";

type RumPayload = Readonly<{
  eventId: string;
  handle: string;
  metric: CoreMetricName | "render-error";
  value: number;
  routeType: StorefrontRumRouteType;
  runtime: "legacy" | "adaptive";
  cohortBucket: number;
  artifactHash: string | null;
  publicationId: string;
  errorCode: string | null;
}>;

type VitalsModule = Readonly<{
  onCLS(callback: (metric: Metric) => void): void;
  onINP(callback: (metric: Metric) => void): void;
  onLCP(callback: (metric: Metric) => void): void;
}>;

export type StorefrontRumReporterOptions = Readonly<{
  handle: string;
  routeType: StorefrontRumRouteType;
  assignment: StorefrontRuntimeAssignment;
  endpoint?: string;
  transport?: (payload: RumPayload) => Promise<void> | void;
  loadVitals?: () => Promise<VitalsModule>;
}>;

const errorCode = /^[A-Z0-9_.-]{1,80}$/;
const storeHandle = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

const defaultEndpoint = (): string => {
  const base = supabaseBrowserConfig.url?.replace(/\/+$/, "");
  return base ? `${base}/functions/v1/storefront-rum` : "";
};

const postPayload = async (endpoint: string, payload: RumPayload): Promise<void> => {
  if (!endpoint || typeof fetch !== "function") return;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    // Observability must never break or delay the storefront.
  }
};

export class StorefrontRumReporter {
  private active = false;
  private readonly handle: string;
  private readonly metadata: Omit<RumPayload, "eventId" | "metric" | "value" | "errorCode"> | null;

  constructor(private readonly options: StorefrontRumReporterOptions) {
    this.handle = options.handle.trim().toLowerCase();
    const assignment = options.assignment;
    const reportable = storeHandle.test(this.handle)
      && assignment.reason === "assigned"
      && assignment.storeId
      && assignment.cohortBucket !== undefined
      && assignment.publicationId;
    this.metadata = reportable
      ? Object.freeze({
          handle: this.handle,
          routeType: options.routeType,
          runtime: assignment.runtime,
          cohortBucket: assignment.cohortBucket,
          artifactHash: assignment.runtime === "adaptive" ? assignment.artifactHash : null,
          publicationId: assignment.publicationId,
        })
      : null;
  }

  isReportable(): boolean {
    return this.metadata !== null;
  }

  async reportMetric(metric: CoreMetricName, value: number): Promise<void> {
    if (!Number.isFinite(value) || value < 0) return;
    if ((metric === "LCP" || metric === "INP") && value > 120_000) return;
    if (metric === "CLS" && value > 10) return;
    await this.send(metric, value, null);
  }

  async reportRenderError(code = "STOREFRONT_RENDER_FAILED"): Promise<void> {
    const normalized = code.trim().toUpperCase();
    await this.send("render-error", 1, errorCode.test(normalized) ? normalized : "STOREFRONT_RENDER_FAILED");
  }

  async startCoreWebVitals(): Promise<() => void> {
    if (this.active || !this.metadata) return () => undefined;
    this.active = true;
    try {
      const vitals = await (this.options.loadVitals?.() ?? import("web-vitals"));
      const report = (metric: Metric) => {
        if (!this.active) return;
        if (metric.name === "CLS" || metric.name === "INP" || metric.name === "LCP") {
          void this.reportMetric(metric.name, metric.value);
        }
      };
      vitals.onCLS(report);
      vitals.onINP(report);
      vitals.onLCP(report);
    } catch {
      this.active = false;
    }
    return () => {
      this.active = false;
    };
  }

  private async send(
    metric: RumPayload["metric"],
    value: number,
    code: string | null,
  ): Promise<void> {
    if (!this.metadata || typeof crypto?.randomUUID !== "function") return;
    const payload: RumPayload = Object.freeze({
      eventId: crypto.randomUUID(),
      ...this.metadata,
      metric,
      value,
      errorCode: code,
    });
    const transport = this.options.transport
      ?? ((next: RumPayload) => postPayload(this.options.endpoint ?? defaultEndpoint(), next));
    await transport(payload);
  }
}

export const createStorefrontRumReporter = (options: StorefrontRumReporterOptions) =>
  new StorefrontRumReporter(options);

