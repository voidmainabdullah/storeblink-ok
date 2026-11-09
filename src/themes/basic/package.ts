import type { ThemePackage } from "@/theme-engine/contracts";
import {
  buildBasicTemplateScene,
  reconcileBasicTemplateProducts,
} from "@/editor/engine/basicTemplate";
import type {
  StoreSceneItem,
  StoreSceneProfile,
} from "@/editor/engine/storeSceneAdapter";
import { builtInThemeRegistry } from "@/themes/registry";

const manifest = builtInThemeRegistry.get("basic");

if (!manifest) {
  throw new Error("The Basic theme manifest is not registered.");
}

export const basicThemePackage: ThemePackage = {
  manifest,
  sectionRenderers: {},
  createScene: (profile, products) =>
    buildBasicTemplateScene(
      profile as StoreSceneProfile,
      products as StoreSceneItem[],
    ),
  reconcileScene: (scene, profile, products) =>
    reconcileBasicTemplateProducts(
      scene,
      profile as StoreSceneProfile,
      products as StoreSceneItem[],
    ),
};

export default basicThemePackage;
