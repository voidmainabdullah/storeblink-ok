import { describe, expect, it } from "vitest";
import { ThemeSdkDiscoveryRegistry } from "./ThemeSdkDiscoveryRegistry";
import {
  ThemeSdkValidationError,
  assertValidThemeSdkPackage,
  validateThemeSdkPackage,
} from "./ThemeSdkPackageValidator";
import { createThemeGrant, createThemeSdkPackage } from "./testFixtures";

const registry = () => new ThemeSdkDiscoveryRegistry({
  engineSchemaVersion: 1,
  tokenSchemaVersion: "2025.10",
  capabilityPolicyVersion: "1.0.0",
  supportedCapabilities: [],
});

describe("Theme SDK package validation", () => {
  it("accepts a self-contained exact StoreKit with all eight routes and migration fixtures", () => {
    const value = assertValidThemeSdkPackage(createThemeSdkPackage());
    expect(Object.keys(value.blueprints).sort()).toEqual([
      "404", "blog", "cart", "collection", "home", "page", "product", "search",
    ]);
    expect(value.blueprints["404"].sections[0].path).toBe("not-found.main");
    expect(value.migrationFixtures[0].expected.publishable).toBe(true);
  });

  it("fails closed on content tampering or a wrong migration expectation", () => {
    const tampered = createThemeSdkPackage();
    tampered.designPack.name = "Tampered after hashing";
    tampered.migrationFixtures[0].expected.candidate.values = {};
    const codes = validateThemeSdkPackage(tampered).issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      "theme-sdk.integrity",
      "theme-sdk.migration.fixture",
    ]));
    expect(() => assertValidThemeSdkPackage(tampered)).toThrow(ThemeSdkValidationError);
  });

  it("does not expose a package in discovery until every check passes", () => {
    const catalog = registry();
    const invalid = createThemeSdkPackage();
    invalid.storeKit.lockfile.blueprints.home.integrity = `sha256:${"f".repeat(64)}`;
    expect(() => catalog.discover(invalid)).toThrow();
    expect(catalog.get("professional-store", "1.0.0")).toBeNull();
    catalog.discover(createThemeSdkPackage());
    expect(catalog.resolveInstallable("professional-store", "1.0.0").blueprints.blog.resourceType)
      .toBe("blog");
  });

  it("re-evaluates revocation immediately before installation", () => {
    const catalog = registry();
    catalog.discover(createThemeSdkPackage(), createThemeGrant());
    const revoked = createThemeGrant();
    revoked.status = "revoked";
    revoked.revokedAt = "2026-08-21T13:00:00.000Z";
    revoked.revocationReason = "Publisher access revoked";
    expect(() => catalog.resolveInstallable("professional-store", "1.0.0", revoked))
      .toThrow(/revoked/);
  });
});
