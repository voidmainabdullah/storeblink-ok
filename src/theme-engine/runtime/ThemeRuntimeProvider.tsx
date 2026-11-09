import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import {
  UNIVERSAL_THEME_CAPABILITIES,
  UNIVERSAL_THEME_TOKENS,
  type CanonicalSectionType,
  type ThemeCapabilities,
  type ThemeDesignTokens,
  type ThemePackage,
  type ThemeSectionRenderer,
} from "@/theme-engine/contracts";
import {
  ThemeFontLoader,
  themeBrandingSystem,
  type ThemeBrandingSettings,
} from "@/theme-engine/branding";
import { themePackageRegistry } from "@/theme-engine/registry";
import {
  ensureUniversalSectionRenderers,
  UnknownSectionFallback,
  UniversalSectionRenderer,
} from "@/theme-engine/renderers";

ensureUniversalSectionRenderers();

type ThemeRuntimeState = {
  themeId: string;
  mode: "editor" | "storefront";
  themePackage: ThemePackage | null;
  tokens: ThemeDesignTokens;
  capabilities: ThemeCapabilities;
  branding: ThemeBrandingSettings | null;
  loading: boolean;
  error: Error | null;
  resolveSectionRenderer(sectionType: CanonicalSectionType): ThemeSectionRenderer;
};

const defaultState: ThemeRuntimeState = {
  themeId: "universal",
  mode: "storefront",
  themePackage: null,
  tokens: UNIVERSAL_THEME_TOKENS,
  capabilities: UNIVERSAL_THEME_CAPABILITIES,
  branding: null,
  loading: false,
  error: null,
  resolveSectionRenderer: () => UniversalSectionRenderer,
};

const ThemeRuntimeContext = createContext<ThemeRuntimeState>(defaultState);

export type ThemeRuntimeProviderProps = PropsWithChildren<{
  themeId?: string | null;
  mode: "editor" | "storefront";
  branding?: ThemeBrandingSettings | null;
}>;

export const ThemeRuntimeProvider = ({
  themeId,
  mode,
  branding = null,
  children,
}: ThemeRuntimeProviderProps) => {
  const resolvedThemeId = themeId?.trim() || "universal";
  const [themePackage, setThemePackage] = useState<ThemePackage | null>(
    () => themePackageRegistry.getLoaded(resolvedThemeId),
  );
  const [loading, setLoading] = useState(() => themePackageRegistry.hasLoader(resolvedThemeId));
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let active = true;
    const loaded = themePackageRegistry.getLoaded(resolvedThemeId);
    setThemePackage(loaded);
    setError(null);
    if (loaded || !themePackageRegistry.hasLoader(resolvedThemeId)) {
      setLoading(false);
      return () => {
        active = false;
      };
    }
    setLoading(true);
    void themePackageRegistry
      .load(resolvedThemeId)
      .then((nextPackage) => {
        if (active) setThemePackage(nextPackage);
      })
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason : new Error(String(reason)));
          setThemePackage(null);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [resolvedThemeId]);

  const value = useMemo<ThemeRuntimeState>(() => {
    const packageTokens = themePackage?.manifest.designTokens ?? UNIVERSAL_THEME_TOKENS;
    return {
      themeId: resolvedThemeId,
      mode,
      themePackage,
      tokens: themeBrandingSystem.resolveTokens(packageTokens, branding),
      capabilities: themePackage?.manifest.capabilities ?? UNIVERSAL_THEME_CAPABILITIES,
      branding,
      loading,
      error,
      resolveSectionRenderer: (sectionType) =>
        themePackageRegistry.resolveSectionRenderer(
          themePackage,
          sectionType,
          UnknownSectionFallback,
        ),
    };
  }, [branding, error, loading, mode, resolvedThemeId, themePackage]);

  return (
    <ThemeRuntimeContext.Provider value={value}>
      <ThemeFontLoader settings={branding} />
      {children}
    </ThemeRuntimeContext.Provider>
  );
};

export const useThemeRuntime = () => useContext(ThemeRuntimeContext);

export const useThemeCapability = (capability: keyof ThemeCapabilities): boolean =>
  useThemeRuntime().capabilities[capability];
