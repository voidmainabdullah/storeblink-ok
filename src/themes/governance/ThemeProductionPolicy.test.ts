import { describe, expect, it } from "vitest";
import { buildBasicTemplateScene } from "@/editor/engine/basicTemplate";
import { createEngineSceneTheme } from "@/editor/engine/storeSceneAdapter";
import { createSceneNode } from "@/engine/scene-graph";
import { buildAtelierTemplateScene } from "@/themes/atelier/templates/home";
import { buildNoirChronoScene } from "@/themes/noir-chrono/templates/home";
import { buildSparkFashionTemplateScene } from "@/themes/spark-fashion/templates/home";
import type { SceneTree } from "@/types";
import { ThemeProductionPolicy } from "./ThemeProductionPolicy";

const product = {
  id: "product-one",
  name: "Product One",
  image_url: "https://example.com/product.webp",
  price_cents: 25500,
};

const minimalScene = (): SceneTree => {
  const root = createSceneNode(
    {
      id: "root",
      type: "section",
      name: "Root",
      extensions: { themeId: "basic" },
    },
    null,
  );
  const child = createSceneNode(
    {
      id: "child",
      type: "text",
      name: "Child",
      props: { text: "Hello", semanticTag: "h1" },
    },
    root.id,
  );
  root.childIds = [child.id];
  return { rootNodeId: root.id, nodes: { [root.id]: root, [child.id]: child } };
};

describe("ThemeProductionPolicy", () => {
  it.each([
    ["Basic", () => buildBasicTemplateScene({}, [product])],
    ["Atelier", () => buildAtelierTemplateScene({}, [product])],
    ["Noir Chrono", () => buildNoirChronoScene({}, [product])],
    ["Spark Fashion", () => buildSparkFashionTemplateScene({}, [product])],
  ])("accepts the shipped %s theme within production resource budgets", (_name, createScene) => {
    const policy = new ThemeProductionPolicy();
    const report = policy.auditDocument(createEngineSceneTheme(createScene()), {
      mode: "publish",
      productIds: [product.id],
    });

    expect(report.valid, report.issues.map((entry) => entry.message).join("\n")).toBe(true);
    expect(report.metrics.totalNodes).toBeGreaterThan(1);
    expect(report.metrics.maximumDepth).toBeLessThanOrEqual(report.limits.maxDepth);
  });

  it("allows a broken product reference in a repairable draft but blocks publish", () => {
    const document = createEngineSceneTheme(buildBasicTemplateScene({}, [product]));
    const policy = new ThemeProductionPolicy();
    const draft = policy.auditDocument(document, { mode: "draft", productIds: [] });
    const published = policy.auditDocument(document, { mode: "publish", productIds: [] });

    expect(draft.valid).toBe(true);
    expect(draft.issues).toContainEqual(expect.objectContaining({
      code: "reference.product.missing",
      severity: "warning",
    }));
    expect(published.valid).toBe(false);
    expect(published.issues).toContainEqual(expect.objectContaining({
      code: "reference.product.missing",
      severity: "error",
    }));
  });

  it("rejects unsafe navigation and scene complexity over platform limits", () => {
    const scene = minimalScene();
    scene.nodes.child.extensions = { navigationTarget: "javascript:alert(1)" };
    scene.nodes.child.childIds = ["one", "two"];
    const report = new ThemeProductionPolicy({ maxChildrenPerNode: 1 }).auditDocument(
      createEngineSceneTheme(scene),
      { mode: "draft" },
    );

    expect(report.valid).toBe(false);
    expect(report.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["navigation.protocol.unsafe", "scene.children.limit"]),
    );
  });

  it("audits every page and rejects duplicate page slugs", () => {
    const scene = minimalScene();
    const document = createEngineSceneTheme(scene, {
      version: 2,
      homePageId: "home",
      components: { version: 1, definitions: {} },
      sharedChrome: {},
      pages: [
        { id: "home", title: "Home", slug: "same", kind: "home", scene },
        { id: "custom", title: "Custom", slug: "same", kind: "custom", scene },
      ],
    });
    const report = new ThemeProductionPolicy().auditDocument(document, { mode: "draft" });

    expect(report.valid).toBe(false);
    expect(report.metrics.pages).toBe(2);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "document.page.slug.duplicate",
    }));
  });
});
