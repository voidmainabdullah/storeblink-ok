import { artifactHashFor } from "@/adaptive-commerce/compiler";
import type {
  ApprovedThemePackageSigningRequest,
  ThemeMarketplaceConsumptionContext,
  ThemeMarketplaceRevocation,
  ThemeMarketplaceSigningAuthority,
  ThemeMarketplaceSubmission,
} from "./contracts";

export interface ThemeMarketplaceRevocationRegistry {
  getRevocation(
    submissionId: string,
    packageHash: string,
  ): Promise<ThemeMarketplaceRevocation | null>;
  registerRevocation(revocation: ThemeMarketplaceRevocation): Promise<void>;
}

export interface ThemeMarketplaceApprovalProvider {
  getSubmissionByPackageHash(packageHash: string): Promise<ThemeMarketplaceSubmission | null>;
}

const revocationKey = (submissionId: string, packageHash: string): string =>
  `${submissionId}:${packageHash}`;

const timestampFor = (value: unknown): number =>
  typeof value === "string" ? Date.parse(value) : Number.NaN;

const isNonEmptyText = (value: unknown): value is string =>
  typeof value === "string" && Boolean(value.trim());

const hasCompleteApprovalEvidence = (
  submission: ThemeMarketplaceSubmission,
  packageHash: string,
): boolean => {
  const scan = submission.scanReport;
  const decision = submission.humanDecision;
  const request = submission.signingRequest;
  const signature = submission.signature;
  if (!scan || !decision || !request || !signature) return false;

  let snapshotHash: string;
  try {
    snapshotHash = artifactHashFor(submission.packageSnapshot);
  } catch {
    return false;
  }
  const scanTime = timestampFor(scan.completedAt);
  const decisionTime = timestampFor(decision.decidedAt);
  const signatureTime = timestampFor(signature.signedAt);

  return snapshotHash === packageHash &&
    submission.provenance.subjectHash === packageHash &&
    scan.passed &&
    scan.issues.length === 0 &&
    scan.packageHash === packageHash &&
    decision.decision === "approved" &&
    decision.packageHash === packageHash &&
    request.submissionId === submission.submissionId &&
    request.packageId === submission.provenance.packageId &&
    request.packageVersion === submission.provenance.packageVersion &&
    request.publisherId === submission.provenance.publisherId &&
    request.packageHash === packageHash &&
    request.humanDecisionId === decision.decisionId &&
    request.approvedAt === decision.decidedAt &&
    request.approvalRevision === decision.scanRevision + 1 &&
    signature.submissionId === submission.submissionId &&
    signature.packageHash === packageHash &&
    signature.approvalRevision === request.approvalRevision &&
    submission.revision === request.approvalRevision + 1 &&
    isNonEmptyText(signature.keyId) &&
    isNonEmptyText(signature.algorithm) &&
    isNonEmptyText(signature.signature) &&
    Number.isFinite(scanTime) &&
    Number.isFinite(decisionTime) &&
    Number.isFinite(signatureTime) &&
    scanTime <= decisionTime &&
    decisionTime <= signatureTime;
};

export class InMemoryThemeMarketplaceRevocationRegistry
implements ThemeMarketplaceRevocationRegistry {
  private readonly revocations = new Map<string, ThemeMarketplaceRevocation>();

  async getRevocation(
    submissionId: string,
    packageHash: string,
  ): Promise<ThemeMarketplaceRevocation | null> {
    const value = this.revocations.get(revocationKey(submissionId, packageHash));
    return value ? structuredClone(value) : null;
  }

  async registerRevocation(revocation: ThemeMarketplaceRevocation): Promise<void> {
    const key = revocationKey(revocation.submissionId, revocation.packageHash);
    const current = this.revocations.get(key);
    if (current) {
      if (JSON.stringify(current) !== JSON.stringify(revocation)) {
        throw new Error("A different revocation already exists for this exact package hash.");
      }
      return;
    }
    this.revocations.set(key, Object.freeze(structuredClone(revocation)));
  }
}

export class ThemeMarketplaceConsumptionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ThemeMarketplaceConsumptionError";
  }
}

export type ThemeMarketplaceConsumptionGateOptions = Readonly<{
  approvals: ThemeMarketplaceApprovalProvider;
  revocations: ThemeMarketplaceRevocationRegistry;
  signingAuthority: ThemeMarketplaceSigningAuthority;
}>;

/**
 * Shared install/runtime gate. Both call paths intentionally use the same
 * checks so a package cannot remain live after marketplace revocation.
 */
export class ThemeMarketplaceConsumptionGate {
  constructor(private readonly options: ThemeMarketplaceConsumptionGateOptions) {}

  assertInstallable(packageValue: unknown): Promise<Readonly<ThemeMarketplaceSubmission>> {
    return this.assertAllowed(packageValue, "install");
  }

  assertRuntimeAllowed(packageValue: unknown): Promise<Readonly<ThemeMarketplaceSubmission>> {
    return this.assertAllowed(packageValue, "runtime");
  }

  private async assertAllowed(
    packageValue: unknown,
    context: ThemeMarketplaceConsumptionContext,
  ): Promise<Readonly<ThemeMarketplaceSubmission>> {
    let packageHash: string;
    try {
      packageHash = artifactHashFor(packageValue);
    } catch {
      throw new ThemeMarketplaceConsumptionError(
        "marketplace.package.non-canonical",
        `${context} denied because the package is not canonical JSON.`,
      );
    }

    let submission: ThemeMarketplaceSubmission | null;
    try {
      submission = await this.options.approvals.getSubmissionByPackageHash(packageHash);
    } catch {
      throw new ThemeMarketplaceConsumptionError(
        "marketplace.approval-provider.unavailable",
        `${context} denied because approval status could not be verified.`,
      );
    }
    if (!submission) {
      throw new ThemeMarketplaceConsumptionError(
        "marketplace.package.not-approved",
        `${context} denied because the exact package hash is not approved.`,
      );
    }
    let revocation: ThemeMarketplaceRevocation | null;
    try {
      revocation = await this.options.revocations.getRevocation(
        submission.submissionId,
        packageHash,
      );
    } catch {
      throw new ThemeMarketplaceConsumptionError(
        "marketplace.revocation-provider.unavailable",
        `${context} denied because revocation status could not be verified.`,
      );
    }
    if (revocation) throw new ThemeMarketplaceConsumptionError(
      "marketplace.package.revoked",
      `${context} denied because the package was revoked: ${revocation.reason}`,
    );

    if (submission.status !== "approved") {
      throw new ThemeMarketplaceConsumptionError(
        "marketplace.package.not-approved",
        `${context} denied because the exact package hash is not approved.`,
      );
    }
    if (
      submission.packageHash !== packageHash ||
      !hasCompleteApprovalEvidence(submission, packageHash)
    ) throw new ThemeMarketplaceConsumptionError(
      "marketplace.approval.incomplete",
      `${context} denied because approval or signature evidence is incomplete.`,
    );

    let verified = false;
    try {
      verified = await this.options.signingAuthority.verifyApproved(
        submission.signingRequest as ApprovedThemePackageSigningRequest,
        submission.signature!,
      );
    } catch {
      throw new ThemeMarketplaceConsumptionError(
        "marketplace.signature-provider.unavailable",
        `${context} denied because the signature provider failed.`,
      );
    }
    if (!verified) throw new ThemeMarketplaceConsumptionError(
      "marketplace.signature.invalid",
      `${context} denied because the approval signature is invalid.`,
    );

    return Object.freeze(structuredClone(submission));
  }
}
