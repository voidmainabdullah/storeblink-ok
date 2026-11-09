export type AssetPlatformErrorCode =
  | "ASSET_INVALID_TYPE"
  | "ASSET_TOO_LARGE"
  | "ASSET_UPLOAD_FAILED"
  | "ASSET_STORAGE_CONFLICT"
  | "ASSET_NOT_FOUND"
  | "ASSET_PERMISSION_DENIED";

const MESSAGES: Record<AssetPlatformErrorCode, string> = {
  ASSET_INVALID_TYPE: "This file type is not supported.",
  ASSET_TOO_LARGE: "This file is larger than the allowed upload limit.",
  ASSET_UPLOAD_FAILED: "The asset could not be uploaded. Try again.",
  ASSET_STORAGE_CONFLICT: "This upload conflicts with another active upload. Retry it.",
  ASSET_NOT_FOUND: "The asset could not be found.",
  ASSET_PERMISSION_DENIED: "You do not have permission to manage assets for this store.",
};

export class AssetPlatformError extends Error {
  constructor(
    readonly code: AssetPlatformErrorCode,
    options: { cause?: unknown; retryable?: boolean; status?: number } = {},
  ) {
    super(MESSAGES[code]);
    this.name = "AssetPlatformError";
    this.retryable = options.retryable ?? (
      code === "ASSET_UPLOAD_FAILED" || code === "ASSET_STORAGE_CONFLICT"
    );
    this.status = options.status;
  }

  readonly retryable: boolean;
  readonly status?: number;
}

export const mapAssetError = (error: unknown): AssetPlatformError => {
  if (error instanceof AssetPlatformError) return error;
  const value = (error ?? {}) as { message?: string; status?: number; statusCode?: number; code?: string };
  const message = String(value.message ?? "").toLowerCase();
  const status = Number(value.status ?? value.statusCode ?? 0) || undefined;
  if (status === 409 || /already exists|conflict/.test(message)) {
    return new AssetPlatformError("ASSET_STORAGE_CONFLICT", { cause: error, status });
  }
  if (status === 401 || status === 403 || /permission|not authorized|row-level security/.test(message)) {
    return new AssetPlatformError("ASSET_PERMISSION_DENIED", { cause: error, status });
  }
  if (status === 404 || /not found/.test(message)) {
    return new AssetPlatformError("ASSET_NOT_FOUND", { cause: error, status });
  }
  if (status === 413 || /too large|size.*limit/.test(message)) {
    return new AssetPlatformError("ASSET_TOO_LARGE", { cause: error, status });
  }
  return new AssetPlatformError("ASSET_UPLOAD_FAILED", { cause: error, status, retryable: true });
};
