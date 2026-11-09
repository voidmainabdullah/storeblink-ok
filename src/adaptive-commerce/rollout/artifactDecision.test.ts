import { describe, expect, it } from "vitest";
import {
  decideAdaptiveArtifact,
  parseAdaptiveRolloutConfig,
} from "./index";

describe("adaptive artifact decision", () => {
  it("fails closed to legacy when rollout configuration is missing or invalid", () => {
    expect(decideAdaptiveArtifact({ storeId: "store-1" })).toMatchObject({
      artifact: "legacy",
      cohort: "legacy-control",
      reason: "missing-config",
      assignment: null,
    });
    expect(decideAdaptiveArtifact({ storeId: "store-1", config: { percentage: 25 } })).toMatchObject({
      artifact: "legacy",
      reason: "invalid-config",
    });
    expect(parseAdaptiveRolloutConfig({ percentage: 10, unexpected: true })).toBeNull();
  });

  it("lets the independent kill switch override a valid 100-percent rollout", () => {
    expect(decideAdaptiveArtifact({
      storeId: "store-1",
      config: { percentage: 100 },
      killSwitch: true,
    })).toEqual({
      artifact: "legacy",
      cohort: "legacy-control",
      reason: "kill-switch",
      assignment: null,
    });
  });

  it("lets the kill switch win even when rollout configuration is malformed", () => {
    expect(decideAdaptiveArtifact({
      storeId: "store-1",
      config: { percentage: "everything" },
      killSwitch: true,
    }).reason).toBe("kill-switch");
  });

  it("serves v3 only to assigned tenants", () => {
    expect(decideAdaptiveArtifact({
      storeId: "store-1",
      config: { percentage: 100, cohortKey: "release-1" },
    })).toMatchObject({ artifact: "v3", cohort: "v3-canary", reason: "inside-cohort" });
    expect(decideAdaptiveArtifact({
      storeId: "store-1",
      config: { percentage: 0, cohortKey: "release-1" },
    })).toMatchObject({ artifact: "legacy", cohort: "legacy-control", reason: "outside-cohort" });
  });
});
