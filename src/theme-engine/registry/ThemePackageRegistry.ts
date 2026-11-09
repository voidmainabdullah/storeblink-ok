import type {
  CanonicalSectionType,
  ThemePackage,
  ThemeSectionRenderer,
} from "@/theme-engine/contracts";
import { validateThemeManifest } from "@/theme-engine/validation";
import { isPlatformCompiledThemeId } from "@/theme-engine/security/platformThemeTrust";

export type ThemePackageLoader = () => Promise<ThemePackage>;

export type ThemePackageProvenance =
  | { source: "platform" }
  | {
      source: "signed";
      publisher: string;
      keyId: string;
      signature: string;
    }
  | { source: "development" };

export type ThemePackageRegistryOptions = {
  requireTrustedPackages?: boolean;
  maximumPackages?: number;
  verifySignedPackage?: (
    themePackage: ThemePackage,
    provenance: Extract<ThemePackageProvenance, { source: "signed" }>,
  ) => boolean | Promise<boolean>;
  isPlatformPackage?: (themeId: string) => boolean;
};

export class ThemePackageRegistry {
  private readonly loaders = new Map<string, ThemePackageLoader>();
  private readonly packages = new Map<string, ThemePackage>();
  private readonly pending = new Map<string, Promise<ThemePackage | null>>();
  private readonly provenance = new Map<string, ThemePackageProvenance>();
  private readonly familyRenderers = new Map<string, Partial<Record<CanonicalSectionType, ThemeSectionRenderer>>>();
  private readonly universalRenderers = new Map<CanonicalSectionType, ThemeSectionRenderer>();

  constructor(private readonly options: ThemePackageRegistryOptions = {}) {}

  registerLoader(
    themeId: string,
    loader: ThemePackageLoader,
    provenance: ThemePackageProvenance = { source: "development" },
  ): () => void {
    if (!themeId.trim()) throw new Error("Theme package id is required.");
    if (this.loaders.has(themeId)) throw new Error(`Theme package loader ${themeId} is already registered.`);
    if (this.loaders.size >= (this.options.maximumPackages ?? 256)) {
      throw new Error(`Theme package registry limit of ${this.options.maximumPackages ?? 256} was reached.`);
    }
    this.assertProvenance(themeId, provenance);
    this.loaders.set(themeId, loader);
    this.provenance.set(themeId, structuredClone(provenance));
    return () => {
      if (this.loaders.get(themeId) === loader) {
        this.loaders.delete(themeId);
        this.packages.delete(themeId);
        this.pending.delete(themeId);
        this.provenance.delete(themeId);
      }
    };
  }

  registerPackage(
    themePackage: ThemePackage,
    provenance: ThemePackageProvenance = { source: "development" },
  ): () => void {
    validateThemeManifest(themePackage.manifest);
    const themeId = themePackage.manifest.id;
    if (this.packages.has(themeId)) throw new Error(`Theme package ${themeId} is already loaded.`);
    this.assertProvenance(themeId, provenance);
    this.packages.set(themeId, themePackage);
    this.provenance.set(themeId, structuredClone(provenance));
    return () => {
      if (this.packages.get(themeId) === themePackage) {
        this.packages.delete(themeId);
        this.provenance.delete(themeId);
      }
    };
  }

  registerFamilyRenderers(
    family: string,
    renderers: Partial<Record<CanonicalSectionType, ThemeSectionRenderer>>,
  ): () => void {
    if (this.familyRenderers.has(family)) throw new Error(`Theme family ${family} is already registered.`);
    this.familyRenderers.set(family, renderers);
    return () => this.familyRenderers.delete(family);
  }

  registerUniversalRenderer(sectionType: CanonicalSectionType, renderer: ThemeSectionRenderer): () => void {
    if (this.universalRenderers.has(sectionType)) {
      throw new Error(`Universal renderer ${sectionType} is already registered.`);
    }
    this.universalRenderers.set(sectionType, renderer);
    return () => {
      if (this.universalRenderers.get(sectionType) === renderer) {
        this.universalRenderers.delete(sectionType);
      }
    };
  }

  hasUniversalRenderer(sectionType: CanonicalSectionType): boolean {
    return this.universalRenderers.has(sectionType);
  }

  hasLoader(themeId: string): boolean {
    return this.loaders.has(themeId);
  }

  getLoaded(themeId: string): ThemePackage | null {
    return this.packages.get(themeId) ?? null;
  }

  getProvenance(themeId: string): ThemePackageProvenance | null {
    const provenance = this.provenance.get(themeId);
    return provenance ? structuredClone(provenance) : null;
  }

  async load(themeId: string): Promise<ThemePackage | null> {
    const loaded = this.packages.get(themeId);
    if (loaded) return loaded;
    const existing = this.pending.get(themeId);
    if (existing) return existing;
    const loader = this.loaders.get(themeId);
    if (!loader) return null;
    const provenance = this.provenance.get(themeId) ?? { source: "development" };

    const pending = loader()
      .then(async (themePackage) => {
        validateThemeManifest(themePackage.manifest);
        if (themePackage.manifest.id !== themeId) {
          throw new Error(
            `Theme package loader ${themeId} returned ${themePackage.manifest.id}.`,
          );
        }
        if (provenance.source === "signed") {
          const valid = await this.options.verifySignedPackage?.(themePackage, provenance);
          if (valid !== true) {
            throw new Error(`Theme package ${themeId} has an invalid or unverifiable signature.`);
          }
        }
        this.packages.set(themeId, themePackage);
        return themePackage;
      })
      .finally(() => this.pending.delete(themeId));
    this.pending.set(themeId, pending);
    return pending;
  }

  resolveSectionRenderer(
    themePackage: ThemePackage | null,
    sectionType: CanonicalSectionType,
    unknownRenderer: ThemeSectionRenderer,
  ): ThemeSectionRenderer {
    return (
      themePackage?.sectionRenderers[sectionType] ??
      (themePackage?.manifest.family
        ? this.familyRenderers.get(themePackage.manifest.family)?.[sectionType]
        : undefined) ??
      this.universalRenderers.get(sectionType) ??
      unknownRenderer
    );
  }

  clear(): void {
    this.loaders.clear();
    this.packages.clear();
    this.pending.clear();
    this.provenance.clear();
    this.familyRenderers.clear();
    this.universalRenderers.clear();
  }

  private assertProvenance(
    themeId: string,
    provenance: ThemePackageProvenance,
  ): void {
    if (
      provenance.source === "platform" &&
      !(this.options.isPlatformPackage ?? isPlatformCompiledThemeId)(themeId)
    ) {
      throw new Error(`Theme package ${themeId} is not an approved compiled platform package.`);
    }
    if (provenance.source === "signed") {
      if (
        !provenance.publisher.trim() ||
        !provenance.keyId.trim() ||
        !provenance.signature.trim()
      ) {
        throw new Error(`Signed theme package ${themeId} has incomplete provenance.`);
      }
      if (this.options.requireTrustedPackages && !this.options.verifySignedPackage) {
        throw new Error(`Signed theme package ${themeId} cannot be verified in this runtime.`);
      }
    }
    if (
      this.options.requireTrustedPackages &&
      provenance.source === "development"
    ) {
      throw new Error(`Untrusted development theme package ${themeId} is disabled in production.`);
    }
  }
}

export const themePackageRegistry = new ThemePackageRegistry({
  requireTrustedPackages: import.meta.env.PROD,
  isPlatformPackage: isPlatformCompiledThemeId,
});
