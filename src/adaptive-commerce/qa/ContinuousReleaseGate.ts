import {
  STOREFRONT_RESOURCE_TYPES,
  type RuntimeArtifact,
  type StorefrontResourceType,
} from "@/adaptive-commerce/contracts";
import { ADAPTIVE_QA_FIXTURES, type AdaptiveQaFixture } from "./fixtures";

export const ADAPTIVE_QA_MIN_WIDTH = 320;
export const ADAPTIVE_QA_MAX_WIDTH = 2560;

export type AdaptiveQaIssue = Readonly<{
  code: string;
  severity: "warning" | "blocker";
  message: string;
}>;

export type AdaptiveQaProbeInput = Readonly<{
  artifact: RuntimeArtifact;
  resourceType: StorefrontResourceType;
  width: number;
  fixture: AdaptiveQaFixture;
}>;

export type AdaptiveQaProbe = (
  input: AdaptiveQaProbeInput,
) => readonly AdaptiveQaIssue[] | Promise<readonly AdaptiveQaIssue[]>;

export type AdaptiveQaFinding = AdaptiveQaIssue & Readonly<{
  artifactId: string;
  resourceType: StorefrontResourceType;
  width: number;
  fixtureId: string;
}>;

export type AdaptiveQaReport = Readonly<{
  passed: boolean;
  checkedArtifacts: number;
  checkedRoutes: number;
  checkedWidths: number;
  checkedFixtures: number;
  probeCount: number;
  findings: readonly AdaptiveQaFinding[];
}>;

export const adaptiveQaWidths = (
  step = 1,
  minimum = ADAPTIVE_QA_MIN_WIDTH,
  maximum = ADAPTIVE_QA_MAX_WIDTH,
): number[] => {
  const safeStep = Math.max(1, Math.floor(step));
  const widths: number[] = [];
  for (let width = minimum; width <= maximum; width += safeStep) widths.push(width);
  if (widths.at(-1) !== maximum) widths.push(maximum);
  return widths;
};

export const runContinuousAdaptiveQa = async (input: Readonly<{
  artifacts: readonly RuntimeArtifact[];
  probe: AdaptiveQaProbe;
  fixtures?: readonly AdaptiveQaFixture[];
  widthStep?: number;
}>): Promise<AdaptiveQaReport> => {
  const fixtures = input.fixtures ?? ADAPTIVE_QA_FIXTURES;
  const widths = adaptiveQaWidths(input.widthStep ?? 1);
  const findings: AdaptiveQaFinding[] = [];
  let probeCount = 0;
  for (const artifact of [...input.artifacts].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const resourceType of STOREFRONT_RESOURCE_TYPES) {
      if (!artifact.routes[resourceType]) {
        findings.push({
          artifactId: artifact.id,
          resourceType,
          width: ADAPTIVE_QA_MIN_WIDTH,
          fixtureId: "contract",
          code: "qa.route.missing",
          severity: "blocker",
          message: `${artifact.id} is missing ${resourceType}.`,
        });
        continue;
      }
      for (const fixture of fixtures) {
        for (const width of widths) {
          probeCount += 1;
          const issues = await input.probe({ artifact, resourceType, width, fixture });
          issues.forEach((issue) => findings.push({
            ...issue,
            artifactId: artifact.id,
            resourceType,
            width,
            fixtureId: fixture.id,
          }));
        }
      }
    }
  }
  const ordered = findings.sort((left, right) =>
    left.artifactId.localeCompare(right.artifactId)
      || left.resourceType.localeCompare(right.resourceType)
      || left.fixtureId.localeCompare(right.fixtureId)
      || left.width - right.width
      || left.code.localeCompare(right.code));
  return Object.freeze({
    passed: !ordered.some((finding) => finding.severity === "blocker"),
    checkedArtifacts: input.artifacts.length,
    checkedRoutes: input.artifacts.length * STOREFRONT_RESOURCE_TYPES.length,
    checkedWidths: widths.length,
    checkedFixtures: fixtures.length,
    probeCount,
    findings: Object.freeze(ordered),
  });
};

