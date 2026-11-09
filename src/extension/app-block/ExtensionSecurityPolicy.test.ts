import { describe, expect, it } from "vitest";
import {
  ExtensionSecurityError,
  ExtensionSecurityPolicy,
  createAppBlockDataProjection,
} from "./ExtensionSecurityPolicy";
import { createExtensionGrant, createExtensionManifest } from "./testFixtures";

describe("ExtensionSecurityPolicy", () => {
  it("accepts only capabilities confirmed by an external grant", () => {
    const policy = new ExtensionSecurityPolicy({
      now: () => new Date("2026-08-21T12:30:00.000Z"),
    });
    const trusted = policy.assertDiscoverable(createExtensionManifest(), createExtensionGrant());
    expect(trusted.manifest.namespace).toBe("app/acme/product-promo");
    expect(trusted.grant?.grantedCapabilities).toContain("commerce/cart.add");
    expect(Object.isFrozen(trusted)).toBe(true);
  });

  it("rejects self-granted capabilities and revoked grants", () => {
    const policy = new ExtensionSecurityPolicy();
    expect(() => policy.assertDiscoverable(createExtensionManifest()))
      .toThrow(ExtensionSecurityError);
    const revoked = createExtensionGrant();
    revoked.status = "revoked";
    revoked.revokedAt = "2026-08-21T13:00:00.000Z";
    revoked.revocationReason = "Malicious message traffic";
    expect(policy.evaluate(createExtensionManifest(), revoked).issues.map((issue) => issue.code))
      .toContain("extension.revoked");
  });

  it("rejects grants that are not yet active or have incoherent time bounds", () => {
    const grant = createExtensionGrant();
    grant.issuedAt = "2026-08-22T00:00:00.000Z";
    const policy = new ExtensionSecurityPolicy({
      now: () => new Date("2026-08-21T12:30:00.000Z"),
    });
    expect(policy.evaluate(createExtensionManifest(), grant).issues)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "extension.grant.not-yet-active" }),
      ]));

    grant.expiresAt = "2026-08-21T00:00:00.000Z";
    expect(policy.evaluate(createExtensionManifest(), grant).issues)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "extension.grant.invalid" }),
      ]));
  });

  it("enforces trust-level capabilities, namespace ownership, and compiled React policy", () => {
    const manifest = createExtensionManifest();
    manifest.requestedCapabilities.push("merchant/settings.read");
    manifest.namespace = "app/another-publisher/product-promo";
    manifest.compiledReact = true;
    const grant = createExtensionGrant();
    grant.grantedCapabilities.push("merchant/settings.read");
    manifest.grantedCapabilities.push("merchant/settings.read");
    const codes = new ExtensionSecurityPolicy().evaluate(manifest, grant)
      .issues.map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining([
      "extension.capability.not-requestable",
      "extension.namespace.invalid",
      "extension.compiled-react.forbidden",
    ]));
  });

  it("rejects package asset traversal and app blocks without an external render grant", () => {
    const traversal = createExtensionManifest();
    traversal.assets.push({
      id: "escape",
      type: "other",
      path: "assets/../escape.txt",
      integrity: `sha256:${"a".repeat(64)}`,
    });
    expect(new ExtensionSecurityPolicy().evaluate(traversal, createExtensionGrant()).issues)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "extension.manifest.invalid" }),
      ]));

    const manifest = createExtensionManifest();
    const grant = createExtensionGrant();
    manifest.grantedCapabilities = manifest.grantedCapabilities
      .filter((entry) => entry !== "app/render");
    grant.grantedCapabilities = grant.grantedCapabilities
      .filter((entry) => entry !== "app/render");
    expect(new ExtensionSecurityPolicy().evaluate(manifest, grant).issues)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "extension.app-block.render-capability" }),
      ]));
  });

  it("creates a minimal deeply frozen projection and enforces its byte quota", () => {
    const source = {
      store: { name: "Demo", currency: "USD" },
      product: { id: "p1", title: "Product", price: "$10.00" },
      products: [{ id: "p1", title: "Product", price: "$10.00" }],
      cart: { itemCount: 2 },
      merchantSettings: { secret: "not granted" },
    };
    const projection = createAppBlockDataProjection(
      source,
      ["commerce/products.read"],
      10_000,
    );
    expect(projection.store).toBeNull();
    expect(projection.product?.id).toBe("p1");
    expect(projection.cart).toBeNull();
    expect(projection.merchantSettings).toEqual({});
    expect(Object.isFrozen(projection.product)).toBe(true);
    expect(() => createAppBlockDataProjection(source, ["commerce/products.read"], 20))
      .toThrow(/data exceeds/);
  });
});
