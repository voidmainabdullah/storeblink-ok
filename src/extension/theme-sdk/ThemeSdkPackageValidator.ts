import {
  AdaptiveCommerceRegistry,
  STOREFRONT_RESOURCE_TYPES,
  type StorefrontResourceType,
} from "@/adaptive-commerce";
import { artifactHashFor, canonicalJson } from "@/adaptive-commerce/compiler";
import { MerchantPatchSystem } from "@/adaptive-commerce/patches";
import {
  ExtensionSecurityPolicy,
  type ExtensionGrant,
} from "@/extension/app-block";
import {
  themeSdkPackageSchema,
  type ThemeSdkPackage,
} from "./contracts";

export type ThemeSdkValidationIssue = Readonly<{
  code: string;
  message: string;
  path?: string;
}>;

export type ThemeSdkValidationReport = Readonly<{
  valid: boolean;
  issues: readonly ThemeSdkValidationIssue[];
  package: ThemeSdkPackage | null;
}>;

export type ThemeSdkValidationOptions = Readonly<{
  securityPolicy?: ExtensionSecurityPolicy;
  grant?: ExtensionGrant | null;
  engineSchemaVersion?: number;
  tokenSchemaVersion?: "2025.10";
  capabilityPolicyVersion?: string;
  supportedCapabilities?: readonly string[];
}>;

const packagePayload = <T extends { integrity?: string }>(value: T): Omit<T, "integrity"> => {
  const clone = structuredClone(value) as T & { integrity?: string };
  delete clone.integrity;
  return clone;
};

export const themePackageIntegrity = (value: { integrity?: string }): string =>
  artifactHashFor(packagePayload(value));

const exactReference = (
  reference: { id?: string; version?: string; integrity?: string },
  value: { id?: string; version?: string; integrity?: string },
): boolean => reference.id === value.id &&
  reference.version === value.version &&
  reference.integrity === value.integrity;

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
  return Object.freeze(value);
};

export class ThemeSdkValidationError extends Error {
  readonly report: ThemeSdkValidationReport;

  constructor(report: ThemeSdkValidationReport) {
    super(report.issues[0]?.message ?? "Theme SDK package is invalid.");
    this.name = "ThemeSdkValidationError";
    this.report = structuredClone(report);
  }
}

export const validateThemeSdkPackage = (
  rawPackage: unknown,
  options: ThemeSdkValidationOptions = {},
): ThemeSdkValidationReport => {
  const parsed = themeSdkPackageSchema.safeParse(rawPackage);
  if (!parsed.success) return {
    valid: false,
    issues: parsed.error.issues.map((issue) => ({
      code: "theme-sdk.schema.invalid",
      message: issue.message,
      path: issue.path.join("."),
    })),
    package: null,
  };
  const value = parsed.data as ThemeSdkPackage;
  const issues: ThemeSdkValidationIssue[] = [];
  const security = (options.securityPolicy ?? new ExtensionSecurityPolicy())
    .evaluate(value.manifest, options.grant ?? null);
  security.issues.forEach((issue) => issues.push(issue));
  if (value.manifest.packageType !== "theme") issues.push({
    code: "theme-sdk.manifest.type",
    message: "Theme SDK packages require a theme extension manifest.",
  });
  if (!value.manifest.storeKit || !exactReference(value.manifest.storeKit, value.storeKit)) {
    issues.push({
      code: "theme-sdk.manifest.store-kit",
      message: "Extension manifest does not pin the included StoreKit exactly.",
    });
  }

  const integrityValues = [
    ["designPack", value.designPack],
    ["componentLibrary", value.componentLibrary],
    ...STOREFRONT_RESOURCE_TYPES.map((resourceType) => [
      `blueprints.${resourceType}`,
      value.blueprints[resourceType],
    ] as const),
    ["storeKit", value.storeKit],
  ] as const;
  integrityValues.forEach(([path, packageValue]) => {
    const expected = themePackageIntegrity(packageValue);
    if (packageValue.integrity !== expected) issues.push({
      code: "theme-sdk.integrity",
      message: `${path} integrity is ${packageValue.integrity}; expected ${expected}.`,
      path,
    });
  });

  if (!exactReference(value.storeKit.lockfile.designPack, value.designPack)) issues.push({
    code: "theme-sdk.lock.design-pack",
    message: "StoreKit does not pin the included DesignPack exactly.",
  });
  if (!exactReference(value.storeKit.lockfile.componentLibrary, value.componentLibrary)) issues.push({
    code: "theme-sdk.lock.component-library",
    message: "StoreKit does not pin the included ComponentLibrary exactly.",
  });
  STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
    const blueprint = value.blueprints[resourceType];
    if (blueprint.resourceType !== resourceType) issues.push({
      code: "theme-sdk.blueprint.resource",
      message: `${resourceType} package contains a ${blueprint.resourceType} blueprint.`,
      path: `blueprints.${resourceType}`,
    });
    if (!exactReference(value.storeKit.lockfile.blueprints[resourceType], blueprint)) issues.push({
      code: "theme-sdk.lock.blueprint",
      message: `StoreKit does not pin the included ${resourceType} blueprint exactly.`,
      path: `storeKit.lockfile.blueprints.${resourceType}`,
    });
  });

  try {
    const registry = new AdaptiveCommerceRegistry({
      engineSchemaVersion: options.engineSchemaVersion ?? value.storeKit.lockfile.engineSchemaVersion,
      tokenSchemaVersion: options.tokenSchemaVersion ?? "2025.10",
      capabilityPolicyVersion: options.capabilityPolicyVersion ?? value.storeKit.lockfile.capabilityPolicyVersion,
      supportedCapabilities: options.supportedCapabilities ?? value.storeKit.requiredCapabilities,
    });
    registry.registerDesignPack(value.designPack);
    registry.registerComponentLibrary(value.componentLibrary);
    STOREFRONT_RESOURCE_TYPES.forEach((resourceType) =>
      registry.registerTemplateBlueprint(value.blueprints[resourceType]));
    registry.registerStoreKit(value.storeKit);
    const report = registry.validateInstallable(value.storeKit.id, value.storeKit.version);
    report.issues.forEach((issue) => issues.push({
      code: `theme-sdk.${issue.code}`,
      message: issue.message,
      path: issue.path,
    }));
  } catch (error) {
    issues.push({
      code: "theme-sdk.registry.invalid",
      message: error instanceof Error ? error.message : "Theme registry validation failed.",
    });
  }

  const patchSystem = new MerchantPatchSystem();
  value.migrationFixtures.forEach((fixture, index) => {
    try {
      const actual = patchSystem.mergeBases(
        fixture.oldBase,
        fixture.newBase,
        fixture.merchantPatches,
        fixture.renames,
      );
      if (
        actual.status !== fixture.expected.status ||
        actual.publishable !== fixture.expected.publishable ||
        actual.conflicts.length !== fixture.expected.conflictCount ||
        canonicalJson(actual.candidate) !== canonicalJson(fixture.expected.candidate)
      ) issues.push({
        code: "theme-sdk.migration.fixture",
        message: `Migration fixture ${fixture.id} output does not match its expected result.`,
        path: `migrationFixtures.${index}`,
      });
    } catch (error) {
      issues.push({
        code: "theme-sdk.migration.failed",
        message: `Migration fixture ${fixture.id} failed: ${error instanceof Error ? error.message : "unknown error"}.`,
        path: `migrationFixtures.${index}`,
      });
    }
  });

  return {
    valid: issues.length === 0,
    issues: structuredClone(issues),
    package: structuredClone(value),
  };
};

export const assertValidThemeSdkPackage = (
  rawPackage: unknown,
  options: ThemeSdkValidationOptions = {},
): Readonly<ThemeSdkPackage> => {
  const report = validateThemeSdkPackage(rawPackage, options);
  if (!report.valid || !report.package) throw new ThemeSdkValidationError(report);
  return deepFreeze(report.package);
};
