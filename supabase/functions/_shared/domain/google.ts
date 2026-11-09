import { DomainApiError, ProviderPendingError } from "./errors.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const GOOGLE_REQUIRED_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/webmasters",
] as const;

const GOOGLE_SCOPE_EQUIVALENTS: Readonly<Record<(typeof GOOGLE_REQUIRED_SCOPES)[number], readonly string[]>> = {
  openid: ["openid"],
  email: ["email", "https://www.googleapis.com/auth/userinfo.email"],
  "https://www.googleapis.com/auth/siteverification": [
    "https://www.googleapis.com/auth/siteverification",
  ],
  "https://www.googleapis.com/auth/webmasters": [
    "https://www.googleapis.com/auth/webmasters",
  ],
};

export const normalizeGoogleGrantedScopes = (scopes: readonly string[]): string[] => {
  const normalized = new Set(scopes.map((scope) => scope.trim()).filter(Boolean));
  if (normalized.has("https://www.googleapis.com/auth/userinfo.email")) {
    normalized.add("email");
  }
  return [...normalized];
};

export const missingGoogleRequiredScopes = (scopes: readonly string[]): string[] => {
  const normalized = new Set(normalizeGoogleGrantedScopes(scopes));
  return GOOGLE_REQUIRED_SCOPES.filter((required) =>
    !GOOGLE_SCOPE_EQUIVALENTS[required].some((scope) => normalized.has(scope))
  );
};

export const GOOGLE_OAUTH_CALLBACK_PATH = "/domain/connect/google/callback";

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GoogleTokenResponse = {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  scopes: string[];
  idToken: string | null;
};

export type GoogleSite = {
  siteUrl: string;
  permissionLevel: string;
};

export type GoogleSitemap = {
  path?: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  warnings?: string;
  errors?: string;
  contents?: Array<{ type?: string; submitted?: string; indexed?: string }>;
};

export type GoogleSearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export type GoogleUrlInspectionResult = {
  inspectionResult?: {
    inspectionResultLink?: string;
    indexStatusResult?: {
      verdict?: string;
      coverageState?: string;
      robotsTxtState?: string;
      indexingState?: string;
      lastCrawlTime?: string;
      pageFetchState?: string;
      googleCanonical?: string;
      userCanonical?: string;
      crawledAs?: string;
    };
  };
};

const readEnvironment = (name: string): string | null => {
  const denoRuntime = (globalThis as typeof globalThis & {
    Deno?: { env: { get(key: string): string | undefined } };
  }).Deno;
  const value = denoRuntime?.env.get(name)?.trim();
  return value || null;
};

const requireEnvironment = (name: string): string => {
  const value = readEnvironment(name);
  if (!value) {
    throw new DomainApiError(
      "GOOGLE_NOT_CONFIGURED",
      "Google Search automation is not configured yet.",
      503,
    );
  }
  return value;
};

const oauthConfig = (): GoogleOAuthConfig => {
  const redirectUri = requireEnvironment("GOOGLE_OAUTH_REDIRECT_URI");
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new DomainApiError(
      "GOOGLE_REDIRECT_INVALID",
      "Google OAuth redirect configuration is invalid.",
      503,
    );
  }
  if (
    redirect.protocol !== "https:" ||
    redirect.hostname !== "storeblink.com" ||
    redirect.pathname !== GOOGLE_OAUTH_CALLBACK_PATH
  ) {
    throw new DomainApiError(
      "GOOGLE_REDIRECT_INVALID",
      "Google OAuth redirect must use the canonical StoreBlink callback.",
      503,
    );
  }
  return {
    clientId: requireEnvironment("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: requireEnvironment("GOOGLE_OAUTH_CLIENT_SECRET"),
    redirectUri: redirect.toString(),
  };
};

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value: string): Uint8Array => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new DomainApiError(
      "GOOGLE_ENCRYPTION_KEY_INVALID",
      "Google token encryption is not configured correctly.",
      503,
    );
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const ownedArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

type GoogleEncryptionMaterial = {
  version: number;
  key: CryptoKey;
};

export type DecryptedGoogleSecret = {
  value: string;
  keyVersion: number;
  requiresReencryption: boolean;
};

const importedEncryptionKeys = new Map<string, Promise<CryptoKey>>();

const parseEncryptionKeyVersion = (name: string, fallback?: number): number => {
  const raw = readEnvironment(name);
  if (!raw && fallback !== undefined) return fallback;
  if (!raw || !/^[1-9]\d{0,8}$/.test(raw)) {
    throw new DomainApiError(
      "GOOGLE_ENCRYPTION_KEY_INVALID",
      "Google token encryption is not configured correctly.",
      503,
    );
  }
  return Number(raw);
};

const importEncryptionKey = async (name: string): Promise<CryptoKey> => {
  const encoded = requireEnvironment(name);
  const bytes = fromBase64Url(encoded);
  if (bytes.byteLength !== 32) {
    throw new DomainApiError(
      "GOOGLE_ENCRYPTION_KEY_INVALID",
      "Google token encryption is not configured correctly.",
      503,
    );
  }
  let imported = importedEncryptionKeys.get(encoded);
  if (!imported) {
    imported = crypto.subtle.importKey(
      "raw",
      ownedArrayBuffer(bytes),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"],
    );
    importedEncryptionKeys.set(encoded, imported);
  }
  return imported;
};

export const googleTokenEncryptionKeyVersion = (): number =>
  parseEncryptionKeyVersion("GOOGLE_TOKEN_ENCRYPTION_KEY_VERSION", 1);

const encryptionMaterials = async (): Promise<GoogleEncryptionMaterial[]> => {
  const currentVersion = googleTokenEncryptionKeyVersion();
  const materials: GoogleEncryptionMaterial[] = [{
    version: currentVersion,
    key: await importEncryptionKey("GOOGLE_TOKEN_ENCRYPTION_KEY"),
  }];
  const previousKey = readEnvironment("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY");
  const previousVersion = readEnvironment("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY_VERSION");
  if (Boolean(previousKey) !== Boolean(previousVersion)) {
    throw new DomainApiError(
      "GOOGLE_ENCRYPTION_KEY_INVALID",
      "Google token encryption is not configured correctly.",
      503,
    );
  }
  if (previousKey && previousVersion) {
    const version = parseEncryptionKeyVersion("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY_VERSION");
    if (version === currentVersion) {
      throw new DomainApiError(
        "GOOGLE_ENCRYPTION_KEY_INVALID",
        "Google token encryption is not configured correctly.",
        503,
      );
    }
    materials.push({
      version,
      key: await importEncryptionKey("GOOGLE_TOKEN_ENCRYPTION_PREVIOUS_KEY"),
    });
  }
  return materials;
};

export const randomOAuthValue = (byteLength = 32): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
};

export const sha256Base64Url = async (value: string): Promise<string> =>
  toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));

export const encryptGoogleSecret = async (value: string, context: string): Promise<string> => {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const [current] = await encryptionMaterials();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    current.key,
    encoder.encode(value),
  );
  return `v${current.version}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
};

export const decryptGoogleSecretWithMetadata = async (
  value: string,
  context: string,
): Promise<DecryptedGoogleSecret> => {
  const [version, ivValue, ciphertextValue, ...extra] = value.split(".");
  const versionMatch = /^v([1-9]\d{0,8})$/.exec(version ?? "");
  if (!versionMatch || !ivValue || !ciphertextValue || extra.length > 0) {
    throw new DomainApiError(
      "GOOGLE_SECRET_INVALID",
      "Encrypted Google credential data is invalid.",
      500,
    );
  }
  const keyVersion = Number(versionMatch[1]);
  try {
    const materials = await encryptionMaterials();
    const material = materials.find((candidate) => candidate.version === keyVersion);
    if (!material) throw new Error("Encryption key version unavailable");
    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ownedArrayBuffer(fromBase64Url(ivValue)),
        additionalData: encoder.encode(context),
      },
      material.key,
      ownedArrayBuffer(fromBase64Url(ciphertextValue)),
    );
    return {
      value: decoder.decode(decrypted),
      keyVersion,
      requiresReencryption: keyVersion !== materials[0].version,
    };
  } catch (error) {
    if (error instanceof DomainApiError) throw error;
    throw new DomainApiError(
      "GOOGLE_SECRET_DECRYPTION_FAILED",
      "Encrypted Google credential data could not be read.",
      500,
    );
  }
};

export const decryptGoogleSecret = async (value: string, context: string): Promise<string> =>
  (await decryptGoogleSecretWithMetadata(value, context)).value;

const parseJson = async <T>(response: Response): Promise<T> => {
  try {
    return await response.json() as T;
  } catch {
    throw new DomainApiError(
      "GOOGLE_RESPONSE_INVALID",
      "Google returned an invalid provider response.",
      502,
    );
  }
};

const googleErrorMessage = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") return "Google rejected the provider request.";
  const record = payload as Record<string, unknown>;
  if (typeof record.error_description === "string") return record.error_description;
  if (record.error && typeof record.error === "object") {
    const nested = record.error as Record<string, unknown>;
    if (typeof nested.message === "string") return nested.message;
  }
  if (typeof record.error === "string") return record.error;
  return "Google rejected the provider request.";
};

const requestGoogle = async <T = Record<string, unknown>>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  acceptedStatuses: readonly number[] = [200],
): Promise<T | null> => {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new ProviderPendingError("Google is temporarily unreachable.");
  }
  if (!acceptedStatuses.includes(response.status)) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const message = googleErrorMessage(payload);
    if (response.status === 401) {
      throw new DomainApiError(
        "GOOGLE_REAUTHORIZATION_REQUIRED",
        "Google authorization expired. Connect the Google account again.",
        401,
        "reconnect_google",
      );
    }
    if (response.status === 429 || response.status >= 500) {
      throw new ProviderPendingError("Google is still processing the Search request.");
    }
    throw new DomainApiError(
      response.status === 403 ? "GOOGLE_PERMISSION_DENIED" : "GOOGLE_REQUEST_REJECTED",
      message,
      502,
    );
  }
  if (response.status === 204 || response.headers.get("content-length") === "0") return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new DomainApiError(
      "GOOGLE_RESPONSE_INVALID",
      "Google returned an invalid provider response.",
      502,
    );
  }
};

const readTokenResponse = async (response: Response): Promise<GoogleTokenResponse> => {
  const payload = await parseJson<Record<string, unknown>>(response);
  if (!response.ok) {
    const errorName = typeof payload.error === "string" ? payload.error : "";
    if (errorName === "invalid_grant") {
      throw new DomainApiError(
        "GOOGLE_REAUTHORIZATION_REQUIRED",
        "Google authorization expired. Connect the Google account again.",
        401,
        "reconnect_google",
      );
    }
    throw new DomainApiError("GOOGLE_OAUTH_FAILED", googleErrorMessage(payload), 502);
  }
  if (typeof payload.access_token !== "string") {
    throw new DomainApiError("GOOGLE_OAUTH_FAILED", "Google did not return an access token.", 502);
  }
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresIn: Math.max(60, Number(payload.expires_in ?? 3600) || 3600),
    scopes: normalizeGoogleGrantedScopes(
      typeof payload.scope === "string" ? payload.scope.split(/\s+/).filter(Boolean) : [],
    ),
    idToken: typeof payload.id_token === "string" ? payload.id_token : null,
  };
};

export class GoogleSearchClient {
  get configured(): boolean {
    return [
      "GOOGLE_OAUTH_CLIENT_ID",
      "GOOGLE_OAUTH_CLIENT_SECRET",
      "GOOGLE_OAUTH_REDIRECT_URI",
      "GOOGLE_TOKEN_ENCRYPTION_KEY",
    ].every((name) => Boolean(readEnvironment(name)));
  }

  get configurationReason(): string | null {
    if (this.configured) return null;
    return "Google OAuth credentials and token encryption are not configured.";
  }

  createAuthorizationUrl(input: {
    state: string;
    codeChallenge: string;
    loginHint?: string | null;
  }): string {
    const config = oauthConfig();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", GOOGLE_REQUIRED_SCOPES.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("enable_granular_consent", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string, codeVerifier: string): Promise<GoogleTokenResponse> {
    const config = oauthConfig();
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    });
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    return readTokenResponse(response);
  }

  async refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
    const config = oauthConfig();
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    let response: Response;
    try {
      response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new ProviderPendingError("Google authorization is temporarily unreachable.");
    }
    return readTokenResponse(response);
  }

  async revokeToken(refreshToken: string): Promise<void> {
    try {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: refreshToken }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Local disconnection must still complete if Google's revocation endpoint is unavailable.
    }
  }

  async getAccountEmail(accessToken: string): Promise<string | null> {
    const profile = await requestGoogle<Record<string, unknown>>(
      "https://openidconnect.googleapis.com/v1/userinfo",
      accessToken,
    );
    return typeof profile?.email === "string" ? profile.email : null;
  }

  async getVerificationToken(accessToken: string, siteUrl: string): Promise<string> {
    const result = await requestGoogle<Record<string, unknown>>(
      "https://www.googleapis.com/siteVerification/v1/token",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          verificationMethod: "META",
          site: { identifier: siteUrl, type: "SITE" },
        }),
      },
    );
    if (typeof result?.token !== "string" || !result.token.trim()) {
      throw new DomainApiError(
        "GOOGLE_VERIFICATION_TOKEN_MISSING",
        "Google did not return a site verification token.",
        502,
      );
    }
    const rawToken = result.token.trim();
    const metaContent = rawToken.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
    const token = (metaContent ?? rawToken).trim();
    if (!/^[A-Za-z0-9_-]{10,512}$/.test(token)) {
      throw new DomainApiError(
        "GOOGLE_VERIFICATION_TOKEN_INVALID",
        "Google returned an invalid site verification token.",
        502,
      );
    }
    return token;
  }

  async verifySite(accessToken: string, siteUrl: string): Promise<void> {
    await requestGoogle(
      "https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=META",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ site: { identifier: siteUrl, type: "SITE" } }),
      },
    );
  }

  async addSearchConsoleProperty(accessToken: string, siteUrl: string): Promise<void> {
    await requestGoogle(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`,
      accessToken,
      { method: "PUT" },
      [200, 204],
    );
  }

  async getSearchConsoleProperty(accessToken: string, siteUrl: string): Promise<GoogleSite> {
    const result = await requestGoogle<Record<string, unknown>>(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}`,
      accessToken,
    );
    return {
      siteUrl: typeof result?.siteUrl === "string" ? result.siteUrl : siteUrl,
      permissionLevel: typeof result?.permissionLevel === "string"
        ? result.permissionLevel
        : "siteOwner",
    };
  }

  async submitSitemap(accessToken: string, siteUrl: string, sitemapUrl: string): Promise<void> {
    await requestGoogle(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
      accessToken,
      { method: "PUT" },
      [200, 204],
    );
  }

  async getSitemap(accessToken: string, siteUrl: string, sitemapUrl: string): Promise<GoogleSitemap> {
    return (await requestGoogle<GoogleSitemap>(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
      accessToken,
    )) ?? {};
  }

  async querySearchAnalytics(
    accessToken: string,
    siteUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<GoogleSearchAnalyticsRow[]> {
    const result = await requestGoogle<{ rows?: GoogleSearchAnalyticsRow[] }>(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["date"],
          type: "web",
          aggregationType: "byProperty",
          rowLimit: 25_000,
          dataState: "final",
        }),
      },
    );
    return Array.isArray(result?.rows) ? result.rows : [];
  }

  async inspectUrl(
    accessToken: string,
    siteUrl: string,
    inspectionUrl: string,
  ): Promise<GoogleUrlInspectionResult> {
    return (await requestGoogle<GoogleUrlInspectionResult>(
      "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ inspectionUrl, siteUrl, languageCode: "en-US" }),
      },
    )) ?? {};
  }
}
