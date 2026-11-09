import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.6";
import { createDomainContext } from "../_shared/domain/auth.ts";
import { DomainApiError, ProviderPendingError } from "../_shared/domain/errors.ts";
import {
  decryptGoogleSecret,
  decryptGoogleSecretWithMetadata,
  encryptGoogleSecret,
  GoogleSearchClient,
  googleTokenEncryptionKeyVersion,
  missingGoogleRequiredScopes,
  randomOAuthValue,
  sha256Base64Url,
} from "../_shared/domain/google.ts";

type JsonObject = Record<string, unknown>;
type DatabaseError = { code?: string; message?: string } | null;

export type GoogleJobInput = {
  storeId: string;
  domainId?: string | null;
  jobType: string;
  idempotencyKey: string;
  payload?: JsonObject;
  maxAttempts?: number;
  runAfter?: string;
};

type WorkflowDependencies = {
  enqueueJob(client: SupabaseClient, input: GoogleJobInput): Promise<void>;
  getDashboard(client: SupabaseClient, storeId: string): Promise<unknown>;
};

const google = new GoogleSearchClient();
const GOOGLE_JOB_TYPES = new Set([
  "google-site-verify",
  "google-property-create",
  "sitemap-submit",
  "search-console-sync",
  "url-inspection-sync",
]);

const throwDatabaseError = (error: DatabaseError, message: string): void => {
  if (!error) return;
  console.error("Google Search database operation failed", { code: error.code });
  throw new DomainApiError("GOOGLE_DATABASE_ERROR", message, 500);
};

const requireString = (value: unknown, field: string, maxLength = 4_096): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new DomainApiError("INVALID_REQUEST", `${field} is invalid.`, 400);
  }
  return value.trim();
};

const googleMetaInjectionEnabled = () =>
  Deno.env.get("GOOGLE_STOREFRONT_META_INJECTION_ENABLED")?.trim().toLowerCase() === "true";

export const googleSearchCapability = () => {
  const available = google.configured && googleMetaInjectionEnabled();
  return {
    available,
    reason: available
      ? null
      : google.configurationReason ?? "Storefront verification metadata is not enabled yet.",
  };
};

const requireGoogleReady = (): void => {
  if (!google.configured || !googleMetaInjectionEnabled()) {
    throw new DomainApiError(
      "GOOGLE_NOT_CONFIGURED",
      google.configurationReason ?? "Storefront verification metadata is not enabled yet.",
      503,
    );
  }
};

const loadPrimaryDomain = async (client: SupabaseClient, storeId: string): Promise<JsonObject> => {
  const { data, error } = await client
    .from("store_domains")
    .select("id,store_id,hostname,status,is_primary,seo_status")
    .eq("store_id", storeId)
    .eq("status", "active")
    .eq("is_primary", true)
    .maybeSingle();
  throwDatabaseError(error, "The primary storefront domain could not be loaded.");
  if (!data) {
    throw new DomainApiError(
      "ACTIVE_PRIMARY_DOMAIN_REQUIRED",
      "Activate a primary custom domain before connecting Google Search.",
      409,
    );
  }
  return data as JsonObject;
};

const loadJobDomain = async (client: SupabaseClient, job: JsonObject): Promise<JsonObject> => {
  const domainId = requireString(job.domain_id, "domainId", 80);
  const { data, error } = await client
    .from("store_domains")
    .select("id,store_id,hostname,status,is_primary,seo_status")
    .eq("id", domainId)
    .eq("store_id", requireString(job.store_id, "storeId", 80))
    .eq("status", "active")
    .maybeSingle();
  throwDatabaseError(error, "The Google job domain could not be loaded.");
  if (!data) throw new DomainApiError("DOMAIN_NOT_FOUND", "The active storefront domain no longer exists.", 404);
  return data as JsonObject;
};

const markReauthorizationRequired = async (
  client: SupabaseClient,
  storeId: string,
  error: DomainApiError,
) => {
  const { error: updateError } = await client
    .from("google_integrations")
    .update({
      status: "reauthorization_required",
      failure_code: error.code,
      failure_message: error.message,
    })
    .eq("store_id", storeId);
  throwDatabaseError(updateError, "Google authorization state could not be updated.");
};

const getAccessToken = async (client: SupabaseClient, storeId: string): Promise<string> => {
  const { data, error } = await client
    .from("google_integrations")
    .select("refresh_token_ciphertext,status,granted_scopes")
    .eq("store_id", storeId)
    .maybeSingle();
  throwDatabaseError(error, "Google authorization could not be loaded.");
  if (!data || data.status !== "connected" || !data.refresh_token_ciphertext) {
    throw new DomainApiError(
      "GOOGLE_REAUTHORIZATION_REQUIRED",
      "Connect a Google account before continuing Search Console setup.",
      401,
      "reconnect_google",
    );
  }

  try {
    const decryptedRefreshToken = await decryptGoogleSecretWithMetadata(
      String(data.refresh_token_ciphertext),
      `google-refresh:${storeId}`,
    );
    const tokens = await google.refreshAccessToken(decryptedRefreshToken.value);
    const expiresAt = new Date(Date.now() + tokens.expiresIn * 1_000).toISOString();
    const grantedScopes = tokens.scopes.length > 0
      ? tokens.scopes
      : Array.isArray(data.granted_scopes)
        ? data.granted_scopes
        : [];
    const update: JsonObject = {
      token_expires_at: expiresAt,
      granted_scopes: grantedScopes,
      failure_code: null,
      failure_message: null,
    };
    if (tokens.refreshToken || decryptedRefreshToken.requiresReencryption) {
      update.refresh_token_ciphertext = await encryptGoogleSecret(
        tokens.refreshToken ?? decryptedRefreshToken.value,
        `google-refresh:${storeId}`,
      );
      update.token_key_version = googleTokenEncryptionKeyVersion();
    }
    const { error: updateError } = await client
      .from("google_integrations")
      .update(update)
      .eq("store_id", storeId);
    throwDatabaseError(updateError, "Refreshed Google authorization could not be saved.");
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof DomainApiError && error.code === "GOOGLE_REAUTHORIZATION_REQUIRED") {
      await markReauthorizationRequired(client, storeId, error);
    }
    throw error;
  }
};

const propertyForDomain = async (
  client: SupabaseClient,
  domainId: string,
): Promise<JsonObject> => {
  const { data, error } = await client
    .from("search_console_properties")
    .select("id,site_url,status,permission_level")
    .eq("domain_id", domainId)
    .maybeSingle();
  throwDatabaseError(error, "Search Console property state could not be loaded.");
  if (!data || data.status !== "active") {
    throw new ProviderPendingError("The Search Console property is not active yet.");
  }
  return data as JsonObject;
};

const jobKeySuffix = (job: JsonObject) => String(job.id ?? Date.now());

const processSiteVerification = async (
  client: SupabaseClient,
  job: JsonObject,
  enqueueJob: WorkflowDependencies["enqueueJob"],
) => {
  const domain = await loadJobDomain(client, job);
  const storeId = String(domain.store_id);
  const domainId = String(domain.id);
  const siteUrl = `https://${String(domain.hostname)}/`;
  const { data: existing, error: verificationLoadError } = await client
    .from("google_site_verifications")
    .select("status,token_ciphertext")
    .eq("domain_id", domainId)
    .maybeSingle();
  throwDatabaseError(verificationLoadError, "Google verification state could not be loaded.");

  if (existing?.status === "verified") {
    await enqueueJob(client, {
      storeId,
      domainId,
      jobType: "google-property-create",
      idempotencyKey: `google-property-create:${domainId}:${jobKeySuffix(job)}`,
      maxAttempts: 8,
    });
    return;
  }

  const accessToken = await getAccessToken(client, storeId);
  let tokenCiphertext = typeof existing?.token_ciphertext === "string"
    ? existing.token_ciphertext
    : null;
  if (!tokenCiphertext) {
    const verificationToken = await google.getVerificationToken(accessToken, siteUrl);
    tokenCiphertext = await encryptGoogleSecret(
      verificationToken,
      `google-site-verification:${domainId}`,
    );
    const { error: tokenError } = await client
      .from("google_site_verifications")
      .upsert({
        store_id: storeId,
        domain_id: domainId,
        method: "META",
        token_ciphertext: tokenCiphertext,
        token_key_version: googleTokenEncryptionKeyVersion(),
        status: "token_ready",
        verified_at: null,
        failure_code: null,
        failure_message: null,
      }, { onConflict: "domain_id" });
    throwDatabaseError(tokenError, "Google verification token could not be saved.");
    const { error: domainError } = await client
      .from("store_domains")
      .update({ seo_status: "verification_token_ready" })
      .eq("id", domainId)
      .eq("status", "active");
    throwDatabaseError(domainError, "Storefront verification status could not be saved.");
  }

  await google.verifySite(accessToken, siteUrl);
  const timestamp = new Date().toISOString();
  const { error: verifiedError } = await client
    .from("google_site_verifications")
    .update({
      status: "verified",
      verified_at: timestamp,
      failure_code: null,
      failure_message: null,
    })
    .eq("domain_id", domainId);
  throwDatabaseError(verifiedError, "Google verification result could not be saved.");
  const { error: domainError } = await client
    .from("store_domains")
    .update({ seo_status: "google_verified" })
    .eq("id", domainId)
    .eq("status", "active");
  throwDatabaseError(domainError, "Verified storefront SEO status could not be saved.");
  await enqueueJob(client, {
    storeId,
    domainId,
    jobType: "google-property-create",
    idempotencyKey: `google-property-create:${domainId}:${jobKeySuffix(job)}`,
    maxAttempts: 8,
  });
};

const processPropertyCreate = async (
  client: SupabaseClient,
  job: JsonObject,
  enqueueJob: WorkflowDependencies["enqueueJob"],
) => {
  const domain = await loadJobDomain(client, job);
  const storeId = String(domain.store_id);
  const domainId = String(domain.id);
  const siteUrl = `https://${String(domain.hostname)}/`;
  const { data: verification, error: verificationError } = await client
    .from("google_site_verifications")
    .select("status")
    .eq("domain_id", domainId)
    .maybeSingle();
  throwDatabaseError(verificationError, "Google verification state could not be checked.");
  if (verification?.status !== "verified") {
    throw new ProviderPendingError("Google site ownership verification is not complete yet.");
  }

  const accessToken = await getAccessToken(client, storeId);
  await google.addSearchConsoleProperty(accessToken, siteUrl);
  const property = await google.getSearchConsoleProperty(accessToken, siteUrl);
  const timestamp = new Date().toISOString();
  const { error: propertyError } = await client
    .from("search_console_properties")
    .upsert({
      store_id: storeId,
      domain_id: domainId,
      site_url: siteUrl,
      permission_level: property.permissionLevel,
      status: "active",
      last_checked_at: timestamp,
      failure_code: null,
      failure_message: null,
    }, { onConflict: "domain_id,site_url" });
  throwDatabaseError(propertyError, "Search Console property state could not be saved.");
  const { error: domainError } = await client
    .from("store_domains")
    .update({ seo_status: "property_added" })
    .eq("id", domainId)
    .eq("status", "active");
  throwDatabaseError(domainError, "Search Console domain status could not be saved.");
  await enqueueJob(client, {
    storeId,
    domainId,
    jobType: "sitemap-submit",
    idempotencyKey: `sitemap-submit:${domainId}:${jobKeySuffix(job)}`,
    maxAttempts: 8,
  });
};

const processSitemapSubmit = async (
  client: SupabaseClient,
  job: JsonObject,
  enqueueJob: WorkflowDependencies["enqueueJob"],
) => {
  const domain = await loadJobDomain(client, job);
  const storeId = String(domain.store_id);
  const domainId = String(domain.id);
  const property = await propertyForDomain(client, domainId);
  const siteUrl = String(property.site_url);
  const sitemapUrl = `https://${String(domain.hostname)}/sitemap.xml`;
  const accessToken = await getAccessToken(client, storeId);
  await google.submitSitemap(accessToken, siteUrl, sitemapUrl);
  const timestamp = new Date().toISOString();
  const { error: sitemapError } = await client
    .from("sitemap_submissions")
    .upsert({
      store_id: storeId,
      domain_id: domainId,
      property_id: property.id,
      sitemap_url: sitemapUrl,
      status: "submitted",
      submitted_at: timestamp,
      last_checked_at: timestamp,
      failure_code: null,
      failure_message: null,
    }, { onConflict: "domain_id,sitemap_url" });
  throwDatabaseError(sitemapError, "Sitemap submission state could not be saved.");
  const { error: domainError } = await client
    .from("store_domains")
    .update({ seo_status: "sitemap_submitted" })
    .eq("id", domainId)
    .eq("status", "active");
  throwDatabaseError(domainError, "Submitted sitemap status could not be saved.");
  const suffix = jobKeySuffix(job);
  await Promise.all([
    enqueueJob(client, {
      storeId,
      domainId,
      jobType: "search-console-sync",
      idempotencyKey: `search-console-sync:${domainId}:setup:${suffix}`,
      maxAttempts: 6,
    }),
    enqueueJob(client, {
      storeId,
      domainId,
      jobType: "url-inspection-sync",
      idempotencyKey: `url-inspection-sync:${domainId}:setup:${suffix}`,
      payload: { limit: 10 },
      maxAttempts: 4,
    }),
  ]);
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const processSearchConsoleSync = async (client: SupabaseClient, job: JsonObject) => {
  const domain = await loadJobDomain(client, job);
  const storeId = String(domain.store_id);
  const domainId = String(domain.id);
  const property = await propertyForDomain(client, domainId);
  const siteUrl = String(property.site_url);
  const accessToken = await getAccessToken(client, storeId);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 3);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  const rows = await google.querySearchAnalytics(
    accessToken,
    siteUrl,
    isoDate(start),
    isoDate(end),
  );
  const metricRows = rows.flatMap((row) => {
    const metricDate = row.keys?.[0];
    if (!metricDate || !/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) return [];
    return [{
      store_id: storeId,
      domain_id: domainId,
      metric_date: metricDate,
      clicks: Math.max(0, Number(row.clicks ?? 0)),
      impressions: Math.max(0, Number(row.impressions ?? 0)),
      ctr: Math.min(1, Math.max(0, Number(row.ctr ?? 0))),
      average_position: Number.isFinite(Number(row.position)) ? Number(row.position) : null,
      dimensions: {},
    }];
  });
  if (metricRows.length > 0) {
    const { error: metricsError } = await client
      .from("search_console_metrics")
      .upsert(metricRows, { onConflict: "domain_id,metric_date,dimensions" });
    throwDatabaseError(metricsError, "Search Console metrics could not be saved.");
  }

  const { data: sitemapRow, error: sitemapLoadError } = await client
    .from("sitemap_submissions")
    .select("id,sitemap_url")
    .eq("domain_id", domainId)
    .eq("status", "submitted")
    .maybeSingle();
  throwDatabaseError(sitemapLoadError, "Sitemap status could not be loaded.");
  if (sitemapRow) {
    try {
      const providerSitemap = await google.getSitemap(
        accessToken,
        siteUrl,
        String(sitemapRow.sitemap_url),
      );
      const discoveredUrls = (providerSitemap.contents ?? []).reduce(
        (total, content) => total + Math.max(0, Number(content.submitted ?? 0) || 0),
        0,
      );
      const { error: sitemapUpdateError } = await client
        .from("sitemap_submissions")
        .update({
          last_checked_at: new Date().toISOString(),
          discovered_urls: discoveredUrls,
          failure_code: null,
          failure_message: null,
        })
        .eq("id", sitemapRow.id);
      throwDatabaseError(sitemapUpdateError, "Sitemap monitoring status could not be saved.");
    } catch (error) {
      if (!(error instanceof ProviderPendingError)) throw error;
    }
  }

  const timestamp = new Date().toISOString();
  const { error: integrationError } = await client
    .from("google_integrations")
    .update({ last_synced_at: timestamp, failure_code: null, failure_message: null })
    .eq("store_id", storeId);
  throwDatabaseError(integrationError, "Google synchronization time could not be saved.");
  const { error: domainError } = await client
    .from("store_domains")
    .update({ seo_status: "monitoring" })
    .eq("id", domainId)
    .eq("status", "active");
  throwDatabaseError(domainError, "Google monitoring status could not be saved.");
};

const listInspectionUrls = async (
  client: SupabaseClient,
  domain: JsonObject,
  limit: number,
): Promise<string[]> => {
  const origin = `https://${String(domain.hostname)}`;
  const storeId = String(domain.store_id);
  const [pages, products] = await Promise.all([
    client
      .from("store_pages")
      .select("handle,page_kind")
      .eq("store_id", storeId)
      .eq("status", "published")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit),
    client
      .from("items")
      .select("id,handle")
      .eq("store_id", storeId)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  throwDatabaseError(pages.error, "Published page URLs could not be loaded.");
  throwDatabaseError(products.error, "Published product URLs could not be loaded.");
  const urls = new Set([`${origin}/`, `${origin}/products`]);
  for (const page of pages.data ?? []) {
    const handle = typeof page.handle === "string" ? page.handle.trim() : "";
    if (!handle || handle === "home") continue;
    const path = page.page_kind === "about"
      ? "/about"
      : page.page_kind === "contact"
        ? "/contact"
        : `/pages/${encodeURIComponent(handle)}`;
    urls.add(`${origin}${path}`);
    if (urls.size >= limit) break;
  }
  if (urls.size < limit) {
    for (const product of products.data ?? []) {
      const identifier = typeof product.handle === "string" && product.handle.trim()
        ? product.handle.trim()
        : String(product.id);
      urls.add(`${origin}/products/${encodeURIComponent(identifier)}`);
      if (urls.size >= limit) break;
    }
  }
  return Array.from(urls).slice(0, limit);
};

const processUrlInspectionSync = async (client: SupabaseClient, job: JsonObject) => {
  const domain = await loadJobDomain(client, job);
  const storeId = String(domain.store_id);
  const domainId = String(domain.id);
  const property = await propertyForDomain(client, domainId);
  const siteUrl = String(property.site_url);
  const payload = job.payload && typeof job.payload === "object" ? job.payload as JsonObject : {};
  const limit = Math.min(25, Math.max(1, Number(payload.limit ?? 10) || 10));
  const urls = await listInspectionUrls(client, domain, limit);
  const accessToken = await getAccessToken(client, storeId);
  for (const inspectedUrl of urls) {
    const result = await google.inspectUrl(accessToken, siteUrl, inspectedUrl);
    const status = result.inspectionResult?.indexStatusResult ?? {};
    const { error } = await client
      .from("url_inspection_results")
      .upsert({
        store_id: storeId,
        domain_id: domainId,
        property_id: property.id,
        inspected_url: inspectedUrl,
        verdict: status.verdict ?? "VERDICT_UNSPECIFIED",
        coverage_state: status.coverageState ?? null,
        robots_txt_state: status.robotsTxtState ?? null,
        indexing_state: status.indexingState ?? null,
        page_fetch_state: status.pageFetchState ?? null,
        crawled_as: status.crawledAs ?? null,
        last_crawl_time: status.lastCrawlTime ?? null,
        google_canonical: status.googleCanonical ?? null,
        user_canonical: status.userCanonical ?? null,
        inspection_result_link: result.inspectionResult?.inspectionResultLink ?? null,
        last_checked_at: new Date().toISOString(),
      }, { onConflict: "domain_id,inspected_url" });
    throwDatabaseError(error, "URL inspection status could not be saved.");
  }
};

export const createGoogleWorkflow = (dependencies: WorkflowDependencies) => ({
  capability() {
    return googleSearchCapability();
  },

  isGoogleJob(jobType: unknown): boolean {
    return typeof jobType === "string" && GOOGLE_JOB_TYPES.has(jobType);
  },

  async beginConnection(request: Request, body: JsonObject) {
    const context = await createDomainContext(request, body.storeId, true);
    requireGoogleReady();
    await loadPrimaryDomain(context.serviceClient, context.storeId);
    const state = randomOAuthValue(32);
    const stateHash = await sha256Base64Url(state);
    const codeVerifier = randomOAuthValue(64);
    const codeChallenge = await sha256Base64Url(codeVerifier);
    const verifierCiphertext = await encryptGoogleSecret(
      codeVerifier,
      `google-pkce:${stateHash}`,
    );
    const redirectUri = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")!.trim();
    const { error: cleanupError } = await context.serviceClient
      .from("google_oauth_states")
      .delete()
      .eq("store_id", context.storeId)
      .eq("user_id", context.user.id)
      .is("consumed_at", null);
    throwDatabaseError(cleanupError, "Previous Google authorization state could not be cleared.");
    const { error: stateError } = await context.serviceClient
      .from("google_oauth_states")
      .insert({
        store_id: context.storeId,
        user_id: context.user.id,
        state_hash: stateHash,
        code_verifier_ciphertext: verifierCiphertext,
        token_key_version: googleTokenEncryptionKeyVersion(),
        code_challenge_method: "S256",
        redirect_uri: redirectUri,
        return_to: "/domain/connect/google",
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
    throwDatabaseError(stateError, "Google authorization state could not be created.");
    const { data: currentIntegration, error: currentIntegrationError } = await context.serviceClient
      .from("google_integrations")
      .select("status")
      .eq("store_id", context.storeId)
      .maybeSingle();
    throwDatabaseError(currentIntegrationError, "Google connection state could not be loaded.");
    if (currentIntegration?.status !== "connected") {
      const { error: integrationError } = await context.serviceClient
        .from("google_integrations")
        .upsert({
          store_id: context.storeId,
          status: "connecting",
          connected_by: context.user.id,
          failure_code: null,
          failure_message: null,
        }, { onConflict: "store_id", ignoreDuplicates: false });
      throwDatabaseError(integrationError, "Google connection state could not be saved.");
    }
    return {
      authorizationUrl: google.createAuthorizationUrl({
        state,
        codeChallenge,
        loginHint: context.user.email,
      }),
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
  },

  async completeConnection(request: Request, body: JsonObject) {
    const context = await createDomainContext(request, body.storeId, false);
    requireGoogleReady();
    const code = requireString(body.code, "code", 8_192);
    const state = requireString(body.state, "state", 1_024);
    const stateHash = await sha256Base64Url(state);
    const { data: oauthState, error: stateLoadError } = await context.serviceClient
      .from("google_oauth_states")
      .select("id,user_id,state_hash,code_verifier_ciphertext,redirect_uri,expires_at,consumed_at")
      .eq("store_id", context.storeId)
      .eq("user_id", context.user.id)
      .eq("state_hash", stateHash)
      .maybeSingle();
    throwDatabaseError(stateLoadError, "Google authorization state could not be loaded.");
    if (
      !oauthState ||
      oauthState.consumed_at ||
      new Date(String(oauthState.expires_at)).getTime() <= Date.now()
    ) {
      throw new DomainApiError(
        "GOOGLE_OAUTH_STATE_INVALID",
        "Google authorization expired or was already used. Start the connection again.",
        409,
      );
    }
    const configuredRedirect = Deno.env.get("GOOGLE_OAUTH_REDIRECT_URI")?.trim();
    if (oauthState.redirect_uri !== configuredRedirect) {
      throw new DomainApiError(
        "GOOGLE_OAUTH_STATE_INVALID",
        "Google authorization redirect no longer matches the active configuration.",
        409,
      );
    }
    const consumedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await context.serviceClient
      .from("google_oauth_states")
      .update({ consumed_at: consumedAt })
      .eq("id", oauthState.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    throwDatabaseError(consumeError, "Google authorization state could not be consumed.");
    if (!consumed) {
      throw new DomainApiError(
        "GOOGLE_OAUTH_STATE_INVALID",
        "Google authorization was already completed.",
        409,
      );
    }

    const codeVerifier = await decryptGoogleSecret(
      String(oauthState.code_verifier_ciphertext),
      `google-pkce:${stateHash}`,
    );
    const tokens = await google.exchangeAuthorizationCode(code, codeVerifier);
    const missingScopes = missingGoogleRequiredScopes(tokens.scopes);
    if (missingScopes.length > 0) {
      const permissionLabels: Record<string, string> = {
        openid: "Google account identity",
        email: "Google account email",
        "https://www.googleapis.com/auth/siteverification": "Site Verification",
        "https://www.googleapis.com/auth/webmasters": "Search Console",
      };
      const missingLabels = missingScopes.map((scope) => permissionLabels[scope] ?? scope);
      console.warn("Google OAuth grant is missing required permissions", {
        missingScopes,
        grantedScopes: tokens.scopes,
      });
      throw new DomainApiError(
        "GOOGLE_SCOPE_MISSING",
        `Google did not grant ${missingLabels.join(" and ")}. Reconnect and select every requested permission.`,
        403,
        "reconnect_google",
      );
    }
    if (!tokens.refreshToken) {
      throw new DomainApiError(
        "GOOGLE_REFRESH_TOKEN_MISSING",
        "Google did not return offline access. Reconnect and approve all requested permissions.",
        409,
        "reconnect_google",
      );
    }
    const refreshTokenCiphertext = await encryptGoogleSecret(
      tokens.refreshToken,
      `google-refresh:${context.storeId}`,
    );
    const accountEmail = await google.getAccountEmail(tokens.accessToken);
    const { error: integrationError } = await context.serviceClient
      .from("google_integrations")
      .upsert({
        store_id: context.storeId,
        google_account_email: accountEmail,
        refresh_token_ciphertext: refreshTokenCiphertext,
        token_key_version: googleTokenEncryptionKeyVersion(),
        granted_scopes: tokens.scopes,
        status: "connected",
        connected_by: context.user.id,
        token_expires_at: new Date(Date.now() + tokens.expiresIn * 1_000).toISOString(),
        failure_code: null,
        failure_message: null,
      }, { onConflict: "store_id" });
    throwDatabaseError(integrationError, "Google authorization could not be saved.");
    const domain = await loadPrimaryDomain(context.serviceClient, context.storeId);
    const domainId = String(domain.id);
    const { error: verificationError } = await context.serviceClient
      .from("google_site_verifications")
      .upsert({
        store_id: context.storeId,
        domain_id: domainId,
        method: "META",
        token_ciphertext: null,
        token_key_version: null,
        status: "pending",
        verified_at: null,
        failure_code: null,
        failure_message: null,
      }, { onConflict: "domain_id" });
    throwDatabaseError(verificationError, "Google verification state could not be initialized.");
    await dependencies.enqueueJob(context.serviceClient, {
      storeId: context.storeId,
      domainId,
      jobType: "google-site-verify",
      idempotencyKey: `google-site-verify:${domainId}:oauth:${Date.now()}`,
      maxAttempts: 12,
    });
    return dependencies.getDashboard(context.serviceClient, context.storeId);
  },

  async retry(request: Request, body: JsonObject) {
    const context = await createDomainContext(request, body.storeId, true);
    requireGoogleReady();
    const domain = await loadPrimaryDomain(context.serviceClient, context.storeId);
    const domainId = String(domain.id);
    const { data: integration, error: integrationError } = await context.serviceClient
      .from("google_integrations")
      .select("status,refresh_token_ciphertext")
      .eq("store_id", context.storeId)
      .maybeSingle();
    throwDatabaseError(integrationError, "Google connection state could not be loaded.");
    if (!integration?.refresh_token_ciphertext || integration.status === "reauthorization_required") {
      throw new DomainApiError(
        "GOOGLE_REAUTHORIZATION_REQUIRED",
        "Reconnect the Google account to continue.",
        409,
        "reconnect_google",
      );
    }
    await context.serviceClient
      .from("google_integrations")
      .update({ status: "connected", failure_code: null, failure_message: null })
      .eq("store_id", context.storeId);
    const { data: verification } = await context.serviceClient
      .from("google_site_verifications")
      .select("status")
      .eq("domain_id", domainId)
      .maybeSingle();
    const { data: property } = await context.serviceClient
      .from("search_console_properties")
      .select("status")
      .eq("domain_id", domainId)
      .maybeSingle();
    const jobType = verification?.status !== "verified"
      ? "google-site-verify"
      : property?.status !== "active"
        ? "google-property-create"
        : "sitemap-submit";
    await dependencies.enqueueJob(context.serviceClient, {
      storeId: context.storeId,
      domainId,
      jobType,
      idempotencyKey: `${jobType}:${domainId}:manual-retry:${Date.now()}`,
      maxAttempts: 12,
    });
    return dependencies.getDashboard(context.serviceClient, context.storeId);
  },

  async disconnect(request: Request, body: JsonObject) {
    const context = await createDomainContext(request, body.storeId, true);
    const { data: integration, error: integrationLoadError } = await context.serviceClient
      .from("google_integrations")
      .select("refresh_token_ciphertext")
      .eq("store_id", context.storeId)
      .maybeSingle();
    throwDatabaseError(integrationLoadError, "Google connection state could not be loaded.");
    if (integration?.refresh_token_ciphertext && google.configured) {
      try {
        const refreshToken = await decryptGoogleSecret(
          String(integration.refresh_token_ciphertext),
          `google-refresh:${context.storeId}`,
        );
        await google.revokeToken(refreshToken);
      } catch (error) {
        console.warn("Google token revocation could not be confirmed", {
          code: error instanceof DomainApiError ? error.code : "UNKNOWN",
        });
      }
    }
    const { error: cancelError } = await context.serviceClient
      .from("seo_sync_jobs")
      .update({
        status: "cancelled",
        completed_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        last_error_code: "GOOGLE_DISCONNECTED",
        last_error_message: "Cancelled because the merchant disconnected Google Search.",
      })
      .eq("store_id", context.storeId)
      .in("job_type", Array.from(GOOGLE_JOB_TYPES))
      .in("status", ["queued", "retry"]);
    throwDatabaseError(cancelError, "Pending Google jobs could not be cancelled.");
    for (const table of [
      "url_inspection_results",
      "search_console_metrics",
      "sitemap_submissions",
      "search_console_properties",
      "google_site_verifications",
      "google_oauth_states",
    ]) {
      const { error } = await context.serviceClient.from(table).delete().eq("store_id", context.storeId);
      throwDatabaseError(error, "Google Search data could not be disconnected.");
    }
    const { error: integrationError } = await context.serviceClient
      .from("google_integrations")
      .upsert({
        store_id: context.storeId,
        google_account_email: null,
        refresh_token_ciphertext: null,
        token_key_version: null,
        granted_scopes: [],
        status: "disconnected",
        connected_by: null,
        token_expires_at: null,
        last_synced_at: null,
        failure_code: null,
        failure_message: null,
      }, { onConflict: "store_id" });
    throwDatabaseError(integrationError, "Google connection state could not be cleared.");
    const { error: domainError } = await context.serviceClient
      .from("store_domains")
      .update({ seo_status: "waiting_for_google" })
      .eq("store_id", context.storeId)
      .eq("status", "active");
    throwDatabaseError(domainError, "Storefront SEO state could not be reset.");
    return dependencies.getDashboard(context.serviceClient, context.storeId);
  },

  async processJob(client: SupabaseClient, job: JsonObject) {
    const storeId = requireString(job.store_id, "storeId", 80);
    try {
      switch (job.job_type) {
        case "google-site-verify":
          return await processSiteVerification(client, job, dependencies.enqueueJob);
        case "google-property-create":
          return await processPropertyCreate(client, job, dependencies.enqueueJob);
        case "sitemap-submit":
          return await processSitemapSubmit(client, job, dependencies.enqueueJob);
        case "search-console-sync":
          return await processSearchConsoleSync(client, job);
        case "url-inspection-sync":
          return await processUrlInspectionSync(client, job);
        default:
          throw new DomainApiError(
            "JOB_HANDLER_NOT_IMPLEMENTED",
            `No Google handler is registered for ${String(job.job_type)}.`,
            500,
          );
      }
    } catch (error) {
      if (error instanceof DomainApiError && error.code === "GOOGLE_REAUTHORIZATION_REQUIRED") {
        await markReauthorizationRequired(client, storeId, error);
        if (job.id) {
          await client
            .from("seo_sync_jobs")
            .update({ max_attempts: Number(job.attempts ?? 1) })
            .eq("id", String(job.id));
        }
      }
      throw error;
    }
  },
});
