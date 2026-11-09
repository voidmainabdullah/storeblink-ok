import {
  merchantPatchSchema,
  semanticPathRenameSchema,
  semanticPathsOverlap,
  semanticStorefrontDocumentSchema,
  type JsonValue,
  type MerchantPatch,
  type MerchantPatchOperation,
  type PatchConflict,
  type SemanticCollection,
  type SemanticPath,
  type SemanticPathRename,
  type SemanticStorefrontDocument,
} from "@/adaptive-commerce/contracts";

export type MerchantPatchApplicationResult = Readonly<{
  document: SemanticStorefrontDocument;
  appliedPatchIds: readonly string[];
  appliedOperationCount: number;
}>;

export type ThreeWayBaseMergeResult = Readonly<{
  status: "merged" | "conflicted";
  publishable: boolean;
  candidate: SemanticStorefrontDocument;
  appliedPatchIds: readonly string[];
  appliedOperationCount: number;
  conflicts: readonly PatchConflict[];
}>;

type ScalarChange = Readonly<{
  path: SemanticPath;
  beforeExists: boolean;
  afterExists: boolean;
  before?: JsonValue;
  after?: JsonValue;
}>;

type CollectionChange = Readonly<{
  path: SemanticPath;
  before: SemanticCollection | null;
  after: SemanticCollection | null;
  changedKeys: ReadonlySet<string>;
  movedKeys: ReadonlySet<string>;
}>;

const clone = <T>(value: T): T => structuredClone(value);
const own = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);
const equal = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const sortedPatches = (patches: readonly MerchantPatch[]): MerchantPatch[] =>
  [...patches].sort((left, right) =>
    left.sequence - right.sequence || left.id.localeCompare(right.id));

const predecessorMap = (order: readonly string[]): Map<string, string | null> =>
  new Map(order.map((key, index) => [key, index === 0 ? null : order[index - 1]]));

const movedKeys = (
  before: readonly string[],
  after: readonly string[],
): Set<string> => {
  const previous = predecessorMap(before);
  const next = predecessorMap(after);
  const result = new Set<string>();
  new Set([...before, ...after]).forEach((key) => {
    if (previous.get(key) !== next.get(key)) result.add(key);
  });
  return result;
};

const pathWithRenames = (
  input: SemanticPath,
  renames: readonly SemanticPathRename[],
): SemanticPath => {
  let path = input as string;
  const seen = new Set<string>([path]);
  for (let iteration = 0; iteration <= renames.length; iteration += 1) {
    const matches = renames
      .filter((rename) => path === rename.from || path.startsWith(`${rename.from}.`))
      .sort((left, right) => right.from.length - left.from.length);
    if (!matches.length) return path as SemanticPath;
    const best = matches[0];
    const equallySpecific = matches.filter((rename) => rename.from.length === best.from.length);
    if (equallySpecific.length > 1) {
      throw new MerchantPatchError(`Semantic path ${path} has ambiguous rename rules.`);
    }
    path = `${best.to}${path.slice(best.from.length)}`;
    if (seen.has(path)) throw new MerchantPatchError(`Semantic path rename cycle includes ${path}.`);
    seen.add(path);
  }
  throw new MerchantPatchError(`Semantic path rename chain for ${input} does not terminate.`);
};

const validateRenames = (input: readonly SemanticPathRename[]): SemanticPathRename[] => {
  const renames = input.map((rename) => semanticPathRenameSchema.parse(rename));
  const sources = new Set<string>();
  renames.forEach((rename) => {
    if (sources.has(rename.from)) throw new MerchantPatchError(`Duplicate semantic rename source ${rename.from}.`);
    sources.add(rename.from);
  });
  renames.forEach((rename) => pathWithRenames(rename.from, renames));
  return renames;
};

const renameOperation = (
  operation: MerchantPatchOperation,
  renames: readonly SemanticPathRename[],
): MerchantPatchOperation => ({
  ...clone(operation),
  target: pathWithRenames(operation.target, renames),
});

const renameDocumentPaths = (
  input: SemanticStorefrontDocument,
  renames: readonly SemanticPathRename[],
): SemanticStorefrontDocument => {
  if (!renames.length) return clone(input);
  const values: SemanticStorefrontDocument["values"] = {};
  Object.entries(input.values).forEach(([rawPath, value]) => {
    const path = pathWithRenames(rawPath as SemanticPath, renames);
    if (own(values, path)) throw new MerchantPatchError(`Semantic rename collides at ${path}.`);
    values[path] = clone(value);
  });
  const collections: SemanticStorefrontDocument["collections"] = {};
  Object.entries(input.collections).forEach(([rawPath, value]) => {
    const path = pathWithRenames(rawPath as SemanticPath, renames);
    if (own(collections, path) || own(values, path)) {
      throw new MerchantPatchError(`Semantic rename collides at ${path}.`);
    }
    collections[path] = clone(value);
  });
  return semanticStorefrontDocumentSchema.parse({ ...input, values, collections });
};

const scalarChanges = (
  before: SemanticStorefrontDocument,
  after: SemanticStorefrontDocument,
): ScalarChange[] => {
  const paths = new Set([...Object.keys(before.values), ...Object.keys(after.values)]);
  return [...paths].flatMap((rawPath) => {
    const beforeExists = own(before.values, rawPath);
    const afterExists = own(after.values, rawPath);
    const previous = before.values[rawPath as SemanticPath];
    const next = after.values[rawPath as SemanticPath];
    if (beforeExists === afterExists && equal(previous, next)) return [];
    return [{
      path: rawPath as SemanticPath,
      beforeExists,
      afterExists,
      ...(beforeExists ? { before: clone(previous) } : {}),
      ...(afterExists ? { after: clone(next) } : {}),
    }];
  });
};

const collectionChanges = (
  before: SemanticStorefrontDocument,
  after: SemanticStorefrontDocument,
): CollectionChange[] => {
  const paths = new Set([
    ...Object.keys(before.collections),
    ...Object.keys(after.collections),
  ]);
  return [...paths].flatMap((rawPath) => {
    const previous = before.collections[rawPath as SemanticPath] ?? null;
    const next = after.collections[rawPath as SemanticPath] ?? null;
    if (equal(previous, next)) return [];
    const keys = new Set([
      ...Object.keys(previous?.items ?? {}),
      ...Object.keys(next?.items ?? {}),
    ]);
    const changedKeys = new Set<string>();
    keys.forEach((key) => {
      const previousExists = Boolean(previous && own(previous.items, key));
      const nextExists = Boolean(next && own(next.items, key));
      if (
        previousExists !== nextExists ||
        !equal(previous?.items[key], next?.items[key])
      ) changedKeys.add(key);
    });
    return [{
      path: rawPath as SemanticPath,
      before: previous ? clone(previous) : null,
      after: next ? clone(next) : null,
      changedKeys,
      movedKeys: movedKeys(previous?.order ?? [], next?.order ?? []),
    }];
  });
};

const conflictValue = (
  change: ScalarChange | undefined,
  side: "before" | "after",
): { baseBefore?: JsonValue; baseAfter?: JsonValue } => {
  if (!change) return {};
  if (side === "before" && change.beforeExists) return { baseBefore: clone(change.before as JsonValue) };
  if (side === "after" && change.afterExists) return { baseAfter: clone(change.after as JsonValue) };
  return {};
};

const conflictFor = (
  patch: MerchantPatch,
  operationIndex: number,
  operation: MerchantPatchOperation,
  reason: PatchConflict["reason"],
  values: Partial<Pick<PatchConflict, "baseBefore" | "baseAfter">> = {},
): PatchConflict => ({
  id: `${patch.id}:${operationIndex}`,
  patchId: patch.id,
  operationIndex,
  target: operation.target,
  key: "key" in operation ? operation.key : null,
  reason,
  ...values,
  status: "unresolved",
});

const insertAt = (order: string[], key: string, beforeKey: string | null): void => {
  if (beforeKey === null) {
    order.push(key);
    return;
  }
  const index = order.indexOf(beforeKey);
  if (index < 0) throw new MerchantPatchError(`Collection item ${beforeKey} does not exist.`);
  order.splice(index, 0, key);
};

const applyOperation = (
  document: SemanticStorefrontDocument,
  operation: MerchantPatchOperation,
): void => {
  if (operation.op === "set") {
    if (!own(document.values, operation.target)) {
      throw new MerchantPatchError(`Semantic value ${operation.target} does not exist.`);
    }
    document.values[operation.target] = clone(operation.value);
    return;
  }
  if (operation.op === "unset") {
    if (!own(document.values, operation.target)) {
      throw new MerchantPatchError(`Semantic value ${operation.target} does not exist.`);
    }
    delete document.values[operation.target];
    return;
  }
  const collection = document.collections[operation.target];
  if (!collection) throw new MerchantPatchError(`Semantic collection ${operation.target} does not exist.`);
  if (operation.op === "insert") {
    if (own(collection.items, operation.key)) {
      throw new MerchantPatchError(`Collection item ${operation.key} already exists.`);
    }
    if (operation.beforeKey === operation.key) {
      throw new MerchantPatchError("A collection item cannot be inserted before itself.");
    }
    collection.items[operation.key] = clone(operation.value);
    insertAt(collection.order, operation.key, operation.beforeKey);
    return;
  }
  if (!own(collection.items, operation.key)) {
    throw new MerchantPatchError(`Collection item ${operation.key} does not exist.`);
  }
  if (operation.op === "remove") {
    delete collection.items[operation.key];
    collection.order = collection.order.filter((key) => key !== operation.key);
    return;
  }
  if (operation.beforeKey === operation.key) return;
  if (operation.beforeKey !== null && !own(collection.items, operation.beforeKey)) {
    throw new MerchantPatchError(`Collection item ${operation.beforeKey} does not exist.`);
  }
  collection.order = collection.order.filter((key) => key !== operation.key);
  insertAt(collection.order, operation.key, operation.beforeKey);
};

const operationConflict = (
  patch: MerchantPatch,
  operationIndex: number,
  operation: MerchantPatchOperation,
  before: SemanticStorefrontDocument,
  after: SemanticStorefrontDocument,
  scalar: readonly ScalarChange[],
  collections: readonly CollectionChange[],
): PatchConflict | null => {
  if (operation.op === "set" || operation.op === "unset") {
    if (!own(after.values, operation.target)) {
      return conflictFor(patch, operationIndex, operation, "path-removed", {
        ...(own(before.values, operation.target)
          ? { baseBefore: clone(before.values[operation.target]) }
          : {}),
      });
    }
    const change = scalar.find((entry) => semanticPathsOverlap(entry.path, operation.target));
    if (change) {
      return conflictFor(patch, operationIndex, operation, "path-changed", {
        ...conflictValue(change, "before"),
        ...conflictValue(change, "after"),
      });
    }
    return null;
  }
  const collection = after.collections[operation.target];
  const collectionChange = collections.find((entry) =>
    semanticPathsOverlap(entry.path, operation.target));
  if (!collection) return conflictFor(patch, operationIndex, operation, "path-removed");
  if (!collectionChange) {
    try {
      const probe = clone(after);
      applyOperation(probe, operation);
      return null;
    } catch {
      return conflictFor(patch, operationIndex, operation, "operation-invalid-on-new-base");
    }
  }
  if (operation.op === "insert") {
    if (collectionChange.changedKeys.has(operation.key) || own(collection.items, operation.key)) {
      return conflictFor(patch, operationIndex, operation, "collection-item-changed");
    }
    if (operation.beforeKey && collectionChange.movedKeys.has(operation.beforeKey)) {
      return conflictFor(patch, operationIndex, operation, "collection-order-changed");
    }
  }
  if (operation.op === "remove" && collectionChange.changedKeys.has(operation.key)) {
    return conflictFor(patch, operationIndex, operation, "collection-item-changed");
  }
  if (
    operation.op === "reorder" &&
    (collectionChange.movedKeys.has(operation.key) ||
      Boolean(operation.beforeKey && collectionChange.movedKeys.has(operation.beforeKey)))
  ) {
    return conflictFor(patch, operationIndex, operation, "collection-order-changed");
  }
  try {
    const probe = clone(after);
    applyOperation(probe, operation);
    return null;
  } catch {
    return conflictFor(patch, operationIndex, operation, "operation-invalid-on-new-base");
  }
};

export class MerchantPatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MerchantPatchError";
  }
}

export class MerchantPatchSystem {
  apply(
    input: SemanticStorefrontDocument,
    rawPatches: readonly MerchantPatch[],
    rawRenames: readonly SemanticPathRename[] = [],
  ): MerchantPatchApplicationResult {
    const renames = validateRenames(rawRenames);
    const document = renameDocumentPaths(
      semanticStorefrontDocumentSchema.parse(input),
      renames,
    );
    const patches = sortedPatches(rawPatches.map((patch) => merchantPatchSchema.parse(patch)));
    let appliedOperationCount = 0;
    const appliedPatchIds: string[] = [];
    patches.forEach((patch) => {
      if (patch.status !== "active") {
        throw new MerchantPatchError(`Patch ${patch.id} is ${patch.status} and cannot be applied.`);
      }
      if (patch.baseRevisionId !== document.revisionId) {
        throw new MerchantPatchError(`Patch ${patch.id} targets base ${patch.baseRevisionId}, not ${document.revisionId}.`);
      }
      patch.operations.forEach((operation) => {
        applyOperation(document, renameOperation(operation, renames));
        appliedOperationCount += 1;
      });
      appliedPatchIds.push(patch.id);
    });
    return {
      document: semanticStorefrontDocumentSchema.parse(document),
      appliedPatchIds,
      appliedOperationCount,
    };
  }

  detectConflicts(
    rawOldBase: SemanticStorefrontDocument,
    rawNewBase: SemanticStorefrontDocument,
    rawPatches: readonly MerchantPatch[],
    rawRenames: readonly SemanticPathRename[] = [],
  ): PatchConflict[] {
    const renames = validateRenames(rawRenames);
    const oldBase = renameDocumentPaths(
      semanticStorefrontDocumentSchema.parse(rawOldBase),
      renames,
    );
    const newBase = semanticStorefrontDocumentSchema.parse(rawNewBase);
    rawPatches.forEach((patch) => {
      if (patch.baseRevisionId !== rawOldBase.revisionId) {
        throw new MerchantPatchError(
          `Patch ${patch.id} targets base ${patch.baseRevisionId}, not merge base ${rawOldBase.revisionId}.`,
        );
      }
    });
    const scalar = scalarChanges(oldBase, newBase);
    const collections = collectionChanges(oldBase, newBase);
    const conflicts: PatchConflict[] = [];
    sortedPatches(rawPatches.map((patch) => merchantPatchSchema.parse(patch)))
      .filter((patch) => patch.status === "active")
      .forEach((patch) => patch.operations.forEach((rawOperation, index) => {
        let operation: MerchantPatchOperation;
        try {
          operation = renameOperation(rawOperation, renames);
        } catch {
          conflicts.push(conflictFor(patch, index, rawOperation, "path-renamed-ambiguously"));
          return;
        }
        const conflict = operationConflict(
          patch,
          index,
          operation,
          oldBase,
          newBase,
          scalar,
          collections,
        );
        if (conflict) conflicts.push(conflict);
      }));
    return conflicts;
  }

  mergeBases(
    rawOldBase: SemanticStorefrontDocument,
    rawNewBase: SemanticStorefrontDocument,
    rawPatches: readonly MerchantPatch[],
    rawRenames: readonly SemanticPathRename[] = [],
  ): ThreeWayBaseMergeResult {
    const renames = validateRenames(rawRenames);
    const oldBase = semanticStorefrontDocumentSchema.parse(rawOldBase);
    const candidate = semanticStorefrontDocumentSchema.parse(rawNewBase);
    const patches = sortedPatches(rawPatches.map((patch) => merchantPatchSchema.parse(patch)))
      .filter((patch) => patch.status === "active");
    const conflicts = this.detectConflicts(oldBase, candidate, patches, renames);
    const conflictKeys = new Set(conflicts.map((conflict) =>
      `${conflict.patchId}:${conflict.operationIndex}`));
    const appliedPatchIds = new Set<string>();
    let appliedOperationCount = 0;
    patches.forEach((patch) => patch.operations.forEach((operation, index) => {
      if (conflictKeys.has(`${patch.id}:${index}`)) return;
      try {
        applyOperation(candidate, renameOperation(operation, renames));
        appliedOperationCount += 1;
        appliedPatchIds.add(patch.id);
      } catch {
        conflicts.push(conflictFor(
          patch,
          index,
          renameOperation(operation, renames),
          "operation-invalid-on-new-base",
        ));
      }
    }));
    return {
      status: conflicts.length ? "conflicted" : "merged",
      publishable: conflicts.length === 0,
      candidate: semanticStorefrontDocumentSchema.parse(candidate),
      appliedPatchIds: [...appliedPatchIds],
      appliedOperationCount,
      conflicts,
    };
  }

  renamePath(path: SemanticPath, renames: readonly SemanticPathRename[]): SemanticPath {
    return pathWithRenames(path, validateRenames(renames));
  }
}

export const merchantPatchSystem = new MerchantPatchSystem();
