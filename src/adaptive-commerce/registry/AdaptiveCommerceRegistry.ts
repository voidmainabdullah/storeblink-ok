import {
  adaptiveComponentLibrarySchema,
  designPackSchema,
  designTokenAddressSchema,
  semanticPathStartsWith,
  STOREFRONT_RESOURCE_TYPES,
  storeKitSchema,
  templateBlueprintSchema,
  type AdaptiveComponentDefinition,
  type AdaptiveComponentLibrary,
  type DesignPack,
  type DesignTokenEntry,
  type DesignTokenTier,
  type StoreKit,
  type StorefrontResourceType,
  type TemplateBlueprint,
  type VersionedPackageRef,
} from "@/adaptive-commerce/contracts";

export type AdaptiveCommerceRegistryOptions = Readonly<{
  engineSchemaVersion: number;
  tokenSchemaVersion: "2025.10";
  capabilityPolicyVersion?: string;
  supportedCapabilities?: readonly string[];
}>;

export type StoreKitInstallabilityIssue = Readonly<{
  code: string;
  message: string;
  path?: string;
}>;

export type StoreKitInstallabilityReport = Readonly<{
  valid: boolean;
  issues: readonly StoreKitInstallabilityIssue[];
}>;

export type ResolvedStoreKit = Readonly<{
  storeKit: StoreKit;
  designPack: DesignPack;
  componentLibrary: AdaptiveComponentLibrary;
  blueprints: Readonly<Record<StorefrontResourceType, TemplateBlueprint>>;
}>;

const clone = <T>(value: T): T => structuredClone(value);
const packageKey = (id: string, version: string): string => `${id}@${version}`;
const refKey = (ref: VersionedPackageRef): string => packageKey(ref.id, ref.version);

const tokenEntryRef = (entry: DesignTokenEntry): string | null =>
  "$ref" in entry ? entry.$ref : null;

export class StoreKitInstallabilityError extends Error {
  readonly report: StoreKitInstallabilityReport;

  constructor(report: StoreKitInstallabilityReport) {
    super(report.issues[0]?.message ?? "StoreKit is not installable.");
    this.name = "StoreKitInstallabilityError";
    this.report = clone(report);
  }
}

export class AdaptiveCommerceRegistry {
  private readonly designPacks = new Map<string, DesignPack>();
  private readonly componentLibraries = new Map<string, AdaptiveComponentLibrary>();
  private readonly blueprints = new Map<string, TemplateBlueprint>();
  private readonly storeKits = new Map<string, StoreKit>();
  private readonly supportedCapabilities: Set<string> | null;

  constructor(private readonly options: AdaptiveCommerceRegistryOptions) {
    if (!Number.isInteger(options.engineSchemaVersion) || options.engineSchemaVersion < 1) {
      throw new Error("Adaptive Commerce engine schema version must be a positive integer.");
    }
    this.supportedCapabilities = options.supportedCapabilities
      ? new Set(options.supportedCapabilities)
      : null;
  }

  registerDesignPack(input: DesignPack): () => void {
    const value = designPackSchema.parse(input);
    return this.register(this.designPacks, value, "DesignPack");
  }

  registerComponentLibrary(input: AdaptiveComponentLibrary): () => void {
    const value = adaptiveComponentLibrarySchema.parse(input);
    return this.register(this.componentLibraries, value, "ComponentLibrary");
  }

  registerTemplateBlueprint(input: TemplateBlueprint): () => void {
    const value = templateBlueprintSchema.parse(input);
    return this.register(this.blueprints, value, "TemplateBlueprint");
  }

  registerStoreKit(input: StoreKit): () => void {
    const value = storeKitSchema.parse(input);
    return this.register(this.storeKits, value, "StoreKit");
  }

  getDesignPack(id: string, version: string): DesignPack | null {
    return this.get(this.designPacks, id, version);
  }

  getComponentLibrary(id: string, version: string): AdaptiveComponentLibrary | null {
    return this.get(this.componentLibraries, id, version);
  }

  getTemplateBlueprint(id: string, version: string): TemplateBlueprint | null {
    return this.get(this.blueprints, id, version);
  }

  getStoreKit(id: string, version: string): StoreKit | null {
    return this.get(this.storeKits, id, version);
  }

  validateInstallable(id: string, version: string): StoreKitInstallabilityReport {
    const issues: StoreKitInstallabilityIssue[] = [];
    const storeKit = this.storeKits.get(packageKey(id, version));
    if (!storeKit) {
      return { valid: false, issues: [{ code: "store-kit.missing", message: `StoreKit ${id}@${version} is not registered.` }] };
    }
    if (storeKit.releaseState !== "released") {
      issues.push({ code: "store-kit.not-released", message: `StoreKit ${id}@${version} is ${storeKit.releaseState}.` });
    }
    if (storeKit.lockfile.engineSchemaVersion !== this.options.engineSchemaVersion) {
      issues.push({
        code: "engine-schema.incompatible",
        message: `StoreKit requires engine schema ${storeKit.lockfile.engineSchemaVersion}; runtime supports ${this.options.engineSchemaVersion}.`,
        path: "lockfile.engineSchemaVersion",
      });
    }
    if (storeKit.lockfile.tokenSchemaVersion !== this.options.tokenSchemaVersion) {
      issues.push({ code: "token-schema.incompatible", message: `StoreKit token schema ${storeKit.lockfile.tokenSchemaVersion} is unsupported.`, path: "lockfile.tokenSchemaVersion" });
    }
    if (
      this.options.capabilityPolicyVersion &&
      storeKit.lockfile.capabilityPolicyVersion !== this.options.capabilityPolicyVersion
    ) {
      issues.push({ code: "capability-policy.incompatible", message: `StoreKit capability policy ${storeKit.lockfile.capabilityPolicyVersion} is unsupported.`, path: "lockfile.capabilityPolicyVersion" });
    }
    if (this.supportedCapabilities) {
      storeKit.requiredCapabilities.forEach((capability) => {
        if (!this.supportedCapabilities?.has(capability)) issues.push({ code: "capability.missing", message: `Required capability ${capability} is not supported.`, path: "requiredCapabilities" });
      });
    }

    const designPack = this.resolveReference(
      this.designPacks,
      storeKit.lockfile.designPack,
      "design-pack",
      issues,
    );
    const componentLibrary = this.resolveReference(
      this.componentLibraries,
      storeKit.lockfile.componentLibrary,
      "component-library",
      issues,
    );
    if (designPack) {
      this.validateDesignPack(designPack, issues);
      if (storeKit.defaultPresetId && !designPack.presets.some((preset) => preset.id === storeKit.defaultPresetId)) {
        issues.push({ code: "preset.missing", message: `Default preset ${storeKit.defaultPresetId} is not in ${designPack.id}@${designPack.version}.`, path: "defaultPresetId" });
      }
    }

    const resolvedBlueprints = new Map<StorefrontResourceType, TemplateBlueprint>();
    STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
      const reference = storeKit.lockfile.blueprints[resourceType];
      const blueprint = this.resolveReference(
        this.blueprints,
        reference,
        `blueprint.${resourceType}`,
        issues,
      );
      if (!blueprint) return;
      resolvedBlueprints.set(resourceType, blueprint);
      if (blueprint.resourceType !== resourceType) {
        issues.push({ code: "blueprint.resource-mismatch", message: `${reference.id}@${reference.version} is ${blueprint.resourceType}, not ${resourceType}.`, path: `lockfile.blueprints.${resourceType}` });
      }
    });

    const validatedBlueprints = new Set<string>();
    resolvedBlueprints.forEach((blueprint) => this.validateBlueprintInheritance(
      blueprint,
      storeKit,
      componentLibrary,
      issues,
      validatedBlueprints,
    ));

    return { valid: issues.length === 0, issues: clone(issues) };
  }

  resolveInstallable(id: string, version: string): ResolvedStoreKit {
    const report = this.validateInstallable(id, version);
    if (!report.valid) throw new StoreKitInstallabilityError(report);
    const storeKit = this.storeKits.get(packageKey(id, version)) as StoreKit;
    const designPack = this.designPacks.get(refKey(storeKit.lockfile.designPack)) as DesignPack;
    const componentLibrary = this.componentLibraries.get(
      refKey(storeKit.lockfile.componentLibrary),
    ) as AdaptiveComponentLibrary;
    const blueprints = Object.fromEntries(
      STOREFRONT_RESOURCE_TYPES.map((resourceType) => [
        resourceType,
        clone(this.blueprints.get(refKey(storeKit.lockfile.blueprints[resourceType])) as TemplateBlueprint),
      ]),
    ) as Record<StorefrontResourceType, TemplateBlueprint>;
    return {
      storeKit: clone(storeKit),
      designPack: clone(designPack),
      componentLibrary: clone(componentLibrary),
      blueprints,
    };
  }

  private register<T>(
    target: Map<string, T>,
    value: T,
    label: string,
  ): () => void {
    // Zod has already required these fields at runtime. The local assertion is
    // needed because this repository intentionally compiles without
    // strictNullChecks, which makes z.infer object properties appear optional.
    const identity = value as T & { id: string; version: string };
    const key = packageKey(identity.id, identity.version);
    if (target.has(key)) throw new Error(`${label} ${key} is already registered.`);
    const stored = clone(value);
    target.set(key, stored);
    return () => {
      if (target.get(key) === stored) target.delete(key);
    };
  }

  private get<T>(target: Map<string, T>, id: string, version: string): T | null {
    const value = target.get(packageKey(id, version));
    return value ? clone(value) : null;
  }

  private resolveReference<T>(
    target: Map<string, T>,
    reference: VersionedPackageRef,
    label: string,
    issues: StoreKitInstallabilityIssue[],
  ): T | null {
    const value = target.get(refKey(reference));
    if (!value) {
      issues.push({ code: `${label}.missing`, message: `${label} ${reference.id}@${reference.version} is not registered.` });
      return null;
    }
    const identity = value as T & { id: string; version: string; integrity: string };
    if (identity.integrity !== reference.integrity) {
      issues.push({ code: `${label}.integrity`, message: `${label} ${reference.id}@${reference.version} integrity does not match its StoreKit pin.` });
      return null;
    }
    return value;
  }

  private validateDesignPack(
    designPack: DesignPack,
    issues: StoreKitInstallabilityIssue[],
  ): void {
    const entries = new Map<string, { tier: DesignTokenTier; entry: DesignTokenEntry }>();
    (["primitive", "semantic", "component"] as const).forEach((tier) => {
      Object.entries(designPack.tokens[tier]).forEach(([path, entry]) =>
        entries.set(`${tier}:${path}`, { tier, entry }));
    });
    entries.forEach(({ tier, entry }, address) => {
      const reference = tokenEntryRef(entry);
      if (!reference) return;
      const parsed = designTokenAddressSchema.parse(reference);
      const target = entries.get(parsed);
      if (!target) {
        issues.push({ code: "token.reference.missing", message: `${address} references missing token ${parsed}.`, path: `tokens.${address}` });
        return;
      }
      if (tier === "primitive") {
        issues.push({ code: "token.reference.primitive", message: `Primitive token ${address} cannot alias another token.`, path: `tokens.${address}` });
      }
      if (tier === "semantic" && target.tier === "component") {
        issues.push({ code: "token.reference.direction", message: `Semantic token ${address} cannot reference component token ${parsed}.`, path: `tokens.${address}` });
      }
    });
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (address: string): void => {
      if (visiting.has(address)) {
        issues.push({ code: "token.reference.cycle", message: `Design token alias cycle includes ${address}.`, path: `tokens.${address}` });
        return;
      }
      if (visited.has(address)) return;
      visiting.add(address);
      const entry = entries.get(address)?.entry;
      const reference = entry ? tokenEntryRef(entry) : null;
      if (reference && entries.has(reference)) visit(reference);
      visiting.delete(address);
      visited.add(address);
    };
    entries.forEach((_entry, address) => visit(address));
    designPack.presets.forEach((preset) => preset.overrides.forEach((override) => {
      if (!entries.has(override.address)) issues.push({ code: "preset.token.missing", message: `Preset ${preset.id} overrides missing token ${override.address}.`, path: `presets.${preset.id}` });
    }));
  }

  private validateBlueprint(
    blueprint: TemplateBlueprint,
    library: AdaptiveComponentLibrary,
    issues: StoreKitInstallabilityIssue[],
  ): void {
    const validateReference = (
      reference: {
        componentId: string;
        variantId: string;
        properties: Record<string, unknown>;
        slots: Array<{ slotId: string }>;
        bindingIds: string[];
      },
      path: string,
      expectedRole: AdaptiveComponentDefinition["role"],
    ) => {
      const component = library.components[reference.componentId];
      if (!component) {
        issues.push({ code: "blueprint.component.missing", message: `${blueprint.id} references missing component ${reference.componentId}.`, path });
        return;
      }
      if (component.role !== expectedRole) issues.push({ code: "blueprint.component.role", message: `${component.id} is ${component.role}, not ${expectedRole}.`, path });
      const variant = component.variants.find((entry) => entry.id === reference.variantId);
      if (!variant) issues.push({ code: "blueprint.variant.missing", message: `${component.id} has no variant ${reference.variantId}.`, path });
      const properties = new Set(component.properties.map((property) => property.id));
      Object.keys(reference.properties).forEach((property) => {
        if (!properties.has(property)) issues.push({ code: "blueprint.property.missing", message: `${component.id} has no property ${property}.`, path });
      });
      const slots = new Set(component.slots.map((slot) => slot.id));
      reference.slots.forEach((slot) => {
        if (!slots.has(slot.slotId)) issues.push({ code: "blueprint.slot.missing", message: `${component.id} has no slot ${slot.slotId}.`, path });
      });
      const requiredSlots = new Set([
        ...component.slots.filter((slot) => slot.required && slot.minimumItems > 0).map((slot) => slot.id),
        ...(variant?.requiredSlots ?? []),
      ]);
      component.slots.filter((slot) => requiredSlots.has(slot.id)).forEach((slot) => {
        if (!reference.slots.some((value) => value.slotId === slot.id)) issues.push({ code: "blueprint.slot.required", message: `${component.id} requires slot ${slot.id}.`, path });
      });
      component.properties.filter((property) => property.required).forEach((property) => {
        const resolved = Object.prototype.hasOwnProperty.call(reference.properties, property.id) ||
          property.defaultValue !== undefined ||
          Boolean(variant && Object.prototype.hasOwnProperty.call(variant.defaults, property.id));
        if (!resolved) issues.push({ code: "blueprint.property.required", message: `${component.id} requires property ${property.id}.`, path });
      });
      component.commerceBindingIds.forEach((bindingId) => {
        if (!reference.bindingIds.includes(bindingId)) issues.push({ code: "blueprint.binding.required", message: `${component.id} requires binding ${bindingId}.`, path });
      });
    };
    blueprint.sections.forEach((section, index) =>
      validateReference(section as typeof section & {
        componentId: string;
        variantId: string;
        properties: Record<string, unknown>;
        slots: Array<{ slotId: string }>;
        bindingIds: string[];
      }, `blueprints.${blueprint.id}.sections.${index}`, "section"));
    blueprint.globalRegions.forEach((region, index) =>
      validateReference(region as typeof region & {
        componentId: string;
        variantId: string;
        properties: Record<string, unknown>;
        slots: Array<{ slotId: string }>;
        bindingIds: string[];
      }, `blueprints.${blueprint.id}.globalRegions.${index}`, "global-region"));
    const semanticRoots = [
      ...blueprint.sections.map((section) => section.path),
      ...blueprint.globalRegions.map((region) => region.path),
    ];
    blueprint.bindings.forEach((binding, index) => {
      if (!semanticRoots.some((root) => semanticPathStartsWith(binding.target.path, root))) {
        issues.push({ code: "blueprint.binding.target", message: `${binding.id} targets unmapped path ${binding.target.path}.`, path: `blueprints.${blueprint.id}.bindings.${index}` });
      }
    });
    blueprint.compositionPatches.forEach((patch, index) => {
      if (!semanticRoots.some((root) => semanticPathStartsWith(patch.target, root))) {
        issues.push({ code: "blueprint.composition.target", message: `Composition patch targets unmapped path ${patch.target}.`, path: `blueprints.${blueprint.id}.compositionPatches.${index}` });
      }
    });
  }

  private validateBlueprintInheritance(
    blueprint: TemplateBlueprint,
    storeKit: StoreKit,
    library: AdaptiveComponentLibrary | null,
    issues: StoreKitInstallabilityIssue[],
    validated: Set<string>,
  ): void {
    const visiting = new Set<string>();
    let current: TemplateBlueprint | undefined = blueprint;
    while (current) {
      const currentKey = packageKey(current.id, current.version);
      if (visiting.has(currentKey)) {
        issues.push({ code: "blueprint.inheritance.cycle", message: `Blueprint inheritance cycle includes ${currentKey}.` });
        return;
      }
      visiting.add(currentKey);
      if (!validated.has(currentKey)) {
        if (library) this.validateBlueprint(current, library, issues);
        current.requiredCapabilities.forEach((capability) => {
          if (!storeKit.requiredCapabilities.includes(capability)) {
            issues.push({ code: "blueprint.capability.unlocked", message: `${currentKey} requires capability ${capability}, but the StoreKit does not declare it.`, path: "requiredCapabilities" });
          }
          if (this.supportedCapabilities && !this.supportedCapabilities.has(capability)) {
            issues.push({ code: "blueprint.capability.missing", message: `${currentKey} requires unsupported capability ${capability}.`, path: "requiredCapabilities" });
          }
        });
        validated.add(currentKey);
      }
      if (!current.extends) return;
      const parent = this.blueprints.get(refKey(current.extends));
      if (!parent) {
        issues.push({ code: "blueprint.parent.missing", message: `${currentKey} extends missing ${refKey(current.extends)}.` });
        return;
      }
      if (parent.integrity !== current.extends.integrity) {
        issues.push({ code: "blueprint.parent.integrity", message: `${currentKey} parent integrity does not match its pin.` });
        return;
      }
      if (parent.resourceType !== current.resourceType) {
        issues.push({ code: "blueprint.parent.resource", message: `${currentKey} cannot extend a ${parent.resourceType} blueprint.` });
        return;
      }
      current = parent;
    }
  }
}
