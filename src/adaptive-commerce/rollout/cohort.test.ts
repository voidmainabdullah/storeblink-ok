import { describe, expect, it } from "vitest";
import {
  assignTenantCohort,
  isRolloutPercentage,
  ROLLOUT_BUCKET_COUNT,
  ROLLOUT_PERCENTAGES,
} from "./index";

describe("adaptive rollout cohort assignment", () => {
  it("is deterministic, bounded, and nested across certified percentages", () => {
    const first = assignTenantCohort("store-123", 10, "release-2026");
    expect(assignTenantCohort("store-123", 10, "release-2026")).toEqual(first);
    expect(first.bucket).toBeGreaterThanOrEqual(0);
    expect(first.bucket).toBeLessThan(ROLLOUT_BUCKET_COUNT);

    const assignments = ROLLOUT_PERCENTAGES.map((percentage) =>
      assignTenantCohort("store-123", percentage, "release-2026"),
    );
    expect(assignments[0].included).toBe(false);
    expect(assignments.at(-1)?.included).toBe(true);
    assignments.slice(1).forEach((assignment, index) => {
      if (assignments[index].included) expect(assignment.included).toBe(true);
    });
  });

  it("uses a different deterministic population when the cohort key changes", () => {
    const populations = ["release-a", "release-b"].map((cohortKey) =>
      Array.from({ length: 500 }, (_, index) =>
        assignTenantCohort(`store-${index}`, 10, cohortKey).included,
      ),
    );
    expect(populations[0]).not.toEqual(populations[1]);
  });

  it("recognizes only 0, 1, 10, 50, and 100 percent", () => {
    expect(ROLLOUT_PERCENTAGES.every(isRolloutPercentage)).toBe(true);
    expect(isRolloutPercentage(5)).toBe(false);
    expect(() => assignTenantCohort("store-1", 5 as never)).toThrow(/0, 1, 10, 50, or 100/);
  });

  it("rejects identifiers that could carry arbitrary tenant data", () => {
    expect(() => assignTenantCohort("person@example.com", 10)).toThrow(/opaque identifier/);
    expect(() => assignTenantCohort("store-1", 10, "spaces are invalid")).toThrow(/opaque identifier/);
  });
});
