import { describe, expect, it, vi } from "vitest";
import type { RuntimeArtifact } from "../contracts";
import { StorefrontCompiler } from "../compiler";
import { createBuiltInAdaptiveCommerceCatalog } from "../fixtures";
import { projectRuntimeArtifact } from "../shadow";
import { ServerStorefrontCompileJob } from "./ServerStorefrontCompileJob";
import type {
  CanonicalCompileSource,
  ClaimedCompileJob,
  ServerCompileJobRequest,
  ServerCompileJobResult,
  ServerCompilerGateway,
} from "./types";

const CREATED_AT = "2030-01-02T03:04:05.000Z";
const catalog = createBuiltInAdaptiveCommerceCatalog();
const request: ServerCompileJobRequest = {
  jobId: "job-server-1",
  idempotencyKey: "compile-release-1",
  storeId: catalog.storeDefinition.storeId,
  installationId: catalog.storeDefinition.installationId,
  expectedSourceRevision: 1,
  expectedPointerRevision: 0,
  intent: "publish",
};

const expectedArtifact = (): RuntimeArtifact => new StorefrontCompiler().compile({
  registry: catalog.registry,
  storeDefinition: catalog.storeDefinition,
  artifactId: request.jobId,
  createdAt: CREATED_AT,
}).artifact;

const source = (legacy: CanonicalCompileSource["legacyProjection"] = {
  projection: projectRuntimeArtifact(expectedArtifact()),
  uncomparableRoutes: [],
}): CanonicalCompileSource => ({
  sourceRevision: 1,
  sourceHash: `sha256:${"b".repeat(64)}`,
  storeDefinition: structuredClone(catalog.storeDefinition),
  merchantPatches: [],
  assets: [],
  legacyProjection: legacy,
});

const claimed = (): ClaimedCompileJob => ({
  jobId: request.jobId,
  state: "claimed",
  createdAt: CREATED_AT,
  result: null,
  errorCode: null,
  errorMessage: null,
});

const gateway = (canonical = source()): ServerCompilerGateway & {
  calls: string[];
  candidate: RuntimeArtifact | null;
  published: RuntimeArtifact | null;
  failed: { code: string; message: string } | null;
} => {
  const calls: string[] = [];
  const result = {
    calls,
    candidate: null as RuntimeArtifact | null,
    published: null as RuntimeArtifact | null,
    failed: null as { code: string; message: string } | null,
    claimJob: vi.fn(async () => ({ kind: "claimed" as const, job: claimed() })),
    transitionJob: vi.fn(async ({ nextState }) => { calls.push(nextState); }),
    loadCanonicalSource: vi.fn(async () => structuredClone(canonical)),
    assertSourceRevision: vi.fn(async () => undefined),
    persistCandidate: vi.fn(async ({ artifact }) => {
      result.candidate = artifact;
      calls.push("candidate-persisted");
    }),
    recordShadow: vi.fn(async ({ status }) => {
      calls.push(`shadow:${status}`);
      return "shadow-1";
    }),
    publishAtomic: vi.fn(async ({ artifact }) => {
      result.published = artifact;
      calls.push("publish-rpc");
      return { publicationId: "publication-1", pointerRevision: 1 };
    }),
    completeJob: vi.fn(async () => { calls.push("completed"); }),
    failJob: vi.fn(async ({ errorCode, errorMessage }) => {
      result.failed = { code: errorCode, message: errorMessage };
      calls.push("failed");
    }),
  } satisfies ServerCompilerGateway & {
    calls: string[];
    candidate: RuntimeArtifact | null;
    published: RuntimeArtifact | null;
    failed: { code: string; message: string } | null;
  };
  return result;
};

const releaseGate = {
  evaluate: vi.fn(async () => ({ passed: true, issues: [] })),
};

describe("ServerStorefrontCompileJob", () => {
  it("compiles once, persists exact candidate, shadows, and invokes one atomic publish", async () => {
    const persistence = gateway();
    const result = await new ServerStorefrontCompileJob({
      registry: catalog.registry,
      gateway: persistence,
      releaseGate,
    }).run(request);

    expect(result).toMatchObject({ published: true, shadowStatus: "accepted", pointerRevision: 1 });
    expect(persistence.publishAtomic).toHaveBeenCalledTimes(1);
    expect(persistence.candidate).toBe(persistence.published);
    expect(persistence.calls).toEqual([
      "loading-source", "compiling", "quality-gate", "candidate-persisted",
      "shadowing", "shadow:accepted", "publishing", "publish-rpc", "completed",
    ]);
  });

  it("replays a completed idempotent result without loading or compiling source", async () => {
    const persistence = gateway();
    const replay: ServerCompileJobResult = {
      jobId: request.jobId, sourceRevision: 1, artifactHash: expectedArtifact().artifactHash,
      shadowId: "shadow-1", shadowStatus: "accepted", publicationId: "publication-1",
      pointerRevision: 1, published: true,
    };
    vi.mocked(persistence.claimJob).mockResolvedValue({
      kind: "existing",
      job: { ...claimed(), state: "succeeded", result: replay },
    });

    await expect(new ServerStorefrontCompileJob({
      registry: catalog.registry, gateway: persistence, releaseGate,
    }).run(request)).resolves.toEqual(replay);
    expect(persistence.loadCanonicalSource).not.toHaveBeenCalled();
    expect(persistence.publishAtomic).not.toHaveBeenCalled();
  });

  it("fails closed on a source race after compilation and never shadows or publishes", async () => {
    const persistence = gateway();
    vi.mocked(persistence.assertSourceRevision).mockRejectedValue(new Error("revision conflict"));

    await expect(new ServerStorefrontCompileJob({
      registry: catalog.registry, gateway: persistence, releaseGate,
    }).run(request)).rejects.toThrow("revision conflict");
    expect(persistence.persistCandidate).not.toHaveBeenCalled();
    expect(persistence.recordShadow).not.toHaveBeenCalled();
    expect(persistence.publishAtomic).not.toHaveBeenCalled();
    expect(persistence.failed?.code).toBe("job.execution-failed");
  });

  it("keeps opaque structural shadow evidence uncomparable without publishing", async () => {
    const persistence = gateway(source({
      projection: null,
      uncomparableRoutes: [],
      reason: "Legacy renderer is opaque.",
    }));
    const result = await new ServerStorefrontCompileJob({
      registry: catalog.registry, gateway: persistence, releaseGate,
    }).run(request);

    expect(result).toMatchObject({ published: false, shadowStatus: "uncomparable" });
    expect(persistence.recordShadow).toHaveBeenCalledTimes(1);
    expect(persistence.publishAtomic).not.toHaveBeenCalled();
  });

  it("persists a comparable intentional change as pending for manual review", async () => {
    const compiledProjection = projectRuntimeArtifact(expectedArtifact());
    const legacyProjection = {
      ...compiledProjection,
      routes: {
        ...compiledProjection.routes,
        home: {
          ...compiledProjection.routes.home,
          title: "Previously published home",
        },
      },
    };
    const persistence = gateway(source({
      projection: legacyProjection,
      uncomparableRoutes: [],
    }));

    const result = await new ServerStorefrontCompileJob({
      registry: catalog.registry, gateway: persistence, releaseGate,
    }).run(request);

    expect(result).toMatchObject({ published: false, shadowStatus: "pending" });
    expect(persistence.calls).toContain("shadow:pending");
    expect(persistence.publishAtomic).not.toHaveBeenCalled();
  });

  it("persists a release-gate failure and leaves live publication untouched", async () => {
    const persistence = gateway();
    const blockedGate = {
      evaluate: vi.fn(async () => ({
        passed: false,
        issues: [{ code: "qa.a11y", severity: "blocker" as const, message: "Missing name." }],
      })),
    };
    await expect(new ServerStorefrontCompileJob({
      registry: catalog.registry, gateway: persistence, releaseGate: blockedGate,
    }).run(request)).rejects.toMatchObject({ code: "qa.a11y" });
    expect(persistence.recordShadow).not.toHaveBeenCalled();
    expect(persistence.publishAtomic).not.toHaveBeenCalled();
    expect(persistence.failed?.code).toBe("qa.a11y");
  });
});
