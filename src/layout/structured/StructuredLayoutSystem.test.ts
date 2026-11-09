import { describe, expect, it } from "vitest";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import { responsiveSystem } from "@/layout/responsive";
import { buildNoirChronoScene } from "@/themes/noir-chrono/templates/home";
import { StructuredLayoutSystem } from "./StructuredLayoutSystem";

describe("StructuredLayoutSystem", () => {
  it("reorders sections by child order and recomputes responsive flow", () => {
    const system = new StructuredLayoutSystem();
    const source = buildBasicTemplateScene({}, []);
    const reordered = system.reorderNode(source, "basic-hero", 2);
    const root = reordered.nodes["basic-root"];

    expect(root.childIds.slice(0, 3)).toEqual(["basic-header", "basic-products", "basic-hero"]);
    expect(responsiveSystem.resolveNode(reordered.nodes["basic-products"], "desktop").transform.y).toBe(96);
    expect(responsiveSystem.resolveNode(reordered.nodes["basic-hero"], "desktop").transform.y).toBe(796);
  });

  it("removes hidden mobile sections from mobile flow only", () => {
    const system = new StructuredLayoutSystem();
    const source = buildBasicTemplateScene({}, []);
    const hero = source.nodes["basic-hero"];
    hero.layout = responsiveSystem.updateLayout(hero, "mobile", {
      meta: { hidden: true, locked: false },
    });
    const reflowed = system.reflowScene(source);

    expect(responsiveSystem.resolveNode(reflowed.nodes["basic-products"], "mobile").transform.y).toBe(72);
    expect(responsiveSystem.resolveNode(reflowed.nodes["basic-products"], "desktop").transform.y).toBe(716);
  });

  it("stacks hero blocks on mobile and applies the media-first option", () => {
    const system = new StructuredLayoutSystem();
    const source = buildBasicTemplateScene({}, []);
    const hero = source.nodes["basic-hero"];
    hero.layout = responsiveSystem.updateLayout(hero, "mobile", {
      props: { reverseOnMobile: true },
    });
    const reflowed = system.reflowScene(source);
    const image = responsiveSystem.resolveNode(reflowed.nodes["basic-hero-image"], "mobile");
    const heading = responsiveSystem.resolveNode(reflowed.nodes["basic-hero-heading"], "mobile");
    const mobileHero = responsiveSystem.resolveNode(reflowed.nodes["basic-hero"], "mobile");

    expect(image.transform.y).toBe(40);
    expect(heading.transform.y).toBeGreaterThan(image.transform.y + image.transform.height);
    expect(mobileHero.transform.height).toBeGreaterThan(
      heading.transform.y + heading.transform.height,
    );
  });

  it("grows a section before positioning the next section", () => {
    const system = new StructuredLayoutSystem();
    const source = buildBasicTemplateScene({}, []);
    const original = source.nodes["basic-hero-heading"];
    const duplicate = JSON.parse(JSON.stringify(original));
    duplicate.id = "basic-hero-heading-extra";
    duplicate.name = "Extra heading";
    duplicate.parentId = "basic-hero";
    source.nodes[duplicate.id] = duplicate;
    source.nodes["basic-hero"].childIds.splice(3, 0, duplicate.id);

    const reflowed = system.reflowScene(source);
    const hero = responsiveSystem.resolveNode(reflowed.nodes["basic-hero"], "mobile");
    const products = responsiveSystem.resolveNode(reflowed.nodes["basic-products"], "mobile");

    expect(products.transform.y).toBe(72 + hero.transform.height);
  });

  it("preserves a user transform override during later structured reflow", () => {
    const system = new StructuredLayoutSystem();
    const source = buildBasicTemplateScene({}, []);
    const heading = source.nodes["basic-hero-heading"];
    const resolved = responsiveSystem.resolveNode(heading, "mobile");
    heading.layout = responsiveSystem.updateLayout(heading, "mobile", {
      transform: {
        ...resolved.transform,
        x: 41,
        y: 333,
        width: 280,
        height: 96,
      },
      manualTransform: true,
    });

    const reflowed = system.reflowScene(source);
    expect(
      responsiveSystem.resolveNode(reflowed.nodes["basic-hero-heading"], "mobile").transform,
    ).toMatchObject({
      x: 41,
      y: 333,
      width: 280,
      height: 96,
    });
  });

  it("mirrors every editable header link into the responsive mobile drawer", () => {
    const system = new StructuredLayoutSystem();
    const source = buildBasicTemplateScene({}, []);
    const custom = JSON.parse(JSON.stringify(source.nodes["basic-nav-home"]));
    custom.id = "basic-nav-lookbook";
    custom.name = "Lookbook link";
    custom.parentId = "basic-header";
    custom.props.label = "Lookbook";
    custom.extensions.navigationTarget = "/pages/lookbook";
    source.nodes[custom.id] = custom;
    source.nodes["basic-header"].childIds.push(custom.id);

    const reflowed = system.reflowScene(source);
    const mirror = responsiveSystem.resolveNode(
      reflowed.nodes["basic-nav-lookbook--mobile"],
      "mobile",
    );

    expect(mirror.props.label).toBe("Lookbook");
    expect(mirror.extensions?.navigationTarget).toBe("/pages/lookbook");
    expect(mirror.meta.hidden).toBe(false);
    expect(reflowed.nodes["basic-mobile-menu"].childIds).toContain(mirror.id);
  });

  it("preserves authored responsive child geometry while reflowing sections", () => {
    const system = new StructuredLayoutSystem();
    const source = buildNoirChronoScene({}, []);
    const before = responsiveSystem.resolveNode(
      source.nodes["noir-hero-title"],
      "mobile",
    ).transform;

    const reflowed = system.reflowScene(source);
    const after = responsiveSystem.resolveNode(
      reflowed.nodes["noir-hero-title"],
      "mobile",
    ).transform;

    expect(after).toEqual(before);
    expect(
      responsiveSystem.resolveNode(
        reflowed.nodes["noir-mobile-nav-products"],
        "mobile",
      ).transform.y,
    ).toBe(72);
  });
});
