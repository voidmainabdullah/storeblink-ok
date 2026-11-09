import { artifactHashFor } from "@/adaptive-commerce/compiler";
import type { ThemeMarketplaceAuditEvent } from "./contracts";

export type ThemeMarketplaceAuditVerificationIssue = Readonly<{
  code:
    | "marketplace.audit.sequence"
    | "marketplace.audit.event-id"
    | "marketplace.audit.previous-hash"
    | "marketplace.audit.event-hash"
    | "marketplace.audit.package-hash"
    | "marketplace.audit.revision";
  sequence: number;
  message: string;
}>;

export type ThemeMarketplaceAuditVerificationReport = Readonly<{
  valid: boolean;
  eventCount: number;
  headHash: string | null;
  issues: readonly ThemeMarketplaceAuditVerificationIssue[];
}>;

/**
 * Verifies the local append-only evidence chain. This proves internal
 * consistency only; it is not a remote timestamp, transparency log, or
 * production signing authority.
 */
export const verifyThemeMarketplaceAuditTrail = (
  events: readonly ThemeMarketplaceAuditEvent[],
): ThemeMarketplaceAuditVerificationReport => {
  const issues: ThemeMarketplaceAuditVerificationIssue[] = [];
  const eventIds = new Set<string>();
  const packageHashBySubmission = new Map<string, string>();
  const revisionBySubmission = new Map<string, number>();

  events.forEach((event, index) => {
    const expectedSequence = index + 1;
    const previous = events[index - 1] ?? null;
    if (event.sequence !== expectedSequence) issues.push({
      code: "marketplace.audit.sequence",
      sequence: event.sequence,
      message: `Expected audit sequence ${expectedSequence}; received ${event.sequence}.`,
    });
    if (!event.eventId || eventIds.has(event.eventId)) issues.push({
      code: "marketplace.audit.event-id",
      sequence: event.sequence,
      message: "Audit event IDs must be present and unique.",
    });
    eventIds.add(event.eventId);

    if (event.previousEventHash !== (previous?.eventHash ?? null)) issues.push({
      code: "marketplace.audit.previous-hash",
      sequence: event.sequence,
      message: "Audit event does not reference the preceding event hash.",
    });

    const { eventHash, ...payload } = event;
    let expectedEventHash: string | null = null;
    try {
      expectedEventHash = artifactHashFor(payload);
    } catch {
      // The mismatch below records canonicalization failures without exposing
      // serializer details through this verification boundary.
    }
    if (eventHash !== expectedEventHash) issues.push({
      code: "marketplace.audit.event-hash",
      sequence: event.sequence,
      message: "Audit event payload does not match its recorded hash.",
    });

    const previousPackageHash = packageHashBySubmission.get(event.submissionId);
    if (previousPackageHash && previousPackageHash !== event.packageHash) issues.push({
      code: "marketplace.audit.package-hash",
      sequence: event.sequence,
      message: "A submission changed package hash inside the audit trail.",
    });
    packageHashBySubmission.set(event.submissionId, event.packageHash);

    const previousRevision = revisionBySubmission.get(event.submissionId);
    if (previousRevision !== undefined && event.submissionRevision < previousRevision) issues.push({
      code: "marketplace.audit.revision",
      sequence: event.sequence,
      message: "A submission revision moved backwards inside the audit trail.",
    });
    revisionBySubmission.set(event.submissionId, event.submissionRevision);
  });

  return Object.freeze({
    valid: issues.length === 0,
    eventCount: events.length,
    headHash: events.at(-1)?.eventHash ?? null,
    issues: Object.freeze(structuredClone(issues)),
  });
};
