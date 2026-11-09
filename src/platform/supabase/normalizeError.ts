type SupabaseErrorLike = Readonly<{
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
}>;

export class SupabaseOperationError extends Error {
  constructor(
    readonly operation: string,
    message: string,
    readonly code?: string,
    readonly details?: string,
    readonly hint?: string,
  ) {
    super(`${operation}${code ? ` (${code})` : ""}: ${message}`);
    this.name = "SupabaseOperationError";
  }
}

const stringValue = (value: unknown) => typeof value === "string" && value.trim()
  ? value.trim()
  : undefined;

export const normalizeSupabaseError = (
  error: unknown,
  operation: string,
): SupabaseOperationError => {
  if (error instanceof SupabaseOperationError) return error;
  const source = error && typeof error === "object"
    ? error as SupabaseErrorLike
    : {};
  const message = error instanceof Error
    ? error.message
    : stringValue(source.message) ?? "The database request failed.";
  return new SupabaseOperationError(
    operation,
    message,
    stringValue(source.code),
    stringValue(source.details),
    stringValue(source.hint),
  );
};

export const throwIfSupabaseError = (error: unknown, operation: string): void => {
  if (error) throw normalizeSupabaseError(error, operation);
};
