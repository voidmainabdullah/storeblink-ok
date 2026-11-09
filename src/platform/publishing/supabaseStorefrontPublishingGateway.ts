import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  StorefrontPublishingGateway,
  StorefrontWriteInput,
  StorefrontWriteMode,
  StorefrontWriteResult,
  PersistedPublication,
} from "./StorefrontPublishingService";
import { StorefrontRevisionConflictError } from "./StorefrontPublishingService";

const revisionFromConflict = (message: string | undefined): number | null => {
  const match = message?.match(/current\s+(\d+)/i);
  if (!match) return null;
  const revision = Number(match[1]);
  return Number.isFinite(revision) ? revision : null;
};

const parseWriteResult = (value: Json | null): StorefrontWriteResult | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const revision = Number(row.revision);
  if (!Number.isFinite(revision)) return null;
  return {
    revision,
    persistedAt:
      typeof row.persisted_at === "string"
        ? row.persisted_at
        : new Date().toISOString(),
    concurrency: "atomic",
  };
};

const parsePublication = (value: unknown): PersistedPublication | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const revision = Number(row.revision);
  if (typeof row.id !== "string" || !Number.isFinite(revision)) return null;
  return {
    id: row.id,
    revision,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date(0).toISOString(),
    ...(Object.prototype.hasOwnProperty.call(row, "snapshot")
      ? { document: structuredClone(row.snapshot) }
      : {}),
  };
};

export const supabaseStorefrontPublishingGateway: StorefrontPublishingGateway = {
  async write(mode, input) {
    const functionName =
      mode === "publish" ? "publish_storefront" : "save_storefront_draft";
    const result = await supabase.rpc(functionName, {
      p_store_id: input.storeId ?? input.userId,
      p_document: input.document as Json,
      p_expected_revision: input.expectedRevision,
      p_store_color: input.storeColor ?? null,
    });
    if (!result.error) {
      const parsed = parseWriteResult(result.data);
      if (!parsed) throw new Error(`${functionName} returned an invalid result.`);
      return parsed;
    }
    if (result.error.code === "40001") {
      throw new StorefrontRevisionConflictError(
        input.expectedRevision,
        revisionFromConflict(result.error.message),
        result.error.message,
      );
    }
    throw result.error;
  },
  async listPublications(limit) {
    const result = await supabase.rpc("get_storefront_publication_history", {
      p_limit: limit,
    });
    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) return [];
    return result.data
      .map(parsePublication)
      .filter((publication): publication is PersistedPublication => Boolean(publication));
  },
  async getPublication(publicationId) {
    const result = await supabase.rpc("get_storefront_publication", {
      p_publication_id: publicationId,
    });
    if (result.error) throw result.error;
    return parsePublication(result.data);
  },
};
