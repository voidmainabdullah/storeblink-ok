import type {
  ResolvedThemeFeature,
  ThemeCapabilities,
  ThemeManifest,
} from "./types";
import { validateThemeManifest } from "@/theme-engine/validation";
import { assertPlatformCompiledThemeId } from "@/themes/platformTrust";

const cloneManifest = (manifest: ThemeManifest): ThemeManifest => structuredClone(manifest);

const featureCapability: Partial<Record<string, keyof ThemeCapabilities>> = {
  "mega-menu": "megaMenu",
  "product-quick-view": "productQuickView",
  "product-compare": "productCompare",
  "sticky-add-to-cart": "stickyAddToCart",
  "product-filters": "productFilters",
  "color-swatches": "colorSwatches",
  "customer-drawer": "customerDrawer",
  "predictive-search": "predictiveSearch",
  "announcement-slider": "announcementSlider",
};

export class ThemeRegistry {
  private readonly manifests = new Map<string, ThemeManifest>();

  register(manifest: ThemeManifest): void {
    const validated = validateThemeManifest(manifest);
    const existing = this.manifests.get(validated.id);
    if (existing && existing.version !== manifest.version) {
      throw new Error(
        `Theme ${manifest.id} ${existing.version} is already registered. Install another version through the migration system.`,
      );
    }
    if (existing) throw new Error(`Theme ${validated.id} ${validated.version} is already registered.`);
    this.manifests.set(validated.id, cloneManifest(validated));
  }

  get(themeId: string): ThemeManifest | null {
    const manifest = this.manifests.get(themeId);
    return manifest ? cloneManifest(manifest) : null;
  }

  list(): ThemeManifest[] {
    return [...this.manifests.values()].map(cloneManifest);
  }

  resolveFeature(themeId: string, featureId: string): ResolvedThemeFeature | null {
    const manifest = this.manifests.get(themeId);
    if (!manifest || !manifest.features.includes(featureId)) return null;
    const capability = featureCapability[featureId];
    if (capability && !manifest.capabilities[capability]) return null;
    return { id: featureId, enabled: true, sourceThemeId: manifest.id };
  }

  supportsTemplate(themeId: string, templateKey: string, pageType?: string): boolean {
    const template = this.manifests
      .get(themeId)
      ?.templates.find((candidate) => candidate.key === templateKey);
    return Boolean(template && (!pageType || template.pageType === pageType));
  }
}

const baseCapabilities: ThemeCapabilities = {
  stickyHeader: true,
  transparentHeader: false,
  megaMenu: false,
  predictiveSearch: false,
  cartDrawer: false,
  productHotspots: false,
  productQuickView: false,
  quickAdd: true,
  collectionFilters: true,
  collectionSorting: true,
  customerAccountDrawer: false,
  appBlocks: true,
  editorialTypography: false,
  productCompare: false,
  stickyAddToCart: false,
  productFilters: true,
  colorSwatches: false,
  customerDrawer: false,
  announcementSlider: false,
};

export const builtInThemeRegistry = new ThemeRegistry();

builtInThemeRegistry.register({
  id: "basic",
  name: "Basic Store",
  description: "Structured responsive storefront connected to live products.",
  version: "1.0.0",
  schemaVersion: 1,
  minimumPlatformVersion: "1.0.0",
  capabilities: baseCapabilities,
  templates: [
    {
      key: "home-default",
      name: "Home",
      pageType: "home",
      allowedSectionTypes: ["header", "hero", "product-grid", "story", "benefits", "newsletter", "footer"],
      requiredSectionTypes: ["header", "footer"],
      removable: false,
    },
    {
      key: "page-default",
      name: "Page",
      pageType: "page",
      allowedSectionTypes: ["header", "content", "image-text", "newsletter", "footer"],
      requiredSectionTypes: ["header", "footer"],
      removable: false,
    },
  ],
  features: ["product-filters"],
  editor: {
    catalogOrder: 20,
  },
});

const discoveredManifestModules = import.meta.glob("../*/manifest.ts", {
  eager: true,
}) as Record<string, Record<string, unknown>>;

Object.entries(discoveredManifestModules).forEach(([path, module]) => {
  const themeId = path.match(/^\.\.\/([^/]+)\/manifest\.ts$/)?.[1];
  if (!themeId) throw new Error(`Cannot resolve compiled theme identity from ${path}.`);
  assertPlatformCompiledThemeId(themeId);
  const manifest =
    module.default ??
    Object.entries(module).find(([key]) => key.endsWith("ThemeManifest"))?.[1];
  if (manifest) builtInThemeRegistry.register(manifest as ThemeManifest);
});
