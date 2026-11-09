import { describe, expect, it } from "vitest";
import { createSceneNode } from "@/engine/scene-graph";
import type { SceneTree } from "@/types";
import { ThemeBrandingSystem } from "./ThemeBrandingSystem";

const scene = (): SceneTree => {
  const root = createSceneNode({
    id: "root",
    type: "section",
    name: "Page",
    transform: { width: 1200, height: 800 },
  }, null);
  const heading = createSceneNode({
    id: "heading",
    type: "text",
    name: "Hero heading",
    props: { text: "A considered store", fontSize: 48, typographyRole: "heading" },
  }, root.id);
  root.childIds = [heading.id];
  return { rootNodeId: root.id, nodes: { root, heading } };
};

describe("ThemeBrandingSystem", () => {
  it("persists a font pairing as root-owned brand tokens", () => {
    const branding = new ThemeBrandingSystem();
    const settings = branding.applyPairing(branding.getSettings(scene()), "editorial");
    const branded = branding.applySettings(scene(), settings);

    expect(branding.getAppliedSettings(branded)).toMatchObject({
      enabled: true,
      pairingId: "editorial",
      headingFontId: "playfair-display",
      bodyFontId: "dm-sans",
    });
    expect(branded.nodes.root.extensions?.designTokens).toMatchObject({
      typography: {
        headingFont: expect.stringContaining("Playfair Display"),
        bodyFont: expect.stringContaining("DM Sans"),
      },
    });
  });

  it("resolves brand roles while preserving explicit local font overrides", () => {
    const branding = new ThemeBrandingSystem();
    const settings = branding.applyPairing(branding.getSettings(scene()), "premium");
    const heading = scene().nodes.heading;
    const resolved = branding.resolveNode(heading, settings);
    const local = branding.resolveNode({
      ...heading,
      props: { ...heading.props, fontBinding: "local", fontFamily: "Arial" },
    }, settings);

    expect(resolved.props.fontFamily).toContain("Cormorant Garamond");
    expect(resolved.props.fontBinding).toBe("brand");
    expect(local.props.fontFamily).toBe("Arial");
  });
});
