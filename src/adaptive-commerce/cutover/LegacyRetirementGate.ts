export type LegacyRetirementEvidence = Readonly<{
  migrationDeployed: boolean;
  compilerWorkerDeployed: boolean;
  rumIngestionDeployed: boolean;
  killSwitchVerified: boolean;
  rolloutPercentage: number;
  totalPublishedStores: number;
  adaptivePublishedStores: number;
  unacceptedShadowStores: number;
  uncomparableStores: number;
  legacyReadCount: number;
  legacyWriteCount: number;
  unresolvedIncidentCount: number;
  observationStartedAt: string;
  observedAt: string;
  rollbackWindowDays: number;
}>;

export type LegacyRetirementIssue = Readonly<{
  code: string;
  message: string;
}>;

export type LegacyRetirementReport = Readonly<{
  ready: boolean;
  observedDays: number;
  requiredObservationDays: number;
  issues: readonly LegacyRetirementIssue[];
}>;

export const evaluateLegacyRetirement = (
  evidence: LegacyRetirementEvidence,
  requiredObservationDays = 14,
): LegacyRetirementReport => {
  const issues: LegacyRetirementIssue[] = [];
  const start = Date.parse(evidence.observationStartedAt);
  const end = Date.parse(evidence.observedAt);
  const observedDays = Number.isFinite(start) && Number.isFinite(end) && end >= start
    ? Math.floor((end - start) / 86_400_000)
    : 0;
  const require = (condition: boolean, code: string, message: string) => {
    if (!condition) issues.push({ code, message });
  };

  require(evidence.migrationDeployed, "cutover.migration", "Adaptive persistence migration is not verified deployed.");
  require(evidence.compilerWorkerDeployed, "cutover.compiler", "Server compiler is not verified deployed.");
  require(evidence.rumIngestionDeployed, "cutover.rum", "RUM ingestion is not verified deployed.");
  require(evidence.killSwitchVerified, "cutover.kill-switch", "Independent kill-switch behavior is not verified.");
  require(evidence.rolloutPercentage === 100, "cutover.rollout", "Adaptive rollout has not reached 100 percent.");
  require(evidence.totalPublishedStores > 0, "cutover.population", "No published-store population was supplied.");
  require(
    evidence.adaptivePublishedStores === evidence.totalPublishedStores,
    "cutover.coverage",
    "Not every published store has an active adaptive publication.",
  );
  require(evidence.unacceptedShadowStores === 0, "cutover.shadow", "Some stores lack accepted shadow evidence.");
  require(evidence.uncomparableStores === 0, "cutover.uncomparable", "Some legacy routes remain uncomparable.");
  require(evidence.legacyReadCount === 0, "cutover.legacy-read", "Legacy runtime reads still occurred during observation.");
  require(evidence.legacyWriteCount === 0, "cutover.legacy-write", "Legacy theme writes still occurred during observation.");
  require(evidence.unresolvedIncidentCount === 0, "cutover.incident", "Adaptive rollout incidents remain unresolved.");
  require(observedDays >= requiredObservationDays, "cutover.observation", `A ${requiredObservationDays}-day zero-legacy observation is required.`);
  require(evidence.rollbackWindowDays >= 7, "cutover.rollback-window", "At least seven days of pointer rollback retention is required.");

  return Object.freeze({
    ready: issues.length === 0,
    observedDays,
    requiredObservationDays,
    issues: Object.freeze(issues),
  });
};

