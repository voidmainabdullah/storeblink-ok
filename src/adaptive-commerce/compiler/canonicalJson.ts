export class CanonicalJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalJsonError";
  }
}

const isPlainObject = (value: object): value is Record<string, unknown> => {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const normalizeNumber = (value: number, path: string): number => {
  if (!Number.isFinite(value)) {
    throw new CanonicalJsonError(`${path} contains a non-finite number.`);
  }
  return Object.is(value, -0) ? 0 : value;
};

const canonicalize = (
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
): unknown => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") return normalizeNumber(value, path);
  if (
    value === undefined ||
    typeof value === "bigint" ||
    typeof value === "function" ||
    typeof value === "symbol"
  ) {
    throw new CanonicalJsonError(`${path} contains an unsupported JSON value.`);
  }
  if (typeof value !== "object") {
    throw new CanonicalJsonError(`${path} is not JSON serializable.`);
  }
  if (ancestors.has(value)) {
    throw new CanonicalJsonError(`${path} contains a circular reference.`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((entry, index) =>
        canonicalize(entry, `${path}[${index}]`, ancestors),
      );
    }
    if (!isPlainObject(value)) {
      throw new CanonicalJsonError(`${path} must be a plain JSON object.`);
    }
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
        .map((key) => [
          key,
          canonicalize(value[key], `${path}.${key}`, ancestors),
        ]),
    );
  } finally {
    ancestors.delete(value);
  }
};

/**
 * Produces a stable JSON representation suitable for artifact hashing.
 * Unsupported values are rejected instead of being silently discarded.
 */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalize(value, "$", new WeakSet<object>()));
