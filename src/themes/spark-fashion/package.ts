import type { ThemePackage } from "@/theme-engine/contracts";
import { sparkFashionThemeManifest } from "./manifest";
import { sparkFashionSectionRenderers } from "./sections/SparkFashionSectionRenderers";
import {
  buildSparkFashionTemplateScene,
  reconcileSparkFashionProducts,
  type SparkFashionProductInput,
} from "./templates/home";
import "./styles/spark-fashion.css";

export const sparkFashionThemePackage: ThemePackage = {
  manifest: sparkFashionThemeManifest,
  sectionRenderers: sparkFashionSectionRenderers,
  createScene: (profile, products) =>
    buildSparkFashionTemplateScene(profile, products as SparkFashionProductInput[]),
  reconcileScene: (scene, profile, products) =>
    reconcileSparkFashionProducts(scene, profile, products as SparkFashionProductInput[]),
};

export default sparkFashionThemePackage;
