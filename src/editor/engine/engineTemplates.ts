import { cloneSceneTree } from "@/engine/scene-graph";
import {
  assertValidSceneTreeStructure,
  validateSceneTree,
} from "@/engine/validation";
import { themePackageRegistry } from "@/theme-engine/registry";
import { themeChromeSystem } from "@/theme-engine/chrome";
import { themeFunctionalitySystem } from "@/theme-engine/functionality";
import { ensureBuiltInThemePackages } from "@/themes/registerBuiltInThemePackages";
import { builtInThemeRegistry } from "@/themes/registry";
import { themeProductionPolicy } from "@/themes/governance";
import type { SceneTree } from "@/types";
import {
  buildBasicTemplateScene,
  reconcileBasicTemplateProducts,
} from "./basicTemplate";
import type {
  StoreSceneItem,
  StoreSceneProfile,
} from "./storeSceneAdapter";
import {
  buildAtelierTemplateScene,
  reconcileAtelierProducts,
  type AtelierProductInput,
} from "@/themes/atelier/templates/home";
import {
  buildSparkFashionTemplateScene,
  reconcileSparkFashionProducts,
  type SparkFashionProductInput,
} from "@/themes/spark-fashion/templates/home";

export {
  buildBasicCustomPageScene,
  buildBasicTemplateScene,
  reconcileBasicTemplateProducts,
} from "./basicTemplate";
export {
  buildAtelierTemplateScene,
  reconcileAtelierProducts,
};
export {
  buildSparkFashionTemplateScene,
  reconcileSparkFashionProducts,
};

ensureBuiltInThemePackages();

export type EngineSceneTemplateId = string;

export type EngineSceneTemplateMeta = {
  id: EngineSceneTemplateId;
  name: string;
  description: string;
  previewImage?: string;
  category?: string[];
  badge?: string;
};

export const getEngineSceneTemplates = (): EngineSceneTemplateMeta[] =>
  builtInThemeRegistry
    .list()
    .filter((manifest) => themePackageRegistry.hasLoader(manifest.id))
    .sort(
      (left, right) =>
        (left.editor?.catalogOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.editor?.catalogOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.name.localeCompare(right.name),
    )
    .map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      description: manifest.description,
      previewImage: manifest.previewImage,
      category: manifest.category,
      badge: manifest.editor?.badge,
    }));

export const ENGINE_SCENE_TEMPLATES: EngineSceneTemplateMeta[] =
  getEngineSceneTemplates();

export const getEngineSceneTemplateId = (
  scene: SceneTree,
): EngineSceneTemplateId | null => {
  const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
  const id = root?.extensions?.themeId ?? root?.extensions?.template;
  return typeof id === "string" && id.trim() ? id : null;
};

export const preloadEngineTemplatePackages = async (): Promise<void> => {
  await Promise.all(
    ENGINE_SCENE_TEMPLATES.map(async ({ id }) => {
      await themePackageRegistry.load(id);
    }),
  );
};

export const loadEngineTemplateScene = async (
  templateId: EngineSceneTemplateId,
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
): Promise<SceneTree> => {
  const themePackage = await themePackageRegistry.load(templateId);
  if (!themePackage?.createScene) {
    throw new Error(`Theme package ${templateId} cannot create an editor scene.`);
  }
  const scene = themeFunctionalitySystem.ensureScene(themeChromeSystem.ensureScene(
    validateSceneTree(
      themePackage.createScene(
        { ...profile } as Record<string, unknown>,
        items,
      ),
    ),
  ));
  assertValidSceneTreeStructure(scene);
  themeProductionPolicy.auditScene(
    scene,
    {
      mode: "draft",
      productIds: items
        .map((item) => item.id)
        .filter((id): id is string | number => id !== null && id !== undefined),
    },
    { manifest: themePackage.manifest },
  );
  return scene;
};

export const reconcileEngineTemplateScene = async (
  scene: SceneTree,
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
): Promise<SceneTree> => {
  const templateId = getEngineSceneTemplateId(scene);
  if (!templateId) return themeChromeSystem.ensureScene(scene);
  if (templateId === "threadtemplate") {
    const migrated = themeFunctionalitySystem.ensureScene(
      themeChromeSystem.ensureScene(buildBasicTemplateScene(profile, items)),
    );
    themeProductionPolicy.auditScene(migrated, {
      mode: "draft",
      productIds: items
        .map((item) => item.id)
        .filter((id): id is string | number => id !== null && id !== undefined),
    }, { manifest: builtInThemeRegistry.get("basic") });
    return migrated;
  }
  const themePackage = await themePackageRegistry.load(templateId);
  if (!themePackage?.reconcileScene) {
    const ensured = themeFunctionalitySystem.ensureScene(
      themeChromeSystem.ensureScene(scene),
    );
    themeProductionPolicy.auditScene(ensured, {
      mode: "draft",
      productIds: items
        .map((item) => item.id)
        .filter((id): id is string | number => id !== null && id !== undefined),
    }, { manifest: themePackage?.manifest });
    return ensured;
  }
  const reconciled = themeFunctionalitySystem.ensureScene(themeChromeSystem.ensureScene(
    validateSceneTree(
      themePackage.reconcileScene(
        cloneSceneTree(scene),
        { ...profile } as Record<string, unknown>,
        items,
      ),
    ),
  ));
  assertValidSceneTreeStructure(reconciled);
  themeProductionPolicy.auditScene(
    reconciled,
    {
      mode: "draft",
      productIds: items
        .map((item) => item.id)
        .filter((id): id is string | number => id !== null && id !== undefined),
    },
    { manifest: themePackage.manifest },
  );
  return reconciled;
};

export const buildEngineTemplateScene = (
  templateId: EngineSceneTemplateId,
  profile: StoreSceneProfile,
  items: StoreSceneItem[] = [],
): SceneTree => {
  if (templateId === "basic") {
    return themeFunctionalitySystem.ensureScene(
      themeChromeSystem.ensureScene(buildBasicTemplateScene(profile, items)),
    );
  }
  if (templateId === "atelier") {
    return themeFunctionalitySystem.ensureScene(
      themeChromeSystem.ensureScene(buildAtelierTemplateScene(
        profile,
        items as unknown as AtelierProductInput[],
      )),
    );
  }
  if (templateId === "spark-fashion") {
    return themeFunctionalitySystem.ensureScene(
      themeChromeSystem.ensureScene(buildSparkFashionTemplateScene(
        profile,
        items as unknown as SparkFashionProductInput[],
      )),
    );
  }
  throw new Error(`Unknown engine scene template: ${String(templateId)}`);
};
