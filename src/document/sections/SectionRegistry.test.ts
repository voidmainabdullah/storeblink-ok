import { describe, expect, it } from "vitest";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import { SectionRegistry } from "./SectionRegistry";
import { BUILT_IN_SECTION_DEFINITIONS } from "./definitions";

describe("SectionRegistry", () => {
  it("rejects duplicate section registrations", () => {
    const registry = new SectionRegistry();
    registry.registerSection(BUILT_IN_SECTION_DEFINITIONS[1]);
    expect(() => registry.registerSection(BUILT_IN_SECTION_DEFINITIONS[1])).toThrow(/already registered/);
  });

  it("keeps unregistered block metadata advisory", () => {
    const registry = new SectionRegistry();
    BUILT_IN_SECTION_DEFINITIONS.forEach((definition) => registry.registerSection(definition));
    const scene = buildBasicTemplateScene({}, []);
    scene.nodes["basic-hero-heading"].extensions = {
      ...scene.nodes["basic-hero-heading"].extensions,
      blockType: "unsupported",
    };

    expect(registry.validateScene(scene)).toMatchObject({
      valid: true,
      issues: expect.arrayContaining([
        expect.objectContaining({ nodeId: "basic-hero-heading", severity: "warning" }),
      ]),
    });
  });

  it("warns about preset ranges but rejects corrupt responsive geometry", () => {
    const registry = new SectionRegistry();
    BUILT_IN_SECTION_DEFINITIONS.forEach((definition) => registry.registerSection(definition));
    const scene = buildBasicTemplateScene({}, []);
    const products = scene.nodes["basic-products"];
    products.props = { ...products.props, columns: 9 };
    products.layout = {
      ...products.layout,
      responsive: {
        ...(products.layout.responsive as Record<string, unknown>),
        mobile: {
          transform: {
            ...products.transform,
            width: -1,
          },
        },
      },
    };

    const result = registry.validateScene(scene);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: "basic-products",
          message: expect.stringMatching(/columns/i),
          severity: "warning",
        }),
        expect.objectContaining({
          nodeId: "basic-products",
          message: expect.stringMatching(/geometry/i),
          severity: "error",
        }),
      ]),
    );
  });

  it("accepts any number of blocks in a section", () => {
    const registry = new SectionRegistry();
    BUILT_IN_SECTION_DEFINITIONS.forEach((definition) => registry.registerSection(definition));
    const scene = buildBasicTemplateScene({}, []);
    const header = scene.nodes["basic-header"];
    const source = scene.nodes["basic-nav-home"];

    for (let index = 0; index < 20; index += 1) {
      const id = `extra-navigation-${index}`;
      scene.nodes[id] = {
        ...structuredClone(source),
        id,
        parentId: header.id,
        name: `Extra navigation ${index + 1}`,
      };
      header.childIds.push(id);
    }

    const result = registry.validateScene(scene);
    expect(result.valid).toBe(true);
    expect(result.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: header.id, message: expect.stringMatching(/blocks/i) }),
      ]),
    );
  });

  it("accepts the page root and explicit section containers only", () => {
    const registry = new SectionRegistry();
    const scene = buildBasicTemplateScene({}, []);

    expect(
      registry.validatePlacement(scene, scene.rootNodeId!),
    ).toEqual({ valid: true, parentId: scene.rootNodeId });
    expect(
      registry.validatePlacement(scene, "basic-hero-heading"),
    ).toMatchObject({ valid: false });

    scene.nodes["basic-hero"].extensions = {
      ...(scene.nodes["basic-hero"].extensions ?? {}),
      acceptsSections: true,
    };
    expect(
      registry.validatePlacement(scene, "basic-hero"),
    ).toEqual({ valid: true, parentId: "basic-hero" });
  });
});
