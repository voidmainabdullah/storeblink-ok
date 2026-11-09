import { DomainApiError } from "./errors.ts";

export type HostingerAvailability = {
  domain: string | null;
  is_available: boolean;
  is_alternative: boolean;
  restriction: string | null;
};

export type HostingerTransfer = {
  domain: string;
  status: string;
  initiated_at?: string | null;
  completed_at?: string | null;
};

export type HostingerRegistrationQuote = {
  itemId: string;
  currency: string;
  amountMinor: number;
  renewalAmountMinor: number;
  period: number;
  periodUnit: "day" | "week" | "month" | "year" | "none";
};

export type HostingerOrder = {
  id: number;
  status: string;
  currency: string;
  subtotal: number;
  total: number;
  subscription_id?: string | null;
};

export type HostingerDomain = {
  domain: string;
  status: string;
  message?: string | null;
};

type HostingerCatalogPrice = {
  id: string;
  currency: string;
  price: number;
  first_period_price: number;
  period: number;
  period_unit: HostingerRegistrationQuote["periodUnit"];
};

type HostingerCatalogItem = {
  category: string;
  prices: HostingerCatalogPrice[];
};

export class HostingerClient {
  private readonly token = Deno.env.get("HOSTINGER_API_TOKEN")?.trim() ?? "";
  private readonly baseUrl = "https://developers.hostinger.com";

  get configured(): boolean {
    return Boolean(this.token);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    if (!this.configured) {
      throw new DomainApiError(
        "HOSTINGER_NOT_CONFIGURED",
        "Domain registration services are not configured yet.",
        503,
      );
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("Hostinger API failure", {
        status: response.status,
        correlationId: body?.correlation_id,
      });
      const code = response.status === 404
        ? "HOSTINGER_RESOURCE_NOT_FOUND"
        : response.status === 422
          ? "HOSTINGER_REQUEST_REJECTED"
          : "HOSTINGER_REQUEST_FAILED";
      throw new DomainApiError(
        code,
        response.status === 404
          ? "The registrar resource is not available yet."
          : response.status === 422
          ? "The registrar could not accept this domain request. Check the domain and account eligibility."
          : "The registrar is temporarily unavailable. Try again shortly.",
        response.status === 404
          ? 404
          : response.status === 429
            ? 429
            : response.status === 422
              ? 422
              : 502,
      );
    }
    return body as T;
  }

  search(domain: string, tlds: string[]): Promise<HostingerAvailability[]> {
    return this.request("/api/domains/v1/availability", {
      method: "POST",
      body: JSON.stringify({ domain, tlds, with_alternatives: true }),
    });
  }

  async getRegistrationQuote(domain: string): Promise<HostingerRegistrationQuote> {
    const tld = domain.split(".").pop()?.trim().toUpperCase();
    if (!tld || !/^[A-Z]{2,24}$/.test(tld)) {
      throw new DomainApiError("INVALID_DOMAIN_TLD", "This domain extension cannot be quoted.", 422);
    }
    const query = new URLSearchParams({ category: "DOMAIN", name: `.${tld}*` });
    const items = await this.request<HostingerCatalogItem[]>(`/api/billing/v1/catalog?${query}`);
    const registrationMarker = `-domain-${tld.toLowerCase()}-`;
    const prices = items
      .filter((item) => item.category.toUpperCase() === "DOMAIN")
      .flatMap((item) => item.prices ?? [])
      .filter((price) => (
        typeof price.id === "string" &&
        /^[A-Za-z0-9._-]{3,200}$/.test(price.id) &&
        price.id.toLowerCase().includes(registrationMarker) &&
        !price.id.toLowerCase().includes("transfer") &&
        Number.isInteger(price.price) && price.price >= 0 &&
        Number.isInteger(price.first_period_price) && price.first_period_price >= 0 &&
        price.period === 1 && price.period_unit === "year" &&
        /^[A-Z]{3}$/.test(price.currency)
      ))
      .sort((left, right) => (
        left.first_period_price - right.first_period_price || left.price - right.price
      ));
    const selected = prices[0];
    if (!selected) {
      throw new DomainApiError(
        "DOMAIN_PRICE_UNAVAILABLE",
        `A one-year registration price for .${tld.toLowerCase()} is not available.`,
        409,
      );
    }
    return {
      itemId: selected.id,
      currency: selected.currency,
      amountMinor: selected.first_period_price,
      renewalAmountMinor: selected.price,
      period: selected.period,
      periodUnit: selected.period_unit,
    };
  }

  purchaseDomain(domain: string, itemId: string): Promise<HostingerOrder> {
    return this.request("/api/domains/v1/portfolio", {
      method: "POST",
      body: JSON.stringify({ domain, item_id: itemId }),
    });
  }

  async getDomain(domain: string): Promise<HostingerDomain | null> {
    try {
      return await this.request(`/api/domains/v1/portfolio/${encodeURIComponent(domain)}`);
    } catch (error) {
      if (error instanceof DomainApiError && error.status === 404) return null;
      throw error;
    }
  }

  claimIncludedDomain(domain: string): Promise<{ domain: string | null; status: string | null }> {
    return this.request("/api/domains/v1/portfolio/claim", {
      method: "POST",
      body: JSON.stringify({ domain }),
    });
  }

  initiateIncludedTransfer(domain: string, authorizationCode: string): Promise<HostingerTransfer> {
    return this.request("/api/domains/v1/transfers/claim", {
      method: "POST",
      body: JSON.stringify({ domain, auth_code: authorizationCode, should_keep_ns: true }),
    });
  }

  getTransfer(domain: string): Promise<HostingerTransfer> {
    return this.request(`/api/domains/v1/transfers/${encodeURIComponent(domain)}`);
  }

  async configureStorefrontDns(domain: string, target: string): Promise<void> {
    await this.request(`/api/dns/v1/zones/${encodeURIComponent(domain)}`, {
      method: "PUT",
      body: JSON.stringify({
        overwrite: false,
        zone: [
          {
            name: "@",
            type: "ALIAS",
            ttl: 300,
            records: [{ content: `${target.replace(/\.$/, "")}.` }],
          },
          {
            name: "www",
            type: "CNAME",
            ttl: 300,
            records: [{ content: `${target.replace(/\.$/, "")}.` }],
          },
        ],
      }),
    });
  }
}
