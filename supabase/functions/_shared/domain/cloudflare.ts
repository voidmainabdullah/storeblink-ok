import { DomainApiError } from "./errors.ts";

type CloudflareEnvelope<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
};

export type CloudflareCustomHostname = {
  id: string;
  hostname: string;
  status?: string;
  ownership_verification?: Record<string, unknown>;
  ownership_verification_http?: Record<string, unknown>;
  ssl?: {
    status?: string;
    validation_records?: Array<Record<string, unknown>>;
    validation_errors?: Array<Record<string, unknown>>;
  };
};

export class CloudflareClient {
  private readonly token = Deno.env.get("CLOUDFLARE_API_TOKEN")?.trim() ?? "";
  private readonly zoneId = Deno.env.get("CLOUDFLARE_ZONE_ID")?.trim() ?? "";

  get configured(): boolean {
    return Boolean(this.token && this.zoneId);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.configured) {
      throw new DomainApiError(
        "CLOUDFLARE_NOT_CONFIGURED",
        "Automatic SSL is not configured yet.",
        503,
      );
    }
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(this.zoneId)}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
      },
    );
    const body = (await response.json().catch(() => null)) as CloudflareEnvelope<T> | null;
    if (!response.ok || !body?.success) {
      const providerCode = body?.errors?.[0]?.code;
      console.error("Cloudflare API failure", {
        status: response.status,
        providerCode,
      });
      throw new DomainApiError(
        "CLOUDFLARE_REQUEST_FAILED",
        "Automatic DNS and SSL setup could not be completed yet.",
        response.status === 429 ? 429 : 502,
      );
    }
    return body.result;
  }

  createCustomHostname(hostname: string): Promise<CloudflareCustomHostname> {
    return this.request("/custom_hostnames", {
      method: "POST",
      body: JSON.stringify({
        hostname,
        ssl: { method: "http", type: "dv", wildcard: false },
      }),
    });
  }

  getCustomHostname(id: string): Promise<CloudflareCustomHostname> {
    return this.request(`/custom_hostnames/${encodeURIComponent(id)}`);
  }

  async findCustomHostname(hostname: string): Promise<CloudflareCustomHostname | null> {
    const result = await this.request<CloudflareCustomHostname[]>(
      `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`,
    );
    return result[0] ?? null;
  }

  async deleteCustomHostname(id: string): Promise<void> {
    await this.request(`/custom_hostnames/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
}

export const normalizedCloudflareSslStatus = (value: unknown): string => {
  const status = typeof value === "string" ? value.toLowerCase() : "pending";
  if (
    [
      "initializing",
      "pending_validation",
      "pending_issuance",
      "pending_deployment",
      "active",
      "expired",
    ].includes(status)
  ) return status;
  if (status.includes("fail") || status.includes("block") || status.includes("timeout")) return "failed";
  return "pending";
};
