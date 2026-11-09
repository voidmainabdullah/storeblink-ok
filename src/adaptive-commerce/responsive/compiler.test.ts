import { describe, expect, it } from "vitest";
import {
  ResponsivePrimitiveError,
  compileResponsivePrimitive,
  fluidClampCss,
  resolveContainerQueryVariant,
  type ContainerPrimitive,
  type FluidClampValue,
  type ResponsiveCompileContext,
  type ResponsivePrimitive,
} from "./index";

const context: ResponsiveCompileContext = {
  direction: "ltr",
  viewportInlineSize: 1_440,
  containerInlineSize: 720,
};

const fluid = (
  basis: FluidClampValue["preferred"]["basis"] = "container-inline",
): FluidClampValue => ({
  kind: "fluid-clamp",
  min: 0,
  preferred: { base: 4, scale: 2, basis },
  max: 40,
});

describe("responsive primitive compiler", () => {
  it("keeps a long-copy Stack intrinsic, wrapping, and existing-layout compatible", () => {
    const compiled = compileResponsivePrimitive({
      id: "long-copy-stack",
      kind: "Stack",
      axis: "block",
      gap: fluid(),
      padding: { inlineStart: 24, inlineEnd: 16, blockStart: 8, blockEnd: 12 },
    }, context);
    expect(compiled.layout).toMatchObject({
      mode: "vertical",
      sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
      autoLayout: {
        padding: { top: 8, right: 16, bottom: 12, left: 24 },
        gap: 18.4,
        wrap: false,
      },
      responsiveIntent: { width: "fill", height: "hug", overflow: "wrap" },
    });
    expect(compiled.extensions.fluidValues?.gap)
      .toBe("clamp(0px, calc(4px + 2cqi), 40px)");
    expect(Object.isFrozen(compiled.layout)).toBe(true);
  });

  it("maps logical edges and media focal points correctly in RTL", () => {
    const rtl = { ...context, direction: "rtl" as const };
    const stack = compileResponsivePrimitive({
      id: "rtl-stack",
      kind: "Stack",
      padding: { inlineStart: 24, inlineEnd: 8, blockStart: 3, blockEnd: 5 },
    }, rtl);
    expect(stack.layout.autoLayout?.padding).toEqual({ top: 3, right: 24, bottom: 5, left: 8 });

    const media = compileResponsivePrimitive({
      id: "rtl-media",
      kind: "MediaFrame",
      aspectRatio: [16, 9],
      focalPoint: { inline: 0.2, block: 0.75 },
      src: "/hero-800.jpg",
      srcSet: "/hero-400.jpg 400w, /hero-800.jpg 800w",
      sizes: "(max-width: 600px) 100vw, 50vw",
    }, rtl);
    expect(media.props).toMatchObject({
      imagePositionX: 80,
      imagePositionY: 75,
      srcSet: "/hero-400.jpg 400w, /hero-800.jpg 800w",
      sizes: "(max-width: 600px) 100vw, 50vw",
      objectFit: "cover",
    });
    expect(media.extensions.adaptivePrimitive.media).toEqual({
      aspectRatio: 16 / 9,
      focalPoint: { inline: 0.2, block: 0.75 },
    });
  });

  it("resolves container policy and fluid values independently of viewport size", () => {
    const primitive: ContainerPrimitive = {
      id: "catalog-container",
      kind: "Container",
      gutter: fluid("container-inline"),
      query: {
        name: "catalog-card",
        fallbackVariant: "standard",
        rules: [
          { variant: "wide", minInlineSize: 600 },
          { variant: "compact", maxInlineSize: 600 },
        ],
      },
    };
    const compact = compileResponsivePrimitive(primitive, {
      ...context,
      containerInlineSize: 320,
    });
    const wide = compileResponsivePrimitive(primitive, {
      ...context,
      containerInlineSize: 900,
    });
    expect(compact.extensions.adaptivePrimitive.containerQuery).toMatchObject({
      activeVariant: "compact",
      basisInlineSize: 320,
    });
    expect(wide.extensions.adaptivePrimitive.containerQuery).toMatchObject({
      activeVariant: "wide",
      basisInlineSize: 900,
    });
    expect(compact.layout.autoLayout?.padding).toEqual({ top: 0, right: 10.4, bottom: 0, left: 10.4 });
    expect(wide.layout.autoLayout?.padding).toEqual({ top: 0, right: 22, bottom: 0, left: 22 });
    expect(compact.extensions.fluidValues?.gutter).toBe(wide.extensions.fluidValues?.gutter);
  });

  it("compiles Grid, Cluster, Overlay, and Freeform into existing layout modes", () => {
    const cases: Array<[ResponsivePrimitive, string]> = [
      [{ id: "grid", kind: "Grid", columns: "auto-fit", minItemInlineSize: 240 }, "grid"],
      [{ id: "cluster", kind: "Cluster", gap: 12 }, "horizontal"],
      [{ id: "overlay", kind: "Overlay", alignment: "center" }, "overlay"],
      [{ id: "freeform", kind: "Freeform", inlineSize: 640, blockSize: 360 }, "absolute"],
    ];
    cases.forEach(([primitive, mode]) => {
      expect(compileResponsivePrimitive(primitive, context).layout.mode).toBe(mode);
    });
    const grid = compileResponsivePrimitive(cases[0][0], context);
    expect(grid.layout.autoLayout).toMatchObject({ columns: "auto", minColumnWidth: 240 });
    const cluster = compileResponsivePrimitive(cases[1][0], context);
    expect(cluster.layout.autoLayout?.wrap).toBe(true);
    const freeform = compileResponsivePrimitive(cases[3][0], context);
    expect(freeform.extensions.adaptivePrimitive.compatibilityIsland).toBe(true);
  });

  it("keeps Anchor native enhancement and deterministic fallback at placement parity", () => {
    const anchor: ResponsivePrimitive = {
      id: "buy-button-anchor",
      kind: "Anchor",
      targetId: "product-media",
      targetSide: "inline-end",
      selfSide: "inline-start",
      progressiveEnhancement: true,
      fallback: { inlineStart: 20, blockStart: 32, selfInlineSize: 100 },
    };
    const fallback = compileResponsivePrimitive(anchor, {
      ...context,
      anchorPositioningSupported: false,
    });
    const native = compileResponsivePrimitive(anchor, {
      ...context,
      anchorPositioningSupported: true,
    });
    expect(native.placement).toEqual(fallback.placement);
    expect(native.extensions.adaptivePrimitive.anchor).toMatchObject({
      strategy: "native",
      fallback: fallback.placement,
    });
    expect(fallback.extensions.adaptivePrimitive.anchor).toMatchObject({ strategy: "fallback" });

    const rtlFallback = compileResponsivePrimitive(anchor, {
      ...context,
      direction: "rtl",
      containerInlineSize: 500,
    });
    expect(rtlFallback.placement).toEqual({ x: 380, y: 32 });
  });

  it("honors an explicit Anchor progressive-enhancement opt-out", () => {
    const compiled = compileResponsivePrimitive({
      id: "stable-anchor",
      kind: "Anchor",
      targetId: "target",
      targetSide: "block-end",
      progressiveEnhancement: false,
      fallback: { inlineStart: 10, blockStart: 12 },
    }, { ...context, anchorPositioningSupported: true });
    expect(compiled.extensions.adaptivePrimitive.anchor).toMatchObject({ strategy: "fallback" });
  });

  it("emits deterministic fluid CSS for container and viewport bases", () => {
    expect(fluidClampCss(fluid("container-inline")))
      .toBe("clamp(0px, calc(4px + 2cqi), 40px)");
    expect(fluidClampCss(fluid("viewport-inline")))
      .toBe("clamp(0px, calc(4px + 2vi), 40px)");
  });

  it("rejects invalid primitive geometry and ambiguous container policies", () => {
    expect(() => compileResponsivePrimitive({
      id: "bad-grid",
      kind: "Grid",
      columns: 0,
    }, context)).toThrow(ResponsivePrimitiveError);
    expect(() => compileResponsivePrimitive({
      id: "bad-media",
      kind: "MediaFrame",
      aspectRatio: [1, 0],
    }, context)).toThrow(/aspect ratio/);
    expect(() => fluidClampCss({ ...fluid(), min: 50, max: 10 })).toThrow(/maximum/);
    expect(() => resolveContainerQueryVariant({
      name: "cards",
      fallbackVariant: "standard",
      rules: [
        { variant: "small", minInlineSize: 0, maxInlineSize: 700 },
        { variant: "large", minInlineSize: 600 },
      ],
    }, 650)).toThrow(/must not overlap/);
  });
});
