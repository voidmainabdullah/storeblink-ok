import { describe, expect, it } from "vitest";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import { sectionRegistry } from "./SectionRegistry";
import { createBlockPresetNodes, createSectionPresetNodes } from "./sectionFactory";

describe("structured section factory", () => {
  it("creates registry-backed section presets without exposing template node ids", () => {
    const nodes = createSectionPresetNodes("hero", "page-root", { business_name: "Store" }, []);

    expect(nodes[0]).toMatchObject({
      parentId: "page-root",
      extensions: { editorKind: "section", sectionType: "hero" },
    });
    expect(nodes[0].id).not.toBe("basic-hero");
    expect(nodes[0].extensions).toMatchObject({
      global: false,
      sectionScope: "local",
      sectionInstanceId: nodes[0].id,
    });
    expect(new Set(nodes.map((node) => node.id)).size).toBe(nodes.length);
  });

  it("duplicates a theme-native section as an independent local instance", () => {
    const first = createSectionPresetNodes(
      "hero",
      "page-root",
      { business_name: "Store" },
      [],
    );
    const source = {
      rootNodeId: "page-root",
      nodes: Object.fromEntries(
        first.map((node) => [node.id, node]),
      ),
    };
    const second = createSectionPresetNodes(
      "hero",
      "page-root",
      { business_name: "Store" },
      [],
      source,
    );

    expect(second[0].id).not.toBe(first[0].id);
    expect(second[0].extensions?.sectionInstanceId).toBe(second[0].id);
    second[1].props.text = "Independent";
    expect(first[1].props.text).not.toBe("Independent");
  });

  it("creates product blocks from live IDs without copying catalog payloads", () => {
    const nodes = createBlockPresetNodes(
      "product-grid",
      "product-card",
      "products-section",
      { business_name: "Store" },
      [
        {
          id: "product-1",
          name: "Live catalog title",
          description: "This must not be persisted in the scene block.",
          image_url: "https://example.test/product.jpg",
        },
      ],
    );

    expect(nodes[0]).toMatchObject({
      parentId: "products-section",
      extensions: {
        editorKind: "block",
        blockType: "product-card",
        productId: "product-1",
      },
    });
    expect(JSON.stringify(nodes)).not.toContain("Live catalog title");
    expect(JSON.stringify(nodes)).not.toContain("This must not be persisted");
  });

  it("creates a production local instance for every visible registry definition", () => {
    const activeScene = buildBasicTemplateScene(
      { business_name: "Store" },
      [],
    );

    sectionRegistry.listSections().forEach((definition) => {
      const nodes = createSectionPresetNodes(
        definition.type,
        "page-root",
        { business_name: "Store" },
        [],
        activeScene,
      );
      const root = nodes[0];
      expect(root, definition.type).toBeDefined();
      expect(root.extensions?.sectionType, definition.type).toBe(
        definition.type,
      );
      expect(root.extensions?.sectionInstanceId, definition.type).toBe(root.id);
      expect(new Set(nodes.map((node) => node.id)).size, definition.type).toBe(
        nodes.length,
      );
    });
  });

  it("uses generic auto layout for sections without a theme-native source", () => {
    const nodes = createSectionPresetNodes(
      "faq",
      "page-root",
      { business_name: "Store" },
      [],
      buildBasicTemplateScene({ business_name: "Store" }, []),
    );

    expect(nodes[0].layout).toMatchObject({
      mode: "vertical",
      sizing: { width: { mode: "fill" }, height: { mode: "hug" } },
      responsiveIntent: { narrowBehavior: "stack" },
    });
    expect(nodes.slice(1).every((node) => node.layout.autoLayout?.position === "flow")).toBe(true);
    expect(nodes.slice(1).every((node) => node.layout.responsiveIntent)).toBe(true);
  });
});
