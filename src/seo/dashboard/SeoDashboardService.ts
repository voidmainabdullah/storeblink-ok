import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { getSupabaseBrowserClient } from "@/platform/supabase/client";
import {
  DomainPlatformError,
  mapDomainError,
  remoteDomainError,
} from "@/domains/domain.errors";
import {
  seoDashboardSchema,
  seoMetadataInputSchema,
  type SeoDashboard,
  type SeoMetadataInput,
} from "./seo-dashboard.types";

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
      // Fall through to the shared transport mapping.
    }
  }
  return mapDomainError(error);
};

export class SeoDashboardService {
  constructor(
    private readonly client?: SupabaseClient<Database>,
  ) {}

  private getClient(): SupabaseClient<Database> {
    return this.client ?? getSupabaseBrowserClient();
  }

  private async invoke(
    body: Record<string, unknown>,
  ): Promise<SeoDashboard> {
    try {
      const { data, error } = await this.getClient().functions.invoke("domain-orchestrator", { body });
      if (error) throw await readInvokeError(error as InvokeError);
      const parsed = z.object({ data: seoDashboardSchema }).safeParse(data);
      if (!parsed.success) {
        throw new DomainPlatformError(
          "INVALID_SEO_RESPONSE",
          "The SEO service returned an invalid response.",
        );
      }
      return parsed.data.data;
    } catch (error) {
      throw mapDomainError(error);
    }
  }

  getDashboard(storeId: string): Promise<SeoDashboard> {
    return this.invoke({ action: "seo-dashboard", storeId });
  }

  updateMetadata(
    storeId: string,
    resourceType: string,
    resourceId: string,
    input: SeoMetadataInput,
  ): Promise<SeoDashboard> {
    return this.invoke({
      action: "seo-metadata-update",
      storeId,
      resourceType,
      resourceId,
      metadata: seoMetadataInputSchema.parse(input),
    });
  }

  regenerate(storeId: string): Promise<SeoDashboard> {
    return this.invoke({ action: "seo-regenerate", storeId });
  }

  rollback(storeId: string, generationId: string): Promise<SeoDashboard> {
    return this.invoke({ action: "seo-rollback", storeId, generationId });
  }

  saveRedirect(
    storeId: string,
    sourcePath: string,
    destinationPath: string,
    statusCode: 301 | 302 | 307 | 308,
  ): Promise<SeoDashboard> {
    return this.invoke({
      action: "seo-redirect-upsert",
      storeId,
      sourcePath,
      destinationPath,
      statusCode,
    });
  }

  deleteRedirect(storeId: string, redirectId: string): Promise<SeoDashboard> {
    return this.invoke({ action: "seo-redirect-delete", storeId, redirectId });
  }
}

export const seoDashboardService = new SeoDashboardService();
