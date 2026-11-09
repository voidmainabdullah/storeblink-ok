import { describe, expect, it } from "vitest";
import { artifactHashFor } from "@/adaptive-commerce/compiler";
import type { ExtensionGrant } from "@/extension/app-block";
import { createThemeSdkPackage } from "@/extension/theme-sdk/testFixtures";
import {
  DefaultThemeMarketplaceScanner,
  type MarketplacePublisherTrustProvider,
  type MarketplaceExtensionGrantProvider,
} from "./ThemeMarketplaceScanner";
import type { ThemePackageProvenance } from "./contracts";

const activePublisher: MarketplacePublisherTrustProvider = {
  async getPublisherTrust(publisherId) {
    return {
      publisherId,
      status: "active",
      verified: true,
      allowedTrustLevels: ["declarative"],
    };
  },
};

const noGrant: MarketplaceExtensionGrantProvider = {
  async getCurrentGrant() {
    return null;
  },
};

const provenanceFor = (packageValue: ReturnType<typeof createThemeSdkPackage>): ThemePackageProvenance => ({
  publisherId: packageValue.manifest.publisherId,
  packageId: packageValue.manifest.id,
  packageVersion: packageValue.manifest.version,
  subjectHash: artifactHashFor(packageValue),
  sourceRepository: "https://github.com/storeblink/professional-store",
  sourceRevision: "0123456789abcdef0123456789abcdef01234567",
  buildId: "build-20260821-0001",
  builderId: "storeblink-theme-cli",
  builderVersion: "1.0.0",
  builtAt: "2026-08-21T00:00:00.000Z",
});

describe("DefaultThemeMarketplaceScanner", () => {
  it("combines the Theme SDK validator, all-eight-route coverage, publisher trust, and provenance", async () => {
    const packageValue = createThemeSdkPackage();
    const scanner = new DefaultThemeMarketplaceScanner({
      publisherTrustProvider: activePublisher,
      grantProvider: noGrant,
      now: () => new Date("2026-08-21T01:00:00.000Z"),
    });

    const report = await scanner.scan({
      submissionId: "submission-1",
      packageHash: artifactHashFor(packageValue),
      package: packageValue,
      provenance: provenanceFor(packageValue),
    });

    expect(report).toEqual(expect.objectContaining({
      passed: true,
      packageHash: artifactHashFor(packageValue),
      issues: [],
    }));
  });

  it("rejects missing route coverage and mismatched build provenance", async () => {
    const packageValue = createThemeSdkPackage();
    delete (packageValue.blueprints as Partial<typeof packageValue.blueprints>).cart;
    const packageHash = artifactHashFor(packageValue);
    const provenance = {
      ...provenanceFor(createThemeSdkPackage()),
      subjectHash: `sha256:${"a".repeat(64)}`,
    };
    const scanner = new DefaultThemeMarketplaceScanner({
      publisherTrustProvider: activePublisher,
      grantProvider: noGrant,
    });

    const report = await scanner.scan({
      submissionId: "submission-1",
      packageHash,
      package: packageValue,
      provenance,
    });

    expect(report.passed).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "marketplace.route-coverage.missing",
      "marketplace.provenance.subject-hash",
      "theme-sdk.schema.invalid",
    ]));
  });

  it("enforces trust, capability, namespace, and quota policy through the existing security validator", async () => {
    const packageValue = createThemeSdkPackage();
    packageValue.manifest.namespace = "theme/wrong-package";
    packageValue.manifest.requestedCapabilities = ["platform/compiled-react"];
    const grant: ExtensionGrant = {
      kind: "storeblink-extension-grant",
      schemaVersion: 1,
      extensionId: packageValue.manifest.id,
      extensionVersion: packageValue.manifest.version,
      trustLevel: "declarative",
      grantedCapabilities: [],
      quotas: { ...packageValue.manifest.requestedQuotas, maxBlocks: 1 },
      status: "active",
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
      revocationReason: null,
    };
    const scanner = new DefaultThemeMarketplaceScanner({
      publisherTrustProvider: {
        async getPublisherTrust(publisherId) {
          return {
            publisherId,
            status: "active",
            verified: true,
            allowedTrustLevels: ["sandboxed"],
          };
        },
      },
      grantProvider: { async getCurrentGrant() { return grant; } },
    });
    const provenance = provenanceFor(packageValue);
    const report = await scanner.scan({
      submissionId: "submission-1",
      packageHash: provenance.subjectHash,
      package: packageValue,
      provenance,
    });

    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "extension.capability.not-requestable",
      "extension.namespace.invalid",
      "extension.quota.escalation",
      "marketplace.publisher.trust-level",
    ]));
  });

  it("fails closed when a trust provider is unavailable", async () => {
    const packageValue = createThemeSdkPackage();
    const scanner = new DefaultThemeMarketplaceScanner({
      publisherTrustProvider: {
        async getPublisherTrust() { throw new Error("provider offline"); },
      },
      grantProvider: noGrant,
    });
    const provenance = provenanceFor(packageValue);

    const report = await scanner.scan({
      submissionId: "submission-1",
      packageHash: provenance.subjectHash,
      package: packageValue,
      provenance,
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "marketplace.provider.publisher-trust.unavailable" }),
    ]));
  });

  it("recomputes the immutable package hash and binds trust evidence to the publisher", async () => {
    const packageValue = createThemeSdkPackage();
    const claimedHash = `sha256:${"b".repeat(64)}`;
    const scanner = new DefaultThemeMarketplaceScanner({
      publisherTrustProvider: {
        async getPublisherTrust() {
          return {
            publisherId: "different-publisher",
            status: "active",
            verified: true,
            allowedTrustLevels: ["declarative"],
          };
        },
      },
      grantProvider: noGrant,
    });

    const report = await scanner.scan({
      submissionId: "submission-1",
      packageHash: claimedHash,
      package: packageValue,
      provenance: { ...provenanceFor(packageValue), subjectHash: claimedHash },
    });

    expect(report.passed).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "marketplace.package.hash-mismatch",
      "marketplace.publisher.identity",
    ]));
  });
});
