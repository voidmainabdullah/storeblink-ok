import type { AuthError, PostgrestError, StorageApiError } from "@supabase/supabase-js";

export type AuthPlatformErrorCode =
  | "AUTH_INVALID_CREDENTIALS"
  | "AUTH_EMAIL_NOT_VERIFIED"
  | "AUTH_SESSION_EXPIRED"
  | "AUTH_MFA_REQUIRED"
  | "AUTH_RATE_LIMITED"
  | "AUTH_BACKEND_UNAVAILABLE"
  | "STORE_ACCESS_DENIED"
  | "STORE_MEMBERSHIP_REVOKED"
  | "AUTH_UNKNOWN";

const USER_MESSAGES: Record<AuthPlatformErrorCode, string> = {
  AUTH_INVALID_CREDENTIALS: "The email or password is incorrect.",
  AUTH_EMAIL_NOT_VERIFIED: "Verify your email before signing in.",
  AUTH_SESSION_EXPIRED: "Your session expired. Sign in again.",
  AUTH_MFA_REQUIRED: "Complete two-step verification to continue.",
  AUTH_RATE_LIMITED: "Too many attempts. Wait a moment and try again.",
  AUTH_BACKEND_UNAVAILABLE:
    "Authentication service is temporarily unavailable. Try again shortly or contact support.",
  STORE_ACCESS_DENIED: "You do not have permission to access this store.",
  STORE_MEMBERSHIP_REVOKED: "Your access to this store has been revoked.",
  AUTH_UNKNOWN: "Authentication could not be completed. Try again.",
};

export class AuthPlatformError extends Error {
  constructor(
    readonly code: AuthPlatformErrorCode,
    options: { cause?: unknown; status?: number; retryAfterSeconds?: number } = {},
  ) {
    super(USER_MESSAGES[code]);
    this.name = "AuthPlatformError";
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  readonly status?: number;
  readonly retryAfterSeconds?: number;
}

type SupabaseLikeError = Partial<AuthError & PostgrestError & StorageApiError> & {
  status?: number;
  code?: string;
  message?: string;
};

export const mapAuthError = (error: unknown): AuthPlatformError => {
  if (error instanceof AuthPlatformError) return error;
  const source = (error ?? {}) as SupabaseLikeError;
  const message = String(source.message ?? "").toLowerCase();
  const code = String(source.code ?? "").toLowerCase();
  const status = Number(source.status || 0) || undefined;

  if (
    error instanceof TypeError &&
    /failed to fetch|networkerror|network request failed|load failed/.test(message)
  ) {
    return new AuthPlatformError("AUTH_BACKEND_UNAVAILABLE", {
      cause: error,
      status,
    });
  }
  if (
    /failed to fetch|networkerror|network request failed|name_not_resolved|connection refused/.test(
      message,
    )
  ) {
    return new AuthPlatformError("AUTH_BACKEND_UNAVAILABLE", {
      cause: error,
      status,
    });
  }

  if (status === 429 || /rate limit|too many requests/.test(message)) {
    return new AuthPlatformError("AUTH_RATE_LIMITED", { cause: error, status });
  }
  if (/email.*not.*confirm|email.*not.*verif/.test(message)) {
    return new AuthPlatformError("AUTH_EMAIL_NOT_VERIFIED", { cause: error, status });
  }
  if (/invalid login|invalid credentials|invalid email or password/.test(message)) {
    return new AuthPlatformError("AUTH_INVALID_CREDENTIALS", { cause: error, status });
  }
  if (/refresh token|session.*expired|jwt expired/.test(message)) {
    return new AuthPlatformError("AUTH_SESSION_EXPIRED", { cause: error, status });
  }
  if (/membership.*revoked|access.*revoked/.test(message)) {
    return new AuthPlatformError("STORE_MEMBERSHIP_REVOKED", { cause: error, status });
  }
  if (/mfa|required.*aal2|assurance level/.test(message)) {
    return new AuthPlatformError("AUTH_MFA_REQUIRED", { cause: error, status });
  }
  if (code === "42501" || status === 401 || status === 403) {
    return new AuthPlatformError("STORE_ACCESS_DENIED", { cause: error, status });
  }
  return new AuthPlatformError("AUTH_UNKNOWN", { cause: error, status });
};
