import { artifactHashFor } from "@/adaptive-commerce/compiler";
import type {
  ApprovedThemePackageSigningRequest,
  ThemeMarketplaceActor,
  ThemeMarketplaceAuditEvent,
  ThemeMarketplaceAuditEventType,
  ThemeMarketplaceHumanDecision,
  ThemeMarketplaceMutation,
  ThemeMarketplaceReviewCommand,
  ThemeMarketplaceRevocation,
  ThemeMarketplaceSigningAuthority,
  ThemeMarketplaceSubmission,
  ThemeMarketplaceSubmitCommand,
  ThemePackageSignature,
} from "./contracts";
import type {
  ThemeMarketplaceScanInput,
  ThemeMarketplaceScanner,
} from "./ThemeMarketplaceScanner";
import type {
  ThemeMarketplaceApprovalProvider,
  ThemeMarketplaceRevocationRegistry,
} from "./ThemeMarketplaceRevocation";
import {
  verifyThemeMarketplaceAuditTrail,
  type ThemeMarketplaceAuditVerificationReport,
} from "./ThemeMarketplaceAudit";

const freeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach((entry) => freeze(entry));
    Object.freeze(value);
  }
  return value;
};

const immutableClone = <T>(value: T): Readonly<T> => freeze(structuredClone(value));

const requiredText = (value: unknown, name: string, max = 500): string => {
  if (typeof value !== "string") {
    throw new ThemeMarketplaceCommandError(
      "marketplace.command.invalid",
      `${name} must be text.`,
    );
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new ThemeMarketplaceCommandError(
      "marketplace.command.invalid",
      `${name} must contain between 1 and ${max} characters.`,
    );
  }
  return normalized;
};

export class ThemeMarketplaceCommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ThemeMarketplaceCommandError";
  }
}

type IdempotencyEntry = Readonly<{
  fingerprint: string;
  submissionId: string;
  result: ThemeMarketplaceSubmission;
}>;

export type ThemeMarketplaceReviewPipelineOptions = Readonly<{
  scanner: ThemeMarketplaceScanner;
  signingAuthority: ThemeMarketplaceSigningAuthority;
  revocations: ThemeMarketplaceRevocationRegistry;
  now?: () => Date;
  createId?: (kind: "submission" | "decision" | "event") => string;
}>;

export class ThemeMarketplaceReviewPipeline implements ThemeMarketplaceApprovalProvider {
  private readonly submissions = new Map<string, ThemeMarketplaceSubmission>();
  private readonly submissionByHash = new Map<string, string>();
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private readonly auditEvents: ThemeMarketplaceAuditEvent[] = [];
  private fallbackId = 0;

  constructor(private readonly options: ThemeMarketplaceReviewPipelineOptions) {}

  submit(command: ThemeMarketplaceSubmitCommand): Readonly<ThemeMarketplaceSubmission> {
    const submittedBy = requiredText(command.submittedBy, "submittedBy", 160);
    const idempotencyKey = requiredText(command.idempotencyKey, "idempotencyKey", 160);
    let packageSnapshot: unknown;
    let packageHash: string;
    let provenanceSnapshot: ThemeMarketplaceSubmitCommand["provenance"];
    try {
      packageSnapshot = structuredClone(command.package);
      packageHash = artifactHashFor(packageSnapshot);
      provenanceSnapshot = structuredClone(command.provenance);
      artifactHashFor(provenanceSnapshot);
    } catch {
      throw new ThemeMarketplaceCommandError(
        "marketplace.package.non-canonical",
        "Marketplace submissions and provenance must be canonical JSON.",
      );
    }
    const fingerprint = artifactHashFor({
      operation: "submit",
      packageHash,
      provenance: provenanceSnapshot,
      submittedBy,
    });
    const idempotencyScope = `submit:${idempotencyKey}`;
    const previous = this.resolveIdempotency(idempotencyScope, fingerprint);
    if (previous) return previous;
    if (this.submissionByHash.has(packageHash)) throw new ThemeMarketplaceCommandError(
      "marketplace.package.already-submitted",
      "This exact immutable package hash already has a marketplace submission.",
    );

    const occurredAt = this.now();
    const submissionId = this.createId("submission");
    const submission = immutableClone<ThemeMarketplaceSubmission>({
      submissionId,
      status: "submitted",
      revision: 1,
      packageHash,
      packageSnapshot: packageSnapshot as Readonly<unknown>,
      provenance: provenanceSnapshot,
      submittedBy,
      submittedAt: occurredAt,
      updatedAt: occurredAt,
      scanReport: null,
      humanDecision: null,
      signingRequest: null,
      signature: null,
      rejectionCode: null,
      revocationReason: null,
      revokedAt: null,
    }) as ThemeMarketplaceSubmission;
    this.submissions.set(submissionId, submission);
    this.submissionByHash.set(packageHash, submissionId);
    this.appendAudit(submission, "submission.created", {
      kind: "publisher",
      id: submittedBy,
    }, {
      publisherId: command.provenance.publisherId,
      packageId: command.provenance.packageId,
      packageVersion: command.provenance.packageVersion,
    });
    this.recordIdempotency(idempotencyScope, fingerprint, submission);
    return immutableClone(submission);
  }

  async scan(
    submissionId: string,
    command: ThemeMarketplaceMutation,
  ): Promise<Readonly<ThemeMarketplaceSubmission>> {
    this.assertExpectedRevision(command.expectedRevision);
    const idempotencyKey = requiredText(command.idempotencyKey, "idempotencyKey", 160);
    const fingerprint = artifactHashFor({
      operation: "scan",
      submissionId,
      expectedRevision: command.expectedRevision,
    });
    const scope = `scan:${submissionId}:${idempotencyKey}`;
    const previous = this.resolveIdempotency(scope, fingerprint);
    if (previous) return previous;
    const current = this.requireRevision(submissionId, command.expectedRevision);
    if (current.status !== "submitted") throw new ThemeMarketplaceCommandError(
      "marketplace.transition.invalid",
      `Cannot scan a ${current.status} submission.`,
    );

    const scanning = this.replace(current, {
      status: "scanning",
      revision: current.revision + 1,
      updatedAt: this.now(),
    });
    this.appendAudit(scanning, "scan.started", {
      kind: "scanner",
      id: this.options.scanner.scannerId,
    }, { scannerVersion: this.options.scanner.scannerVersion });

    const scanInput: ThemeMarketplaceScanInput = {
      submissionId,
      packageHash: scanning.packageHash,
      package: structuredClone(scanning.packageSnapshot),
      provenance: structuredClone(scanning.provenance),
    };
    let report;
    let providerFailed = false;
    try {
      report = await this.options.scanner.scan(scanInput);
      if (
        report.packageHash !== scanning.packageHash ||
        report.scannerId !== this.options.scanner.scannerId ||
        report.scannerVersion !== this.options.scanner.scannerVersion
      ) throw new Error("Scanner evidence does not match the active submission.");
      providerFailed = report.issues.some((issue) =>
        issue.code.startsWith("marketplace.provider.") && issue.code.endsWith(".unavailable"));
    } catch {
      providerFailed = true;
      report = {
        passed: false,
        scannerId: this.options.scanner.scannerId,
        scannerVersion: this.options.scanner.scannerVersion,
        packageHash: scanning.packageHash,
        issues: [{
          code: "marketplace.scanner.unavailable",
          message: "Automated scanner failed; review fails closed.",
        }],
        completedAt: this.now(),
      } as const;
    }

    const passed = report.passed && report.issues.length === 0;
    const finished = this.replace(scanning, {
      status: passed ? "needs-human-review" : "rejected",
      revision: scanning.revision + 1,
      updatedAt: this.now(),
      scanReport: immutableClone(report),
      rejectionCode: passed
        ? null
        : providerFailed
          ? "marketplace.scanner.unavailable"
          : report.issues[0]?.code ?? "marketplace.scan.rejected",
    });
    this.appendAudit(
      finished,
      passed
        ? "scan.passed"
        : providerFailed
          ? "scan.provider-failed"
          : "scan.rejected",
      { kind: "scanner", id: this.options.scanner.scannerId },
      {
        issueCount: report.issues.length,
        scannerVersion: report.scannerVersion,
      },
    );
    this.recordIdempotency(scope, fingerprint, finished);
    return immutableClone(finished);
  }

  async review(
    submissionId: string,
    command: ThemeMarketplaceReviewCommand,
  ): Promise<Readonly<ThemeMarketplaceSubmission>> {
    this.assertExpectedRevision(command.expectedRevision);
    if (command.decision !== "approved" && command.decision !== "rejected") {
      throw new ThemeMarketplaceCommandError(
        "marketplace.command.invalid",
        "decision must be approved or rejected.",
      );
    }
    const reviewerId = requiredText(command.reviewerId, "reviewerId", 160);
    const notes = requiredText(command.notes, "notes", 2_000);
    const idempotencyKey = requiredText(command.idempotencyKey, "idempotencyKey", 160);
    const fingerprint = artifactHashFor({
      operation: "review",
      submissionId,
      decision: command.decision,
      reviewerId,
      notes,
      expectedRevision: command.expectedRevision,
    });
    const scope = `review:${submissionId}:${idempotencyKey}`;
    const previous = this.resolveIdempotency(scope, fingerprint);
    if (previous) return previous;
    const current = this.requireRevision(submissionId, command.expectedRevision);
    if (reviewerId === current.submittedBy) throw new ThemeMarketplaceCommandError(
      "marketplace.review.self-approval",
      "A publisher cannot approve or reject their own marketplace submission.",
    );
    if (
      current.status !== "needs-human-review" ||
      !current.scanReport?.passed ||
      current.scanReport.packageHash !== current.packageHash
    ) throw new ThemeMarketplaceCommandError(
      "marketplace.review.not-ready",
      "Human review is allowed only after the exact package hash passes scanning.",
    );

    const decidedAt = this.now();
    const decision: ThemeMarketplaceHumanDecision = {
      decisionId: this.createId("decision"),
      decision: command.decision,
      reviewerId,
      notes,
      decidedAt,
      packageHash: current.packageHash,
      scanRevision: current.revision,
    };
    if (command.decision === "rejected") {
      const rejected = this.replace(current, {
        status: "rejected",
        revision: current.revision + 1,
        updatedAt: decidedAt,
        humanDecision: decision,
        rejectionCode: "marketplace.review.rejected",
      });
      this.appendAudit(rejected, "review.rejected", {
        kind: "reviewer",
        id: reviewerId,
      }, { decisionId: decision.decisionId });
      this.recordIdempotency(scope, fingerprint, rejected);
      return immutableClone(rejected);
    }

    const approvalRevision = current.revision + 1;
    const signingRequest: ApprovedThemePackageSigningRequest = {
      submissionId,
      packageId: current.provenance.packageId,
      packageVersion: current.provenance.packageVersion,
      publisherId: current.provenance.publisherId,
      packageHash: current.packageHash,
      approvalRevision,
      humanDecisionId: decision.decisionId,
      approvedAt: decidedAt,
    };
    const approved = this.replace(current, {
      status: "signing",
      revision: approvalRevision,
      updatedAt: decidedAt,
      humanDecision: decision,
      signingRequest,
      rejectionCode: null,
    });
    this.appendAudit(approved, "review.approved", {
      kind: "reviewer",
      id: reviewerId,
    }, { decisionId: decision.decisionId });

    let signature: ThemePackageSignature | null = null;
    try {
      signature = await this.options.signingAuthority.signApproved(
        immutableClone(signingRequest) as ApprovedThemePackageSigningRequest,
      );
      if (!this.signatureMatches(signingRequest, signature)) {
        throw new Error("Signing authority returned evidence for a different approval.");
      }
      const verified = await this.options.signingAuthority.verifyApproved(signingRequest, signature);
      if (!verified) throw new Error("Signing authority did not verify its returned evidence.");
    } catch {
      const rejected = this.replace(approved, {
        status: "rejected",
        revision: approved.revision + 1,
        updatedAt: this.now(),
        signature: null,
        rejectionCode: "marketplace.signing.failed",
      });
      this.appendAudit(rejected, "signing.failed", {
        kind: "signing-authority",
        id: this.options.signingAuthority.authorityId,
      }, { decisionId: decision.decisionId });
      this.recordIdempotency(scope, fingerprint, rejected);
      return immutableClone(rejected);
    }

    const signed = this.replace(approved, {
      status: "approved",
      revision: approved.revision + 1,
      updatedAt: this.now(),
      signature: immutableClone(signature),
    });
    this.appendAudit(signed, "signing.completed", {
      kind: "signing-authority",
      id: this.options.signingAuthority.authorityId,
    }, {
      keyId: signature.keyId,
      algorithm: signature.algorithm,
    });
    this.recordIdempotency(scope, fingerprint, signed);
    return immutableClone(signed);
  }

  async revoke(
    submissionId: string,
    command: ThemeMarketplaceMutation & Readonly<{ revokedBy: string; reason: string }>,
  ): Promise<Readonly<ThemeMarketplaceSubmission>> {
    this.assertExpectedRevision(command.expectedRevision);
    const revokedBy = requiredText(command.revokedBy, "revokedBy", 160);
    const reason = requiredText(command.reason, "reason", 500);
    const idempotencyKey = requiredText(command.idempotencyKey, "idempotencyKey", 160);
    const fingerprint = artifactHashFor({
      operation: "revoke",
      submissionId,
      revokedBy,
      reason,
      expectedRevision: command.expectedRevision,
    });
    const scope = `revoke:${submissionId}:${idempotencyKey}`;
    const previous = this.resolveIdempotency(scope, fingerprint);
    if (previous) return previous;
    const current = this.requireRevision(submissionId, command.expectedRevision);
    if (current.status !== "approved" || !current.signature) throw new ThemeMarketplaceCommandError(
      "marketplace.revocation.not-approved",
      "Only an approved and signed package can be revoked.",
    );

    const revokedAt = this.now();
    const revocation: ThemeMarketplaceRevocation = {
      submissionId,
      packageHash: current.packageHash,
      packageId: current.provenance.packageId,
      packageVersion: current.provenance.packageVersion,
      reason,
      revokedBy,
      revokedAt,
    };
    let registryFailed = false;
    try {
      await this.options.revocations.registerRevocation(
        immutableClone(revocation) as ThemeMarketplaceRevocation,
      );
    } catch {
      registryFailed = true;
    }
    const revoked = this.replace(current, {
      status: "revoked",
      revision: current.revision + 1,
      updatedAt: revokedAt,
      revocationReason: reason,
      revokedAt,
    });
    this.appendAudit(revoked, "submission.revoked", {
      kind: "reviewer",
      id: revokedBy,
    }, { reason });
    if (registryFailed) this.appendAudit(revoked, "revocation-registry.failed", {
      kind: "system",
      id: "theme-marketplace-review-pipeline",
    }, { failClosed: true });
    this.recordIdempotency(scope, fingerprint, revoked);
    return immutableClone(revoked);
  }

  getSubmission(submissionId: string): Readonly<ThemeMarketplaceSubmission> | null {
    const value = this.submissions.get(submissionId);
    return value ? immutableClone(value) : null;
  }

  async getSubmissionByPackageHash(
    packageHash: string,
  ): Promise<ThemeMarketplaceSubmission | null> {
    const submissionId = this.submissionByHash.get(packageHash);
    const value = submissionId ? this.submissions.get(submissionId) : null;
    return value ? immutableClone(value) as ThemeMarketplaceSubmission : null;
  }

  getAuditEvents(submissionId?: string): readonly ThemeMarketplaceAuditEvent[] {
    return immutableClone(
      submissionId
        ? this.auditEvents.filter((event) => event.submissionId === submissionId)
        : this.auditEvents,
    );
  }

  verifyAuditTrail(): ThemeMarketplaceAuditVerificationReport {
    return verifyThemeMarketplaceAuditTrail(this.auditEvents);
  }

  private replace(
    current: ThemeMarketplaceSubmission,
    patch: Partial<ThemeMarketplaceSubmission>,
  ): ThemeMarketplaceSubmission {
    const next = immutableClone({
      ...structuredClone(current),
      ...structuredClone(patch),
    }) as ThemeMarketplaceSubmission;
    this.submissions.set(current.submissionId, next);
    return next;
  }

  private requireRevision(submissionId: string, expectedRevision: number): ThemeMarketplaceSubmission {
    const current = this.submissions.get(submissionId);
    if (!current) throw new ThemeMarketplaceCommandError(
      "marketplace.submission.not-found",
      `Marketplace submission ${submissionId} was not found.`,
    );
    if (current.revision !== expectedRevision) throw new ThemeMarketplaceCommandError(
      "marketplace.revision.conflict",
      `Expected revision ${expectedRevision}; current revision is ${current.revision}.`,
    );
    return current;
  }

  private resolveIdempotency(
    scope: string,
    fingerprint: string,
  ): Readonly<ThemeMarketplaceSubmission> | null {
    const previous = this.idempotency.get(scope);
    if (!previous) return null;
    if (previous.fingerprint !== fingerprint) throw new ThemeMarketplaceCommandError(
      "marketplace.idempotency.conflict",
      "Idempotency key was already used with a different command.",
    );
    if (!this.submissions.has(previous.submissionId)) throw new ThemeMarketplaceCommandError(
      "marketplace.idempotency.corrupt",
      "Idempotency record points to a missing submission.",
    );
    return immutableClone(previous.result);
  }

  private recordIdempotency(
    scope: string,
    fingerprint: string,
    result: ThemeMarketplaceSubmission,
  ): void {
    this.idempotency.set(scope, immutableClone({
      fingerprint,
      submissionId: result.submissionId,
      result,
    }) as IdempotencyEntry);
  }

  private assertExpectedRevision(expectedRevision: number): void {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
      throw new ThemeMarketplaceCommandError(
        "marketplace.command.invalid",
        "expectedRevision must be a positive safe integer.",
      );
    }
  }

  private appendAudit(
    submission: ThemeMarketplaceSubmission,
    type: ThemeMarketplaceAuditEventType,
    actor: ThemeMarketplaceActor,
    details: Record<string, string | number | boolean | null>,
  ): void {
    const previous = this.auditEvents.at(-1) ?? null;
    const payload = {
      eventId: this.createId("event"),
      sequence: this.auditEvents.length + 1,
      submissionId: submission.submissionId,
      submissionRevision: submission.revision,
      type,
      actor,
      occurredAt: this.now(),
      packageHash: submission.packageHash,
      details,
      previousEventHash: previous?.eventHash ?? null,
    };
    const event = immutableClone({
      ...payload,
      eventHash: artifactHashFor(payload),
    }) as ThemeMarketplaceAuditEvent;
    this.auditEvents.push(event);
  }

  private signatureMatches(
    request: ApprovedThemePackageSigningRequest,
    signature: ThemePackageSignature,
  ): boolean {
    return signature.submissionId === request.submissionId &&
      signature.packageHash === request.packageHash &&
      signature.approvalRevision === request.approvalRevision &&
      Boolean(signature.keyId.trim()) &&
      Boolean(signature.algorithm.trim()) &&
      Boolean(signature.signature.trim()) &&
      Number.isFinite(new Date(signature.signedAt).getTime());
  }

  private now(): string {
    return (this.options.now ?? (() => new Date()))().toISOString();
  }

  private createId(kind: "submission" | "decision" | "event"): string {
    if (this.options.createId) return this.options.createId(kind);
    const randomUuid = globalThis.crypto?.randomUUID?.();
    if (randomUuid) return `${kind}-${randomUuid}`;
    this.fallbackId += 1;
    return `${kind}-${this.fallbackId}`;
  }
}
