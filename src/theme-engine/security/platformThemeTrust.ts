export const PLATFORM_COMPILED_THEME_IDS = [
  "basic",
  "atelier",
  "noir-chrono",
  "spark-fashion",
] as const;

const platformIds = new Set<string>(PLATFORM_COMPILED_THEME_IDS);

export const isPlatformCompiledThemeId = (themeId: string): boolean =>
  platformIds.has(themeId);

export const assertPlatformCompiledThemeId = (themeId: string): void => {
  if (!isPlatformCompiledThemeId(themeId)) {
    throw new Error(
      `Compiled theme ${themeId} is not in the explicit platform source allowlist. ` +
      "Signing or a package manifest does not confer platform trust.",
    );
  }
};
