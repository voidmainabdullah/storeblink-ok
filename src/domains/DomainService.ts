import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSupabaseBrowserClient } from "@/platform/supabase/client";
import {
  domainDashboardSchema,
  domainSearchResultSchema,
  googleAuthorizationSchema,
  type DomainDashboard,
  type DomainSearchResult,
  type GoogleAuthorization,
} from "./domain.types";
import {
  DomainPlatformError,
  mapDomainError,
  remoteDomainError,
} from "./domain.errors";

type InvokeError = Error & { context?: Response };

const readInvokeError = async (error: InvokeError): Promise<DomainPlatformError> => {
  if (error.context instanceof Response) {
    try {
      const payload = await error.context.clone().json() as {
        error?: { code?: string; message?: string; action?: string };
      };
      if (payload.error?.code) {
        return remoteDomainError(
          payload.error.code,
          payload.error.message,
          payload.error.action,
        );
      }
    } catch {
      // Fall through to the transport-level mapping.
    }
  }
  return mapDomainError(error);
};

export class DomainService {
  constructor(
    private readonly client: SupabaseClient<Database> = getSupabaseBrowserClient(),
  ) {}

  private async invoke<T>(
    body: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    try {
      const { data, error } = await this.client.functions.invoke("domain-orchestrator", {
        body,
      });
      if (error) throw await readInvokeError(error as InvokeError);
      const parsed = z.object({ data: schema }).safeParse(data);
      if (!parsed.success) {
        throw new DomainPlatformError(
          "INVALID_DOMAIN_RESPONSE",
          "The domain service returned an invalid response.",
        );
      }
      return parsed.data.data;
    } catch (error) {
      throw mapDomainError(error);
    }
  }

  getDashboard(storeId: string): Promise<DomainDashboard> {
    return this.invoke({ action: "status", storeId }, domainDashboardSchema);
  }

  connectExisting(storeId: string, hostname: string): Promise<DomainDashboard> {
    return this.invoke(
      { action: "connect-existing", storeId, hostname },
      domainDashboardSchema,
    );
  }

  setPrimary(storeId: string, domainId: string): Promise<DomainDashboard> {
    return this.invoke(
      { action: "set-primary", storeId, domainId },
      domainDashboardSchema,
    );
  }

  retry(storeId: string, domainId: string): Promise<DomainDashboard> {
    return this.invoke(
      { action: "retry", storeId, domainId },
      domainDashboardSchema,
    );
  }

  disconnect(storeId: string, domainId: string): Promise<DomainDashboard> {
    return this.invoke(
      { action: "disconnect", storeId, domainId },
      domainDashboardSchema,
    );
  }

  async search(
    storeId: string,
    name: string,
    tlds: readonly string[],
  ): Promise<readonly DomainSearchResult[]> {
    const result = await this.invoke(
      { action: "search", storeId, name, tlds },
      z.object({
        results: z.array(domainSearchResultSchema),
        capabilities: z.record(z.unknown()),
      }),
    );
    return result.results;
  }

  claimIncludedDomain(
    storeId: string,
    hostname: string,
  ): Promise<DomainDashboard> {
    return this.invoke(
      { action: "claim-included-domain", storeId, hostname, confirm: true },
      domainDashboardSchema,
    );
  }

  purchaseDomain(storeId: string, quoteId: string): Promise<DomainDashboard> {
    return this.invoke(
      { action: "purchase-domain", storeId, quoteId, confirm: true },
      domainDashboardSchema,
    );
  }

  initiateIncludedTransfer(
    storeId: string,
    hostname: string,
    authorizationCode: string,
  ): Promise<DomainDashboard> {
    return this.invoke(
      {
        action: "initiate-included-transfer",
        storeId,
        hostname,
        authorizationCode,
        confirm: true,
      },
      domainDashboardSchema,
    );
  }

  beginGoogleConnection(storeId: string): Promise<GoogleAuthorization> {
    return this.invoke(
      { action: "google-connect", storeId },
      googleAuthorizationSchema,
    );
  }

  completeGoogleConnection(
    storeId: string,
    code: string,
    state: string,
  ): Promise<DomainDashboard> {
    return this.invoke(
      { action: "google-oauth-callback", storeId, code, state },
      domainDashboardSchema,
    );
  }

  retryGoogleConnection(storeId: string): Promise<DomainDashboard> {
    return this.invoke(
      { action: "google-retry", storeId },
      domainDashboardSchema,
    );
  }

  disconnectGoogle(storeId: string): Promise<DomainDashboard> {
    return this.invoke(
      { action: "google-disconnect", storeId },
      domainDashboardSchema,
    );
  }
}

export const domainService = new DomainService();
