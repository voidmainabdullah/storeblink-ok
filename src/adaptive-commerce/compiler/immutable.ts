export const deepFreeze = <T>(value: T): Readonly<T> => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value as Readonly<T>;
  }
  Object.freeze(value);
  Object.values(value as Record<string, unknown>).forEach((entry) => {
    if (entry && typeof entry === "object") deepFreeze(entry);
  });
  return value as Readonly<T>;
};

export const cloneAndFreeze = <T>(value: T): Readonly<T> =>
  deepFreeze(structuredClone(value));

