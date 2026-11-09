export type AdaptiveTokenErrorCode =
  | "TOKEN_SCHEMA_INVALID"
  | "TOKEN_VALUE_INVALID"
  | "TOKEN_REFERENCE_MISSING"
  | "TOKEN_REFERENCE_CYCLE"
  | "TOKEN_REFERENCE_DIRECTION"
  | "TOKEN_TYPE_MISMATCH"
  | "TOKEN_CSS_NAME_COLLISION"
  | "TOKEN_COMPATIBILITY_COLLISION";

export class AdaptiveTokenError extends Error {
  readonly code: AdaptiveTokenErrorCode;
  readonly address?: string;

  constructor(code: AdaptiveTokenErrorCode, message: string, address?: string) {
    super(message);
    this.name = "AdaptiveTokenError";
    this.code = code;
    this.address = address;
  }
}
