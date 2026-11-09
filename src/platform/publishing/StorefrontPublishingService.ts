export type StorefrontWriteMode = "draft" | "publish";

export type StorefrontWriteInput = {
  /** Explicit tenant target. Older owner-only callers fall back to userId. */
  storeId?: string;
  /** Actor ID is retained for recovery attribution; authorization is server-owned. */
  userId: string;
  expectedRevision: number;
  document: unknown;
  storeColor?: string | null;
  context?: {
    productIds?: Array<string | number>;
  };
};

export type StorefrontWriteResult = {
  revision: number;
  persistedAt: string;
  concurrency: "atomic";
};

export class StorefrontRevisionConflictError extends Error {
  readonly code = "STOREFRONT_REVISION_CONFLICT";

  constructor(
    readonly expectedRevision: number,
    readonly serverRevision: number | null,
    message = "Storefront changed in another session.",
  ) {
    super(message);
    this.name = "StorefrontRevisionConflictError";
  }
}

export type PersistedPublication = {
  id: string;
  revision: number;
  createdAt: string;
  document?: unknown;
};

export interface StorefrontPublishingGateway {
  write(
    mode: StorefrontWriteMode,
    input: StorefrontWriteInput,
  ): Promise<StorefrontWriteResult>;
  listPublications?(limit: number): Promise<PersistedPublication[]>;
  getPublication?(publicationId: string): Promise<PersistedPublication | null>;
}

export interface StorefrontPublicationGuard {
  validate(
    mode: StorefrontWriteMode,
    input: StorefrontWriteInput,
  ): void | Promise<void>;
}

export interface StorefrontPublishingServiceOptions {
  guard?: StorefrontPublicationGuard;
  recovery?: import("./PublicationRecoverySystem").PublicationRecoveryStore;
  dependencies?: DependencyGraphAPI;
}

const objectRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const assetId = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const collectPublishedAssetIds = (document: unknown): string[] => {
  const theme = objectRecord(document);
  const scene = objectRecord(theme?.engine_scene ?? document);
  const nodes = objectRecord(scene?.nodes);
  if (!nodes) return [];
  const ids = new Set<string>();
  Object.values(nodes).forEach((value) => {
    const node = objectRecord(value);
    const props = objectRecord(node?.props);
    const extensions = objectRecord(node?.extensions);
    [props?.assetId, extensions?.assetId, extensions?.logoAssetId].forEach(
      (candidate) => {
        const id = assetId(candidate);
        if (id) ids.add(id);
      },
    );
    const style = objectRecord(node?.style);
    const fills = style?.fills;
    if (Array.isArray(fills)) {
      fills.forEach((fill) => {
        const record = objectRecord(fill);
        if (record?.type !== "image") return;
        const id = assetId(record.assetId);
        if (id) ids.add(id);
      });
    }
  });
  const rootId = assetId(scene?.rootNodeId);
  const root = rootId ? objectRecord(nodes[rootId]) : null;
  const rootExtensions = objectRecord(root?.extensions);
  const library = objectRecord(rootExtensions?.assetLibrary);
  const libraryItems = objectRecord(library?.items);
  Object.keys(libraryItems ?? {}).forEach((id) => ids.add(id));
  return [...ids].sort();
};

export class StorefrontPublishingService {
  private revision = 0;
  private queue: Promise<void> = Promise.resolve();
  private storeId: string | null = null;
  private currentPublishedDocument: unknown = null;

  constructor(
    private readonly gateway: StorefrontPublishingGateway,
    private readonly options: StorefrontPublishingServiceOptions = {},
  ) {}

  initialize(
    revision: number,
    published?: { storeId: string; document: unknown } | null,
  ): void {
    this.revision = Math.max(0, Math.floor(revision));
    this.queue = Promise.resolve();
    this.storeId = published?.storeId ?? null;
    this.currentPublishedDocument =
      published?.document === undefined ? null : structuredClone(published.document);
    if (published?.document !== undefined && this.options.recovery) {
      this.options.recovery.clear(published.storeId);
      this.options.recovery.capture({
        storeId: published.storeId,
        revision: this.revision,
        reason: "loaded-publication",
        document: published.document,
      });
    }
    if (published?.document !== undefined) {
      this.indexPublishedDependencies(
        published.storeId,
        this.revision,
        published.document,
      );
    }
  }

  getRevision(): number {
    return this.revision;
  }

  saveDraft(
    input: Omit<StorefrontWriteInput, "expectedRevision">,
  ): Promise<StorefrontWriteResult> {
    return this.enqueue("draft", input);
  }

  publish(
    input: Omit<StorefrontWriteInput, "expectedRevision">,
  ): Promise<StorefrontWriteResult> {
    return this.enqueue("publish", input);
  }

  listRecoveryPoints() {
    return this.storeId && this.options.recovery
      ? this.options.recovery.list(this.storeId)
      : [];
  }

  rollback(
    recoveryPointId: string,
    input: Omit<StorefrontWriteInput, "expectedRevision" | "document">,
  ): Promise<StorefrontWriteResult> {
    if (!this.options.recovery) {
      return Promise.reject(new Error("Publication recovery is not configured."));
    }
    const storeId = this.storeId ?? input.storeId ?? input.userId;
    const point = this.options.recovery.get(storeId, recoveryPointId);
    if (!point) {
      return Promise.reject(new Error("Publication recovery point was not found."));
    }
    return this.publish({ ...input, document: point.document });
  }

  async listPersistedPublications(limit = 20): Promise<PersistedPublication[]> {
    if (!this.gateway.listPublications) return [];
    return this.gateway.listPublications(Math.min(Math.max(Math.floor(limit), 1), 50));
  }

  async getPersistedPublication(publicationId: string): Promise<PersistedPublication | null> {
    if (!this.gateway.getPublication) return null;
    return this.gateway.getPublication(publicationId);
  }

  async rollbackPersistedPublication(
    publicationId: string,
    input: Omit<StorefrontWriteInput, "expectedRevision" | "document">,
  ): Promise<StorefrontWriteResult> {
    if (!this.gateway.getPublication) {
      throw new Error("Durable publication recovery is not configured.");
    }
    const publication = await this.gateway.getPublication(publicationId);
    if (!publication?.document) {
      throw new Error("Published storefront recovery point was not found.");
    }
    return this.publish({ ...input, document: publication.document });
  }

  private enqueue(
    mode: StorefrontWriteMode,
    input: Omit<StorefrontWriteInput, "expectedRevision">,
  ): Promise<StorefrontWriteResult> {
    const operation = this.queue.then(async () => {
      const targetStoreId = input.storeId ?? input.userId;
      const writeInput = {
        ...input,
        expectedRevision: this.revision,
      };
      await this.options.guard?.validate(mode, writeInput);
      const previousPublishedDocument =
        mode === "publish" && this.currentPublishedDocument !== null
          ? structuredClone(this.currentPublishedDocument)
          : null;
      const previousRevision = this.revision;
      const result = await this.gateway.write(mode, writeInput);
      this.revision = result.revision;
      if (mode === "publish") {
        if (this.options.recovery && previousPublishedDocument !== null) {
          this.options.recovery.capture({
            storeId: targetStoreId,
            revision: previousRevision,
            reason: "pre-publish",
            document: previousPublishedDocument,
          });
        }
        this.storeId = targetStoreId;
        this.currentPublishedDocument = structuredClone(input.document);
        this.indexPublishedDependencies(
          targetStoreId,
          result.revision,
          input.document,
        );
      }
      return result;
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private indexPublishedDependencies(
    storeId: string,
    revision: number,
    document: unknown,
  ): void {
    const dependencies = this.options.dependencies;
    if (!dependencies) return;
    const revisionId = `${storeId}:${revision}`;
    const manifestId = `${revisionId}:assets`;
    const assetIds = collectPublishedAssetIds(document);
    dependencies.replaceSource(
      { kind: "published-revision", id: revisionId },
      [{
        source: { kind: "published-revision", id: revisionId },
        target: { kind: "asset-manifest", id: manifestId },
        relation: "publishes-assets",
        metadata: { assetCount: assetIds.length },
      }],
    );
    dependencies.replaceSource(
      { kind: "asset-manifest", id: manifestId },
      assetIds.map((id) => ({
        source: { kind: "asset-manifest" as const, id: manifestId },
        target: { kind: "asset" as const, id },
        relation: "uses-asset" as const,
      })),
    );
  }
}
import type { DependencyGraphAPI } from "@/engine/dependency-graph";
