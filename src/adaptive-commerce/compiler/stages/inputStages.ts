import { z } from "zod";
import type { DesignTokenOverride } from "@/adaptive-commerce";
import { STOREFRONT_RESOURCE_TYPES } from "../../contracts/identifiers";
import { merchantPatchSchema } from "../../contracts/merchantPatch";
import { storeDefinitionSchema } from "../../contracts/storeDefinition";
import { merchantPatchSystem } from "../../patches";
import { resolveDesignTokens } from "../../tokens";
import { seedStorefrontSectionControls } from "../sectionControls";
import { artifactHashFor } from "../sha256";
import type { StorefrontCompilerContext } from "../types";
import { fail, requireContext, sameReference } from "./stageSupport";

const createdAtSchema = z.string().datetime();

export const schemaValidationStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const parsedStore = storeDefinitionSchema.safeParse(context.input.storeDefinition);
  if (!parsedStore.success) {
    fail("schema-validation", "store-definition-invalid", parsedStore.error.message);
  }
  if (!createdAtSchema.safeParse(context.input.createdAt).success) {
    fail("schema-validation", "artifact-created-at-invalid", "createdAt must be an ISO UTC timestamp.");
  }
  if (context.input.artifactId !== undefined && !context.input.artifactId.trim()) {
    fail("schema-validation", "artifact-id-invalid", "artifactId cannot be empty.");
  }
  const patches = context.input.merchantPatches.map((patch) => merchantPatchSchema.parse(patch));
  if (patches.some((patch) => patch.storeId !== parsedStore.data.storeId)) {
    fail("schema-validation", "merchant-patch-store-mismatch", "Every merchant patch must belong to the compiled store.");
  }
  const declared = new Set(parsedStore.data.merchantPatchIds);
  const provided = new Set(patches.map((patch) => patch.id));
  if (declared.size !== provided.size || [...declared].some((id) => !provided.has(id))) {
    fail(
      "schema-validation",
      "merchant-patch-set-mismatch",
      "The provided merchant patches must exactly match StoreDefinition.merchantPatchIds.",
    );
  }
  const { baseHash, ...basePayload } = parsedStore.data.base;
  if (artifactHashFor(basePayload) !== baseHash) {
    fail("schema-validation", "store-base-hash-mismatch", "The StoreDefinition base document hash is invalid.");
  }
  return { ...context, storeDefinition: parsedStore.data };
};

export const migrationStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const store = requireContext(context.storeDefinition, "migration", "StoreDefinition");
  if (store.schemaVersion !== 1 || store.base.schemaVersion !== 1) {
    fail("migration", "store-schema-unsupported", "No deterministic migration is registered for this StoreDefinition schema.");
  }
  try {
    // Section controls were introduced after the earliest v3 bases. Seeding a
    // cloned effective base here lets a narrowly validated control patch work
    // for an older installation without rewriting its immutable source base.
    const resolved = context.input.registry.resolveInstallable(
      store.storeKit.id,
      store.storeKit.version,
    );
    const effectiveBase = seedStorefrontSectionControls(store.base, resolved.blueprints);
    const applied = merchantPatchSystem.apply(effectiveBase, context.input.merchantPatches);
    return {
      ...context,
      effectiveDocument: applied.document,
      appliedPatchIds: applied.appliedPatchIds,
    };
  } catch (cause) {
    fail(
      "migration",
      "merchant-patch-application-failed",
      cause instanceof Error ? cause.message : "Merchant patches could not be applied.",
    );
  }
};

const mergeTokenOverrides = (
  preset: readonly DesignTokenOverride[],
  merchant: readonly DesignTokenOverride[],
): DesignTokenOverride[] => {
  const byAddress = new Map<string, DesignTokenOverride>();
  [...preset, ...merchant].forEach((override) =>
    byAddress.set(override.address, structuredClone(override)));
  return [...byAddress.values()].sort((left, right) =>
    left.address < right.address ? -1 : left.address > right.address ? 1 : 0);
};

export const tokenResolutionStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const store = requireContext(context.storeDefinition, "token-resolution", "StoreDefinition");
  const storeKit = context.input.registry.getStoreKit(store.storeKit.id, store.storeKit.version);
  if (!storeKit || !sameReference(store.storeKit, storeKit)) {
    fail("token-resolution", "store-kit-reference-missing", "The StoreDefinition StoreKit pin cannot be resolved exactly.");
  }
  const designPack = context.input.registry.getDesignPack(
    storeKit.lockfile.designPack.id,
    storeKit.lockfile.designPack.version,
  );
  if (!designPack || !sameReference(storeKit.lockfile.designPack, designPack)) {
    fail("token-resolution", "design-pack-reference-missing", "The StoreKit DesignPack pin cannot be resolved exactly.");
  }
  const presetId = store.designTokens.presetId ?? storeKit.defaultPresetId;
  const preset = presetId
    ? designPack.presets.find((candidate) => candidate.id === presetId)
    : undefined;
  if (presetId && !preset) {
    fail("token-resolution", "design-preset-missing", `Design preset ${presetId} is not certified by ${designPack.id}.`);
  }
  try {
    const resolved = resolveDesignTokens(designPack.tokens, {
      presetId,
      overrides: mergeTokenOverrides(preset?.overrides ?? [], store.designTokens.overrides),
    });
    const resolvedTokens = Object.fromEntries(
      resolved.order.map((address) => [address, structuredClone(resolved.tokens[address].value)]),
    );
    return { ...context, resolvedTokens };
  } catch (cause) {
    fail(
      "token-resolution",
      "design-token-resolution-failed",
      cause instanceof Error ? cause.message : "Design tokens could not be resolved.",
    );
  }
};

export const templateResolutionStage = (
  context: StorefrontCompilerContext,
): StorefrontCompilerContext => {
  const store = requireContext(context.storeDefinition, "template-resolution", "StoreDefinition");
  let resolved;
  try {
    resolved = context.input.registry.resolveInstallable(store.storeKit.id, store.storeKit.version);
  } catch (cause) {
    fail(
      "template-resolution",
      "store-kit-not-installable",
      cause instanceof Error ? cause.message : "The StoreKit is not installable.",
    );
  }
  if (!sameReference(store.storeKit, resolved.storeKit)) {
    fail("template-resolution", "store-kit-integrity-mismatch", "The resolved StoreKit does not match the StoreDefinition pin.");
  }
  if (
    store.schemaVersion !== resolved.storeKit.lockfile.engineSchemaVersion ||
    store.base.schemaVersion !== resolved.storeKit.lockfile.engineSchemaVersion
  ) {
    fail("template-resolution", "engine-schema-mismatch", "StoreDefinition and StoreKit engine schema versions differ.");
  }
  STOREFRONT_RESOURCE_TYPES.forEach((resourceType) => {
    const blueprint = resolved.blueprints[resourceType];
    if (!blueprint || blueprint.resourceType !== resourceType) {
      fail("template-resolution", "storefront-route-missing", `The StoreKit does not resolve a ${resourceType} route.`);
    }
    if (!sameReference(resolved.storeKit.lockfile.blueprints[resourceType], blueprint)) {
      fail("template-resolution", "blueprint-integrity-mismatch", `The ${resourceType} blueprint does not match its StoreKit pin.`);
    }
  });
  return { ...context, resolvedStoreKit: structuredClone(resolved) };
};
