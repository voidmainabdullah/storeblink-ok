import {
  commerceBindingSchema,
  designTokenOverrideSchema,
  merchantPatchSchema,
  sectionControlSemanticPath,
  semanticPathSchema,
  type CommerceBinding,
  type DesignTokenLiteral,
  type JsonValue,
  type MerchantPatchOperation,
  type SemanticPath,
  type SemanticStorefrontDocument,
  type StoreDefinition,
  type StorefrontResourceType,
} from "@/adaptive-commerce/contracts";
import { merchantPatchSystem } from "@/adaptive-commerce/patches";
import { routesWithoutVisibleSections } from "./catalog";
import type { AdaptiveAuthoringSource } from "./types";

type CommandBase = Readonly<{
  id: string;
  label: string;
}>;

export type SemanticValueCommand = CommandBase & Readonly<{
  kind: "semantic-value";
  target: SemanticPath;
  before: JsonValue;
  after: JsonValue;
}>;

export type CollectionReorderCommand = CommandBase & Readonly<{
  kind: "collection-reorder";
  target: SemanticPath;
  key: string;
  beforeKey: string | null;
  restoreBeforeKey: string | null;
}>;

export type PresetCommand = CommandBase & Readonly<{
  kind: "preset";
  before: string | null;
  after: string | null;
}>;

export type TokenCommand = CommandBase & Readonly<{
  kind: "token";
  address: string;
  before: DesignTokenLiteral | null;
  after: DesignTokenLiteral | null;
}>;

export type BindingSourceCommand = CommandBase & Readonly<{
  kind: "binding-source";
  bindingId: string;
  before: CommerceBinding["source"];
  after: CommerceBinding["source"];
}>;

export type AdaptiveAuthoringCommand =
  | SemanticValueCommand
  | CollectionReorderCommand
  | PresetCommand
  | TokenCommand
  | BindingSourceCommand;

export type AdaptiveAuthoringSession = Readonly<{
  source: AdaptiveAuthoringSource;
  executed: readonly AdaptiveAuthoringCommand[];
  undone: readonly AdaptiveAuthoringCommand[];
}>;

export type AdaptiveAuthoringProjection = Readonly<{
  storeDefinition: StoreDefinition;
  effectiveDocument: SemanticStorefrontDocument;
  operations: readonly MerchantPatchOperation[];
  changed: boolean;
}>;

export class AdaptiveAuthoringPolicyViolationError extends Error {
  readonly code = "ADAPTIVE_ROUTE_REQUIRES_VISIBLE_SECTION";

  constructor(readonly route: StorefrontResourceType) {
    super(`${route === "404" ? "404" : `${route[0].toUpperCase()}${route.slice(1)}`} must keep at least one visible certified section.`);
    this.name = "AdaptiveAuthoringPolicyViolationError";
  }
}

const commandId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `authoring-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const createSemanticValueCommand = (input: Readonly<{
  target: string;
  before: JsonValue;
  after: JsonValue;
  label: string;
}>): SemanticValueCommand => ({
  kind: "semantic-value",
  id: commandId(),
  label: input.label,
  target: semanticPathSchema.parse(input.target),
  before: structuredClone(input.before),
  after: structuredClone(input.after),
});

export const createPresetCommand = (
  before: string | null,
  after: string | null,
): PresetCommand => ({
  kind: "preset",
  id: commandId(),
  label: "Change design preset",
  before,
  after,
});

export const createCollectionReorderCommand = (input: Readonly<{
  target: string;
  order: readonly string[];
  key: string;
  beforeKey: string | null;
  label: string;
}>): CollectionReorderCommand => {
  const index = input.order.indexOf(input.key);
  if (index < 0) throw new Error(`Collection item ${input.key} is not present in ${input.target}.`);
  if (input.beforeKey !== null && !input.order.includes(input.beforeKey)) {
    throw new Error(`Collection item ${input.beforeKey} is not present in ${input.target}.`);
  }
  return {
    kind: "collection-reorder",
    id: commandId(),
    label: input.label,
    target: semanticPathSchema.parse(input.target),
    key: input.key,
    beforeKey: input.beforeKey,
    restoreBeforeKey: input.order[index + 1] ?? null,
  };
};

export const createTokenCommand = (input: Readonly<{
  address: string;
  before: DesignTokenLiteral | null;
  after: DesignTokenLiteral | null;
  label: string;
}>): TokenCommand => {
  if (input.after) designTokenOverrideSchema.parse({ address: input.address, value: input.after });
  return {
    kind: "token",
    id: commandId(),
    label: input.label,
    address: input.address,
    before: input.before ? structuredClone(input.before) : null,
    after: input.after ? structuredClone(input.after) : null,
  };
};

export const createBindingSourceCommand = (input: Readonly<{
  binding: CommerceBinding;
  after: CommerceBinding["source"];
}>): BindingSourceCommand => {
  commerceBindingSchema.parse({ ...input.binding, source: input.after });
  return {
    kind: "binding-source",
    id: commandId(),
    label: `Change ${input.binding.id} product source`,
    bindingId: input.binding.id,
    before: structuredClone(input.binding.source),
    after: structuredClone(input.after),
  };
};

export const inverseOperationFor = (
  command: AdaptiveAuthoringCommand,
): MerchantPatchOperation | null => command.kind === "semantic-value"
  ? { op: "set", target: command.target, value: structuredClone(command.before) }
  : command.kind === "collection-reorder"
    ? { op: "reorder", target: command.target, key: command.key, beforeKey: command.restoreBeforeKey }
  : null;

const forwardOperationFor = (
  command: AdaptiveAuthoringCommand,
): MerchantPatchOperation | null => command.kind === "semantic-value"
  ? { op: "set", target: command.target, value: structuredClone(command.after) }
  : command.kind === "collection-reorder"
    ? { op: "reorder", target: command.target, key: command.key, beforeKey: command.beforeKey }
  : null;

const jsonEqual = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const compactSemanticOperations = (
  commands: readonly AdaptiveAuthoringCommand[],
  before: SemanticStorefrontDocument,
  after: SemanticStorefrontDocument,
): MerchantPatchOperation[] => {
  const targetOrder: string[] = [];
  commands.forEach((command) => {
    const operation = forwardOperationFor(command);
    if (operation && !targetOrder.includes(operation.target)) targetOrder.push(operation.target);
  });
  return targetOrder.flatMap((target): MerchantPatchOperation[] => {
    const semantic = commands.find((command): command is SemanticValueCommand =>
      command.kind === "semantic-value" && command.target === target);
    if (semantic) {
      const next = after.values[target];
      return jsonEqual(before.values[target], next)
        ? []
        : [{ op: "set", target: semantic.target, value: structuredClone(next) }];
    }
    const reorder = commands.find((command): command is CollectionReorderCommand =>
      command.kind === "collection-reorder" && command.target === target);
    if (!reorder) return [];
    const current = [...(before.collections[target]?.order ?? [])];
    const desired = after.collections[target]?.order ?? [];
    const operations: MerchantPatchOperation[] = [];
    desired.forEach((key, destination) => {
      if (current[destination] === key) return;
      const source = current.indexOf(key);
      if (source < 0) return;
      const beforeKey = current[destination] ?? null;
      operations.push({ op: "reorder", target: reorder.target, key, beforeKey });
      current.splice(source, 1);
      const insertAt = beforeKey === null ? current.length : current.indexOf(beforeKey);
      current.splice(insertAt, 0, key);
    });
    return operations;
  });
};

const applyDefinitionCommands = (
  input: StoreDefinition,
  commands: readonly AdaptiveAuthoringCommand[],
): StoreDefinition => {
  const definition = structuredClone(input);
  commands.forEach((command) => {
    if (command.kind === "preset") {
      definition.designTokens.presetId = command.after;
      return;
    }
    if (command.kind === "token") {
      definition.designTokens.overrides = definition.designTokens.overrides
        .filter((override) => override.address !== command.address);
      if (command.after) {
        definition.designTokens.overrides.push(designTokenOverrideSchema.parse({
          address: command.address,
          value: structuredClone(command.after),
        }));
      }
      return;
    }
    if (command.kind === "binding-source") {
      definition.commerceBindings = definition.commerceBindings.map((binding) =>
        binding.id === command.bindingId
          ? commerceBindingSchema.parse({ ...binding, source: structuredClone(command.after) })
          : binding);
    }
  });
  return definition;
};

export const createAdaptiveAuthoringSession = (
  source: AdaptiveAuthoringSource,
): AdaptiveAuthoringSession => ({ source, executed: [], undone: [] });

const visibilityRouteFor = (
  source: AdaptiveAuthoringSource,
  command: AdaptiveAuthoringCommand,
): StorefrontResourceType | null => {
  if (command.kind !== "semantic-value" || command.after !== false) return null;
  return source.catalog.blueprints.find((blueprint) => blueprint.sections.some((section) =>
    sectionControlSemanticPath(section.path, "visible") === command.target))?.resourceType ?? null;
};

const assertCommandPolicy = (
  candidate: AdaptiveAuthoringSession,
  command: AdaptiveAuthoringCommand,
): void => {
  const route = visibilityRouteFor(candidate.source, command);
  if (!route) return;
  const projection = projectAdaptiveAuthoringSession(candidate);
  if (routesWithoutVisibleSections(candidate.source.catalog, projection.effectiveDocument).includes(route)) {
    throw new AdaptiveAuthoringPolicyViolationError(route);
  }
};

export const executeAdaptiveAuthoringCommand = (
  session: AdaptiveAuthoringSession,
  command: AdaptiveAuthoringCommand,
): AdaptiveAuthoringSession => {
  const candidate = {
    ...session,
    executed: [...session.executed, command],
    undone: [],
  };
  assertCommandPolicy(candidate, command);
  return candidate;
};

export const undoAdaptiveAuthoringCommand = (
  session: AdaptiveAuthoringSession,
): AdaptiveAuthoringSession => {
  const command = session.executed.at(-1);
  if (!command) return session;
  return {
    ...session,
    executed: session.executed.slice(0, -1),
    undone: [...session.undone, command],
  };
};

export const redoAdaptiveAuthoringCommand = (
  session: AdaptiveAuthoringSession,
): AdaptiveAuthoringSession => {
  const command = session.undone.at(-1);
  if (!command) return session;
  const candidate = {
    ...session,
    executed: [...session.executed, command],
    undone: session.undone.slice(0, -1),
  };
  assertCommandPolicy(candidate, command);
  return candidate;
};

export const projectAdaptiveAuthoringSession = (
  session: AdaptiveAuthoringSession,
): AdaptiveAuthoringProjection => {
  const storeDefinition = applyDefinitionCommands(session.source.storeDefinition, session.executed);
  const initialDocument = merchantPatchSystem.apply(
    session.source.storeDefinition.base,
    session.source.merchantPatches,
  ).document;
  const draftOperations = session.executed.flatMap((command) => {
    const operation = forwardOperationFor(command);
    return operation ? [operation] : [];
  });
  const patches = [...session.source.merchantPatches];
  if (draftOperations.length) {
    patches.push(merchantPatchSchema.parse({
      id: "authoring-draft",
      storeId: storeDefinition.storeId,
      baseRevisionId: storeDefinition.base.revisionId,
      sequence: Math.max(0, ...patches.map((patch) => patch.sequence)) + 1,
      status: "active",
      operations: draftOperations,
      createdAt: "2000-01-01T00:00:00.000Z",
      createdBy: "authoring-session",
    }));
  }
  const effectiveDocument = merchantPatchSystem.apply(storeDefinition.base, patches).document;
  const operations = compactSemanticOperations(session.executed, initialDocument, effectiveDocument);
  const definitionChanged = !jsonEqual(
    {
      designTokens: session.source.storeDefinition.designTokens,
      commerceBindings: session.source.storeDefinition.commerceBindings,
    },
    {
      designTokens: storeDefinition.designTokens,
      commerceBindings: storeDefinition.commerceBindings,
    },
  );
  return {
    storeDefinition,
    effectiveDocument,
    operations,
    changed: definitionChanged || !jsonEqual(initialDocument, effectiveDocument),
  };
};
