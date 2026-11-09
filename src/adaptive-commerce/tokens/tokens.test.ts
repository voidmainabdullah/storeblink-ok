import { describe, expect, it } from "vitest";
import {
  tokenAddress,
  tokenLiteral,
  type DesignTokenSet,
  type MerchantDesignTokenOverrides,
} from "@/adaptive-commerce/contracts";
import { UNIVERSAL_THEME_TOKENS } from "@/theme-engine/contracts/defaults";
import {
  ADAPTIVE_CASCADE_LAYERS,
  AdaptiveTokenError,
  adaptThemeDesignTokens,
  emitAdaptiveTokenCss,
  resolveDesignTokens,
  tokenCssVariable,
  tokenValueToCss,
} from "./index";

const tokenSet = (): DesignTokenSet => ({
  primitive: {
    "color.palette.brand": tokenLiteral("color", "#2457ff"),
    "space.scale.md": tokenLiteral("dimension", { value: 24, unit: "px" }),
  },
  semantic: {
    "color.action": { $ref: tokenAddress("primitive", "color.palette.brand") },
    "space.section": { $ref: tokenAddress("primitive", "space.scale.md") },
  },
  component: {
    "button.primary.background": { $ref: tokenAddress("semantic", "color.action") },
  },
});

const expectCode = (run: () => unknown, code: AdaptiveTokenError["code"]): void => {
  try {
    run();
    throw new Error("Expected token resolution to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AdaptiveTokenError);
    expect(error).toMatchObject({ code });
  }
};

describe("adaptive design tokens", () => {
  it("resolves primitive to semantic to component aliases deterministically", () => {
    const resolved = resolveDesignTokens(tokenSet());
    expect(resolved.order).toEqual([
      "component:button.primary.background",
      "primitive:color.palette.brand",
      "primitive:space.scale.md",
      "semantic:color.action",
      "semantic:space.section",
    ]);
    expect(resolved.tokens["component:button.primary.background"]).toMatchObject({
      type: "color",
      value: "#2457ff",
      declaredTier: "component",
      overridden: false,
    });
    expect(Object.isFrozen(resolved.tokens)).toBe(true);
  });

  it("applies merchant values only in the explicit override tier and propagates aliases", () => {
    const merchant: MerchantDesignTokenOverrides = {
      presetId: null,
      overrides: [{
        address: tokenAddress("semantic", "color.action"),
        value: tokenLiteral("color", "#ff5a1f"),
      }],
    };
    const resolved = resolveDesignTokens(tokenSet(), merchant);
    expect(resolved.tokens["semantic:color.action"]).toMatchObject({
      value: "#ff5a1f",
      source: "merchant",
      overridden: true,
    });
    expect(resolved.tokens["component:button.primary.background"]).toMatchObject({
      value: "#ff5a1f",
      source: "merchant",
      overridden: true,
    });

    const css = emitAdaptiveTokenCss(tokenSet(), merchant);
    expect(css).toContain("@layer merchant {");
    expect(css).toContain("--sb-color-action: #ff5a1f;");
    expect(css).toContain("--sb-button-primary-background: var(--sb-color-action);");
  });

  it("emits stable StoreBlink variables in the fixed cascade order", () => {
    const reversed: DesignTokenSet = {
      primitive: Object.fromEntries(Object.entries(tokenSet().primitive).reverse()),
      semantic: Object.fromEntries(Object.entries(tokenSet().semantic).reverse()),
      component: tokenSet().component,
    };
    const css = emitAdaptiveTokenCss(tokenSet());
    expect(emitAdaptiveTokenCss(reversed)).toBe(css);
    expect(css.startsWith(`@layer ${ADAPTIVE_CASCADE_LAYERS.join(", ")};`)).toBe(true);
    const layerPositions = ADAPTIVE_CASCADE_LAYERS.map((layer) => css.indexOf(`@layer ${layer} {`));
    expect(layerPositions.every((position) => position >= 0)).toBe(true);
    expect(layerPositions).toEqual([...layerPositions].sort((left, right) => left - right));
    expect(css).not.toContain("!important");
    expect([...css.matchAll(/--[^:]+:/g)].every(([name]) => name.startsWith("--sb-"))).toBe(true);
  });

  it("adapts existing ThemeDesignTokens without changing the legacy contract", () => {
    const before = structuredClone(UNIVERSAL_THEME_TOKENS);
    const adapted = adaptThemeDesignTokens(UNIVERSAL_THEME_TOKENS);
    const resolved = resolveDesignTokens(adapted);
    expect(UNIVERSAL_THEME_TOKENS).toEqual(before);
    expect(resolved.tokens["component:button.primary.background"].value)
      .toBe(UNIVERSAL_THEME_TOKENS.colors.primary);
    expect(resolved.tokens["component:text.display"].type).toBe("dimension");
    expect(emitAdaptiveTokenCss(adapted)).toContain("--sb-motion-easing");
  });

  it("formats DTCG-style dimension and cubic-bezier values", () => {
    expect(tokenValueToCss("dimension", { value: 1.5, unit: "rem" })).toBe("1.5rem");
    expect(tokenValueToCss("cubicBezier", [0.22, 1, 0.36, 1]))
      .toBe("cubic-bezier(0.22, 1, 0.36, 1)");
  });

  it("rejects missing references", () => {
    const input = tokenSet();
    input.semantic["color.action"] = { $ref: tokenAddress("primitive", "color.palette.missing") };
    expectCode(() => resolveDesignTokens(input), "TOKEN_REFERENCE_MISSING");
  });

  it("rejects reference cycles", () => {
    const input = tokenSet();
    input.semantic["color.action"] = { $ref: tokenAddress("semantic", "color.secondary") };
    input.semantic["color.secondary"] = { $ref: tokenAddress("semantic", "color.action") };
    expectCode(() => resolveDesignTokens(input), "TOKEN_REFERENCE_CYCLE");
  });

  it("rejects references that reach upward through the tier graph", () => {
    const input = tokenSet();
    input.primitive["color.palette.brand"] = { $ref: tokenAddress("semantic", "color.action") };
    expectCode(() => resolveDesignTokens(input), "TOKEN_REFERENCE_DIRECTION");
  });

  it("rejects invalid typed literals and merchant type changes", () => {
    const invalid = tokenSet();
    invalid.primitive["color.palette.brand"] = { $type: "color", $value: 42 };
    expectCode(() => resolveDesignTokens(invalid), "TOKEN_VALUE_INVALID");

    const mismatch: MerchantDesignTokenOverrides = {
      presetId: null,
      overrides: [{
        address: tokenAddress("semantic", "color.action"),
        value: tokenLiteral("dimension", "12px"),
      }],
    };
    expectCode(() => resolveDesignTokens(tokenSet(), mismatch), "TOKEN_TYPE_MISMATCH");
  });

  it("rejects merchant primitive overrides at the contract boundary", () => {
    const primitiveOverride = {
      presetId: null,
      overrides: [{
        address: tokenAddress("primitive", "color.palette.brand"),
        value: tokenLiteral("color", "#ffffff"),
      }],
    } as MerchantDesignTokenOverrides;
    expectCode(() => resolveDesignTokens(tokenSet(), primitiveOverride), "TOKEN_SCHEMA_INVALID");
  });

  it("rejects paths that collapse onto the same CSS variable", () => {
    const input = tokenSet();
    input.primitive["color.a-b.c"] = tokenLiteral("color", "#000000");
    input.primitive["color.a.b-c"] = tokenLiteral("color", "#ffffff");
    expectCode(() => emitAdaptiveTokenCss(input), "TOKEN_CSS_NAME_COLLISION");
  });

  it("rejects unsafe CSS paths and legacy key normalization collisions", () => {
    expectCode(() => tokenCssVariable("color.primary;display:none"), "TOKEN_SCHEMA_INVALID");
    expectCode(() => adaptThemeDesignTokens({
      ...UNIVERSAL_THEME_TOKENS,
      spacing: { xY: "1px", "x-y": "2px" },
    }), "TOKEN_COMPATIBILITY_COLLISION");
  });
});
