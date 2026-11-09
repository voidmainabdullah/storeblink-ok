import { STOREFRONT_RESOURCE_TYPES } from "../contracts";
import { artifactHashFor, StorefrontCompiler } from "../compiler";
import { compareShadowArtifacts } from "../shadow";
import type {
  ServerCompileJobRequest,
  ServerCompileJobResult,
  ServerCompileJobState,
  ServerCompilerDependencies,
} from "./types";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,127}$/;

export class ServerCompileJobError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ServerCompileJobError";
    this.code = code;
  }
}

const assertRequest = (request: ServerCompileJobRequest): void => {
  const identifiers = [
    ["Job id", request.jobId],
    ["Store id", request.storeId],
    ["Installation id", request.installationId],
  ] as const;
  identifiers.forEach(([label, value]) => {
    if (!SAFE_ID.test(value)) throw new ServerCompileJobError("job.invalid-request", `${label} is invalid.`);
  });
  if (request.idempotencyKey.trim().length < 8 || request.idempotencyKey.length > 160) {
    throw new ServerCompileJobError(
      "job.invalid-request",
      "Idempotency key must contain between 8 and 160 characters.",
    );
  }
  if (!Number.isSafeInteger(request.expectedSourceRevision) || request.expectedSourceRevision < 1) {
    throw new ServerCompileJobError("job.invalid-request", "Expected source revision is invalid.");
  }
  if (!Number.isSafeInteger(request.expectedPointerRevision) || request.expectedPointerRevision < 0) {
    throw new ServerCompileJobError("job.invalid-request", "Expected pointer revision is invalid.");
  }
};

const requestHash = (request: ServerCompileJobRequest): string => artifactHashFor({
  storeId: request.storeId,
  installationId: request.installationId,
  expectedSourceRevision: request.expectedSourceRevision,
  expectedPointerRevision: request.expectedPointerRevision,
  intent: request.intent,
});

const errorDetails = (error: unknown): { code: string; message: string } => {
  if (error instanceof ServerCompileJobError) return { code: error.code, message: error.message };
  if (error instanceof Error) return { code: "job.execution-failed", message: error.message };
  return { code: "job.execution-failed", message: "Server storefront compilation failed." };
};

export class ServerStorefrontCompileJob {
  private readonly compiler = new StorefrontCompiler();

  constructor(private readonly dependencies: ServerCompilerDependencies) {
    if (!dependencies.registry && !dependencies.registryLoader) {
      throw new Error("Server compiler requires an exact StoreKit registry loader.");
    }
  }

  async run(request: ServerCompileJobRequest): Promise<ServerCompileJobResult> {
    assertRequest(request);
    const claim = await this.dependencies.gateway.claimJob({
      request,
      requestHash: requestHash(request),
    });
    if (claim.kind === "existing") {
      if (claim.job.state === "succeeded" && claim.job.result) return claim.job.result;
      if (claim.job.state === "failed") {
        throw new ServerCompileJobError(
          claim.job.errorCode ?? "job.previously-failed",
          claim.job.errorMessage ?? "The idempotent compile job previously failed.",
        );
      }
      throw new ServerCompileJobError(
        "job.in-progress",
        `Compile job ${claim.job.jobId} is already ${claim.job.state}.`,
      );
    }

    let state: ServerCompileJobState = "claimed";
    const transition = async (nextState: ServerCompileJobState): Promise<void> => {
      await this.dependencies.gateway.transitionJob({
        jobId: claim.job.jobId,
        expectedState: state,
        nextState,
      });
      state = nextState;
    };

    try {
      await transition("loading-source");
      const source = await this.dependencies.gateway.loadCanonicalSource({
        storeId: request.storeId,
        installationId: request.installationId,
        expectedSourceRevision: request.expectedSourceRevision,
      });
      if (
        source.sourceRevision !== request.expectedSourceRevision ||
        source.storeDefinition.storeId !== request.storeId ||
        source.storeDefinition.installationId !== request.installationId
      ) {
        throw new ServerCompileJobError(
          "source.revision-conflict",
          "Canonical storefront source changed before compilation began.",
        );
      }

      await transition("compiling");
      const registry = this.dependencies.registryLoader
        ? await this.dependencies.registryLoader.loadCompilerRegistry({
          storeId: request.storeId,
          installationId: request.installationId,
        })
        : this.dependencies.registry as NonNullable<ServerCompilerDependencies["registry"]>;
      const { artifact } = this.compiler.compile({
        registry,
        storeDefinition: source.storeDefinition,
        merchantPatches: source.merchantPatches,
        assets: source.assets,
        artifactId: claim.job.jobId,
        createdAt: claim.job.createdAt,
      });
      const resolvedRoutes = Object.keys(artifact.routes).sort();
      const expectedRoutes = [...STOREFRONT_RESOURCE_TYPES].sort();
      if (JSON.stringify(resolvedRoutes) !== JSON.stringify(expectedRoutes)) {
        throw new ServerCompileJobError(
          "compiler.route-incomplete",
          "Server compiler did not resolve the exact eight-route contract.",
        );
      }

      await transition("quality-gate");
      const gate = await this.dependencies.releaseGate.evaluate({ artifact, source });
      if (!gate.passed || gate.issues.some((issue) => issue.severity === "blocker")) {
        const blocker = gate.issues.find((issue) => issue.severity === "blocker");
        throw new ServerCompileJobError(
          blocker?.code ?? "release-gate.blocked",
          blocker?.message ?? "Adaptive Commerce release gate rejected the artifact.",
        );
      }

      // This check happens after all expensive work and immediately before the
      // shadow/publication boundary. The SQL publish RPC repeats it atomically.
      await this.dependencies.gateway.assertSourceRevision({
        storeId: request.storeId,
        installationId: request.installationId,
        expectedSourceRevision: request.expectedSourceRevision,
      });

      // Persist the exact compiled bytes before shadowing. Publication consumes
      // this candidate by job id, so it can never publish a fresh recompilation.
      await this.dependencies.gateway.persistCandidate({
        jobId: claim.job.jobId,
        expectedState: state,
        sourceRevision: source.sourceRevision,
        artifact,
      });

      await transition("shadowing");
      const structuralDiff = compareShadowArtifacts(source.legacyProjection, artifact);
      const shadowStatus = structuralDiff.status === "equal"
        ? "accepted" as const
        : structuralDiff.status === "different"
          ? "pending" as const
          : "uncomparable" as const;
      const shadowId = await this.dependencies.gateway.recordShadow({
        jobId: claim.job.jobId,
        storeId: request.storeId,
        installationId: request.installationId,
        artifactHash: artifact.artifactHash,
        structuralDiff,
        status: shadowStatus,
      });

      if (request.intent === "shadow-only" || shadowStatus !== "accepted") {
        const result: ServerCompileJobResult = Object.freeze({
          jobId: claim.job.jobId,
          sourceRevision: source.sourceRevision,
          artifactHash: artifact.artifactHash,
          shadowId,
          shadowStatus,
          publicationId: null,
          pointerRevision: null,
          published: false,
        });
        await this.dependencies.gateway.completeJob({
          jobId: claim.job.jobId,
          expectedState: state,
          result,
        });
        return result;
      }

      await transition("publishing");
      const publication = await this.dependencies.gateway.publishAtomic({
        jobId: claim.job.jobId,
        storeId: request.storeId,
        installationId: request.installationId,
        sourceRevision: source.sourceRevision,
        artifact,
        expectedPointerRevision: request.expectedPointerRevision,
      });
      const result: ServerCompileJobResult = Object.freeze({
        jobId: claim.job.jobId,
        sourceRevision: source.sourceRevision,
        artifactHash: artifact.artifactHash,
        shadowId,
        shadowStatus,
        publicationId: publication.publicationId,
        pointerRevision: publication.pointerRevision,
        published: true,
      });
      await this.dependencies.gateway.completeJob({
        jobId: claim.job.jobId,
        expectedState: state,
        result,
      });
      return result;
    } catch (error) {
      const details = errorDetails(error);
      try {
        await this.dependencies.gateway.failJob({
          jobId: claim.job.jobId,
          errorCode: details.code,
          errorMessage: details.message,
        });
      } catch {
        // Persistence failure must not replace the original compiler/gate error.
      }
      if (error instanceof ServerCompileJobError) throw error;
      throw new ServerCompileJobError(details.code, details.message);
    }
  }
}
