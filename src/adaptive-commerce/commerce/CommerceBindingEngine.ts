import {
  COMMERCE_BINDING_SOURCES,
  commerceBindingSchema,
} from "../contracts/commerceBinding";
import type {
  CommerceBinding,
  CommerceBindingSource,
  CommerceBindingTargetProperty,
  JsonValue,
  SemanticPath,
} from "@/adaptive-commerce";

export type CommerceRuntimeData = Readonly<
  Partial<Record<CommerceBindingSource, JsonValue>>
>;

export type CommerceContentProjection = Readonly<{
  bindingId: string;
  targetPath: SemanticPath;
  channel: "props";
  props: Readonly<Partial<Record<CommerceBindingTargetProperty, JsonValue>>>;
  usedFallback: boolean;
}>;

export class CommerceBindingResolutionError extends Error {
  readonly code = "COMMERCE_BINDING_RESOLUTION_FAILED";

  constructor(
    readonly bindingId: string,
    message: string,
  ) {
    super(message);
    this.name = "CommerceBindingResolutionError";
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const ownValue = (record: Record<string, unknown>, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;

const selectSource = (
  data: CommerceRuntimeData,
  source: CommerceBinding["source"],
): unknown => {
  const root = data[source.kind];
  if (!source.selector) return root;
  const record = asRecord(root);
  return record ? ownValue(record, source.selector) : undefined;
};

const readField = (source: unknown, field: string): unknown => {
  let current = source;
  for (const segment of field.split(".")) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = ownValue(record, segment);
  }
  return current;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  const record = asRecord(value);
  return Boolean(record && Object.values(record).every(isJsonValue));
};

export class CommerceBindingEngine {
  compile(
    binding: CommerceBinding,
    availableTargets?: ReadonlySet<string>,
  ): CommerceBinding {
    const compiled = commerceBindingSchema.parse(structuredClone(binding));
    if (availableTargets && !availableTargets.has(compiled.target.path)) {
      throw new Error(
        `Commerce binding ${compiled.id} targets missing semantic path ${compiled.target.path}.`,
      );
    }
    return compiled;
  }

  compileAll(
    bindings: readonly CommerceBinding[],
    availableTargets?: ReadonlySet<string>,
  ): CommerceBinding[] {
    const ids = new Set<string>();
    return bindings.map((binding) => {
      const compiled = this.compile(binding, availableTargets);
      if (ids.has(compiled.id)) {
        throw new Error(`Duplicate commerce binding ${compiled.id}.`);
      }
      ids.add(compiled.id);
      return compiled;
    });
  }

  resolve(
    binding: CommerceBinding,
    data: CommerceRuntimeData,
  ): CommerceContentProjection {
    const compiled = this.compile(binding);
    const value = readField(selectSource(data, compiled.source), compiled.field);
    const available = value !== undefined && isJsonValue(value);
    const usedFallback = !available && compiled.fallback !== undefined;
    const resolved = available ? value as JsonValue : compiled.fallback;
    if (resolved === undefined) {
      if (compiled.required) {
        throw new CommerceBindingResolutionError(
          compiled.id,
          `Required commerce binding ${compiled.id} could not resolve ${compiled.source.kind}.${compiled.field}.`,
        );
      }
      return {
        bindingId: compiled.id,
        targetPath: compiled.target.path,
        channel: "props",
        props: {},
        usedFallback: false,
      };
    }
    return {
      bindingId: compiled.id,
      targetPath: compiled.target.path,
      channel: "props",
      props: { [compiled.target.property]: structuredClone(resolved) },
      usedFallback,
    };
  }

  supportedSources(): readonly CommerceBindingSource[] {
    return COMMERCE_BINDING_SOURCES;
  }
}

export const commerceBindingEngine = new CommerceBindingEngine();
