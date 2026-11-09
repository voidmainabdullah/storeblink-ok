import type { ThemePackage } from "@/theme-engine/contracts";
import type {
  StoreSceneItem,
  StoreSceneProfile,
} from "@/editor/engine/storeSceneAdapter";
import { noirChronoThemeManifest } from "./manifest";
import { sectionRenderers } from "./renderers";
import {
  buildNoirChronoScene,
  reconcileNoirChronoProducts,
} from "./templates/home";
import "./styles/theme.css";

export const noirChronoThemePackage: ThemePackage = {
  manifest: noirChronoThemeManifest,
  sectionRenderers,
  createScene: (profile, products) =>
    buildNoirChronoScene(
      profile as StoreSceneProfile,
      products as StoreSceneItem[],
    ),
  reconcileScene: (scene, profile, products) =>
    reconcileNoirChronoProducts(
      scene,
      profile as StoreSceneProfile,
      products as StoreSceneItem[],
    ),
};

export * from "./controllers";
export default noirChronoThemePackage;
