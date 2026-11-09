import {
  AdaptiveCommerceRegistry,
  STOREFRONT_RESOURCE_TYPES,
  type AdaptiveCommerceRegistryOptions,
  type ResolvedStoreKit,
} from "@/adaptive-commerce";
import {
  ExtensionSecurityPolicy,
  type ExtensionGrant,
} from "@/extension/app-block";
import type { ThemeSdkPackage } from "./contracts";
import {
  assertValidThemeSdkPackage,
  type ThemeSdkValidationOptions,
} from "./ThemeSdkPackageValidator";

type CatalogEntry = Readonly<{
  package: Readonly<ThemeSdkPackage>;
  unregister: readonly (() => void)[];
}>;

const keyFor = (id: string, version: string): string => `${id}@${version}`;

export class ThemeSdkDiscoveryRegistry {
  private readonly packages = new Map<string, CatalogEntry>();
  private readonly registry: AdaptiveCommerceRegistry;
  private readonly securityPolicy: ExtensionSecurityPolicy;

  constructor(
    registryOptions: AdaptiveCommerceRegistryOptions,
    securityPolicy = new ExtensionSecurityPolicy(),
  ) {
    this.registry = new AdaptiveCommerceRegistry(registryOptions);
    this.securityPolicy = securityPolicy;
  }

  discover(rawPackage: unknown, grant: ExtensionGrant | null = null): () => void {
    const options: ThemeSdkValidationOptions = {
      securityPolicy: this.securityPolicy,
      grant,
    };
    const packageValue = assertValidThemeSdkPackage(rawPackage, options);
    const key = keyFor(packageValue.storeKit.id, packageValue.storeKit.version);
    if (this.packages.has(key)) throw new Error(`Theme SDK package ${key} is already discovered.`);
    const unregister: Array<() => void> = [];
    try {
      unregister.push(this.registry.registerDesignPack(packageValue.designPack));
      unregister.push(this.registry.registerComponentLibrary(packageValue.componentLibrary));
      STOREFRONT_RESOURCE_TYPES.forEach((resourceType) =>
        unregister.push(this.registry.registerTemplateBlueprint(packageValue.blueprints[resourceType])));
      unregister.push(this.registry.registerStoreKit(packageValue.storeKit));
      this.registry.resolveInstallable(packageValue.storeKit.id, packageValue.storeKit.version);
    } catch (error) {
      [...unregister].reverse().forEach((dispose) => dispose());
      throw error;
    }
    const entry: CatalogEntry = { package: packageValue, unregister };
    this.packages.set(key, entry);
    return () => {
      if (this.packages.get(key) !== entry) return;
      this.packages.delete(key);
      [...unregister].reverse().forEach((dispose) => dispose());
    };
  }

  resolveInstallable(
    id: string,
    version: string,
    currentGrant: ExtensionGrant | null = null,
  ): ResolvedStoreKit {
    const entry = this.packages.get(keyFor(id, version));
    if (!entry) throw new Error(`Theme SDK package ${id}@${version} is not discovered.`);
    this.securityPolicy.assertDiscoverable(entry.package.manifest, currentGrant);
    return this.registry.resolveInstallable(id, version);
  }

  get(id: string, version: string): ThemeSdkPackage | null {
    const entry = this.packages.get(keyFor(id, version));
    return entry ? structuredClone(entry.package) as ThemeSdkPackage : null;
  }
}
