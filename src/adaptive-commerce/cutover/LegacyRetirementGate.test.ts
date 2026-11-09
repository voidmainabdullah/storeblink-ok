import { evaluateLegacyRetirement, type LegacyRetirementEvidence } from "./LegacyRetirementGate";

const completeEvidence: LegacyRetirementEvidence = {
  migrationDeployed: true,
  compilerWorkerDeployed: true,
  rumIngestionDeployed: true,
  killSwitchVerified: true,
  rolloutPercentage: 100,
  totalPublishedStores: 20,
  adaptivePublishedStores: 20,
  unacceptedShadowStores: 0,
  uncomparableStores: 0,
  legacyReadCount: 0,
  legacyWriteCount: 0,
  unresolvedIncidentCount: 0,
  observationStartedAt: "2026-08-01T00:00:00.000Z",
  observedAt: "2026-08-15T00:00:00.000Z",
  rollbackWindowDays: 14,
};

describe("LegacyRetirementGate", () => {
  it("accepts only verified 100 percent cutover after a zero-legacy observation", () => {
    expect(evaluateLegacyRetirement(completeEvidence)).toEqual({
      ready: true,
      observedDays: 14,
      requiredObservationDays: 14,
      issues: [],
    });
  });

  it("refuses code-deletion claims when any external or runtime evidence is missing", () => {
    const report = evaluateLegacyRetirement({
      ...completeEvidence,
      migrationDeployed: false,
      rolloutPercentage: 50,
      adaptivePublishedStores: 19,
      uncomparableStores: 1,
      legacyReadCount: 2,
      observedAt: "2026-08-05T00:00:00.000Z",
    });
    expect(report.ready).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "cutover.migration",
      "cutover.rollout",
      "cutover.coverage",
      "cutover.uncomparable",
      "cutover.legacy-read",
      "cutover.observation",
    ]));
  });
});

