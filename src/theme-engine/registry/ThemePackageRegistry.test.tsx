import { describe, expect, it, vi } from "vitest";
import type { ThemePackage, ThemeSectionRenderer } from "@/theme-engine/contracts";
import { UNIVERSAL_THEME_CAPABILITIES, UNIVERSAL_THEME_TOKENS } from "@/theme-engine/contracts";
import { ThemePackageRegistry } from "./ThemePackageRegistry";

const Renderer: ThemeSectionRenderer = ({ children }) => <>{children}</>;
const FamilyRenderer: ThemeSectionRenderer = ({ children }) => <section>{children}</section>;
const UniversalRenderer: ThemeSectionRenderer = ({ children }) => <main>{children}</main>;
const UnknownRenderer: ThemeSectionRenderer = ({ children }) => <div>{children}</div>;

const themePackage: ThemePackage = {
  manifest: {
    id: "test-theme",
    name: "Test theme",
    description: "Test package",
    version: "1.0.0",
    schemaVersion: 1,
    minimumPlatformVersion: "1.0.0",
    family: "editorial",
    capabilities: UNIVERSAL_THEME_CAPABILITIES,
    designTokens: UNIVERSAL_THEME_TOKENS,
    templates: [{
      key: "home-default",
      name: "Home",
      pageType: "home",
      allowedSectionTypes: ["site-header"],
      removable: false,
    }],
    features: [],
  },
  sectionRenderers: {
    "site-header": Renderer,
  },
};

describe("ThemePackageRegistry", () => {
  it("loads a theme package once and caches concurrent requests", async () => {
    const registry = new ThemePackageRegistry();
    const loader = vi.fn(async () => themePackage);
    registry.registerLoader("test-theme", loader);

    const [first, second] = await Promise.all([
      registry.load("test-theme"),
      registry.load("test-theme"),
    ]);

    expect(first).toBe(themePackage);
    expect(second).toBe(themePackage);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("resolves theme, family, universal and safe fallback renderers in order", () => {
    const registry = new ThemePackageRegistry();
    registry.registerFamilyRenderers("editorial", {
      "brand-story": FamilyRenderer,
    });
    registry.registerUniversalRenderer("site-footer", UniversalRenderer);

    expect(registry.resolveSectionRenderer(themePackage, "site-header", UnknownRenderer)).toBe(Renderer);
    expect(registry.resolveSectionRenderer(themePackage, "brand-story", UnknownRenderer)).toBe(FamilyRenderer);
    expect(registry.resolveSectionRenderer(themePackage, "site-footer", UnknownRenderer)).toBe(UniversalRenderer);
    expect(registry.resolveSectionRenderer(themePackage, "faq", UnknownRenderer)).toBe(UnknownRenderer);
  });

  it("rejects duplicate package loader ids", () => {
    const registry = new ThemePackageRegistry();
    registry.registerLoader("test-theme", async () => themePackage);
    expect(() => registry.registerLoader("test-theme", async () => themePackage)).toThrow(/already registered/i);
  });

  it("rejects invalid packages before they enter the runtime cache", async () => {
    const registry = new ThemePackageRegistry();
    registry.registerLoader("invalid-theme", async () => ({
      ...themePackage,
      manifest: {
        ...themePackage.manifest,
        id: "INVALID THEME",
      },
    }));

    await expect(registry.load("invalid-theme")).rejects.toThrow();
    expect(registry.getLoaded("invalid-theme")).toBeNull();
  });

  it("rejects development loaders in production and verifies signed packages", async () => {
    const registry = new ThemePackageRegistry({
      requireTrustedPackages: true,
      verifySignedPackage: async (_themePackage, provenance) =>
        provenance.signature === "valid-signature",
    });
    expect(() =>
      registry.registerLoader("development-theme", async () => themePackage),
    ).toThrow(/untrusted/i);

    registry.registerLoader(
      "test-theme",
      async () => themePackage,
      {
        source: "signed",
        publisher: "StoreBlink Partner",
        keyId: "partner-key",
        signature: "valid-signature",
      },
    );
    await expect(registry.load("test-theme")).resolves.toBe(themePackage);
    expect(registry.getProvenance("test-theme")).toMatchObject({
      source: "signed",
      publisher: "StoreBlink Partner",
    });
  });

  it("does not let arbitrary source packages claim compiled platform trust", () => {
    const defaultRegistry = new ThemePackageRegistry();
    expect(() => defaultRegistry.registerLoader(
      "marketplace-upload",
      async () => themePackage,
      { source: "platform" },
    )).toThrow(/not an approved compiled platform package/);

    const registry = new ThemePackageRegistry({
      isPlatformPackage: (themeId) => themeId === "approved-platform-theme",
    });
    expect(() => registry.registerLoader(
      "marketplace-upload",
      async () => themePackage,
      { source: "platform" },
    )).toThrow(/not an approved compiled platform package/);
    expect(() => registry.registerLoader(
      "approved-platform-theme",
      async () => themePackage,
      { source: "platform" },
    )).not.toThrow();
  });
});
