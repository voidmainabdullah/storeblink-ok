export class DomainApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly action?: string,
  ) {
    super(message);
    this.name = "DomainApiError";
  }
}

export class ProviderPendingError extends DomainApiError {
  constructor(message = "Provider operation is still pending.") {
    super("PROVIDER_PENDING", message, 409);
  }
}

export const safeError = (error: unknown): DomainApiError => {
  if (error instanceof DomainApiError) return error;
  console.error("Unhandled domain operation error", error);
  return new DomainApiError(
    "DOMAIN_OPERATION_FAILED",
    "The domain operation could not be completed. Try again shortly.",
    500,
  );
};
