import type { AdaptiveCommerceRegistryOptions } from "@/adaptive-commerce";
import { ExtensionSecurityPolicy } from "@/extension/app-block";
import { ThemeSdkDiscoveryRegistry } from "./ThemeSdkDiscoveryRegistry";

const bundledPackageModules = import.meta.glob("../../themes/*/dist/theme-package.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

export const listBundledThemeSdkPackagePaths = (): readonly string[] =>
  Object.keys(bundledPackageModules).sort();

/**
 * Discovers declarative packages only after complete SDK validation. Bundled
 * app-block packages still require an externally supplied grant and therefore
 * are intentionally not auto-promoted by this source discovery seam.
 */
export const discoverBundledThemeSdkPackages = (
  registryOptions: AdaptiveCommerceRegistryOptions,
): ThemeSdkDiscoveryRegistry => {
  const catalog = new ThemeSdkDiscoveryRegistry(
    registryOptions,
    new ExtensionSecurityPolicy(),
  );
  Object.entries(bundledPackageModules)
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([_path, packageValue]) => catalog.discover(packageValue));
  return catalog;
};
