import { z } from "zod";
import {
  STOREFRONT_RESOURCE_TYPES,
} from "@/adaptive-commerce/contracts";
import {
  extensionTrustLevelSchema,
  type ExtensionGrant,
  type ExtensionTrustLevel,
} from "@/extension/app-block";
import {
  validateThemeSdkPackage,
  type ThemeSdkValidationOptions,
} from "@/extension/theme-sdk";
import { artifactHashFor } from "@/adaptive-commerce/compiler";
import type {
  ThemeMarketplaceScanIssue,
  ThemeMarketplaceScanReport,
  ThemePackageProvenance,
} from "./contracts";

const integrityHash = /^sha256:[a-f0-9]{64}$/;
const identifier = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const revision = /^[0-9A-Za-z][0-9A-Za-z._:/-]{6,127}$/;

const publisherTrustSchema = z.object({
  publisherId: z.string().regex(identifier),
  status: z.enum(["active", "suspended", "revoked"]),
  verified: z.boolean(),
  allowedTrustLevels: z.array(extensionTrustLevelSchema),
}).strict();

const provenanceSchema = z.object({
  publisherId: z.string().regex(identifier),
  packageId: z.string().regex(identifier),
  packageVersion: z.string().regex(exactVersion),
  subjectHash: z.string().regex(integrityHash),
  sourceRepository: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "Marketplace source repositories must use HTTPS.",
  }),
  sourceRevision: z.string().regex(revision),
  buildId: z.string().min(8).max(160),
  builderId: z.string().regex(identifier),
  builderVersion: z.string().regex(exactVersion),
  builtAt: z.string().datetime(),
}).strict();

export type MarketplacePublisherTrust = Readonly<{
  publisherId: string;
  status: "active" | "suspended" | "revoked";
  verified: boolean;
  allowedTrustLevels: readonly ExtensionTrustLevel[];
}>;

export interface MarketplacePublisherTrustProvider {
  getPublisherTrust(publisherId: string): Promise<MarketplacePublisherTrust | null>;
}

export interface MarketplaceExtensionGrantProvider {
  getCurrentGrant(packageId: string, packageVersion: string): Promise<ExtensionGrant | null>;
}

export type ThemeMarketplaceScanInput = Readonly<{
  submissionId: string;
  packageHash: string;
  package: unknown;
  provenance: ThemePackageProvenance;
}>;

export interface ThemeMarketplaceScanner {
  readonly scannerId: string;
  readonly scannerVersion: string;
  scan(input: ThemeMarketplaceScanInput): Promise<ThemeMarketplaceScanReport>;
}

export type DefaultThemeMarketplaceScannerOptions = Readonly<{
  publisherTrustProvider: MarketplacePublisherTrustProvider;
  grantProvider: MarketplaceExtensionGrantProvider;
  validation?: Omit<ThemeSdkValidationOptions, "grant">;
  now?: () => Date;
}>;

const providerIssue = (provider: string): ThemeMarketplaceScanIssue => ({
  code: `marketplace.provider.${provider}.unavailable`,
  message: `${provider} provider failed; marketplace review fails closed.`,
});

export class DefaultThemeMarketplaceScanner implements ThemeMarketplaceScanner {
  readonly scannerId = "storeblink-theme-marketplace-scanner";
  readonly scannerVersion = "1.0.0";

  constructor(private readonly options: DefaultThemeMarketplaceScannerOptions) {}

  async scan(input: ThemeMarketplaceScanInput): Promise<ThemeMarketplaceScanReport> {
    const issues: ThemeMarketplaceScanIssue[] = [];
    if (!integrityHash.test(input.packageHash)) issues.push({
      code: "marketplace.package.hash-invalid",
      message: "The submission hash must be a canonical SHA-256 identity.",
    });
    try {
      const computedPackageHash = artifactHashFor(input.package);
      if (computedPackageHash !== input.packageHash) issues.push({
        code: "marketplace.package.hash-mismatch",
        message: "The submitted package bytes do not match the immutable submission hash.",
      });
    } catch {
      issues.push({
        code: "marketplace.package.non-canonical",
        message: "Marketplace packages must be canonical JSON before scanning.",
      });
    }
    const rawBlueprints = input.package && typeof input.package === "object"
      ? (input.package as { blueprints?: unknown }).blueprints
      : null;
    STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
      const blueprint = rawBlueprints && typeof rawBlueprints === "object"
        ? (rawBlueprints as Record<string, unknown>)[resourceType]
        : null;
      if (
        !blueprint ||
        typeof blueprint !== "object" ||
        (blueprint as { resourceType?: unknown }).resourceType !== resourceType
      ) issues.push({
        code: "marketplace.route-coverage.missing",
        message: `Package must include an exact ${resourceType} route blueprint.`,
        path: `blueprints.${resourceType}`,
      });
    });
    const provenance = provenanceSchema.safeParse(input.provenance);
    if (!provenance.success) provenance.error.issues.forEach((issue) => issues.push({
      code: "marketplace.provenance.invalid",
      message: issue.message,
      path: issue.path.join("."),
    }));
    if (input.provenance.subjectHash !== input.packageHash) issues.push({
      code: "marketplace.provenance.subject-hash",
      message: "Build provenance does not attest the submitted package hash.",
      path: "provenance.subjectHash",
    });

    let publisherTrust: MarketplacePublisherTrust | null = null;
    let grant: ExtensionGrant | null = null;
    let publisherTrustUnavailable = false;
    let publisherTrustEvidenceInvalid = false;
    try {
      const rawTrust = await this.options.publisherTrustProvider
        .getPublisherTrust(input.provenance.publisherId);
      if (rawTrust) {
        const parsedTrust = publisherTrustSchema.safeParse(rawTrust);
        if (parsedTrust.success) {
          publisherTrust = parsedTrust.data as MarketplacePublisherTrust;
        }
        else {
          publisherTrustEvidenceInvalid = true;
          issues.push({
            code: "marketplace.publisher.evidence-invalid",
            message: "Publisher trust evidence is malformed; marketplace review fails closed.",
          });
        }
      }
    } catch {
      publisherTrustUnavailable = true;
      issues.push(providerIssue("publisher-trust"));
    }
    try {
      grant = await this.options.grantProvider.getCurrentGrant(
        input.provenance.packageId,
        input.provenance.packageVersion,
      );
    } catch {
      issues.push(providerIssue("extension-grant"));
    }

    const validation = validateThemeSdkPackage(input.package, {
      ...this.options.validation,
      grant,
    });
    validation.issues.forEach((issue) => issues.push(issue));
    const packageValue = validation.package;

    if (!publisherTrust && !publisherTrustUnavailable && !publisherTrustEvidenceInvalid) issues.push({
      code: "marketplace.publisher.not-found",
      message: "Publisher trust record was not found.",
    });
    if (publisherTrust && publisherTrust.publisherId !== input.provenance.publisherId) {
      issues.push({
        code: "marketplace.publisher.identity",
        message: "Publisher trust evidence belongs to a different publisher.",
      });
    }
    if (publisherTrust && (publisherTrust.status !== "active" || !publisherTrust.verified)) {
      issues.push({
        code: "marketplace.publisher.not-trusted",
        message: "Publisher must be active and verified before human review.",
      });
    }
    if (packageValue) {
      const manifest = packageValue.manifest;
      if (
        manifest.publisherId !== input.provenance.publisherId ||
        manifest.id !== input.provenance.packageId ||
        manifest.version !== input.provenance.packageVersion
      ) issues.push({
        code: "marketplace.provenance.identity",
        message: "Manifest identity does not match build provenance.",
      });
      if (
        publisherTrust &&
        !publisherTrust.allowedTrustLevels.includes(manifest.trustLevel)
      ) issues.push({
        code: "marketplace.publisher.trust-level",
        message: `Publisher is not authorized for ${manifest.trustLevel} packages.`,
      });

    }

    return Object.freeze({
      passed: issues.length === 0,
      scannerId: this.scannerId,
      scannerVersion: this.scannerVersion,
      packageHash: input.packageHash,
      issues: Object.freeze(structuredClone(issues)),
      completedAt: (this.options.now ?? (() => new Date()))().toISOString(),
    });
  }
}
