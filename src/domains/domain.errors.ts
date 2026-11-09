export type DomainPlatformErrorCode =
  | "AUTH_REQUIRED"
  | "AAL2_REQUIRED"
  | "DOMAIN_ACCESS_DENIED"
  | "DOMAIN_ALREADY_CLAIMED"
  | "PROVIDER_NOT_CONFIGURED"
  | "DOMAIN_SERVICE_UNAVAILABLE"
  | "DOMAIN_SERVICE_VERSION_MISMATCH"
  | "DOMAIN_OPERATION_FAILED";

const friendlyMessages: Record<DomainPlatformErrorCode, string> = {
  AUTH_REQUIRED: "Sign in to manage domains.",
  AAL2_REQUIRED: "Complete two-step verification before managing domains.",
  DOMAIN_ACCESS_DENIED: "You do not have permission to manage this store's domains.",
  DOMAIN_ALREADY_CLAIMED: "This domain is already connected to another store.",
  PROVIDER_NOT_CONFIGURED: "This domain service has not been configured yet.",
  DOMAIN_SERVICE_UNAVAILABLE: "The domain service is temporarily unavailable. Try again shortly.",
  DOMAIN_SERVICE_VERSION_MISMATCH: "StoreBlink services are being updated. Refresh the page and try again shortly.",
  DOMAIN_OPERATION_FAILED: "The domain operation could not be completed.",
};

export class DomainPlatformError extends Error {
  constructor(
    readonly code: string,
    message?: string,
    readonly action?: string,
  ) {
    super(message ?? friendlyMessages[code as DomainPlatformErrorCode] ?? friendlyMessages.DOMAIN_OPERATION_FAILED);
    this.name = "DomainPlatformError";
  }
}

export const remoteDomainError = (
  code: string,
  message?: string,
  action?: string,
): DomainPlatformError => code === "UNKNOWN_ACTION"
  ? new DomainPlatformError("DOMAIN_SERVICE_VERSION_MISMATCH", undefined, action)
  : new DomainPlatformError(code, message, action);

export const mapDomainError = (error: unknown): DomainPlatformError => {
  if (error instanceof DomainPlatformError) return error;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (/failed to fetch|failed to send a request|network request failed|load failed/.test(message)) {
    return new DomainPlatformError("DOMAIN_SERVICE_UNAVAILABLE");
  }
  return new DomainPlatformError("DOMAIN_OPERATION_FAILED");
};
