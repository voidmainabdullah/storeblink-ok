import { artifactHashFor } from "@/adaptive-commerce/compiler/sha256";
import type { RuntimeArtifact } from "@/adaptive-commerce/contracts";
import type {
  LegacyShadowProjection,
  ShadowComparableProjection,
  StructuralArtifactDiff,
  StructuralDiffChange,
} from "./types";

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const valueHash = (value: unknown): string => artifactHashFor(value);

const diffValue = (
  before: unknown,
  after: unknown,
  path: string,
  changes: StructuralDiffChange[],
): void => {
  if (Object.is(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    if (valueHash(before) === valueHash(after)) return;
    const beforeMembers = before.map(valueHash);
    const afterMembers = after.map(valueHash);
    if (
      beforeMembers.length === afterMembers.length &&
      [...beforeMembers].sort().every((hash, index) => hash === [...afterMembers].sort()[index])
    ) {
      changes.push({
        kind: "reordered",
        path,
        beforeHash: valueHash(before),
        afterHash: valueHash(after),
      });
      return;
    }
    const length = Math.max(before.length, after.length);
    for (let index = 0; index < length; index += 1) {
      if (index >= before.length) {
        changes.push({ kind: "added", path: `${path}.${index}`, beforeHash: null, afterHash: valueHash(after[index]) });
      } else if (index >= after.length) {
        changes.push({ kind: "removed", path: `${path}.${index}`, beforeHash: valueHash(before[index]), afterHash: null });
      } else {
        diffValue(before[index], after[index], `${path}.${index}`, changes);
      }
    }
    return;
  }
  if (isObject(before) && isObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    keys.forEach((key) => {
      const childPath = path ? `${path}.${key}` : key;
      if (!Object.prototype.hasOwnProperty.call(before, key)) {
        changes.push({ kind: "added", path: childPath, beforeHash: null, afterHash: valueHash(after[key]) });
      } else if (!Object.prototype.hasOwnProperty.call(after, key)) {
        changes.push({ kind: "removed", path: childPath, beforeHash: valueHash(before[key]), afterHash: null });
      } else {
        diffValue(before[key], after[key], childPath, changes);
      }
    });
    return;
  }
  changes.push({
    kind: "changed",
    path,
    beforeHash: valueHash(before),
    afterHash: valueHash(after),
  });
};

export const projectRuntimeArtifact = (artifact: RuntimeArtifact): ShadowComparableProjection =>
  structuredClone({
    routes: artifact.routes,
    globals: artifact.globals,
    resolvedTokens: artifact.resolvedTokens,
    componentVersions: artifact.componentVersions,
    bindingPlans: artifact.bindingPlans,
    assets: artifact.assets,
  });

export const compareShadowArtifacts = (
  legacy: LegacyShadowProjection,
  adaptive: RuntimeArtifact,
): StructuralArtifactDiff => {
  const adaptiveProjection = projectRuntimeArtifact(adaptive);
  const adaptiveHash = valueHash(adaptiveProjection);
  const uncomparableRoutes = [...new Set(legacy.uncomparableRoutes)].sort();
  if (!legacy.projection || uncomparableRoutes.length > 0) {
    return Object.freeze({
      status: "uncomparable",
      legacyHash: legacy.projection ? valueHash(legacy.projection) : null,
      adaptiveHash,
      uncomparableRoutes,
      changes: [],
      reason: legacy.reason ?? "Legacy runtime contains opaque route rendering.",
    });
  }
  const changes: StructuralDiffChange[] = [];
  diffValue(legacy.projection, adaptiveProjection, "storefront", changes);
  return Object.freeze({
    status: changes.length === 0 ? "equal" : "different",
    legacyHash: valueHash(legacy.projection),
    adaptiveHash,
    uncomparableRoutes: [],
    changes: Object.freeze(changes),
    reason: null,
  });
};

