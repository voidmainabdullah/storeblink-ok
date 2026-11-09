import { describe, expect, it } from "vitest";
import {
  storeKitSchema,
  semanticPath,
  templateBlueprintSchema,
  tokenAddress,
  type DesignPack,
  type StoreKit,
  type StorefrontResourceType,
  type TemplateBlueprint,
} from "@/adaptive-commerce/contracts";
import {
  HASH_D,
  createBlueprint,
  createComponentLibrary,
  createDesignPack,
  createRegistry,
  createStoreKit,
} from "@/adaptive-commerce/testing/fixtures";
import { AdaptiveCommerceRegistry, StoreKitInstallabilityError } from "./AdaptiveCommerceRegistry";

const resourceTypes = [
  "home", "product", "collection", "page", "blog", "cart", "search", "404",
] as const;

const registryWith = (options: {
  designPack?: DesignPack;
  blueprints?: Partial<Record<StorefrontResourceType, TemplateBlueprint>>;
  storeKit?: StoreKit;
} = {}): AdaptiveCommerceRegistry => {
  const registry = new AdaptiveCommerceRegistry({
    engineSchemaVersion: 1,
    tokenSchemaVersion: "2025.10",
    capabilityPolicyVersion: "1.0.0",
    supportedCapabilities: [],
  });
  registry.registerDesignPack(options.designPack ?? createDesignPack());
  registry.registerComponentLibrary(createComponentLibrary());
  resourceTypes.forEach((type) =>
    registry.registerTemplateBlueprint(options.blueprints?.[type] ?? createBlueprint(type)));
  registry.registerStoreKit(options.storeKit ?? createStoreKit());
  return registry;
};

describe("AdaptiveCommerceRegistry", () => {
  it("resolves an exact, complete eight-route StoreKit lock", () => {
    const resolved = createRegistry().resolveInstallable("professional-store", "1.0.0");
    expect(Object.keys(resolved.blueprints).sort()).toEqual([...resourceTypes].sort());
    expect(resolved.blueprints["404"].sections[0].path).toBe("not-found.main");
  });

  it("supports exact parallel versions and returns defensive copies", () => {
    const registry = createRegistry();
    const next = { ...createDesignPack(), version: "1.1.0", integrity: HASH_D };
    registry.registerDesignPack(next);
    const first = registry.getDesignPack("professional-core", "1.0.0");
    const second = registry.getDesignPack("professional-core", "1.1.0");
    expect(first?.version).toBe("1.0.0");
    expect(second?.version).toBe("1.1.0");
    if (first) first.name = "mutated outside registry";
    expect(registry.getDesignPack("professional-core", "1.0.0")?.name)
      .toBe("Professional Core");
    expect(() => registry.registerDesignPack(next)).toThrow(/already registered/);
  });

  it("rejects missing route assignments at the schema boundary", () => {
    const kit = createStoreKit() as StoreKit & { lockfile: { blueprints: Record<string, unknown> } };
    delete kit.lockfile.blueprints.blog;
    expect(() => storeKitSchema.parse(kit)).toThrow();
  });

  it("uses not-found as the canonical 404 semantic namespace", () => {
    const blueprint = createBlueprint("404");
    expect(() => templateBlueprintSchema.parse(blueprint)).not.toThrow();
    blueprint.sections[0].path = semanticPath("page.not-found");
    expect(() => templateBlueprintSchema.parse(blueprint)).toThrow(/not-found/);
  });

  it("reports exact pin integrity and certified component failures", () => {
    const badKit = createStoreKit();
    badKit.lockfile.designPack.integrity = HASH_D;
    const badHome = createBlueprint("home");
    badHome.sections[0].componentId = "unknown-section";
    const report = registryWith({
      blueprints: { home: badHome },
      storeKit: badKit,
    }).validateInstallable("professional-store", "1.0.0");
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "design-pack.integrity",
      "blueprint.component.missing",
    ]));
  });

  it("blocks missing token aliases, illegal direction, and cycles", () => {
    const pack = createDesignPack();
    pack.tokens.semantic["content.foreground"] = {
      $ref: tokenAddress("component", "heading.foreground"),
    };
    pack.tokens.component["heading.foreground"] = {
      $ref: tokenAddress("semantic", "content.foreground"),
    };
    pack.tokens.component["button.foreground"] = {
      $ref: tokenAddress("semantic", "missing.foreground"),
    };
    const report = registryWith({ designPack: pack })
      .validateInstallable("professional-store", "1.0.0");
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "token.reference.direction",
      "token.reference.cycle",
      "token.reference.missing",
    ]));
    expect(() => registryWith({ designPack: pack })
      .resolveInstallable("professional-store", "1.0.0"))
      .toThrow(StoreKitInstallabilityError);
  });
});
