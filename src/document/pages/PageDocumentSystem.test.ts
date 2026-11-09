import { describe, expect, it } from "vitest";
import { buildBasicCustomPageScene, buildBasicTemplateScene } from "@/editor/engine/engineTemplates";
import { createEngineSceneTheme, getRequiredEngineScene } from "@/editor/engine/storeSceneAdapter";
import { navigationSystem } from "@/content/menus";
import { createComponentSystem } from "@/document/components";
import { themeBrandingSystem } from "@/theme-engine/branding";
import type { SceneNode, SceneTree } from "@/types";
import {
  ENGINE_PAGE_DOCUMENT_THEME_KEY,
  createPageDocumentSystem,
  getStorefrontPageBySlug,
} from "./PageDocumentSystem";

describe("PageDocumentSystem", () => {
  it("migrates a single Engine Scene into a home page without duplicating live state", () => {
    const home = buildBasicTemplateScene({ business_name: "Pages Store" }, []);
    const pages = createPageDocumentSystem();

    const snapshot = pages.load(createEngineSceneTheme(home), home);

    expect(snapshot.activePageId).toBe("home");
    expect(snapshot.document.pages).toHaveLength(1);
    expect(snapshot.document.pages[0]).toMatchObject({
      id: "home",
      title: "Home",
      slug: "home",
      kind: "home",
    });
  });

  it("persists custom pages while keeping engine_scene as the home compatibility scene", () => {
    const profile = { business_name: "Pages Store" };
    const initialHome = buildBasicTemplateScene(profile, []);
    initialHome.nodes["basic-nav-products"].props.label = "Shop all";
    const home = navigationSystem.synchronizeNode(
      initialHome,
      "basic-nav-products",
    );
    const custom = buildBasicCustomPageScene(profile, "Lookbook", "lookbook");
    const pages = createPageDocumentSystem();
    pages.load(createEngineSceneTheme(home), home);

    const created = pages.addPage({ title: "Lookbook", scene: custom }, home);
    const document = pages.serialize(created.scene);
    const theme = createEngineSceneTheme(created.scene, document);

    expect(theme[ENGINE_PAGE_DOCUMENT_THEME_KEY]?.pages).toHaveLength(2);
    expect(getRequiredEngineScene(theme).nodes["basic-root"].name).toBe("Basic storefront");
    expect(getStorefrontPageBySlug(theme, home, "lookbook")?.scene.nodes["basic-root"].name).toBe("Lookbook");
    expect(
      Object.values(
        getStorefrontPageBySlug(theme, home, "lookbook")?.scene.nodes ?? {},
      ).find((node) => node.extensions?.navigationKey === "products")?.props.label,
    ).toBe("Shop all");
  });

  it("snapshots the current Scene Graph before switching pages", () => {
    const profile = { business_name: "Pages Store" };
    const home = buildBasicTemplateScene(profile, []);
    const pages = createPageDocumentSystem();
    pages.load(createEngineSceneTheme(home), home);
    const custom = pages.addPage(
      { title: "Journal", scene: buildBasicCustomPageScene(profile, "Journal", "journal") },
      home,
    );
    const editedCustom = structuredClone(custom.scene);
    editedCustom.nodes["basic-story-heading"].props.text = "Edited journal";

    pages.activate("home", editedCustom);
    const persisted = pages.serialize(home);

    expect(
      persisted.pages.find((page) => page.id === custom.id)?.scene.nodes["basic-story-heading"].props.text,
    ).toBe("Edited journal");
  });

  it("prepares a page switch without mutating live state and preserves current edits for undo", () => {
    const profile = { business_name: "Pages Store" };
    const home = buildBasicTemplateScene(profile, []);
    const pages = createPageDocumentSystem();
    pages.load(createEngineSceneTheme(home), home);
    const custom = pages.addPage(
      { title: "Journal", scene: buildBasicCustomPageScene(profile, "Journal", "journal") },
      home,
    );
    const editedCustom = structuredClone(custom.scene);
    editedCustom.nodes["basic-story-heading"].props.text = "Unsaved current edit";

    const transition = pages.prepareActivate("home", editedCustom);

    expect(pages.getSnapshot().activePageId).toBe(custom.id);
    expect(transition.before.activePageId).toBe(custom.id);
    expect(
      transition.before.document.pages.find((page) => page.id === custom.id)
        ?.scene.nodes["basic-story-heading"].props.text,
    ).toBe("Unsaved current edit");
    expect(transition.after.activePageId).toBe("home");
  });

  it("finalizes a prepared destination scene without mutating the live document", () => {
    const profile = { business_name: "Pages Store" };
    const home = buildBasicTemplateScene(profile, []);
    const pages = createPageDocumentSystem();
    pages.load(createEngineSceneTheme(home), home);
    const prepared = pages.prepareAddPage(
      {
        title: "Journal",
        scene: buildBasicCustomPageScene(profile, "Journal", "journal"),
      },
      home,
    );
    const reconciled = structuredClone(prepared.scene);
    reconciled.nodes["basic-story-heading"].props.text = "Finalized scene";

    const finalized = pages.finalizeTransition(prepared, reconciled);

    expect(pages.getSnapshot().document.pages).toHaveLength(1);
    expect(finalized.after.document.pages).toHaveLength(2);
    expect(finalized.scene.nodes["basic-story-heading"].props.text).toBe(
      "Finalized scene",
    );
  });

  it("propagates shared chrome master changes to every page reference", () => {
    const profile = { business_name: "Pages Store" };
    const home = buildBasicTemplateScene(profile, []);
    const pages = createPageDocumentSystem();
    pages.load(createEngineSceneTheme(home), home);
    const custom = pages.addPage(
      { title: "Journal", scene: buildBasicCustomPageScene(profile, "Journal", "journal") },
      home,
    );
    pages.activate("home", custom.scene);

    const editedHomeInput = structuredClone(home);
    editedHomeInput.nodes["basic-nav-products"].props.label =
      "New catalog label";
    const editedHome = navigationSystem.synchronizeNode(
      editedHomeInput,
      "basic-nav-products",
    );
    editedHome.nodes["basic-header"].style.fills = [
      { type: "solid", color: "#ff0000" },
    ];
    const activatedCustom = pages.activate(custom.id, editedHome);
    const customHeader = Object.values(activatedCustom.nodes).find(
      (node) => node.extensions?.sectionType === "header",
    );
    const customProducts = Object.values(activatedCustom.nodes).find(
      (node) => node.extensions?.navigationKey === "products",
    );

    expect(customProducts?.props.label).toBe("New catalog label");
    expect(customHeader?.style.fills).toEqual([
      { type: "solid", color: "#ff0000" },
    ]);
    expect(customHeader?.extensions?.global).toBe(true);
    expect(customHeader?.extensions?.sectionScope).toBe("shared-reference");
    expect(customHeader?.meta.componentInstance?.componentDefinitionId).toBe(
      "store-shared-header",
    );
  });

  it("prepares store typography across every page without mutating live state", () => {
    const profile = { business_name: "Pages Store" };
    const home = buildBasicTemplateScene(profile, []);
    const pages = createPageDocumentSystem();
    pages.load(createEngineSceneTheme(home), home);
    const custom = pages.addPage(
      {
        title: "Journal",
        scene: buildBasicCustomPageScene(profile, "Journal", "journal"),
      },
      home,
    );
    const settings = themeBrandingSystem.applyPairing(
      themeBrandingSystem.getSettings(home),
      "editorial",
    );

    const transition = pages.prepareSharedRootUpdate(
      custom.scene,
      (homeScene) => themeBrandingSystem.applySettings(homeScene, settings),
    );

    const liveDocument = pages.getSnapshot().document;
    const liveCustom = liveDocument.pages.find((page) => page.id === custom.id);
    expect(
      liveCustom?.scene.nodes[liveCustom.scene.rootNodeId].extensions?.themeBranding,
    ).toBeUndefined();

    transition.after.document.pages.forEach((page) => {
      const root = page.scene.nodes[page.scene.rootNodeId];
      expect(root.extensions?.themeBranding).toEqual(settings);
      expect(root.extensions?.designTokens).toMatchObject({
        typography: {
          headingFont: expect.any(String),
          bodyFont: expect.any(String),
          editorialFont: expect.any(String),
          uiFont: expect.any(String),
        },
      });
    });
    const activeRoot = transition.scene.nodes[transition.scene.rootNodeId];
    expect(activeRoot.extensions?.themeBranding).toEqual(settings);
    expect(transition.after.activePageId).toBe(custom.id);
  });

  it("creates physical header and footer instances linked to shared definitions", () => {
    const profile = { business_name: "Pages Store" };
    const home = buildBasicTemplateScene(profile, []);
    const custom = buildBasicCustomPageScene(profile, "Journal", "journal");
    const pages = createPageDocumentSystem();
    pages.load(createEngineSceneTheme(home), home);

    const created = pages.addPage({ title: "Journal", scene: custom }, home);
    const sourceChromeIds = new Set(
      ["basic-header", "basic-footer"].flatMap((id) => {
        const ids: string[] = [];
        const visit = (nodeId: string) => {
          ids.push(nodeId);
          home.nodes[nodeId]?.childIds.forEach(visit);
        };
        visit(id);
        return ids;
      }),
    );
    const copiedChrome = Object.values(created.scene.nodes).filter((node) =>
      node.extensions?.editorKind === "section" &&
      ["header", "footer"].includes(String(node.extensions?.sectionType)),
    );

    expect(copiedChrome).toHaveLength(2);
    expect(copiedChrome.every((node) => !sourceChromeIds.has(node.id))).toBe(true);
    expect(
      copiedChrome.every(
        (node) =>
          node.extensions?.sectionScope === "shared-reference" &&
          node.meta.componentInstance?.componentDefinitionId === node.meta.componentId,
      ),
    ).toBe(true);
    expect(created.scene.components?.sharedChrome).toEqual({
      headerDefinitionId: "store-shared-header",
      footerDefinitionId: "store-shared-footer",
    });
  });

  it("preserves page-specific content overrides and can reset them to the shared master", () => {
    const profile = { business_name: "Pages Store" };
    const home = buildBasicTemplateScene(profile, []);
    const components = createComponentSystem();
    const pages = createPageDocumentSystem(components);
    const loaded = pages.load(createEngineSceneTheme(home), home);
    const canonicalHome = loaded.document.pages.find((page) => page.id === "home")?.scene as SceneTree;
    const masterBrand = canonicalHome.nodes["basic-brand"].props.text;
    const custom = pages.addPage(
      { title: "Journal", scene: buildBasicCustomPageScene(profile, "Journal", "journal") },
      canonicalHome,
    );
    const editedCustom = structuredClone(custom.scene);
    const customBrand = Object.values(editedCustom.nodes).find(
      (node) => node.extensions?.componentSourceNodeId === "basic-brand",
    ) as SceneNode;
    customBrand.props.text = "Journal brand";

    const homeScene = pages.activate("home", editedCustom);
    const restoredCustom = pages.activate(custom.id, homeScene);
    const restoredBrand = Object.values(restoredCustom.nodes).find(
      (node) => node.extensions?.componentSourceNodeId === "basic-brand",
    );
    const header = Object.values(restoredCustom.nodes).find(
      (node) => node.extensions?.sharedChromeRole === "header",
    ) as SceneNode;

    expect(restoredBrand?.props.text).toBe("Journal brand");
    expect(header.meta.componentInstance?.overrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceNodeId: "basic-brand", scope: "text" }),
      ]),
    );

    const resetCustom = components.resetOverrides(restoredCustom, header.id, {
      sourceNodeId: "basic-brand",
      scope: "text",
    });
    const resetHome = pages.activate("home", resetCustom);
    const resetRestored = pages.activate(custom.id, resetHome);
    const resetBrand = Object.values(resetRestored.nodes).find(
      (node) => node.extensions?.componentSourceNodeId === "basic-brand",
    );
    const resetHeader = Object.values(resetRestored.nodes).find(
      (node) => node.extensions?.sharedChromeRole === "header",
    ) as SceneNode;

    expect(resetBrand?.props.text).toBe(masterBrand);
    expect(resetHeader.meta.componentInstance?.overrides).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceNodeId: "basic-brand", scope: "text" }),
      ]),
    );
  });

  it("persists custom-page component definitions and propagates them to inactive page instances", () => {
    const profile = { business_name: "Pages Store" };
    const home = buildBasicTemplateScene(profile, []);
    const components = createComponentSystem();
    const pages = createPageDocumentSystem(components);
    pages.load(createEngineSceneTheme(home), home);
    const componentPage = pages.addPage(
      { title: "Components", scene: buildBasicCustomPageScene(profile, "Components", "components") },
      home,
    );
    const defined = components.createDefinition(componentPage.scene, "basic-story", {
      definitionId: "story-card",
      name: "Story card",
    }).scene;
    pages.serialize(defined);
    const instancePage = pages.addPage(
      { title: "Instances", scene: buildBasicCustomPageScene(profile, "Instances", "instances") },
      defined,
    );
    const instantiated = components.instantiate(
      instancePage.scene,
      "story-card",
      "basic-root",
      { x: 40, y: 300 },
    );
    const instanceRootId = instantiated.instanceRootId as string;
    pages.serialize(instantiated.scene);
    const restoredMaster = pages.activate(componentPage.id, instantiated.scene);
    const editedMaster = structuredClone(restoredMaster);
    editedMaster.nodes["basic-story-heading"].props.text = "Updated shared story";
    const updatedMaster = components.updateDefinition(editedMaster, "story-card").scene;
    const document = pages.serialize(updatedMaster);
    const persistedInstancePage = document.pages.find((page) => page.id === instancePage.id);
    const instanceHeading = Object.values(persistedInstancePage?.scene.nodes ?? {}).find(
      (node) =>
        node.extensions?.componentInstanceId === instanceRootId &&
        node.extensions?.componentSourceNodeId === "basic-story-heading",
    );

    expect(document.components.definitions["story-card"]).toBeDefined();
    expect(instanceHeading?.props.text).toBe("Updated shared story");
  });

  it("captures controlled overrides for component instances on the home page", () => {
    const profile = { business_name: "Pages Store" };
    const components = createComponentSystem();
    let home = buildBasicTemplateScene(profile, []);
    home = components.createDefinition(home, "basic-story", {
      definitionId: "home-story-card",
    }).scene;
    const instantiated = components.instantiate(home, "home-story-card", "basic-root", {
      x: 40,
      y: 900,
    });
    const instanceRootId = instantiated.instanceRootId as string;
    const pages = createPageDocumentSystem(components);
    const loaded = pages.load(createEngineSceneTheme(instantiated.scene), instantiated.scene);
    const activeHome = loaded.document.pages[0].scene;
    const editedHome = structuredClone(activeHome);
    const instanceHeading = Object.values(editedHome.nodes).find(
      (node) =>
        node.extensions?.componentInstanceId === instanceRootId &&
        node.extensions?.componentSourceNodeId === "basic-story-heading",
    ) as SceneNode;
    instanceHeading.props.text = "Home page override";

    const document = pages.serialize(editedHome);
    const persistedHome = document.pages.find((page) => page.id === "home")?.scene as SceneTree;
    const persistedHeading = Object.values(persistedHome.nodes).find(
      (node) =>
        node.extensions?.componentInstanceId === instanceRootId &&
        node.extensions?.componentSourceNodeId === "basic-story-heading",
    );

    expect(persistedHeading?.props.text).toBe("Home page override");
    expect(persistedHome.nodes[instanceRootId].meta.componentInstance?.overrides).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceNodeId: "basic-story-heading", scope: "text" }),
      ]),
    );
  });
});
