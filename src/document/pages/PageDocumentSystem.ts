import {
  SCENE_NAVIGATION_EXTENSION_KEY,
  navigationSystem,
} from "@/content/menus";
import {
  componentSystem,
  type ComponentSystemAPI,
} from "@/document/components";
import { cloneSceneTree, generateNodeId } from "@/engine/scene-graph";
import { validateSceneTree } from "@/engine/validation";
import { structuredLayoutSystem } from "@/layout/structured";
import { themeChromeSystem } from "@/theme-engine/chrome";
import type {
  ComponentLibrary,
  SceneNode,
  SceneTree,
  SharedChromeComponentReferences,
} from "@/types";

export const ENGINE_PAGE_DOCUMENT_THEME_KEY = "engine_page_document";

export type StorefrontPageKind = "home" | "custom";

export type StorefrontPage = {
  id: string;
  title: string;
  slug: string;
  kind: StorefrontPageKind;
  scene: SceneTree;
};

export type StorefrontPageDocument = {
  version: 2;
  homePageId: string;
  pages: StorefrontPage[];
  components: ComponentLibrary;
  sharedChrome: SharedChromeComponentReferences;
};

export type PageDocumentSnapshot = {
  document: StorefrontPageDocument;
  activePageId: string;
  revision: number;
};

export type PreparedPageTransition = {
  before: PageDocumentSnapshot;
  after: PageDocumentSnapshot;
  scene: SceneTree;
  page: StorefrontPage;
};

type PageListener = () => void;

const SHARED_ROOT_EXTENSION_KEYS = [
  SCENE_NAVIGATION_EXTENSION_KEY,
  "assetLibrary",
  "themeChrome",
  "themeBranding",
  "designTokens",
] as const;

const clonePage = (page: StorefrontPage): StorefrontPage => ({
  ...page,
  scene: cloneSceneTree(page.scene),
});

const cloneDocument = (
  document: StorefrontPageDocument,
): StorefrontPageDocument => {
  const components = structuredClone(document.components);
  return {
    ...document,
    components,
    sharedChrome: { ...document.sharedChrome },
    pages: document.pages.map((page) => {
      const cloned = clonePage(page);
      cloned.scene.components = components;
      return cloned;
    }),
  };
};

const cloneSnapshot = (snapshot: PageDocumentSnapshot): PageDocumentSnapshot => ({
  document: cloneDocument(snapshot.document),
  activePageId: snapshot.activePageId,
  revision: snapshot.revision,
});

const sectionRole = (
  node: SceneNode | undefined,
): "header" | "footer" | null => {
  const sectionType = node?.extensions?.sectionType;
  const canonicalType = node?.extensions?.canonicalSectionType;
  if (
    sectionType === "header" ||
    sectionType === "site-header" ||
    canonicalType === "site-header"
  ) {
    return "header";
  }
  if (
    sectionType === "footer" ||
    sectionType === "site-footer" ||
    canonicalType === "site-footer"
  ) {
    return "footer";
  }
  return null;
};

export const localizePageSections = (input: SceneTree): SceneTree => {
  const scene = cloneSceneTree(input);
  Object.values(scene.nodes).forEach((node) => {
    if (
      node.type !== "section" ||
      node.extensions?.editorKind !== "section"
    ) {
      return;
    }
    const componentRole = node.extensions?.componentRole;
    const sharedRole = sectionRole(node);
    if (sharedRole && (componentRole === "definition" || componentRole === "instance")) {
      node.extensions = {
        ...(node.extensions ?? {}),
        global: true,
        sectionScope: componentRole === "definition" ? "shared-master" : "shared-reference",
        sharedChromeRole: sharedRole,
      };
      return;
    }
    node.extensions = {
      ...(node.extensions ?? {}),
      global: false,
      sectionScope: "local",
      sectionInstanceId:
        typeof node.extensions?.sectionInstanceId === "string" &&
        node.extensions.sectionInstanceId.trim()
          ? node.extensions.sectionInstanceId
          : node.id,
    };
  });
  return scene;
};

const removeSceneSubtree = (scene: SceneTree, nodeId: string): void => {
  const node = scene.nodes[nodeId];
  if (!node) return;
  node.childIds.forEach((childId) => removeSceneSubtree(scene, childId));
  delete scene.nodes[nodeId];
};

const copySharedRootExtensions = (
  targetScene: SceneTree,
  sourceScene: SceneTree,
): SceneTree => {
  if (!targetScene.rootNodeId || !sourceScene.rootNodeId) {
    return cloneSceneTree(targetScene);
  }
  const target = cloneSceneTree(targetScene);
  const targetRoot = target.nodes[target.rootNodeId];
  const sourceRoot = sourceScene.nodes[sourceScene.rootNodeId];
  const extensions = { ...(targetRoot.extensions ?? {}) };
  SHARED_ROOT_EXTENSION_KEYS.forEach((key) => {
    const value = sourceRoot.extensions?.[key];
    if (value === undefined) delete extensions[key];
    else extensions[key] = structuredClone(value);
  });
  targetRoot.extensions = extensions;
  return target;
};

const SHARED_CHROME_DEFINITION_IDS = {
  header: "store-shared-header",
  footer: "store-shared-footer",
} as const;

const libraryFor = (scene: SceneTree, fallback?: ComponentLibrary): ComponentLibrary =>
  structuredClone(scene.components ?? fallback ?? { version: 1, definitions: {} });

const ensureHomeSharedChrome = (
  input: SceneTree,
  fallbackLibrary?: ComponentLibrary,
  components: ComponentSystemAPI = componentSystem,
): SceneTree => {
  let scene = cloneSceneTree(input);
  scene.components = libraryFor(scene, fallbackLibrary);
  if (!scene.rootNodeId) return scene;
  const root = scene.nodes[scene.rootNodeId];

  (["header", "footer"] as const).forEach((role) => {
    const section = root.childIds
      .map((nodeId) => scene.nodes[nodeId])
      .find((node) => sectionRole(node) === role);
    if (!section) return;
    const definitionId = scene.components?.sharedChrome?.[`${role}DefinitionId`] ??
      SHARED_CHROME_DEFINITION_IDS[role];
    section.meta = { ...section.meta };
    delete section.meta.componentId;
    delete section.meta.componentInstance;
    section.extensions = {
      ...(section.extensions ?? {}),
      componentRole: "definition",
      componentDefinitionId: definitionId,
      global: true,
      sectionScope: "shared-master",
      sharedChromeRole: role,
    };
    const existing = scene.components?.definitions[definitionId];
    if (!existing) {
      scene = components.createDefinition(scene, section.id, {
        definitionId,
        name: `Shared ${role}`,
      }).scene;
    } else {
      existing.masterNodeId = section.id;
      scene = components.updateDefinition(scene, definitionId).scene;
    }
    scene.components = {
      ...(scene.components as ComponentLibrary),
      sharedChrome: {
        ...((scene.components as ComponentLibrary).sharedChrome ?? {}),
        [`${role}DefinitionId`]: definitionId,
      },
    };
  });
  return components.propagateAll(localizePageSections(validateSceneTree(scene)));
};

const ensurePageSharedChrome = (
  input: SceneTree,
  sourceScene: SceneTree,
  library: ComponentLibrary,
  components: ComponentSystemAPI = componentSystem,
): SceneTree => {
  if (!input.rootNodeId) return cloneSceneTree(input);
  let scene = copySharedRootExtensions(input, sourceScene);
  scene = components.captureOverrides(scene);
  scene.components = library;

  (["header", "footer"] as const).forEach((role) => {
    const root = scene.nodes[scene.rootNodeId as string];
    const definitionId = library.sharedChrome?.[`${role}DefinitionId`];
    if (!definitionId || !library.definitions[definitionId]) return;
    const targetId = root.childIds.find((nodeId) => sectionRole(scene.nodes[nodeId]) === role);
    const target = targetId ? scene.nodes[targetId] : undefined;
    const existingDefinitionId = target?.meta.componentInstance?.componentDefinitionId;
    if (target && existingDefinitionId === definitionId) return;
    const targetIndex = targetId
      ? root.childIds.indexOf(targetId)
      : role === "header"
        ? 0
        : root.childIds.length;
    const placement = target?.transform;
    if (targetId) {
      root.childIds = root.childIds.filter((nodeId) => nodeId !== targetId);
      removeSceneSubtree(scene, targetId);
    }
    const instantiated = components.instantiate(scene, definitionId, root.id, {
      index: targetIndex,
      x: placement?.x,
      y: placement?.y,
      zIndex: placement?.zIndex,
    });
    scene = instantiated.scene;
  });

  scene = components.propagateAll(scene);

  const propagated = validateSceneTree(themeChromeSystem.ensureScene(scene));
  const withNavigation = navigationSystem.applyDocument(
    propagated,
    navigationSystem.getDocument(sourceScene),
  );
  const validated = localizePageSections(validateSceneTree(withNavigation));
  return structuredLayoutSystem.isStructuredScene(validated)
    ? structuredLayoutSystem.reflowScene(validated)
    : validated;
};

export const copyPageChromeAsLocalInstances = (
  targetScene: SceneTree,
  sourceScene: SceneTree,
): SceneTree => {
  if (!targetScene.rootNodeId || !sourceScene.rootNodeId) {
    return cloneSceneTree(targetScene);
  }
  const source = ensureHomeSharedChrome(sourceScene);
  return ensurePageSharedChrome(
    targetScene,
    source,
    source.components as ComponentLibrary,
  );
};

export const pageSlug = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "page";
};

const createHomeDocument = (
  input: SceneTree,
  components: ComponentSystemAPI = componentSystem,
): StorefrontPageDocument => {
  const scene = ensureHomeSharedChrome(input, input.components, components);
  const library = structuredClone(scene.components as ComponentLibrary);
  return {
    version: 2,
    homePageId: "home",
    components: library,
    sharedChrome: { ...(library.sharedChrome ?? {}) },
    pages: [
      {
        id: "home",
        title: "Home",
        slug: "home",
        kind: "home",
        scene,
      },
    ],
  };
};

const readPersistedDocument = (
  rawTheme: unknown,
): StorefrontPageDocument | null => {
  if (!rawTheme || typeof rawTheme !== "object") return null;
  const candidate = (rawTheme as Record<string, unknown>)[
    ENGINE_PAGE_DOCUMENT_THEME_KEY
  ];
  if (!candidate || typeof candidate !== "object") return null;
  const rawDocument = candidate as Omit<Partial<StorefrontPageDocument>, "version"> & {
    version?: number;
  };
  if (
    (rawDocument.version !== 1 && rawDocument.version !== 2) ||
    !Array.isArray(rawDocument.pages) ||
    !rawDocument.pages.length
  ) {
    return null;
  }

  try {
    const pages = rawDocument.pages.map((rawPage) => {
      if (
        !rawPage ||
        typeof rawPage.id !== "string" ||
        typeof rawPage.title !== "string" ||
        typeof rawPage.slug !== "string" ||
        (rawPage.kind !== "home" && rawPage.kind !== "custom")
      ) {
        throw new Error("Invalid storefront page metadata.");
      }
      return {
        id: rawPage.id,
        title: rawPage.title,
        slug: pageSlug(rawPage.slug),
        kind: rawPage.kind,
        scene: localizePageSections(validateSceneTree(rawPage.scene)),
      };
    });
    const homePageId =
      typeof rawDocument.homePageId === "string" &&
      pages.some(
        (page) =>
          page.id === rawDocument.homePageId && page.kind === "home",
      )
        ? rawDocument.homePageId
        : pages.find((page) => page.kind === "home")?.id;
    if (!homePageId) return null;
    const home = pages.find((page) => page.id === homePageId) as StorefrontPage;
    const library = rawDocument.components ?? home.scene.components ?? emptyComponentLibrary();
    return {
      version: 2,
      homePageId,
      pages,
      components: structuredClone(library),
      sharedChrome: {
        ...(rawDocument.sharedChrome ?? library.sharedChrome ?? {}),
      },
    };
  } catch {
    return null;
  }
};

const emptyComponentLibrary = (): ComponentLibrary => ({ version: 1, definitions: {} });

const normalizeDocumentSharedSystems = (
  document: StorefrontPageDocument,
  components: ComponentSystemAPI = componentSystem,
): StorefrontPageDocument => {
  const home = document.pages.find((page) => page.id === document.homePageId);
  if (!home) return cloneDocument(document);
  let homeInput = cloneSceneTree(home.scene);
  homeInput = components.captureOverrides(homeInput);
  homeInput.components = structuredClone(document.components ?? homeInput.components ?? emptyComponentLibrary());
  const homeScene = ensureHomeSharedChrome(homeInput, document.components, components);
  const library = structuredClone(homeScene.components as ComponentLibrary);
  homeScene.components = library;
  return {
    ...document,
    version: 2,
    components: library,
    sharedChrome: { ...(library.sharedChrome ?? {}) },
    pages: document.pages.map((page) => ({
      ...page,
      scene:
        page.id === home.id
          ? homeScene
          : ensurePageSharedChrome(page.scene, homeScene, library, components),
    })),
  };
};

export const getStorefrontPageDocument = (
  rawTheme: unknown,
  fallbackScene: SceneTree,
): StorefrontPageDocument =>
  normalizeDocumentSharedSystems(
    readPersistedDocument(rawTheme) ?? createHomeDocument(fallbackScene),
  );

export const getStorefrontPageBySlug = (
  rawTheme: unknown,
  fallbackScene: SceneTree,
  slug: string,
): StorefrontPage | null => {
  const document = getStorefrontPageDocument(rawTheme, fallbackScene);
  const normalized = pageSlug(slug);
  const page = document.pages.find((candidate) => candidate.slug === normalized);
  return page ? clonePage(page) : null;
};

export class PageDocumentSystem {
  private listeners = new Set<PageListener>();
  private snapshot: PageDocumentSnapshot | null = null;

  constructor(private readonly components: ComponentSystemAPI = componentSystem) {}

  load(rawTheme: unknown, fallbackScene: SceneTree): PageDocumentSnapshot {
    const document = normalizeDocumentSharedSystems(
      readPersistedDocument(rawTheme) ?? createHomeDocument(fallbackScene, this.components),
      this.components,
    );
    this.snapshot = {
      document,
      activePageId: document.homePageId,
      revision: (this.snapshot?.revision ?? 0) + 1,
    };
    this.emit();
    return this.getSnapshot();
  }

  getSnapshot = (): PageDocumentSnapshot => {
    if (!this.snapshot) {
      throw new Error("PageDocumentSystem must be loaded before it is read.");
    }
    return cloneSnapshot(this.snapshot);
  };

  subscribe = (listener: PageListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getActivePage(): StorefrontPage {
    const snapshot = this.getSnapshot();
    const page = snapshot.document.pages.find(
      (candidate) => candidate.id === snapshot.activePageId,
    );
    if (!page) {
      throw new Error(
        `Active storefront page ${snapshot.activePageId} does not exist.`,
      );
    }
    return clonePage(page);
  }

  activate(pageId: string, currentScene: SceneTree): SceneTree {
    const prepared = this.prepareActivate(pageId, currentScene);
    this.restore(prepared.after);
    return cloneSceneTree(prepared.scene);
  }

  prepareActivate(pageId: string, currentScene: SceneTree): PreparedPageTransition {
    const snapshot = this.getSnapshot();
    if (!snapshot.document.pages.some((page) => page.id === pageId)) {
      throw new Error(`Storefront page ${pageId} does not exist.`);
    }
    const document = this.withActiveScene(currentScene);
    const before: PageDocumentSnapshot = {
      ...snapshot,
      document,
    };
    const target = document.pages.find((page) => page.id === pageId);
    if (!target) throw new Error(`Storefront page ${pageId} does not exist.`);
    return {
      before,
      after: {
        document,
        activePageId: pageId,
        revision: before.revision + 1,
      },
      scene: cloneSceneTree(target.scene),
      page: clonePage(target),
    };
  }

  prepareSceneUpdate(currentScene: SceneTree, nextScene: SceneTree): PreparedPageTransition {
    const snapshot = this.getSnapshot();
    const beforeDocument = this.withActiveSceneFor(snapshot, currentScene);
    const before: PageDocumentSnapshot = {
      ...snapshot,
      document: beforeDocument,
    };
    const afterDocument = this.withActiveSceneFor(before, nextScene);
    const page = afterDocument.pages.find((candidate) => candidate.id === snapshot.activePageId);
    if (!page) {
      throw new Error(`Active storefront page ${snapshot.activePageId} does not exist.`);
    }
    return {
      before,
      after: {
        document: afterDocument,
        activePageId: snapshot.activePageId,
        revision: before.revision + 1,
      },
      scene: cloneSceneTree(page.scene),
      page: clonePage(page),
    };
  }

  prepareSharedRootUpdate(
    currentScene: SceneTree,
    updateHomeScene: (homeScene: SceneTree) => SceneTree,
  ): PreparedPageTransition {
    const snapshot = this.getSnapshot();
    const beforeDocument = this.withActiveSceneFor(snapshot, currentScene);
    const before: PageDocumentSnapshot = {
      ...snapshot,
      document: beforeDocument,
    };
    const home = beforeDocument.pages.find(
      (page) => page.id === beforeDocument.homePageId,
    );
    if (!home) {
      throw new Error(`Home storefront page ${beforeDocument.homePageId} does not exist.`);
    }
    const nextHomeScene = localizePageSections(
      validateSceneTree(updateHomeScene(cloneSceneTree(home.scene))),
    );
    const afterDocument = normalizeDocumentSharedSystems(
      {
        ...beforeDocument,
        pages: beforeDocument.pages.map((page) =>
          page.id === beforeDocument.homePageId
            ? { ...page, scene: nextHomeScene }
            : page,
        ),
      },
      this.components,
    );
    const page = afterDocument.pages.find(
      (candidate) => candidate.id === snapshot.activePageId,
    );
    if (!page) {
      throw new Error(`Active storefront page ${snapshot.activePageId} does not exist.`);
    }
    return {
      before,
      after: {
        document: afterDocument,
        activePageId: snapshot.activePageId,
        revision: before.revision + 1,
      },
      scene: cloneSceneTree(page.scene),
      page: clonePage(page),
    };
  }

  addPage(
    input: { title: string; slug?: string; scene: SceneTree },
    currentScene: SceneTree,
  ): StorefrontPage {
    const prepared = this.prepareAddPage(input, currentScene);
    this.restore(prepared.after);
    return clonePage(prepared.page);
  }

  prepareAddPage(
    input: { title: string; slug?: string; scene: SceneTree },
    currentScene: SceneTree,
  ): PreparedPageTransition {
    const snapshot = this.getSnapshot();
    const document = this.withActiveScene(currentScene);
    const before: PageDocumentSnapshot = {
      ...snapshot,
      document,
    };
    const title = input.title.trim() || "Untitled page";
    const baseSlug = pageSlug(input.slug ?? title);
    const usedSlugs = new Set(document.pages.map((page) => page.slug));
    let slug = baseSlug;
    let suffix = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }
    const page: StorefrontPage = {
      id: generateNodeId("page"),
      title,
      slug,
      kind: "custom",
      scene: ensurePageSharedChrome(
        validateSceneTree(input.scene),
        document.pages.find((candidate) => candidate.id === document.homePageId)?.scene ?? currentScene,
        document.components,
        this.components,
      ),
    };
    const after: PageDocumentSnapshot = {
      document: { ...document, pages: [...document.pages, page] },
      activePageId: page.id,
      revision: before.revision + 1,
    };
    return { before, after, scene: cloneSceneTree(page.scene), page: clonePage(page) };
  }

  finalizeTransition(
    transition: PreparedPageTransition,
    scene: SceneTree,
  ): PreparedPageTransition {
    const after = cloneSnapshot(transition.after);
    const pageIndex = after.document.pages.findIndex(
      (page) => page.id === after.activePageId,
    );
    if (pageIndex < 0) {
      throw new Error(
        `Active storefront page ${after.activePageId} does not exist.`,
      );
    }
    after.document.pages[pageIndex] = {
      ...after.document.pages[pageIndex],
      scene: localizePageSections(validateSceneTree(scene)),
    };
    after.document = normalizeDocumentSharedSystems(after.document, this.components);
    const page = after.document.pages.find(
      (candidate) => candidate.id === after.activePageId,
    );
    if (!page) {
      throw new Error(
        `Active storefront page ${after.activePageId} does not exist.`,
      );
    }
    return {
      before: cloneSnapshot(transition.before),
      after,
      scene: cloneSceneTree(page.scene),
      page: clonePage(page),
    };
  }

  restore(snapshot: PageDocumentSnapshot): void {
    if (!snapshot.document.pages.some((page) => page.id === snapshot.activePageId)) {
      throw new Error(`Active storefront page ${snapshot.activePageId} does not exist.`);
    }
    const document = normalizeDocumentSharedSystems({
      ...cloneDocument(snapshot.document),
      pages: snapshot.document.pages.map((page) => ({
        ...page,
        scene: validateSceneTree(page.scene),
      })),
    }, this.components);
    this.snapshot = {
      document,
      activePageId: snapshot.activePageId,
      revision: snapshot.revision,
    };
    this.emit();
  }

  serialize(currentScene: SceneTree): StorefrontPageDocument {
    const snapshot = this.getSnapshot();
    const document = this.withActiveScene(currentScene);
    this.snapshot = { ...snapshot, document };
    return cloneDocument(document);
  }

  private withActiveScene(scene: SceneTree): StorefrontPageDocument {
    return this.withActiveSceneFor(this.getSnapshot(), scene);
  }

  private withActiveSceneFor(
    snapshot: PageDocumentSnapshot,
    scene: SceneTree,
  ): StorefrontPageDocument {
    let validated = localizePageSections(validateSceneTree(scene));
    validated.components = libraryFor(validated, snapshot.document.components);
    validated = this.components.captureOverrides(validated);
    validated = snapshot.activePageId === snapshot.document.homePageId
      ? ensureHomeSharedChrome(validated, snapshot.document.components, this.components)
      : validated;
    const updated = {
      ...snapshot.document,
      components: structuredClone(validated.components ?? snapshot.document.components),
      pages: snapshot.document.pages.map((page) =>
        page.id === snapshot.activePageId ? { ...page, scene: validated } : page,
      ),
    };
    return normalizeDocumentSharedSystems(updated, this.components);
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const createPageDocumentSystem = (components?: ComponentSystemAPI) =>
  new PageDocumentSystem(components);
