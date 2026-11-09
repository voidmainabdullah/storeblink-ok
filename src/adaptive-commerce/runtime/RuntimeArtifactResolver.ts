import type {
  RuntimeArtifactGateway,
  RuntimeArtifactValidator,
  StorefrontRuntimeAssignment,
} from "./types";
import { runtimeArtifactSchema } from "@/adaptive-commerce/contracts";
import { artifactHashFor } from "@/adaptive-commerce/compiler/sha256";

const opaqueId = /^[A-Za-z0-9:_-]{1,128}$/;
const sha256 = /^sha256:[a-f0-9]{64}$/;
const storeHandle = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

const recordOf = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const defaultArtifactValidator: RuntimeArtifactValidator<Record<string, unknown>> = (
  value,
  expectedHash,
): value is Record<string, unknown> => {
  const parsed = runtimeArtifactSchema.safeParse(value);
  if (!parsed.success || parsed.data.artifactHash !== expectedHash) return false;
  const { artifactHash: _declaredHash, ...content } = parsed.data;
  return artifactHashFor(content) === expectedHash;
};

const validBucket = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0 && Number(value) < 10_000;

export class RuntimeArtifactResolver<TArtifact = Record<string, unknown>> {
  constructor(
    private readonly gateway: RuntimeArtifactGateway,
    private readonly validateArtifact: RuntimeArtifactValidator<TArtifact> =
      defaultArtifactValidator as RuntimeArtifactValidator<TArtifact>,
  ) {}

  async resolve(handle: string): Promise<StorefrontRuntimeAssignment<TArtifact>> {
    const normalized = handle.trim().toLowerCase();
    if (!storeHandle.test(normalized)) {
      return Object.freeze({ runtime: "legacy", reason: "invalid" });
    }
    let raw: unknown;
    try {
      raw = await this.gateway.resolve(normalized);
    } catch {
      return Object.freeze({ runtime: "legacy", reason: "unavailable" });
    }
    if (raw === null || raw === undefined) {
      return Object.freeze({ runtime: "legacy", reason: "missing" });
    }
    const row = recordOf(raw);
    if (!row || (row.runtime !== "legacy" && row.runtime !== "adaptive")) {
      return Object.freeze({ runtime: "legacy", reason: "invalid" });
    }
    const storeId = typeof row.store_id === "string" && opaqueId.test(row.store_id)
      ? row.store_id
      : undefined;
    const cohortBucket = validBucket(row.cohort_bucket)
      ? Number(row.cohort_bucket)
      : undefined;
    const publicationId = typeof row.publication_id === "string" && opaqueId.test(row.publication_id)
      ? row.publication_id
      : undefined;
    if (row.runtime === "legacy") {
      return Object.freeze({
        runtime: "legacy",
        reason: "assigned",
        ...(storeId ? { storeId } : {}),
        ...(cohortBucket !== undefined ? { cohortBucket } : {}),
        ...(publicationId ? { publicationId } : {}),
      });
    }
    const artifactHash = typeof row.artifact_hash === "string" && sha256.test(row.artifact_hash)
      ? row.artifact_hash
      : "";
    const publicationRevision = Number(row.publication_revision);
    if (
      !storeId || cohortBucket === undefined || !publicationId || !artifactHash ||
      !Number.isInteger(publicationRevision) || publicationRevision < 1 ||
      !this.validateArtifact(row.artifact, artifactHash)
    ) {
      return Object.freeze({ runtime: "legacy", reason: "invalid", ...(storeId ? { storeId } : {}) });
    }
    return Object.freeze({
      runtime: "adaptive",
      reason: "assigned",
      storeId,
      cohortBucket,
      publicationId,
      publicationRevision,
      artifactHash,
      artifact: structuredClone(row.artifact) as TArtifact,
    });
  }
}
