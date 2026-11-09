export const THEME_MARKETPLACE_STATUSES = [
  "submitted",
  "scanning",
  "needs-human-review",
  "signing",
  "approved",
  "rejected",
  "revoked",
] as const;

export type ThemeMarketplaceStatus = typeof THEME_MARKETPLACE_STATUSES[number];

export type ThemePackageProvenance = Readonly<{
  publisherId: string;
  packageId: string;
  packageVersion: string;
  subjectHash: string;
  sourceRepository: string;
  sourceRevision: string;
  buildId: string;
  builderId: string;
  builderVersion: string;
  builtAt: string;
}>;

export type ThemeMarketplaceActor = Readonly<{
  kind: "publisher" | "scanner" | "reviewer" | "signing-authority" | "system";
  id: string;
}>;

export type ThemeMarketplaceScanIssue = Readonly<{
  code: string;
  message: string;
  path?: string;
}>;

export type ThemeMarketplaceScanReport = Readonly<{
  passed: boolean;
  scannerId: string;
  scannerVersion: string;
  packageHash: string;
  issues: readonly ThemeMarketplaceScanIssue[];
  completedAt: string;
}>;

export type ThemeMarketplaceHumanDecision = Readonly<{
  decisionId: string;
  decision: "approved" | "rejected";
  reviewerId: string;
  notes: string;
  decidedAt: string;
  packageHash: string;
  scanRevision: number;
}>;

export type ApprovedThemePackageSigningRequest = Readonly<{
  submissionId: string;
  packageId: string;
  packageVersion: string;
  publisherId: string;
  packageHash: string;
  approvalRevision: number;
  humanDecisionId: string;
  approvedAt: string;
}>;

export type ThemePackageSignature = Readonly<{
  submissionId: string;
  packageHash: string;
  approvalRevision: number;
  keyId: string;
  algorithm: string;
  signature: string;
  signedAt: string;
}>;

/**
 * Production supplies this boundary. The local implementation never owns a
 * marketplace private key and cannot claim production trust.
 */
export interface ThemeMarketplaceSigningAuthority {
  readonly authorityId: string;
  signApproved(request: ApprovedThemePackageSigningRequest): Promise<ThemePackageSignature>;
  verifyApproved(
    request: ApprovedThemePackageSigningRequest,
    signature: ThemePackageSignature,
  ): Promise<boolean>;
}

export type ThemeMarketplaceSubmission = Readonly<{
  submissionId: string;
  status: ThemeMarketplaceStatus;
  revision: number;
  packageHash: string;
  packageSnapshot: Readonly<unknown>;
  provenance: ThemePackageProvenance;
  submittedBy: string;
  submittedAt: string;
  updatedAt: string;
  scanReport: ThemeMarketplaceScanReport | null;
  humanDecision: ThemeMarketplaceHumanDecision | null;
  signingRequest: ApprovedThemePackageSigningRequest | null;
  signature: ThemePackageSignature | null;
  rejectionCode: string | null;
  revocationReason: string | null;
  revokedAt: string | null;
}>;

export type ThemeMarketplaceAuditEventType =
  | "submission.created"
  | "scan.started"
  | "scan.passed"
  | "scan.rejected"
  | "scan.provider-failed"
  | "review.approved"
  | "review.rejected"
  | "signing.completed"
  | "signing.failed"
  | "submission.revoked"
  | "revocation-registry.failed";

export type ThemeMarketplaceAuditEvent = Readonly<{
  eventId: string;
  sequence: number;
  submissionId: string;
  submissionRevision: number;
  type: ThemeMarketplaceAuditEventType;
  actor: ThemeMarketplaceActor;
  occurredAt: string;
  packageHash: string;
  details: Readonly<Record<string, string | number | boolean | null>>;
  previousEventHash: string | null;
  eventHash: string;
}>;

export type ThemeMarketplaceMutation = Readonly<{
  expectedRevision: number;
  idempotencyKey: string;
}>;

export type ThemeMarketplaceSubmitCommand = Readonly<{
  package: unknown;
  provenance: ThemePackageProvenance;
  submittedBy: string;
  idempotencyKey: string;
}>;

export type ThemeMarketplaceReviewCommand = ThemeMarketplaceMutation & Readonly<{
  reviewerId: string;
  decision: "approved" | "rejected";
  notes: string;
}>;

export type ThemeMarketplaceRevocation = Readonly<{
  submissionId: string;
  packageHash: string;
  packageId: string;
  packageVersion: string;
  reason: string;
  revokedBy: string;
  revokedAt: string;
}>;

export type ThemeMarketplaceConsumptionContext = "install" | "runtime";
