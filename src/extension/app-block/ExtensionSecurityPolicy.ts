import {
  APP_BLOCK_SLOTS,
  appBlockDataProjectionSchema,
  extensionGrantSchema,
  thirdPartyExtensionManifestSchema,
  type AppBlockDataProjection,
  type ExtensionCapability,
  type ExtensionGrant,
  type ExtensionTrustLevel,
  type ThirdPartyExtensionManifest,
} from "./contracts";

const TRUST_CAPABILITIES: Readonly<Record<ExtensionTrustLevel, ReadonlySet<ExtensionCapability>>> = {
  declarative: new Set(["theme/content.read"]),
  sandboxed: new Set([
    "theme/content.read",
    "theme/navigation.request",
    "commerce/products.read",
    "commerce/cart.read",
    "commerce/cart.add",
    "commerce/cart.open",
    "app/render",
    "app/frame.resize",
  ]),
  "reviewed-partner": new Set([
    "theme/content.read",
    "theme/navigation.request",
    "commerce/products.read",
    "commerce/cart.read",
    "commerce/cart.add",
    "commerce/cart.open",
    "app/render",
    "app/frame.resize",
    "app/telemetry.emit",
    "merchant/settings.read",
  ]),
  platform: new Set([
    "theme/content.read",
    "theme/navigation.request",
    "commerce/products.read",
    "commerce/cart.read",
    "commerce/cart.add",
    "commerce/cart.open",
    "app/render",
    "app/frame.resize",
    "app/telemetry.emit",
    "merchant/settings.read",
    "platform/compiled-react",
  ]),
};

const ACTION_CAPABILITY = {
  "add-to-cart": "commerce/cart.add",
  "open-cart": "commerce/cart.open",
  "view-product": "theme/navigation.request",
  navigate: "theme/navigation.request",
} as const satisfies Record<string, ExtensionCapability>;

export type ExtensionSecurityIssue = Readonly<{
  code: string;
  message: string;
  path?: string;
}>;

export type ExtensionSecurityReport = Readonly<{
  valid: boolean;
  issues: readonly ExtensionSecurityIssue[];
  manifest: ThirdPartyExtensionManifest | null;
  grant: ExtensionGrant | null;
}>;

export type ExtensionSecurityPolicyOptions = Readonly<{
  now?: () => Date;
  allowPlatformCompiledReact?: boolean;
  platformPackageIds?: readonly string[];
}>;

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const bytes = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  return typeof TextEncoder === "undefined"
    ? serialized.length
    : new TextEncoder().encode(serialized).byteLength;
};

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value as Record<string, unknown>).forEach((entry) => deepFreeze(entry));
  return Object.freeze(value);
};

export class ExtensionSecurityError extends Error {
  readonly report: ExtensionSecurityReport;

  constructor(report: ExtensionSecurityReport) {
    super(report.issues[0]?.message ?? "Extension is not trusted for discovery.");
    this.name = "ExtensionSecurityError";
    this.report = structuredClone(report);
  }
}

export class ExtensionSecurityPolicy {
  private readonly platformPackageIds: ReadonlySet<string>;

  constructor(private readonly options: ExtensionSecurityPolicyOptions = {}) {
    this.platformPackageIds = new Set(options.platformPackageIds ?? []);
  }

  evaluate(rawManifest: unknown, rawGrant: unknown = null): ExtensionSecurityReport {
    const parsedManifest = thirdPartyExtensionManifestSchema.safeParse(rawManifest);
    if (!parsedManifest.success) return {
      valid: false,
      issues: parsedManifest.error.issues.map((issue) => ({
        code: "extension.manifest.invalid",
        message: issue.message,
        path: issue.path.join("."),
      })),
      manifest: null,
      grant: null,
    };
    const manifest = parsedManifest.data as ThirdPartyExtensionManifest;
    const issues: ExtensionSecurityIssue[] = [];
    const parsedGrant = rawGrant === null
      ? null
      : extensionGrantSchema.safeParse(rawGrant);
    if (parsedGrant && !parsedGrant.success) {
      parsedGrant.error.issues.forEach((issue) => issues.push({
        code: "extension.grant.invalid",
        message: issue.message,
        path: issue.path.join("."),
      }));
    }
    const grant = parsedGrant?.success
      ? parsedGrant.data as ExtensionGrant
      : null;

    const allowed = TRUST_CAPABILITIES[manifest.trustLevel];
    manifest.requestedCapabilities.forEach((capability) => {
      if (!allowed.has(capability)) issues.push({
        code: "extension.capability.not-requestable",
        message: `${manifest.trustLevel} extensions cannot request ${capability}.`,
        path: "requestedCapabilities",
      });
    });

    const expectedNamespace = manifest.trustLevel === "platform"
      ? `platform/${manifest.id}`
      : manifest.packageType === "theme"
        ? `theme/${manifest.id}`
        : `app/${manifest.publisherId}/${manifest.id}`;
    if (manifest.namespace !== expectedNamespace) issues.push({
      code: "extension.namespace.invalid",
      message: `${manifest.id} must use namespace ${expectedNamespace}.`,
      path: "namespace",
    });

    if (!grant) {
      if (manifest.grantedCapabilities.length || manifest.appBlocks.length) issues.push({
        code: "extension.grant.missing",
        message: "Capabilities and app blocks require an external StoreBlink grant record.",
      });
    } else {
      if (
        grant.extensionId !== manifest.id ||
        grant.extensionVersion !== manifest.version ||
        grant.trustLevel !== manifest.trustLevel
      ) issues.push({
        code: "extension.grant.identity",
        message: "Grant identity or trust level does not match the extension.",
      });
      if (grant.status === "revoked") issues.push({
        code: "extension.revoked",
        message: `Extension grant was revoked: ${grant.revocationReason ?? "no reason supplied"}.`,
      });
      const now = (this.options.now ?? (() => new Date()))();
      if (new Date(grant.issuedAt).getTime() > now.getTime()) issues.push({
        code: "extension.grant.not-yet-active",
        message: "Extension grant has not reached its issuance time.",
      });
      if (grant.expiresAt && new Date(grant.expiresAt).getTime() <= now.getTime()) issues.push({
        code: "extension.grant.expired",
        message: "Extension grant has expired.",
      });
      if (!sameStrings(manifest.grantedCapabilities, grant.grantedCapabilities)) issues.push({
        code: "extension.grant.mismatch",
        message: "Manifest capabilities do not match the external grant record.",
      });
      (Object.keys(grant.quotas) as Array<keyof ExtensionGrant["quotas"]>).forEach((key) => {
        if (grant.quotas[key] > manifest.requestedQuotas[key]) issues.push({
          code: "extension.quota.escalation",
          message: `Granted quota ${key} exceeds the package request.`,
          path: `quotas.${key}`,
        });
      });
    }

    const granted = new Set(grant?.grantedCapabilities ?? []);
    if (manifest.appBlocks.length > (grant?.quotas.maxBlocks ?? 0)) issues.push({
      code: "extension.quota.blocks",
      message: "Extension declares more app blocks than its grant permits.",
    });
    if (manifest.trustLevel === "declarative" && manifest.appBlocks.length) issues.push({
      code: "extension.app-block.trust",
      message: "Declarative packages cannot include executable app-block sessions.",
    });
    if (manifest.appBlocks.length && !granted.has("app/render")) issues.push({
      code: "extension.app-block.render-capability",
      message: "App blocks require the externally granted app/render capability.",
    });
    manifest.appBlocks.forEach((block, blockIndex) => {
      if (block.namespace !== `${manifest.namespace}/${block.id}`) issues.push({
        code: "extension.app-block.namespace",
        message: `App block ${block.id} escapes extension namespace ${manifest.namespace}.`,
        path: `appBlocks.${blockIndex}.namespace`,
      });
      if (block.view.elements.length > (grant?.quotas.maxViewElements ?? 0)) issues.push({
        code: "extension.quota.view-elements",
        message: `App block ${block.id} exceeds its view-element quota.`,
      });
      block.slots.forEach((slot) => {
        if (!APP_BLOCK_SLOTS.includes(slot)) issues.push({
          code: "extension.app-block.slot",
          message: `App block ${block.id} targets unsupported slot ${slot}.`,
        });
      });
      block.requiredCapabilities.forEach((capability) => {
        if (!manifest.requestedCapabilities.includes(capability) || !granted.has(capability)) issues.push({
          code: "extension.app-block.capability",
          message: `App block ${block.id} requires ungranted capability ${capability}.`,
        });
      });
      block.view.elements.forEach((element) => {
        if (element.kind === "action" && !granted.has(ACTION_CAPABILITY[element.action])) issues.push({
          code: "extension.action.capability",
          message: `${element.action} requires ${ACTION_CAPABILITY[element.action]}.`,
        });
      });
    });

    if (manifest.compiledReact) {
      if (
        manifest.trustLevel !== "platform" ||
        !manifest.requestedCapabilities.includes("platform/compiled-react") ||
        !granted.has("platform/compiled-react") ||
        !this.options.allowPlatformCompiledReact ||
        !this.platformPackageIds.has(manifest.id)
      ) issues.push({
        code: "extension.compiled-react.forbidden",
        message: "Compiled React is restricted to explicitly configured platform packages.",
      });
    }

    return {
      valid: issues.length === 0,
      issues: structuredClone(issues),
      manifest: structuredClone(manifest),
      grant: grant ? structuredClone(grant) : null,
    };
  }

  assertDiscoverable(rawManifest: unknown, rawGrant: unknown = null): Readonly<{
    manifest: ThirdPartyExtensionManifest;
    grant: ExtensionGrant | null;
  }> {
    const report = this.evaluate(rawManifest, rawGrant);
    if (!report.valid || !report.manifest) throw new ExtensionSecurityError(report);
    return deepFreeze({ manifest: report.manifest, grant: report.grant });
  }
}

export type AppBlockDataSource = Readonly<{
  store?: { name: string; currency: string } | null;
  product?: { id: string; title: string; price: string } | null;
  products?: readonly { id: string; title: string; price: string }[];
  cart?: { itemCount: number } | null;
  merchantSettings?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export const createAppBlockDataProjection = (
  source: AppBlockDataSource,
  grantedCapabilities: readonly ExtensionCapability[],
  maxDataBytes: number,
): Readonly<AppBlockDataProjection> => {
  const granted = new Set(grantedCapabilities);
  const projection = appBlockDataProjectionSchema.parse({
    store: granted.has("theme/content.read") ? source.store ?? null : null,
    product: granted.has("commerce/products.read") ? source.product ?? null : null,
    products: granted.has("commerce/products.read") ? source.products ?? [] : [],
    cart: granted.has("commerce/cart.read") ? source.cart ?? null : null,
    merchantSettings: granted.has("merchant/settings.read")
      ? source.merchantSettings ?? {}
      : {},
  }) as AppBlockDataProjection;
  if (bytes(projection) > maxDataBytes) {
    throw new Error(`App-block data exceeds the ${maxDataBytes} byte grant quota.`);
  }
  return deepFreeze(structuredClone(projection));
};

export const capabilityForAppBlockAction = (
  action: keyof typeof ACTION_CAPABILITY,
): ExtensionCapability => ACTION_CAPABILITY[action];
