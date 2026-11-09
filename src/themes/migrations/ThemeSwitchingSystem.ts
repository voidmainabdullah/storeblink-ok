import type {
  CanonicalSectionType,
  ThemeInstallation,
  ThemeManifest,
} from "@/theme-engine/contracts";

export type ThemeSwitchMapping = {
  sourceSectionType: CanonicalSectionType | string;
  targetSectionType: CanonicalSectionType | string | null;
};

export type ThemeSwitchPlan = {
  previousInstallation: ThemeInstallation;
  nextInstallation: ThemeInstallation;
  mappings: ThemeSwitchMapping[];
  unsupportedSectionTypes: string[];
};

const portableMappings: Record<string, CanonicalSectionType> = {
  header: "site-header",
  footer: "site-footer",
  hero: "immersive-product-hero",
  "product-grid": "featured-product-collection",
  story: "brand-story",
  "rich-text": "rich-text",
  newsletter: "newsletter",
};

export class ThemeSwitchingSystem {
  prepare(input: {
    current: ThemeInstallation;
    targetManifest: ThemeManifest;
    sourceSectionTypes: string[];
    nextInstallationId: string;
    now?: string;
  }): ThemeSwitchPlan {
    const now = input.now ?? new Date().toISOString();
    const targetTemplate = input.targetManifest.templates.find(
      (template) => template.pageType === "home",
    );
    const nativeSectionTypes = new Set(targetTemplate?.allowedSectionTypes ?? []);
    const mappings = input.sourceSectionTypes.map((sourceSectionType) => {
      const portable = portableMappings[sourceSectionType] ?? sourceSectionType;
      return {
        sourceSectionType,
        targetSectionType: nativeSectionTypes.has(portable)
          ? portable
          : sourceSectionType,
      };
    });

    return {
      previousInstallation: {
        ...structuredClone(input.current),
        status: "archived",
        updatedAt: now,
      },
      nextInstallation: {
        id: input.nextInstallationId,
        storeId: input.current.storeId,
        themeId: input.targetManifest.id,
        themeVersion: input.targetManifest.version,
        schemaVersion: input.targetManifest.schemaVersion,
        status: "draft",
        globalSettings: structuredClone(input.current.globalSettings),
        featureSettings: {},
        createdAt: now,
        updatedAt: now,
      },
      mappings,
      unsupportedSectionTypes: [],
    };
  }
}

export const themeSwitchingSystem = new ThemeSwitchingSystem();
