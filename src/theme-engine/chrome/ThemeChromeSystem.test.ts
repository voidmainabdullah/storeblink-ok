import { describe, expect, it } from "vitest";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import { assetSystem, type ImageAssetRecord } from "@/assets/system";
import { responsiveSystem } from "@/layout/responsive";
import { buildAtelierTemplateScene } from "@/themes/atelier/templates/home";
import {
  mobileMenuAnimationRegistry,
  themeChromeNodeSlot,
  themeLogoPresentationForScene,
  themeChromeSystem,
} from "./index";

const logoAsset = (
  id: string,
  source: string,
  width = 400,
  height = 100,
): ImageAssetRecord => ({
  id,
  kind: "image",
  originalSource: source,
  originalName: `${id}.png`,
  intrinsicWidth: width,
  intrinsicHeight: height,
  aspectRatio: width / height,
  format: "png",
  altText: id,
  createdAt: 1,
  updatedAt: 1,
});

describe("ThemeChromeSystem", () => {
  it.each([
    ["basic", () => buildBasicTemplateScene({}, [])],
    ["atelier", () => buildAtelierTemplateScene({}, [])],
  ])("materializes shared chrome contracts for %s", (_themeId, createScene) => {
    const scene = createScene();
    const settings = themeChromeSystem.getSettings(scene);
    const slots = Object.values(scene.nodes).map(themeChromeNodeSlot);
    const logo = Object.values(scene.nodes).find((node) => themeChromeNodeSlot(node) === "logo");

    expect(slots).toEqual(expect.arrayContaining([
      "account",
      "cart",
      "search",
      "nav-link",
      "mobile-menu-trigger",
      "mobile-menu",
      "logo",
      "logo-fallback",
    ]));
    expect(Object.keys(settings.navigationIcons)).toEqual(
      expect.arrayContaining(["home", "products", "about", "contact"]),
    );
    expect(logo?.extensions).toMatchObject({
      autoPositioned: false,
      transformable: true,
      aspectRatioLocked: true,
      aspectRatioRequired: true,
      responsiveTransformPolicy: "linked-anchor",
    });
    expect(settings.logo.responsiveMode).toBe("auto");
    expect(logo?.meta.hidden).toBe(true);
  });

  it("persists independent icon, navigation, menu, and logo settings as scene data", () => {
    const source = buildBasicTemplateScene({}, []);
    const settings = themeChromeSystem.getSettings(source);
    settings.icons.account = {
      library: "phosphor",
      name: "Smiley",
      color: "#ff0066",
      size: 32,
    };
    settings.mobileMenu.animation = "fadeScale";
    settings.navigationIcons.home = {
      library: "tabler",
      name: "IconHome",
      color: "#0055ff",
      size: 20,
    };
    settings.logo.src = "data:image/svg+xml;base64,PHN2Zy8+";

    const scene = themeChromeSystem.applySettings(source, settings);
    const rootSettings = scene.nodes[scene.rootNodeId!].extensions?.themeChrome;
    const logo = Object.values(scene.nodes).find((node) => themeChromeNodeSlot(node) === "logo")!;
    const fallback = Object.values(scene.nodes).find(
      (node) => themeChromeNodeSlot(node) === "logo-fallback",
    )!;

    expect(rootSettings).toMatchObject({
      icons: {
        account: {
          library: "phosphor",
          name: "Smiley",
          color: "#ff0066",
          size: 32,
        },
      },
      mobileMenu: { animation: "fadeScale" },
      logo: { src: settings.logo.src },
    });
    expect(scene.nodes["basic-account-icon"].props.iconConfig).toMatchObject(
      settings.icons.account,
    );
    expect(scene.nodes["basic-nav-home"].props.iconConfig).toMatchObject(
      settings.navigationIcons.home!,
    );
    expect(logo.props).toMatchObject({
      src: settings.logo.src,
      objectFit: "contain",
    });
    expect(logo.meta.hidden).toBe(false);
    expect(fallback.meta.hidden).toBe(true);
    expect(responsiveSystem.resolveNode(logo, "mobile").meta.hidden).toBe(false);
  });

  it("registers exactly the two exposed menu animations", () => {
    expect(mobileMenuAnimationRegistry.list().map((animation) => animation.id)).toEqual([
      "slideIn",
      "fadeScale",
    ]);
  });

  it("does not treat cart count text as a customizable cart icon", () => {
    const scene = buildAtelierTemplateScene({}, []);
    expect(themeChromeNodeSlot(scene.nodes["atelier-cart-count"])).toBeNull();
  });

  it("removes persistent shadows from navigation, account, cart, and search chrome", () => {
    const source = buildBasicTemplateScene({}, []);
    const shadow = {
      type: "shadow" as const,
      value: { x: 0, y: 4, blur: 12, spread: 0, color: "rgba(0,0,0,.3)" },
    };
    Object.values(source.nodes).forEach((node) => {
      if (!["nav-link", "account", "cart", "search"].includes(themeChromeNodeSlot(node) ?? "")) return;
      node.style = { ...node.style, effects: [shadow] };
      const responsive = node.layout.responsive as Record<string, { style?: typeof node.style }> | undefined;
      if (responsive?.mobile) {
        responsive.mobile = {
          ...responsive.mobile,
          style: { ...node.style, effects: [shadow] },
        };
      }
    });

    const scene = themeChromeSystem.ensureScene(source);
    Object.values(scene.nodes).forEach((node) => {
      if (!["nav-link", "account", "cart", "search"].includes(themeChromeNodeSlot(node) ?? "")) return;
      expect(node.style.effects.some((effect) => effect.type === "shadow")).toBe(false);
      const responsive = node.layout.responsive as Record<string, { style?: { effects?: Array<{ type?: string }> } }> | undefined;
      Object.values(responsive ?? {}).forEach((override) => {
        expect(override.style?.effects?.some((effect) => effect.type === "shadow") ?? false).toBe(false);
      });
    });
  });

  it("resolves light and dark assets from the current header background", () => {
    let source = buildBasicTemplateScene({}, []);
    source = assetSystem.upsertImage(
      source,
      logoAsset("logo-primary", "data:image/png;base64,PRIMARY"),
    );
    source = assetSystem.upsertImage(
      source,
      logoAsset("logo-light", "data:image/png;base64,LIGHT"),
    );
    source = assetSystem.upsertImage(
      source,
      logoAsset("logo-dark", "data:image/png;base64,DARK"),
    );
    source.nodes["basic-header"].props.background = "#111111";
    source.nodes["basic-header"].style.fills = [
      { type: "solid", color: "#111111" },
    ];
    const settings = themeChromeSystem.getSettings(source);
    settings.logo.assetId = "logo-primary";
    settings.logo.lightAssetId = "logo-light";
    settings.logo.darkAssetId = "logo-dark";
    const scene = themeChromeSystem.applySettings(source, settings);

    expect(themeLogoPresentationForScene(scene).src).toBe(
      "data:image/png;base64,LIGHT",
    );

    scene.nodes["basic-header"].props.background = "#ffffff";
    scene.nodes["basic-header"].style.fills = [
      { type: "solid", color: "#ffffff" },
    ];
    expect(themeLogoPresentationForScene(scene).src).toBe(
      "data:image/png;base64,DARK",
    );
  });

  it("keeps breakpoint logo geometry independent and honors fit-header mode", () => {
    let source = buildBasicTemplateScene({}, []);
    source = assetSystem.upsertImage(
      source,
      logoAsset("logo-wide", "data:image/png;base64,WIDE"),
    );
    const settings = themeChromeSystem.getSettings(source);
    settings.logo.assetId = "logo-wide";
    settings.logo.placement.mobile = {
      ...settings.logo.placement.mobile,
      width: 80,
      maxWidth: 300,
      padding: 6,
      heightMode: "fit-header",
    };
    const scene = themeChromeSystem.applySettings(source, settings);
    const desktop = themeLogoPresentationForScene(scene, "desktop");
    const mobile = themeLogoPresentationForScene(scene, "mobile");

    expect(mobile.height).toBeLessThanOrEqual(60);
    expect(mobile.width / mobile.height).toBeCloseTo(4);
    expect(desktop.width).not.toBe(mobile.width);
  });

  it("preserves a manually moved and resized logo through reconciliation", () => {
    let source = buildBasicTemplateScene({}, []);
    source = assetSystem.upsertImage(
      source,
      logoAsset("logo-manual", "data:image/png;base64,MANUAL"),
    );
    const settings = themeChromeSystem.getSettings(source);
    settings.logo.assetId = "logo-manual";
    let scene = themeChromeSystem.applySettings(source, settings);
    const logo = Object.values(scene.nodes).find(
      (node) => themeChromeNodeSlot(node) === "logo",
    )!;
    const initial = responsiveSystem.resolveNode(logo, "desktop").transform;
    const manual = {
      ...initial,
      x: initial.x + 74,
      y: initial.y + 18,
      width: 276,
      height: 69,
    };
    logo.layout = responsiveSystem.updateLayout(logo, "desktop", {
      transform: manual,
      manualTransform: true,
    });

    scene = themeChromeSystem.ensureScene(scene);
    let reconciledLogo = Object.values(scene.nodes).find(
      (node) => themeChromeNodeSlot(node) === "logo",
    )!;
    expect(
      responsiveSystem.resolveNode(reconciledLogo, "desktop").transform,
    ).toEqual(manual);
    expect(themeChromeSystem.getSettings(scene).logo.placement.desktop.width)
      .toBe(276);
    expect(themeLogoPresentationForScene(scene, "desktop")).toMatchObject({
      width: 276,
      height: 69,
    });

    const nextSettings = themeChromeSystem.getSettings(scene);
    nextSettings.icons.search = {
      ...nextSettings.icons.search,
      color: "#ff0066",
    };
    scene = themeChromeSystem.applySettings(scene, nextSettings);
    reconciledLogo = Object.values(scene.nodes).find(
      (node) => themeChromeNodeSlot(node) === "logo",
    )!;
    expect(
      responsiveSystem.resolveNode(reconciledLogo, "desktop").transform,
    ).toEqual(manual);

    const reset = themeChromeSystem.resetLogoPlacement(scene, "desktop");
    const resetLogo = Object.values(reset.nodes).find(
      (node) => themeChromeNodeSlot(node) === "logo",
    )!;
    const resetTransform =
      responsiveSystem.resolveNode(resetLogo, "desktop").transform;
    expect(responsiveSystem.hasManualTransform(resetLogo, "desktop")).toBe(false);
    expect(resetTransform.x).not.toBe(manual.x);
    expect(resetTransform.width).not.toBe(manual.width);
  });
});
