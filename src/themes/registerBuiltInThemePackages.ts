import { themePackageRegistry } from "@/theme-engine/registry";
import { assertPlatformCompiledThemeId } from "./platformTrust";

let registered = false;

export const ensureBuiltInThemePackages = () => {
  if (registered) return;
  const loaders = import.meta.glob("./*/package.ts") as Record<
    string,
    () => Promise<Record<string, unknown>>
  >;
  const approvedLoaders = Object.entries(loaders).map(([path, loader]) => {
    const themeId = path.match(/^\.\/([^/]+)\/package\.ts$/)?.[1];
    if (!themeId) throw new Error(`Built-in theme package path is invalid: ${path}.`);
    assertPlatformCompiledThemeId(themeId);
    return { themeId, loader };
  });
  const unregister: Array<() => void> = [];
  try {
    approvedLoaders.forEach(({ themeId, loader }) => unregister.push(
      themePackageRegistry.registerLoader(
        themeId,
        async () => {
          const module = await loader();
          const themePackage =
            module.default ??
            Object.entries(module).find(([key]) => key.endsWith("ThemePackage"))?.[1];
          if (!themePackage) throw new Error(`Theme package ${themeId} has no exported package.`);
          return themePackage as Awaited<ReturnType<Parameters<typeof themePackageRegistry.registerLoader>[1]>>;
        },
        { source: "platform" },
      ),
    ));
    registered = true;
  } catch (error) {
    [...unregister].reverse().forEach((dispose) => dispose());
    throw error;
  }
};
