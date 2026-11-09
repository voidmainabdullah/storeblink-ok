import { describe, expect, it } from "vitest";
import type { JsonValue } from "@/adaptive-commerce/contracts";
import { commerceBindingSchema } from "../contracts/commerceBinding";
import { semanticPathSchema } from "../contracts/identifiers";
import {
  CommerceBindingEngine,
  CommerceBindingResolutionError,
} from "./CommerceBindingEngine";

const binding = commerceBindingSchema.parse({
  id: "product-title",
  source: { kind: "product", selector: "featured" },
  field: "title",
  target: {
    path: semanticPathSchema.parse("home.featured-products"),
    property: "text",
  },
  required: true,
});

describe("CommerceBindingEngine", () => {
  it("projects live data through the props channel only", () => {
    const engine = new CommerceBindingEngine();
    const projection = engine.resolve(binding, {
      product: { featured: { title: "Summer dress" } },
    });
    expect(projection).toEqual({
      bindingId: "product-title",
      targetPath: "home.featured-products",
      channel: "props",
      props: { text: "Summer dress" },
      usedFallback: false,
    });
    expect(projection).not.toHaveProperty("style");
    expect(projection).not.toHaveProperty("layout");
    expect(projection).not.toHaveProperty("transform");
  });

  it("rejects non-content targets at the contract boundary", () => {
    const unsafe = structuredClone(binding) as any;
    unsafe.target.property = "style";
    expect(() => new CommerceBindingEngine().compile(unsafe)).toThrow();
  });

  it("fails missing semantic targets and duplicate binding IDs closed", () => {
    const engine = new CommerceBindingEngine();
    expect(() => engine.compile(binding, new Set(["home.hero"]))).toThrow(
      /missing semantic path/,
    );
    expect(() => engine.compileAll([binding, binding])).toThrow(/Duplicate/);
  });

  it("uses declared fallbacks and rejects unresolved required data", () => {
    const engine = new CommerceBindingEngine();
    const fallback = commerceBindingSchema.parse({
      ...structuredClone(binding),
      id: "product-label",
      fallback: "Product",
    });
    expect(engine.resolve(fallback, {})).toMatchObject({
      props: { text: "Product" },
      usedFallback: true,
    });
    expect(() => engine.resolve(binding, {})).toThrow(
      CommerceBindingResolutionError,
    );
  });

  it("does not traverse inherited values or mutate binding input", () => {
    const engine = new CommerceBindingEngine();
    const source = Object.create({ title: "prototype value" }) as Record<string, JsonValue>;
    const snapshot = structuredClone(binding);
    expect(() => engine.resolve(binding, { product: { featured: source } })).toThrow(
      CommerceBindingResolutionError,
    );
    expect(binding).toEqual(snapshot);
  });
});
