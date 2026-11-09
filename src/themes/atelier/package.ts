import type { ThemePackage } from "@/theme-engine/contracts";
import { atelierThemeManifest } from "./manifest";
import { atelierSectionRenderers } from "./sections/AtelierSectionRenderers";
import {
  buildAtelierTemplateScene,
  reconcileAtelierProducts,
  type AtelierProductInput,
} from "./templates/home";
import "./styles/atelier.css";

export const atelierThemePackage: ThemePackage = {
  manifest: atelierThemeManifest,
  sectionRenderers: atelierSectionRenderers,
  createScene: (profile, products) =>
    buildAtelierTemplateScene(profile, products as AtelierProductInput[]),
  reconcileScene: (scene, profile, products) =>
    reconcileAtelierProducts(scene, profile, products as AtelierProductInput[]),
};

export default atelierThemePackage;
