import { describe, expect, it } from "vitest";
import { artifactHashFor } from "@/adaptive-commerce/compiler";
import { createThemeSdkPackage } from "@/extension/theme-sdk/testFixtures";
import type {
  ApprovedThemePackageSigningRequest,
  ThemeMarketplaceSigningAuthority,
  ThemePackageSignature,
  ThemePackageProvenance,
} from "./contracts";
import {
  DefaultThemeMarketplaceScanner,
  type MarketplaceExtensionGrantProvider,
  type MarketplacePublisherTrustProvider,
} from "./ThemeMarketplaceScanner";
import {
  ThemeMarketplaceCommandError,
  ThemeMarketplaceReviewPipeline,
} from "./ThemeMarketplaceReviewPipeline";
import { verifyThemeMarketplaceAuditTrail } from "./ThemeMarketplaceAudit";
import {
  InMemoryThemeMarketplaceRevocationRegistry,
  ThemeMarketplaceConsumptionError,
  ThemeMarketplaceConsumptionGate,
} from "./ThemeMarketplaceRevocation";

class TestSigningAuthority implements ThemeMarketplaceSigningAuthority {
  readonly authorityId = "test-signing-authority-not-production";
  readonly requests: ApprovedThemePackageSigningRequest[] = [];

  async signApproved(request: ApprovedThemePackageSigningRequest): Promise<ThemePackageSignature> {
    this.requests.push(structuredClone(request));
    return {
      submissionId: request.submissionId,
      packageHash: request.packageHash,
      approvalRevision: request.approvalRevision,
      keyId: "test-key",
      algorithm: "test-only",
      signature: `test-signature:${request.packageHash}`,
      signedAt: "2026-08-21T02:00:00.000Z",
    };
  }

  async verifyApproved(
    request: ApprovedThemePackageSigningRequest,
    signature: ThemePackageSignature,
  ): Promise<boolean> {
    return signature.signature === `test-signature:${request.packageHash}` &&
      signature.approvalRevision === request.approvalRevision;
  }
}

const publisherProvider: MarketplacePublisherTrustProvider = {
  async getPublisherTrust(publisherId) {
    return {
      publisherId,
      status: "active",
      verified: true,
      allowedTrustLevels: ["declarative"],
    };
  },
};

const grantProvider: MarketplaceExtensionGrantProvider = {
  async getCurrentGrant() { return null; },
};

const provenanceFor = (packageValue: ReturnType<typeof createThemeSdkPackage>): ThemePackageProvenance => ({
  publisherId: packageValue.manifest.publisherId,
  packageId: packageValue.manifest.id,
  packageVersion: packageValue.manifest.version,
  subjectHash: artifactHashFor(packageValue),
  sourceRepository: "https://github.com/storeblink/professional-store",
  sourceRevision: "0123456789abcdef0123456789abcdef01234567",
  buildId: "build-20260821-0001",
  builderId: "storeblink-theme-cli",
  builderVersion: "1.0.0",
  builtAt: "2026-08-21T00:00:00.000Z",
});

const setup = (authority = new TestSigningAuthority()) => {
  let id = 0;
  const revocations = new InMemoryThemeMarketplaceRevocationRegistry();
  const scanner = new DefaultThemeMarketplaceScanner({
    publisherTrustProvider: publisherProvider,
    grantProvider,
    now: () => new Date("2026-08-21T01:00:00.000Z"),
  });
  const pipeline = new ThemeMarketplaceReviewPipeline({
    scanner,
    signingAuthority: authority,
    revocations,
    now: () => new Date("2026-08-21T02:00:00.000Z"),
    createId: (kind) => `${kind}-${++id}`,
  });
  return { pipeline, authority, revocations };
};

const submit = (pipeline: ThemeMarketplaceReviewPipeline) => {
  const packageValue = createThemeSdkPackage();
  const submission = pipeline.submit({
    package: packageValue,
    provenance: provenanceFor(packageValue),
    submittedBy: "publisher-user-1",
    idempotencyKey: "submit-1",
  });
  return { packageValue, submission };
};

const scanAndApprove = async (
  pipeline: ThemeMarketplaceReviewPipeline,
  submissionId: string,
) => {
  const scanned = await pipeline.scan(submissionId, {
    expectedRevision: 1,
    idempotencyKey: "scan-1",
  });
  const approved = await pipeline.review(submissionId, {
    expectedRevision: scanned.revision,
    idempotencyKey: "review-1",
    reviewerId: "reviewer-1",
    decision: "approved",
    notes: "Identity, design quality, accessibility, and security checks reviewed.",
  });
  return { scanned, approved };
};

describe("ThemeMarketplaceReviewPipeline", () => {
  it("keeps an immutable hash through scan, mandatory human approval, and exact-hash signing", async () => {
    const { pipeline, authority } = setup();
    const { packageValue, submission } = submit(pipeline);
    const originalHash = submission.packageHash;
    packageValue.manifest.name = "mutated caller object";

    const { scanned, approved } = await scanAndApprove(pipeline, submission.submissionId);

    expect(scanned.status).toBe("needs-human-review");
    expect(scanned.revision).toBe(3);
    expect(approved).toEqual(expect.objectContaining({
      status: "approved",
      revision: 5,
      packageHash: originalHash,
    }));
    expect(approved.humanDecision).toEqual(expect.objectContaining({
      decision: "approved",
      packageHash: originalHash,
    }));
    expect(authority.requests).toHaveLength(1);
    expect(authority.requests[0]).toEqual(expect.objectContaining({
      packageHash: originalHash,
      approvalRevision: 4,
      humanDecisionId: approved.humanDecision?.decisionId,
    }));
    expect((approved.packageSnapshot as ReturnType<typeof createThemeSdkPackage>).manifest.name)
      .toBe("Professional Store");
    expect(Object.isFrozen(approved)).toBe(true);
    expect(Object.isFrozen(approved.packageSnapshot)).toBe(true);

    const events = pipeline.getAuditEvents(submission.submissionId);
    expect(events.map((event) => event.type)).toEqual([
      "submission.created",
      "scan.started",
      "scan.passed",
      "review.approved",
      "signing.completed",
    ]);
    events.forEach((event, index) => {
      expect(event.sequence).toBe(index + 1);
      expect(event.previousEventHash).toBe(index ? events[index - 1].eventHash : null);
      expect(event.packageHash).toBe(originalHash);
    });
  });

  it("requires a passed scan and a human decision before signing", async () => {
    const { pipeline, authority } = setup();
    const { submission } = submit(pipeline);

    await expect(pipeline.review(submission.submissionId, {
      expectedRevision: 1,
      idempotencyKey: "early-review",
      reviewerId: "reviewer-1",
      decision: "approved",
      notes: "This must not bypass automated scanning.",
    })).rejects.toMatchObject({ code: "marketplace.review.not-ready" });
    expect(authority.requests).toHaveLength(0);

    const scanned = await pipeline.scan(submission.submissionId, {
      expectedRevision: 1,
      idempotencyKey: "scan-1",
    });
    const rejected = await pipeline.review(submission.submissionId, {
      expectedRevision: scanned.revision,
      idempotencyKey: "human-reject",
      reviewerId: "reviewer-1",
      decision: "rejected",
      notes: "Visual quality requires another publisher submission.",
    });
    expect(rejected.status).toBe("rejected");
    expect(authority.requests).toHaveLength(0);
  });

  it("keeps human-approved packages in signing state until authority evidence verifies", async () => {
    const authority = new TestSigningAuthority();
    let markSigningStarted: (() => void) | null = null;
    const signingStarted = new Promise<void>((resolve) => { markSigningStarted = resolve; });
    let finishSigning: ((signature: ThemePackageSignature) => void) | null = null;
    authority.signApproved = async (request) => {
      authority.requests.push(structuredClone(request));
      markSigningStarted?.();
      return new Promise<ThemePackageSignature>((resolve) => { finishSigning = resolve; });
    };
    const { pipeline } = setup(authority);
    const { submission } = submit(pipeline);
    const scanned = await pipeline.scan(submission.submissionId, {
      expectedRevision: 1,
      idempotencyKey: "scan-before-delayed-sign",
    });
    const pendingReview = pipeline.review(submission.submissionId, {
      expectedRevision: scanned.revision,
      idempotencyKey: "delayed-sign",
      reviewerId: "reviewer-1",
      decision: "approved",
      notes: "Human approval is complete; signing remains externally mediated.",
    });

    await signingStarted;
    const awaitingSignature = pipeline.getSubmission(submission.submissionId);
    expect(awaitingSignature).toEqual(expect.objectContaining({
      status: "signing",
      signature: null,
    }));
    expect(awaitingSignature?.humanDecision?.decision).toBe("approved");
    const request = authority.requests[0];
    finishSigning?.({
      submissionId: request.submissionId,
      packageHash: request.packageHash,
      approvalRevision: request.approvalRevision,
      keyId: "test-key",
      algorithm: "test-only",
      signature: `test-signature:${request.packageHash}`,
      signedAt: "2026-08-21T02:00:00.000Z",
    });

    await expect(pendingReview).resolves.toMatchObject({ status: "approved" });
  });

  it("enforces reviewer separation of duties", async () => {
    const { pipeline, authority } = setup();
    const { submission } = submit(pipeline);
    const scanned = await pipeline.scan(submission.submissionId, {
      expectedRevision: 1,
      idempotencyKey: "scan-1",
    });

    await expect(pipeline.review(submission.submissionId, {
      expectedRevision: scanned.revision,
      idempotencyKey: "self-review",
      reviewerId: submission.submittedBy,
      decision: "approved",
      notes: "Publisher self-approval must not reach signing.",
    })).rejects.toMatchObject({ code: "marketplace.review.self-approval" });
    expect(authority.requests).toHaveLength(0);
  });

  it("rejects the submission when signing fails or returns evidence for another hash", async () => {
    const authority = new TestSigningAuthority();
    authority.signApproved = async (request) => ({
      submissionId: request.submissionId,
      packageHash: `sha256:${"f".repeat(64)}`,
      approvalRevision: request.approvalRevision,
      keyId: "wrong-key",
      algorithm: "test-only",
      signature: "wrong",
      signedAt: "2026-08-21T02:00:00.000Z",
    });
    const { pipeline } = setup(authority);
    const { submission } = submit(pipeline);
    const { approved } = await scanAndApprove(pipeline, submission.submissionId);

    expect(approved.status).toBe("rejected");
    expect(approved.rejectionCode).toBe("marketplace.signing.failed");
    expect(approved.signature).toBeNull();
    expect(pipeline.getAuditEvents(submission.submissionId).at(-1)?.type).toBe("signing.failed");
  });

  it("enforces optimistic revisions and idempotent mutation commands", async () => {
    const { pipeline, authority } = setup();
    const { submission } = submit(pipeline);
    const command = { expectedRevision: 1, idempotencyKey: "scan-idempotent" };
    const first = await pipeline.scan(submission.submissionId, command);
    const repeated = await pipeline.scan(submission.submissionId, command);
    expect(repeated.revision).toBe(first.revision);
    expect(pipeline.getAuditEvents(submission.submissionId)).toHaveLength(3);

    await expect(pipeline.review(submission.submissionId, {
      expectedRevision: 1,
      idempotencyKey: "stale-review",
      reviewerId: "reviewer-1",
      decision: "approved",
      notes: "Stale revision must fail.",
    })).rejects.toBeInstanceOf(ThemeMarketplaceCommandError);

    const reviewCommand = {
      expectedRevision: first.revision,
      idempotencyKey: "review-idempotent",
      reviewerId: "reviewer-1",
      decision: "approved" as const,
      notes: "Reviewed once; retried transport must not sign twice.",
    };
    const approved = await pipeline.review(submission.submissionId, reviewCommand);
    const repeatedApproval = await pipeline.review(submission.submissionId, reviewCommand);
    expect(repeatedApproval.revision).toBe(approved.revision);
    expect(authority.requests).toHaveLength(1);

    const revoked = await pipeline.revoke(submission.submissionId, {
      expectedRevision: approved.revision,
      idempotencyKey: "revoke-after-approval",
      revokedBy: "reviewer-2",
      reason: "Package must be withdrawn",
    });
    expect(revoked.status).toBe("revoked");
    expect((await pipeline.scan(submission.submissionId, command)).revision).toBe(first.revision);
    expect((await pipeline.review(submission.submissionId, reviewCommand)).revision)
      .toBe(approved.revision);
    expect(pipeline.getSubmission(submission.submissionId)?.status).toBe("revoked");

    await expect(pipeline.review(submission.submissionId, {
      ...reviewCommand,
      notes: "Same idempotency key with different content.",
    })).rejects.toMatchObject({ code: "marketplace.idempotency.conflict" });
    await expect(pipeline.review(submission.submissionId, {
      ...reviewCommand,
      expectedRevision: approved.revision,
    })).rejects.toMatchObject({ code: "marketplace.idempotency.conflict" });
  });

  it("verifies the append-only audit hash chain and detects altered evidence", async () => {
    const { pipeline } = setup();
    const { submission } = submit(pipeline);
    await scanAndApprove(pipeline, submission.submissionId);

    expect(pipeline.verifyAuditTrail()).toEqual(expect.objectContaining({
      valid: true,
      eventCount: 5,
    }));
    const tampered = pipeline.getAuditEvents().map((event, index) => index === 2
      ? { ...event, details: { ...event.details, issueCount: 99 } }
      : event);
    expect(verifyThemeMarketplaceAuditTrail(tampered).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "marketplace.audit.event-hash" }),
    ]));
  });

  it("checks revocation during both install and runtime consumption", async () => {
    const { pipeline, authority, revocations } = setup();
    const { packageValue, submission } = submit(pipeline);
    const { approved } = await scanAndApprove(pipeline, submission.submissionId);
    const gate = new ThemeMarketplaceConsumptionGate({
      approvals: pipeline,
      revocations,
      signingAuthority: authority,
    });

    await expect(gate.assertInstallable(packageValue)).resolves.toMatchObject({ status: "approved" });
    await expect(gate.assertRuntimeAllowed(packageValue)).resolves.toMatchObject({ status: "approved" });

    const revoked = await pipeline.revoke(submission.submissionId, {
      expectedRevision: approved.revision,
      idempotencyKey: "revoke-1",
      revokedBy: "reviewer-2",
      reason: "Confirmed supply-chain compromise",
    });
    expect(revoked.status).toBe("revoked");
    await expect(gate.assertInstallable(packageValue)).rejects.toMatchObject({
      code: "marketplace.package.revoked",
    });
    await expect(gate.assertRuntimeAllowed(packageValue)).rejects.toMatchObject({
      code: "marketplace.package.revoked",
    });
  });

  it("fails closed when approval, revocation, or signature verification providers fail", async () => {
    const { pipeline, authority, revocations } = setup();
    const { packageValue, submission } = submit(pipeline);
    await scanAndApprove(pipeline, submission.submissionId);

    const approvalFailure = new ThemeMarketplaceConsumptionGate({
      approvals: { async getSubmissionByPackageHash() { throw new Error("offline"); } },
      revocations,
      signingAuthority: authority,
    });
    await expect(approvalFailure.assertInstallable(packageValue)).rejects.toMatchObject({
      code: "marketplace.approval-provider.unavailable",
    });

    const revocationFailure = new ThemeMarketplaceConsumptionGate({
      approvals: pipeline,
      revocations: {
        async getRevocation() { throw new Error("offline"); },
        async registerRevocation() {},
      },
      signingAuthority: authority,
    });
    await expect(revocationFailure.assertRuntimeAllowed(packageValue)).rejects.toMatchObject({
      code: "marketplace.revocation-provider.unavailable",
    });

    const signatureFailure = new ThemeMarketplaceConsumptionGate({
      approvals: pipeline,
      revocations,
      signingAuthority: {
        ...authority,
        authorityId: authority.authorityId,
        signApproved: authority.signApproved.bind(authority),
        async verifyApproved() { throw new Error("offline"); },
      },
    });
    await expect(signatureFailure.assertRuntimeAllowed(packageValue)).rejects
      .toBeInstanceOf(ThemeMarketplaceConsumptionError);
    await expect(signatureFailure.assertRuntimeAllowed(packageValue)).rejects.toMatchObject({
      code: "marketplace.signature-provider.unavailable",
    });
  });

  it("fails closed when approval evidence is internally inconsistent", async () => {
    const { pipeline, authority, revocations } = setup();
    const { packageValue, submission } = submit(pipeline);
    const { approved } = await scanAndApprove(pipeline, submission.submissionId);
    const forged = {
      ...approved,
      signingRequest: {
        ...approved.signingRequest!,
        humanDecisionId: "decision-from-another-review",
      },
    };
    const gate = new ThemeMarketplaceConsumptionGate({
      approvals: { async getSubmissionByPackageHash() { return forged; } },
      revocations,
      signingAuthority: authority,
    });

    await expect(gate.assertInstallable(packageValue)).rejects.toMatchObject({
      code: "marketplace.approval.incomplete",
    });
  });
});
