export type LegacyRuntimeAssignment = Readonly<{
  runtime: "legacy";
  reason: "assigned" | "missing" | "invalid" | "unavailable";
  storeId?: string;
  cohortBucket?: number;
  publicationId?: string;
}>;

export type AdaptiveRuntimeAssignment<TArtifact = Record<string, unknown>> = Readonly<{
  runtime: "adaptive";
  reason: "assigned";
  storeId: string;
  cohortBucket: number;
  publicationId: string;
  publicationRevision: number;
  artifactHash: string;
  artifact: TArtifact;
}>;

export type StorefrontRuntimeAssignment<TArtifact = Record<string, unknown>> =
  | LegacyRuntimeAssignment
  | AdaptiveRuntimeAssignment<TArtifact>;

export interface RuntimeArtifactGateway {
  resolve(handle: string): Promise<unknown>;
}

export type RuntimeArtifactValidator<TArtifact> = (
  artifact: unknown,
  expectedHash: string,
) => artifact is TArtifact;

