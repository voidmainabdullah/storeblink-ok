import { describe, expect, it } from "vitest";
import { adaptiveComponentLibrarySchema } from "../contracts/componentLibrary";
import { CertifiedComponentRegistry } from "./CertifiedComponentRegistry";
import {
  CERTIFIED_COMPONENT_DEFINITIONS,
  STOREFRONT_CERTIFIED_COMPONENT_LIBRARY,
} from "./certifiedLibrary";

describe("certified adaptive component catalog", () => {
  it("provides versioned slots, variants, customization and structural a11y", () => {
    expect(CERTIFIED_COMPONENT_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "site-header",
      "site-footer",
      "hero",
      "product-grid",
      "product-gallery",
      "product-information",
      "collection-grid",
      "cart",
      "search-results",
      "recommendations",
      "rich-text",
      "blog-article",
      "not-found",
    ]);
    for (const definition of CERTIFIED_COMPONENT_DEFINITIONS) {
      expect(definition.version).toBe("1.0.0");
      expect(definition.variants.length).toBeGreaterThan(0);
      expect(definition.slots.length).toBeGreaterThan(0);
      expect(definition.a11y).toBeDefined();
      expect(definition.customization.allowFreeform).toBe(false);
    }
    expect(STOREFRONT_CERTIFIED_COMPONENT_LIBRARY.integrity).toMatch(
      /^sha256:[a-f0-9]{64}$/,
    );
  });

  it("rejects a component library when accessibility is omitted", () => {
    const broken = structuredClone(STOREFRONT_CERTIFIED_COMPONENT_LIBRARY) as any;
    delete broken.components.hero.a11y;
    expect(adaptiveComponentLibrarySchema.safeParse(broken).success).toBe(false);
  });

  it("returns defensive copies and rejects the same pinned library twice", () => {
    const registry = new CertifiedComponentRegistry();
    registry.register(STOREFRONT_CERTIFIED_COMPONENT_LIBRARY);
    expect(() => registry.register(STOREFRONT_CERTIFIED_COMPONENT_LIBRARY)).toThrow(
      /already registered/,
    );
    const first = registry.getComponent(
      "storeblink-certified",
      "1.0.0",
      "product-information",
    );
    expect(first?.customization.editableSlots).toEqual(["extra-content"]);
    first!.name = "Mutated";
    expect(
      registry.getComponent("storeblink-certified", "1.0.0", "product-information")?.name,
    ).toBe("Product information");
  });
});

