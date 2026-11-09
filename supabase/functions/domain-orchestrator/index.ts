import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.6";
import {
  createDomainContext,
  createServiceClient,
  isCronRequest,
} from "../_shared/domain/auth.ts";
import {
  CloudflareClient,
  normalizedCloudflareSslStatus,
  type CloudflareCustomHostname,
} from "../_shared/domain/cloudflare.ts";
import { DomainApiError, ProviderPendingError } from "../_shared/domain/errors.ts";
import { normalizeHostname, requireUuid } from "../_shared/domain/hostname.ts";
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  readJsonObject,
} from "../_shared/domain/http.ts";
import { HostingerClient } from "../_shared/domain/hostinger.ts";
import {
  createGoogleWorkflow,
  googleSearchCapability,
  type GoogleJobInput,
} from "./google-workflow.ts";

type JsonObject = Record<string, unknown>;
type DatabaseError = { code?: string; message?: string } | null;

const cloudflare = new CloudflareClient();
const hostinger = new HostingerClient();

const envFlag = (name: string) => Deno.env.get(name)?.trim().toLowerCase() === "true";

const requireCnameTarget = (): string => {
  const target = Deno.env.get("CUSTOM_HOSTNAME_CNAME_TARGET")?.trim();
  if (!target) {
    throw new DomainApiError(
      "CUSTOM_HOST_TARGET_NOT_CONFIGURED",
      "Custom-domain routing has not been configured by StoreBlink yet.",
      503,
    );
  }
  return normalizeHostname(target);
};

const requireProvisioningReadiness = (): string => {
  const target = requireCnameTarget();
  if (!cloudflare.configured) {
    throw new DomainApiError(
      "CLOUDFLARE_NOT_CONFIGURED",
      "Automatic DNS and SSL provisioning is not configured yet.",
      503,
    );
  }
  return target;
};

const throwDatabaseError = (error: DatabaseError, fallback: string): void => {
  if (!error) return;
  console.error("Domain database operation failed", { code: error.code });
  if (error.code === "23505") {
    throw new DomainApiError(
      "DOMAIN_ALREADY_CLAIMED",
      "This domain is already connected to another store or has an active verification claim.",
      409,
    );
  }
  if (error.code === "55000") {
    throw new DomainApiError(
      "DOMAIN_DISCONNECT_PENDING",
      "This domain is still disconnecting. Wait a moment, then connect it again.",
      409,
    );
  }
  if (error.code === "22023") {
    throw new DomainApiError(
      "DOMAIN_QUOTE_EXPIRED",
      "This registration quote has expired. Search again to confirm the current price.",
      409,
    );
  }
  throw new DomainApiError("DOMAIN_DATABASE_ERROR", fallback, 500);
};

const providerCapabilities = () => {
  const cnameTargetConfigured = Boolean(Deno.env.get("CUSTOM_HOSTNAME_CNAME_TARGET")?.trim());
  const provisioningConfigured = cloudflare.configured && cnameTargetConfigured;
  const includedClaimEnabled = hostinger.configured && envFlag("HOSTINGER_INCLUDED_DOMAIN_CLAIM_ENABLED");
  const includedTransferEnabled = hostinger.configured && envFlag("HOSTINGER_INCLUDED_TRANSFER_ENABLED");
  const paidRegistrationEnabled = hostinger.configured && envFlag("HOSTINGER_PAID_DOMAIN_PURCHASE_ENABLED");
  return {
    existingDomain: {
      available: cloudflare.configured && cnameTargetConfigured,
      reason: !cnameTargetConfigured
        ? "Custom-host routing target is not configured."
        : !cloudflare.configured
          ? "Cloudflare for SaaS credentials are not configured."
          : null,
    },
    domainSearch: {
      available: hostinger.configured,
      reason: hostinger.configured ? null : "Registrar credentials are not configured.",
    },
    includedRegistration: {
      available: includedClaimEnabled && provisioningConfigured,
      reason: includedClaimEnabled && provisioningConfigured
        ? null
        : !hostinger.configured
          ? "Registrar credentials are not configured."
          : !includedClaimEnabled
            ? "This registrar account does not have an enabled included-domain claim workflow."
            : "Automatic DNS and SSL provisioning is not configured yet.",
    },
    paidRegistration: {
      available: paidRegistrationEnabled && provisioningConfigured,
      reason: paidRegistrationEnabled && provisioningConfigured
        ? null
        : !hostinger.configured
          ? "Registrar credentials are not configured."
          : !paidRegistrationEnabled
            ? "Paid domain registration is disabled until the platform billing account and default payment method are approved."
            : "Automatic DNS and SSL provisioning is not configured yet.",
    },
    includedTransfer: {
      available: includedTransferEnabled && provisioningConfigured,
      reason: includedTransferEnabled && provisioningConfigured
        ? null
        : !hostinger.configured
          ? "Registrar credentials are not configured."
          : !includedTransferEnabled
            ? "Included registrar transfer claims are not enabled for this platform account."
            : "Automatic DNS and SSL provisioning is not configured yet.",
    },
    googleSearch: googleSearchCapability(),
  };
};

const selectOrThrow = async <T>(query: PromiseLike<{ data: T | null; error: DatabaseError }>): Promise<T> => {
  const { data, error } = await query;
  throwDatabaseError(error, "Domain status could not be loaded.");
  return data as T;
};

const getDomainDashboard = async (client: SupabaseClient, storeId: string) => {
  const [
    domains,
    verifications,
    cloudflareRows,
    purchaseOrders,
    transferRequests,
    googleIntegration,
    siteVerifications,
    properties,
    sitemapSubmissions,
    metrics,
    inspectionResults,
  ] = await Promise.all([
    selectOrThrow<Array<JsonObject>>(
      client
        .from("store_domains")
        .select("id,hostname,source,status,verification_status,dns_status,ssl_status,seo_status,is_primary,redirect_to_primary,cname_target,claim_expires_at,activated_at,last_checked_at,failure_code,failure_message,created_at,updated_at")
        .eq("store_id", storeId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true }),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("domain_verifications")
        .select("domain_id,method,record_name,record_type,record_value,status,expires_at,verified_at,last_error")
        .eq("store_id", storeId),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("cloudflare_custom_hostnames")
        .select("domain_id,hostname_status,ssl_status,ownership_status,validation_method,validation_records,last_synced_at")
        .eq("store_id", storeId),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("domain_purchase_orders")
        .select("id,domain_id,hostname,purchase_kind,status,quoted_amount_minor,final_amount_minor,currency,provider_status,failure_code,failure_message,created_at,updated_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("domain_transfer_requests")
        .select("id,domain_id,hostname,status,confirmation_email_masked,initiated_at,completed_at,failure_code,failure_message,created_at,updated_at")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(20),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("google_integrations")
        .select("id,status,google_account_email,granted_scopes,last_synced_at,failure_code,failure_message,updated_at")
        .eq("store_id", storeId)
        .limit(1),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("google_site_verifications")
        .select("domain_id,method,status,verified_at,failure_code,failure_message,updated_at")
        .eq("store_id", storeId),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("search_console_properties")
        .select("id,domain_id,site_url,permission_level,status,last_checked_at,failure_code,failure_message,updated_at")
        .eq("store_id", storeId),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("sitemap_submissions")
        .select("domain_id,sitemap_url,status,submitted_at,last_checked_at,discovered_urls,indexed_urls,failure_code,failure_message,updated_at")
        .eq("store_id", storeId),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("search_console_metrics")
        .select("domain_id,metric_date,clicks,impressions,ctr,average_position")
        .eq("store_id", storeId)
        .order("metric_date", { ascending: false })
        .limit(28),
    ),
    selectOrThrow<Array<JsonObject>>(
      client
        .from("url_inspection_results")
        .select("domain_id,inspected_url,verdict,coverage_state,robots_txt_state,indexing_state,page_fetch_state,last_crawl_time,google_canonical,user_canonical,inspection_result_link,last_checked_at")
        .eq("store_id", storeId)
        .order("last_checked_at", { ascending: false })
        .limit(50),
    ),
  ]);

  const verificationsByDomain = new Map(verifications.map((row) => [row.domain_id, row]));
  const cloudflareByDomain = new Map(cloudflareRows.map((row) => [row.domain_id, row]));
  return {
    storeId,
    domains: domains.map((domain) => ({
      ...domain,
      verification: verificationsByDomain.get(domain.id) ?? null,
      certificate: cloudflareByDomain.get(domain.id) ?? null,
    })),
    purchaseOrders,
    transferRequests,
    google: googleIntegration[0] ?? { status: "disconnected" },
    siteVerifications,
    searchConsoleProperties: properties,
    sitemapSubmissions,
    searchMetrics: metrics,
    urlInspectionResults: inspectionResults,
    capabilities: providerCapabilities(),
    generatedAt: new Date().toISOString(),
  };
};

const connectExistingDomain = async (
  request: Request,
  body: JsonObject,
) => {
  const context = await createDomainContext(request, body.storeId, true);
  const hostname = normalizeHostname(body.hostname);
  const cnameTarget = requireCnameTarget();
  if (!cloudflare.configured) {
    throw new DomainApiError(
      "CLOUDFLARE_NOT_CONFIGURED",
      "Automatic SSL is not configured yet.",
      503,
    );
  }
  const { error } = await context.serviceClient.rpc("create_existing_domain_claim", {
    p_store_id: context.storeId,
    p_actor_user_id: context.user.id,
    p_hostname: hostname,
    p_cname_target: cnameTarget,
  });
  throwDatabaseError(error, "The domain claim could not be created.");
  return getDomainDashboard(context.serviceClient, context.storeId);
};

const setPrimaryDomain = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const domainId = requireUuid(body.domainId, "domainId");
  const { error } = await context.serviceClient.rpc("set_primary_store_domain", {
    p_store_id: context.storeId,
    p_domain_id: domainId,
  });
  throwDatabaseError(error, "The primary domain could not be changed.");
  return getDomainDashboard(context.serviceClient, context.storeId);
};

const enqueueJob = async (
  client: SupabaseClient,
  input: GoogleJobInput,
) => {
  const { error } = await client.from("seo_sync_jobs").insert({
    store_id: input.storeId,
    domain_id: input.domainId ?? null,
    job_type: input.jobType,
    idempotency_key: input.idempotencyKey,
    payload: input.payload ?? {},
    max_attempts: Math.min(240, Math.max(1, input.maxAttempts ?? 12)),
    ...(input.runAfter ? { run_after: input.runAfter } : {}),
  });
  if (error?.code !== "23505") throwDatabaseError(error, "The provider job could not be queued.");
};

const googleWorkflow = createGoogleWorkflow({
  enqueueJob,
  getDashboard: getDomainDashboard,
});

const retryDomain = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const domainId = requireUuid(body.domainId, "domainId");
  const domain = await selectOrThrow<JsonObject>(
    context.serviceClient
      .from("store_domains")
      .select("id,store_id,hostname,status")
      .eq("id", domainId)
      .eq("store_id", context.storeId)
      .maybeSingle(),
  );
  if (!domain) throw new DomainApiError("DOMAIN_NOT_FOUND", "Domain not found.", 404);
  if (domain.status === "active" || domain.status === "disabled") {
    throw new DomainApiError(
      "DOMAIN_RETRY_NOT_ALLOWED",
      "Only a pending or failed domain can be retried.",
      409,
    );
  }
  const provider = await selectOrThrow<JsonObject>(
    context.serviceClient
      .from("cloudflare_custom_hostnames")
      .select("cloudflare_hostname_id")
      .eq("domain_id", domainId)
      .maybeSingle(),
  );
  const jobType = provider?.cloudflare_hostname_id
    ? "cloudflare-poll-ssl-status"
    : "cloudflare-create-hostname";
  await context.serviceClient
    .from("store_domains")
    .update({
      status: jobType === "cloudflare-create-hostname" ? "verification_pending" : "ssl_pending",
      failure_code: null,
      failure_message: null,
    })
    .eq("id", domainId)
    .eq("store_id", context.storeId);
  await enqueueJob(context.serviceClient, {
    storeId: context.storeId,
    domainId,
    jobType,
    idempotencyKey: `${jobType}:${domainId}:retry:${Date.now()}`,
    payload: { hostname: domain.hostname },
    maxAttempts: jobType === "cloudflare-poll-ssl-status" ? 48 : 12,
  });
  return getDomainDashboard(context.serviceClient, context.storeId);
};

const disableDomain = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const domainId = requireUuid(body.domainId, "domainId");
  const domain = await selectOrThrow<JsonObject>(
    context.serviceClient
      .from("store_domains")
      .select("id,store_id,is_primary")
      .eq("id", domainId)
      .eq("store_id", context.storeId)
      .maybeSingle(),
  );
  if (!domain) throw new DomainApiError("DOMAIN_NOT_FOUND", "Domain not found.", 404);
  const provider = await selectOrThrow<JsonObject>(
    context.serviceClient
      .from("cloudflare_custom_hostnames")
      .select("cloudflare_hostname_id")
      .eq("domain_id", domainId)
      .maybeSingle(),
  );
  const { error } = await context.serviceClient
    .from("store_domains")
    .update({ status: "disabled", is_primary: false })
    .eq("id", domainId)
    .eq("store_id", context.storeId);
  throwDatabaseError(error, "The domain could not be disconnected.");
  const { error: cancellationError } = await context.serviceClient
    .from("seo_sync_jobs")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error_code: "DOMAIN_DISCONNECTED",
      last_error_message: "Cancelled because the merchant disconnected the domain.",
    })
    .eq("domain_id", domainId)
    .in("status", ["queued", "retry"]);
  throwDatabaseError(cancellationError, "Pending domain jobs could not be cancelled.");
  if (provider?.cloudflare_hostname_id) {
    await enqueueJob(context.serviceClient, {
      storeId: context.storeId,
      domainId,
      jobType: "cloudflare-delete-hostname",
      idempotencyKey: `cloudflare-delete-hostname:${domainId}:${Date.now()}`,
    });
  } else {
    const { error: providerDeleteError } = await context.serviceClient
      .from("cloudflare_custom_hostnames")
      .delete()
      .eq("domain_id", domainId);
    throwDatabaseError(providerDeleteError, "Domain provider state could not be removed.");
  }
  if (domain.is_primary) {
    const replacement = await selectOrThrow<JsonObject>(
      context.serviceClient
        .from("store_domains")
        .select("id")
        .eq("store_id", context.storeId)
        .eq("status", "active")
        .neq("id", domainId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    );
    if (replacement?.id) {
      await context.serviceClient.rpc("set_primary_store_domain", {
        p_store_id: context.storeId,
        p_domain_id: replacement.id,
      });
    }
  }
  return getDomainDashboard(context.serviceClient, context.storeId);
};

const searchDomains = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  if (typeof body.name !== "string") {
    throw new DomainApiError("INVALID_SEARCH", "Enter a domain name to search.", 422);
  }
  const name = body.name.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
    throw new DomainApiError(
      "INVALID_SEARCH",
      "Use 3-63 letters, numbers, or hyphens without a domain extension.",
      422,
    );
  }
  const requestedTlds = Array.isArray(body.tlds) ? body.tlds : ["com", "net", "org", "store"];
  const tlds = Array.from(
    new Set(
      requestedTlds
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase().replace(/^\./, ""))
        .filter((value) => /^[a-z]{2,24}$/.test(value)),
    ),
  ).slice(0, 8);
  if (!tlds.length) throw new DomainApiError("INVALID_SEARCH", "Select at least one domain extension.", 422);
  const results = await hostinger.search(name, tlds);
  const paidRegistrationEnabled = envFlag("HOSTINGER_PAID_DOMAIN_PURCHASE_ENABLED");
  const quotedResults = await Promise.all(results.map(async (result) => {
    let normalizedDomain: string | null = null;
    try {
      normalizedDomain = result.domain && result.is_available
        ? normalizeHostname(result.domain)
        : null;
    } catch {
      return {
        result: { ...result, domain: null, is_available: false },
        quote: null,
        quoteUnavailableReason: "The registrar returned an invalid domain result.",
      };
    }
    if (!normalizedDomain || !paidRegistrationEnabled) {
      return { result, quote: null, quoteUnavailableReason: null };
    }
    try {
      const quote = await hostinger.getRegistrationQuote(normalizedDomain);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error: expireError } = await context.serviceClient
        .from("domain_registration_quotes")
        .update({ status: "expired" })
        .eq("store_id", context.storeId)
        .eq("hostname", normalizedDomain)
        .eq("status", "open");
      throwDatabaseError(expireError, "Previous registration quotes could not be expired.");
      const { data: savedQuote, error: quoteError } = await context.serviceClient
        .from("domain_registration_quotes")
        .insert({
          store_id: context.storeId,
          hostname: normalizedDomain,
          provider_item_id: quote.itemId,
          amount_minor: quote.amountMinor,
          renewal_amount_minor: quote.renewalAmountMinor,
          currency: quote.currency,
          period: quote.period,
          period_unit: quote.periodUnit,
          quoted_by: context.user.id,
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      throwDatabaseError(quoteError, "The registration quote could not be saved.");
      if (!savedQuote?.id) {
        throw new DomainApiError("DOMAIN_QUOTE_NOT_CREATED", "The registration quote could not be saved.", 500);
      }
      return {
        result,
        quote: {
          id: String(savedQuote.id),
          amountMinor: quote.amountMinor,
          renewalAmountMinor: quote.renewalAmountMinor,
          currency: quote.currency,
          period: quote.period,
          periodUnit: quote.periodUnit,
          expiresAt,
        },
        quoteUnavailableReason: null,
      };
    } catch (error) {
      const normalized = error instanceof DomainApiError
        ? error
        : new DomainApiError("DOMAIN_PRICE_UNAVAILABLE", "A registration price is unavailable.", 409);
      console.warn("Domain quote unavailable", { hostname: normalizedDomain, code: normalized.code });
      return { result, quote: null, quoteUnavailableReason: normalized.message };
    }
  }));
  return {
    results: quotedResults.map(({ result, quote, quoteUnavailableReason }) => ({
      domain: result.domain,
      available: result.is_available,
      alternative: result.is_alternative,
      restriction: result.restriction,
      quote,
      quoteUnavailableReason,
    })),
    capabilities: providerCapabilities(),
  };
};

const purchasePaidDomain = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  if (!envFlag("HOSTINGER_PAID_DOMAIN_PURCHASE_ENABLED")) {
    throw new DomainApiError(
      "REGISTRATION_NOT_AVAILABLE",
      "Paid domain registration is not enabled for this platform account.",
      503,
    );
  }
  if (body.confirm !== true) {
    throw new DomainApiError("CONFIRMATION_REQUIRED", "Confirm the quoted domain purchase.", 422);
  }
  const { data: canPurchase, error: capabilityError } = await context.userClient.rpc(
    "has_store_capability",
    { p_store_id: context.storeId, p_capability: "billing.manage" },
  );
  if (capabilityError || canPurchase !== true) {
    throw new DomainApiError(
      "DOMAIN_PURCHASE_ACCESS_DENIED",
      "Only a store owner or billing manager can purchase a domain.",
      403,
    );
  }
  requireProvisioningReadiness();
  const quoteId = requireUuid(body.quoteId, "quoteId");
  const { data: order, error } = await context.serviceClient.rpc(
    "create_paid_domain_purchase_order",
    {
      p_store_id: context.storeId,
      p_actor_user_id: context.user.id,
      p_quote_id: quoteId,
    },
  );
  throwDatabaseError(error, "The domain purchase order could not be created.");
  if (!order?.id) {
    throw new DomainApiError("PURCHASE_REQUEST_NOT_CREATED", "The domain purchase order could not be created.", 500);
  }
  await enqueueJob(context.serviceClient, {
    storeId: context.storeId,
    jobType: "hostinger-purchase-domain",
    idempotencyKey: `hostinger-purchase-domain:${String(order.id)}`,
    payload: { orderId: order.id },
    maxAttempts: 48,
  });
  return getDomainDashboard(context.serviceClient, context.storeId);
};

const claimIncludedDomain = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  if (!envFlag("HOSTINGER_INCLUDED_DOMAIN_CLAIM_ENABLED")) {
    throw new DomainApiError(
      "REGISTRATION_NOT_AVAILABLE",
      "Included-domain registration is not enabled for this platform account.",
      503,
    );
  }
  if (body.confirm !== true) {
    throw new DomainApiError("CONFIRMATION_REQUIRED", "Confirm the domain registration request.", 422);
  }
  const hostname = normalizeHostname(body.hostname);
  const target = requireProvisioningReadiness();
  const { data: existing } = await context.serviceClient
    .from("domain_purchase_orders")
    .select("id,status")
    .eq("store_id", context.storeId)
    .eq("hostname", hostname)
    .maybeSingle();
  if (existing && !["failed", "cancelled"].includes(existing.status)) {
    throw new DomainApiError("PURCHASE_ALREADY_REQUESTED", "This registration is already being processed.", 409);
  }
  const { data: order, error: orderError } = await context.serviceClient
    .from("domain_purchase_orders")
    .upsert({
      store_id: context.storeId,
      hostname,
      status: "requested",
      requested_by: context.user.id,
      failure_code: null,
      failure_message: null,
    }, { onConflict: "store_id,hostname" })
    .select("id")
    .single();
  throwDatabaseError(orderError, "The registration request could not be created.");
  if (!order) {
    throw new DomainApiError(
      "PURCHASE_REQUEST_NOT_CREATED",
      "The registration request could not be created.",
      500,
    );
  }
  try {
    const providerOrder = await hostinger.claimIncludedDomain(hostname);
    const { data: domain, error: claimError } = await context.serviceClient.rpc(
      "create_existing_domain_claim",
      {
        p_store_id: context.storeId,
        p_actor_user_id: context.user.id,
        p_hostname: hostname,
        p_cname_target: target,
      },
    );
    throwDatabaseError(claimError, "The registered domain could not be attached to the store.");
    const domainId = domain.id as string;
    await hostinger.configureStorefrontDns(hostname, target);
    await context.serviceClient
      .from("store_domains")
      .update({ source: "hostinger_purchase", dns_status: "configured", status: "provisioning" })
      .eq("id", domainId);
    await context.serviceClient
      .from("domain_purchase_orders")
      .update({
        domain_id: domainId,
        provider_order_id: providerOrder.domain ?? hostname,
        status: providerOrder.status === "active" ? "active" : "submitted",
      })
      .eq("id", order.id);
  } catch (error) {
    await context.serviceClient
      .from("domain_purchase_orders")
      .update({ status: "failed", failure_code: "REGISTRAR_REJECTED", failure_message: "Registrar request failed." })
      .eq("id", order.id);
    throw error;
  }
  return getDomainDashboard(context.serviceClient, context.storeId);
};

const initiateIncludedTransfer = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  if (!envFlag("HOSTINGER_INCLUDED_TRANSFER_ENABLED")) {
    throw new DomainApiError(
      "TRANSFER_NOT_AVAILABLE",
      "Included registrar transfers are not enabled for this platform account.",
      503,
    );
  }
  if (body.confirm !== true) {
    throw new DomainApiError(
      "CONFIRMATION_REQUIRED",
      "Confirm that you own this domain and understand the registrant email step.",
      422,
    );
  }
  const hostname = normalizeHostname(body.hostname);
  const authorizationCode = typeof body.authorizationCode === "string"
    ? body.authorizationCode.trim()
    : "";
  if (authorizationCode.length < 4 || authorizationCode.length > 200) {
    throw new DomainApiError("INVALID_AUTHORIZATION_CODE", "Enter a valid EPP authorization code.", 422);
  }
  const target = requireProvisioningReadiness();
  const { data: transferRequest, error: requestError } = await context.serviceClient
    .from("domain_transfer_requests")
    .upsert({
      store_id: context.storeId,
      hostname,
      status: "requested",
      requested_by: context.user.id,
      failure_code: null,
      failure_message: null,
    }, { onConflict: "store_id,hostname" })
    .select("id")
    .single();
  throwDatabaseError(requestError, "The transfer request could not be created.");
  if (!transferRequest) {
    throw new DomainApiError(
      "TRANSFER_REQUEST_NOT_CREATED",
      "The transfer request could not be created.",
      500,
    );
  }
  try {
    const providerTransfer = await hostinger.initiateIncludedTransfer(hostname, authorizationCode);
    const { data: domain, error: claimError } = await context.serviceClient.rpc(
      "create_existing_domain_claim",
      {
        p_store_id: context.storeId,
        p_actor_user_id: context.user.id,
        p_hostname: hostname,
        p_cname_target: target,
      },
    );
    throwDatabaseError(claimError, "The transfer could not be attached to the store.");
    const domainId = domain.id as string;
    await context.serviceClient
      .from("store_domains")
      .update({ source: "hostinger_transfer", status: "provisioning" })
      .eq("id", domainId);
    await context.serviceClient
      .from("domain_transfer_requests")
      .update({
        domain_id: domainId,
        provider_transfer_id: hostname,
        status: "awaiting_registrant",
        initiated_at: providerTransfer.initiated_at ?? new Date().toISOString(),
      })
      .eq("id", transferRequest.id);
    await enqueueJob(context.serviceClient, {
      storeId: context.storeId,
      domainId,
      jobType: "hostinger-poll-transfer-status",
      idempotencyKey: `hostinger-poll-transfer-status:${domainId}`,
      payload: { transferRequestId: transferRequest.id, hostname },
      maxAttempts: 192,
    });
  } catch (error) {
    await context.serviceClient
      .from("domain_transfer_requests")
      .update({ status: "failed", failure_code: "TRANSFER_INIT_FAILED", failure_message: "Registrar transfer initiation failed." })
      .eq("id", transferRequest.id);
    throw error;
  }
  return getDomainDashboard(context.serviceClient, context.storeId);
};

const mapHostnameStatus = (result: CloudflareCustomHostname) => {
  const sslStatus = normalizedCloudflareSslStatus(result.ssl?.status);
  return {
    hostnameStatus: result.status ?? "pending",
    sslStatus,
    ownershipStatus:
      result.status === "active" || sslStatus === "active" ? "verified" : "pending",
    validationRecords: result.ssl?.validation_records ?? [],
  };
};

const ensurePrimaryDomain = async (
  client: SupabaseClient,
  storeId: string,
  domainId: string,
) => {
  const { data: primary, error } = await client
    .from("store_domains")
    .select("id")
    .eq("store_id", storeId)
    .eq("is_primary", true)
    .eq("status", "active")
    .maybeSingle();
  throwDatabaseError(error, "Primary-domain status could not be checked.");
  if (!primary) {
    const { error: primaryError } = await client.rpc("set_primary_store_domain", {
      p_store_id: storeId,
      p_domain_id: domainId,
    });
    throwDatabaseError(primaryError, "The primary domain could not be assigned.");
  }
};

const activateDomain = async (
  client: SupabaseClient,
  storeId: string,
  domainId: string,
): Promise<boolean> => {
  const timestamp = new Date().toISOString();
  const { data: activated, error: domainError } = await client
    .from("store_domains")
    .update({
      status: "active",
      ssl_status: "active",
      dns_status: "active",
      verification_status: "verified",
      activated_at: timestamp,
      last_checked_at: timestamp,
      failure_code: null,
      failure_message: null,
    })
    .eq("id", domainId)
    .neq("status", "disabled")
    .select("id")
    .maybeSingle();
  throwDatabaseError(domainError, "Active domain state could not be saved.");
  if (!activated) return false;

  const { error: seoError } = await client
    .from("store_domains")
    .update({ seo_status: "waiting_for_google" })
    .eq("id", domainId)
    .in("seo_status", ["waiting_for_domain", "domain_ready"]);
  throwDatabaseError(seoError, "Domain SEO state could not be initialized.");

  const { error: verificationError } = await client
    .from("domain_verifications")
    .update({ status: "verified", verified_at: timestamp, last_error: null })
    .eq("domain_id", domainId);
  throwDatabaseError(verificationError, "Domain verification state could not be saved.");

  await ensurePrimaryDomain(client, storeId, domainId);
  await enqueueJob(client, {
    storeId,
    domainId,
    jobType: "sitemap-refresh",
    idempotencyKey: `sitemap-refresh:domain-active:${domainId}`,
  });
  return true;
};

const processCloudflareCreate = async (client: SupabaseClient, job: JsonObject) => {
  const domainId = String(job.domain_id);
  const domain = await selectOrThrow<JsonObject>(
    client.from("store_domains").select("id,store_id,hostname,status").eq("id", domainId).single(),
  );
  if (domain.status === "disabled") return;
  const provider = await selectOrThrow<JsonObject>(
    client
      .from("cloudflare_custom_hostnames")
      .select("id,cloudflare_hostname_id")
      .eq("domain_id", domainId)
      .single(),
  );
  let hostnameResource: CloudflareCustomHostname;
  if (provider.cloudflare_hostname_id) {
    hostnameResource = await cloudflare.getCustomHostname(String(provider.cloudflare_hostname_id));
  } else {
    hostnameResource =
      (await cloudflare.findCustomHostname(String(domain.hostname))) ??
      (await cloudflare.createCustomHostname(String(domain.hostname)));
  }
  const mapped = mapHostnameStatus(hostnameResource);
  const { data: savedProvider, error: providerError } = await client
    .from("cloudflare_custom_hostnames")
    .update({
      cloudflare_hostname_id: hostnameResource.id,
      hostname_status: mapped.hostnameStatus,
      ssl_status: mapped.sslStatus,
      ownership_status: mapped.ownershipStatus,
      validation_records: mapped.validationRecords,
      provider_payload: {
        hostname: hostnameResource.hostname,
        status: hostnameResource.status,
        ssl: { status: hostnameResource.ssl?.status },
      },
      last_synced_at: new Date().toISOString(),
    })
    .eq("domain_id", domainId)
    .select("id")
    .maybeSingle();
  throwDatabaseError(providerError, "Certificate provider state could not be saved.");
  if (!savedProvider) {
    await cloudflare.deleteCustomHostname(hostnameResource.id).catch((cleanupError) => {
      console.error("Orphaned custom hostname cleanup failed", cleanupError);
    });
    return;
  }
  const { error: domainError } = await client
    .from("store_domains")
    .update({
      status: mapped.sslStatus === "active" ? "active" : "ssl_pending",
      ssl_status: mapped.sslStatus,
      dns_status: mapped.hostnameStatus === "active" ? "active" : "pending",
      verification_status: mapped.ownershipStatus === "verified" ? "verified" : "validating",
      last_checked_at: new Date().toISOString(),
      provider_updated_at: new Date().toISOString(),
      failure_code: null,
      failure_message: null,
    })
    .eq("id", domainId)
    .neq("status", "disabled");
  throwDatabaseError(domainError, "Domain provider state could not be saved.");
  if (mapped.sslStatus === "active") {
    await activateDomain(client, String(domain.store_id), domainId);
    return;
  }
  await enqueueJob(client, {
    storeId: String(domain.store_id),
    domainId,
    jobType: "cloudflare-poll-ssl-status",
    idempotencyKey: `cloudflare-poll-ssl-status:${domainId}`,
    maxAttempts: 48,
  });
};

const processCloudflarePoll = async (client: SupabaseClient, job: JsonObject) => {
  const domainId = String(job.domain_id);
  const domain = await selectOrThrow<JsonObject>(
    client
      .from("store_domains")
      .select("status")
      .eq("id", domainId)
      .maybeSingle(),
  );
  if (!domain || domain.status === "disabled") return;
  const provider = await selectOrThrow<JsonObject>(
    client
      .from("cloudflare_custom_hostnames")
      .select("cloudflare_hostname_id,store_id")
      .eq("domain_id", domainId)
      .single(),
  );
  if (!provider.cloudflare_hostname_id) {
    throw new DomainApiError("CLOUDFLARE_HOSTNAME_MISSING", "Custom hostname has not been created.", 409);
  }
  const resource = await cloudflare.getCustomHostname(String(provider.cloudflare_hostname_id));
  const mapped = mapHostnameStatus(resource);
  await client
    .from("cloudflare_custom_hostnames")
    .update({
      hostname_status: mapped.hostnameStatus,
      ssl_status: mapped.sslStatus,
      ownership_status: mapped.ownershipStatus,
      validation_records: mapped.validationRecords,
      last_synced_at: new Date().toISOString(),
    })
    .eq("domain_id", domainId);
  if (mapped.sslStatus === "failed") {
    await client
      .from("store_domains")
      .update({
        status: "action_required",
        ssl_status: "failed",
        failure_code: "SSL_VALIDATION_FAILED",
        failure_message: "Check that the CNAME record exactly matches the required target.",
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", domainId)
      .neq("status", "disabled");
    throw new DomainApiError("SSL_VALIDATION_FAILED", "Certificate validation failed.", 409);
  }
  if (mapped.sslStatus !== "active") {
    await client
      .from("store_domains")
      .update({
        status: "ssl_pending",
        ssl_status: mapped.sslStatus,
        dns_status: mapped.hostnameStatus === "active" ? "active" : "pending",
        verification_status: mapped.ownershipStatus === "verified" ? "verified" : "validating",
        last_checked_at: new Date().toISOString(),
      })
      .eq("id", domainId)
      .neq("status", "disabled");
    throw new ProviderPendingError("Cloudflare is still validating DNS or issuing the certificate.");
  }
  await activateDomain(client, String(provider.store_id), domainId);
};

const processCloudflareDelete = async (client: SupabaseClient, job: JsonObject) => {
  const provider = await selectOrThrow<JsonObject>(
    client
      .from("cloudflare_custom_hostnames")
      .select("cloudflare_hostname_id")
      .eq("domain_id", String(job.domain_id))
      .maybeSingle(),
  );
  if (provider?.cloudflare_hostname_id) {
    await cloudflare.deleteCustomHostname(String(provider.cloudflare_hostname_id));
  }
  await client
    .from("cloudflare_custom_hostnames")
    .delete()
    .eq("domain_id", String(job.domain_id));
};

const processHostingerPurchase = async (client: SupabaseClient, job: JsonObject) => {
  const payload = (job.payload ?? {}) as JsonObject;
  const orderId = requireUuid(payload.orderId, "orderId");
  let order = await selectOrThrow<JsonObject>(
    client
      .from("domain_purchase_orders")
      .select("id,store_id,domain_id,hostname,status,requested_by,provider_item_id,provider_order_id,provider_status,provider_requested_at,quoted_amount_minor,currency")
      .eq("id", orderId)
      .single(),
  );
  if (["active", "failed", "cancelled"].includes(String(order.status))) return;
  if (order.status === "requested" && !envFlag("HOSTINGER_PAID_DOMAIN_PURCHASE_ENABLED")) {
    await client
      .from("domain_purchase_orders")
      .update({
        status: "cancelled",
        failure_code: "PAID_REGISTRATION_DISABLED",
        failure_message: "Paid registration was disabled before the registrar request started.",
      })
      .eq("id", orderId);
    return;
  }
  const hostname = normalizeHostname(order.hostname);

  if (!order.provider_order_id && order.status === "requested") {
    requireProvisioningReadiness();
    const labels = hostname.split(".");
    const tld = labels.pop();
    const name = labels.join(".");
    if (!name || !tld) {
      throw new DomainApiError("INVALID_DOMAIN", "The quoted domain is invalid.", 422);
    }
    const availability = await hostinger.search(name, [tld]);
    const exact = availability.find((result) => result.domain?.toLowerCase() === hostname);
    if (!exact?.is_available) {
      await client
        .from("domain_purchase_orders")
        .update({
          status: "failed",
          failure_code: "DOMAIN_NO_LONGER_AVAILABLE",
          failure_message: "The domain became unavailable before registration completed.",
        })
        .eq("id", orderId);
      throw new DomainApiError(
        "DOMAIN_NO_LONGER_AVAILABLE",
        "The domain became unavailable before registration completed.",
        409,
      );
    }

    const currentQuote = await hostinger.getRegistrationQuote(hostname);
    if (
      currentQuote.itemId !== order.provider_item_id ||
      currentQuote.currency !== order.currency ||
      currentQuote.amountMinor !== order.quoted_amount_minor
    ) {
      await client
        .from("domain_purchase_orders")
        .update({
          status: "failed",
          failure_code: "DOMAIN_PRICE_CHANGED",
          failure_message: "The registrar price changed. Search again to review the new quote.",
        })
        .eq("id", orderId);
      throw new DomainApiError(
        "DOMAIN_PRICE_CHANGED",
        "The registrar price changed. Search again to review the new quote.",
        409,
      );
    }

    const requestedAt = new Date().toISOString();
    const { data: claimedOrder, error: claimError } = await client
      .from("domain_purchase_orders")
      .update({ status: "submitted", provider_requested_at: requestedAt })
      .eq("id", orderId)
      .eq("status", "requested")
      .select("id")
      .maybeSingle();
    throwDatabaseError(claimError, "The registrar purchase could not be started.");
    if (!claimedOrder) {
      throw new ProviderPendingError("Another worker is processing this registration.");
    }

    const providerOrder = await hostinger.purchaseDomain(hostname, currentQuote.itemId);
    const providerStatus = providerOrder.status.trim().toLowerCase();
    if (/failed|cancelled|refunded|fraud/.test(providerStatus)) {
      await client
        .from("domain_purchase_orders")
        .update({
          provider_order_id: String(providerOrder.id),
          provider_status: providerStatus,
          final_amount_minor: providerOrder.total,
          currency: providerOrder.currency,
          status: "failed",
          failure_code: "REGISTRAR_PAYMENT_FAILED",
          failure_message: "The registrar could not complete payment for this domain.",
        })
        .eq("id", orderId);
      throw new DomainApiError(
        "REGISTRAR_PAYMENT_FAILED",
        "The registrar could not complete payment for this domain.",
        409,
      );
    }
    const { error: orderError } = await client
      .from("domain_purchase_orders")
      .update({
        provider_order_id: String(providerOrder.id),
        provider_status: providerStatus,
        final_amount_minor: providerOrder.total,
        currency: providerOrder.currency,
        status: "pending_setup",
        failure_code: /awaiting_payment|payment_initiated/.test(providerStatus)
          ? "REGISTRAR_PAYMENT_PENDING"
          : null,
        failure_message: /awaiting_payment|payment_initiated/.test(providerStatus)
          ? "The platform registrar payment is still pending."
          : null,
      })
      .eq("id", orderId);
    throwDatabaseError(orderError, "The registrar order status could not be saved.");
    order = { ...order, provider_order_id: String(providerOrder.id), status: "pending_setup" };
  }

  let providerDomain = await hostinger.getDomain(hostname);
  if (!providerDomain) {
    const requestedAt = Date.parse(String(order.provider_requested_at ?? ""));
    const elapsed = Number.isFinite(requestedAt) ? Date.now() - requestedAt : 0;
    if (!order.provider_order_id && elapsed > 30 * 60 * 1000) {
      await client
        .from("domain_purchase_orders")
        .update({
          status: "failed",
          failure_code: "PURCHASE_RECONCILIATION_REQUIRED",
          failure_message: "The registrar did not return an order reference. Platform support must reconcile this request before retrying.",
        })
        .eq("id", orderId);
      throw new DomainApiError(
        "PURCHASE_RECONCILIATION_REQUIRED",
        "The registrar purchase needs platform support review.",
        409,
      );
    }
    throw new ProviderPendingError("The registrar is still provisioning the purchased domain.");
  }

  const providerDomainStatus = providerDomain.status.trim().toLowerCase();
  if (/failed|deleted|suspended|expired/.test(providerDomainStatus)) {
    await client
      .from("domain_purchase_orders")
      .update({
        status: "failed",
        provider_status: providerDomainStatus,
        failure_code: "DOMAIN_PROVISIONING_FAILED",
        failure_message: providerDomain.message ?? "The registrar reported that domain provisioning failed.",
      })
      .eq("id", orderId);
    throw new DomainApiError("DOMAIN_PROVISIONING_FAILED", "Domain provisioning failed at the registrar.", 409);
  }

  const target = requireProvisioningReadiness();
  await hostinger.configureStorefrontDns(hostname, target);
  const { data: domain, error: domainError } = await client.rpc(
    "create_existing_domain_claim",
    {
      p_store_id: order.store_id,
      p_actor_user_id: order.requested_by,
      p_hostname: hostname,
      p_cname_target: target,
    },
  );
  throwDatabaseError(domainError, "The purchased domain could not be attached to the store.");
  if (!domain?.id) {
    throw new DomainApiError("DOMAIN_CLAIM_NOT_CREATED", "The purchased domain could not be attached to the store.", 500);
  }
  const domainId = String(domain.id);
  const { error: storeDomainError } = await client
    .from("store_domains")
    .update({ source: "hostinger_purchase", dns_status: "configured", status: "provisioning" })
    .eq("id", domainId)
    .neq("status", "disabled");
  throwDatabaseError(storeDomainError, "The purchased domain state could not be saved.");
  const { error: completedError } = await client
    .from("domain_purchase_orders")
    .update({
      domain_id: domainId,
      provider_status: providerDomainStatus,
      status: "active",
      failure_code: null,
      failure_message: null,
    })
    .eq("id", orderId);
  throwDatabaseError(completedError, "The completed purchase could not be finalized.");
};

const processTransferPoll = async (client: SupabaseClient, job: JsonObject) => {
  const domain = await selectOrThrow<JsonObject>(
    client
      .from("store_domains")
      .select("status")
      .eq("id", String(job.domain_id))
      .maybeSingle(),
  );
  if (!domain || domain.status === "disabled") return;
  const payload = (job.payload ?? {}) as JsonObject;
  const hostname = normalizeHostname(payload.hostname);
  const requestId = requireUuid(payload.transferRequestId, "transferRequestId");
  const transfer = await hostinger.getTransfer(hostname);
  const status = transfer.status.trim().toLowerCase();
  if (/fail|reject|cancel/.test(status)) {
    await client
      .from("domain_transfer_requests")
      .update({ status: "failed", failure_code: "TRANSFER_FAILED", failure_message: "The registrar reported that the transfer failed." })
      .eq("id", requestId);
    throw new DomainApiError("TRANSFER_FAILED", "The registrar reported that the transfer failed.", 409);
  }
  if (!/complete|active/.test(status)) {
    await client
      .from("domain_transfer_requests")
      .update({ status: /confirm|email|approve/.test(status) ? "awaiting_registrant" : "transferring" })
      .eq("id", requestId);
    throw new ProviderPendingError("The registrar transfer is still waiting for completion.");
  }
  requireProvisioningReadiness();
  await client
    .from("domain_transfer_requests")
    .update({ status: "completed", completed_at: transfer.completed_at ?? new Date().toISOString() })
    .eq("id", requestId);
  await client
    .from("store_domains")
    .update({
      dns_status: "pending",
      status: "verification_pending",
      failure_code: null,
      failure_message: null,
    })
    .eq("id", String(job.domain_id))
    .neq("status", "disabled");
  await enqueueJob(client, {
    storeId: String(job.store_id),
    domainId: String(job.domain_id),
    jobType: "cloudflare-create-hostname",
    idempotencyKey: `cloudflare-create-hostname:${String(job.domain_id)}:transfer-complete`,
    maxAttempts: 12,
  });
};

const processSitemapRefresh = async (client: SupabaseClient, job: JsonObject) => {
  const storeId = String(job.store_id);
  const { error: dirtyError } = await client.rpc("mark_sitemap_dirty_for_service", {
    p_store_id: storeId,
    p_segments: ["pages", "products", "collections", "blogs"],
    p_event_type: "SITEMAP_REFRESH_JOB",
  });
  throwDatabaseError(dirtyError, "Sitemap regeneration could not be scheduled.");
};

const processJob = async (client: SupabaseClient, job: JsonObject) => {
  switch (job.job_type) {
    case "cloudflare-create-hostname":
      return processCloudflareCreate(client, job);
    case "cloudflare-poll-ssl-status":
      return processCloudflarePoll(client, job);
    case "cloudflare-delete-hostname":
      return processCloudflareDelete(client, job);
    case "hostinger-purchase-domain":
      return processHostingerPurchase(client, job);
    case "hostinger-poll-transfer-status":
      return processTransferPoll(client, job);
    case "sitemap-refresh":
      return processSitemapRefresh(client, job);
    default:
      if (googleWorkflow.isGoogleJob(job.job_type)) {
        return googleWorkflow.processJob(client, job);
      }
      throw new DomainApiError(
        "JOB_HANDLER_NOT_IMPLEMENTED",
        `No handler is registered for ${String(job.job_type)}.`,
        500,
      );
  }
};

const runClaimedJobs = async (serviceClient: SupabaseClient, limit: number) => {
  const workerId = `domain-worker-${crypto.randomUUID()}`;
  const { data: jobs, error } = await serviceClient.rpc("claim_seo_sync_jobs", {
    p_worker: workerId,
    p_limit: limit,
  });
  throwDatabaseError(error, "Provider jobs could not be claimed.");
  const results: Array<{ id: string; status: string }> = [];
  for (const job of (jobs ?? []) as JsonObject[]) {
    try {
      await processJob(serviceClient, job);
      const { error: finishError } = await serviceClient.rpc("finish_seo_sync_job", {
        p_job_id: job.id,
        p_worker: workerId,
        p_success: true,
        p_error_code: null,
        p_error_message: null,
      });
      throwDatabaseError(finishError, "A completed job could not be finalized.");
      results.push({ id: String(job.id), status: "completed" });
    } catch (jobError) {
      const normalized = jobError instanceof DomainApiError
        ? jobError
        : new DomainApiError("PROVIDER_JOB_FAILED", "Provider job failed.", 500);
      const { data: finished, error: finishError } = await serviceClient.rpc(
        "finish_seo_sync_job",
        {
          p_job_id: job.id,
          p_worker: workerId,
          p_success: false,
          p_error_code: normalized.code,
          p_error_message: normalized.message,
        },
      );
      throwDatabaseError(finishError, "A failed job could not be finalized.");
      results.push({ id: String(job.id), status: String(finished?.status ?? "retry") });
    }
  }
  return { claimed: (jobs ?? []).length, results };
};

const scheduleBackgroundJobs = () => {
  const task = runClaimedJobs(createServiceClient(), 4).catch((error) => {
    console.error("Background domain job batch failed", error);
  });
  const runtime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
};

const processJobs = async (request: Request, body: JsonObject) => {
  if (!isCronRequest(request)) {
    throw new DomainApiError("CRON_AUTH_FAILED", "Job worker authentication failed.", 401);
  }
  const limit = Math.min(25, Math.max(1, Number(body.limit ?? 10) || 10));
  return runClaimedJobs(createServiceClient(), limit);
};

const requireCompilerRequest = (request: Request): void => {
  if (!isCronRequest(request)) {
    throw new DomainApiError("CRON_AUTH_FAILED", "SEO compiler authentication failed.", 401);
  }
};

const processSeoCompilerClaim = async (request: Request, body: JsonObject) => {
  requireCompilerRequest(request);
  const client = createServiceClient();
  const worker = `sitemap-worker-${crypto.randomUUID()}`;
  const limit = Math.min(5, Math.max(1, Number(body.limit ?? 2) || 2));
  const { data: rows, error } = await client.rpc("claim_dirty_sitemap_stores", {
    p_worker: worker,
    p_limit: limit,
    p_minimum_age_seconds: 120,
  });
  throwDatabaseError(error, "Dirty sitemap stores could not be claimed.");
  const claims: JsonObject[] = [];
  for (const row of (rows ?? []) as JsonObject[]) {
    const storeId = requireUuid(row.store_id, "storeId");
    try {
      const { data: snapshot, error: snapshotError } = await client.rpc(
        "get_sitemap_compile_snapshot",
        { p_store_id: storeId },
      );
      throwDatabaseError(snapshotError, "Sitemap compile snapshot could not be loaded.");
      const store = snapshot && typeof snapshot === "object"
        ? (snapshot as JsonObject).store as JsonObject | undefined
        : undefined;
      const hostname = typeof store?.primaryHostname === "string"
        ? normalizeHostname(store.primaryHostname)
        : "storeblink.com";
      const snapshotDirtyVersion = snapshot && typeof snapshot === "object"
        ? Number((snapshot as JsonObject).dirtyVersion)
        : Number.NaN;
      if (!Number.isSafeInteger(snapshotDirtyVersion) || snapshotDirtyVersion < 0) {
        throw new DomainApiError(
          "INVALID_SITEMAP_SNAPSHOT",
          "Sitemap snapshot version is invalid.",
          500,
        );
      }
      const storagePrefix = `stores/${storeId}/generations/${Date.now()}-${crypto.randomUUID()}`;
      const { data: generation, error: generationError } = await client.rpc(
        "begin_sitemap_generation",
        {
          p_store_id: storeId,
          p_hostname: hostname,
          p_storage_prefix: storagePrefix,
          p_source_dirty_version: snapshotDirtyVersion,
        },
      );
      throwDatabaseError(generationError, "Sitemap generation could not be started.");
      const generationRecord = Array.isArray(generation) ? generation[0] : generation;
      const generationId = generationRecord && typeof generationRecord === "object"
        ? String((generationRecord as JsonObject).id ?? "")
        : "";
      requireUuid(generationId, "generationId");
      claims.push({ storeId, generationId, storagePrefix, snapshot });
    } catch (claimError) {
      await client.rpc("release_sitemap_compile_lease", {
        p_store_id: storeId,
        p_worker: worker,
        p_error_code: "SITEMAP_CLAIM_FAILED",
        p_error_message: claimError instanceof Error ? claimError.message : "Sitemap claim failed.",
      });
      console.error("Sitemap claim preparation failed", { storeId });
    }
  }
  return claims;
};

const processSeoCompilerActivate = async (request: Request, body: JsonObject) => {
  requireCompilerRequest(request);
  const generationId = requireUuid(body.generationId, "generationId");
  const segments = Array.isArray(body.segments) ? body.segments : [];
  const urlCount = Number(body.urlCount);
  const contentHash = typeof body.contentHash === "string" ? body.contentHash : "";
  if (!segments.length || !Number.isInteger(urlCount) || urlCount < 1 || !/^[a-f0-9]{64}$/.test(contentHash)) {
    throw new DomainApiError("INVALID_SITEMAP_ACTIVATION", "Validated sitemap output is required.", 400);
  }
  for (const segment of segments) {
    if (!segment || typeof segment !== "object" || Array.isArray(segment)) {
      throw new DomainApiError("INVALID_SITEMAP_SEGMENT", "Sitemap segment metadata is invalid.", 400);
    }
    const value = segment as JsonObject;
    if (
      !["pages", "products", "collections", "blogs"].includes(String(value.type)) ||
      !Number.isInteger(Number(value.number)) || Number(value.number) < 1 ||
      !Number.isInteger(Number(value.urlCount)) || Number(value.urlCount) < 1 || Number(value.urlCount) > 25_000 ||
      !Number.isFinite(Number(value.uncompressedBytes)) || Number(value.uncompressedBytes) > 52_428_800 ||
      !/^[a-f0-9]{64}$/.test(String(value.contentHash ?? ""))
    ) {
      throw new DomainApiError("INVALID_SITEMAP_SEGMENT", "Sitemap segment metadata is invalid.", 400);
    }
  }
  const client = createServiceClient();
  const { data, error } = await client.rpc("activate_sitemap_generation", {
    p_generation_id: generationId,
    p_segments: segments,
    p_url_count: urlCount,
    p_content_hash: contentHash,
  });
  throwDatabaseError(error, "Sitemap generation could not be activated.");
  return data;
};

const processSeoCompilerFail = async (request: Request, body: JsonObject) => {
  requireCompilerRequest(request);
  const client = createServiceClient();
  const { error } = await client.rpc("fail_sitemap_generation", {
    p_generation_id: requireUuid(body.generationId, "generationId"),
    p_code: typeof body.code === "string" ? body.code : "SITEMAP_COMPILE_FAILED",
    p_message: typeof body.message === "string" ? body.message : "Sitemap compilation failed.",
    p_validation_errors: Array.isArray(body.validationErrors) ? body.validationErrors : [],
  });
  throwDatabaseError(error, "Sitemap failure state could not be saved.");
  return { failed: true };
};

const processSeoRollbackPrepare = async (request: Request, body: JsonObject) => {
  requireCompilerRequest(request);
  const storeId = requireUuid(body.storeId, "storeId");
  const generationId = requireUuid(body.generationId, "generationId");
  const client = createServiceClient();
  const { data: generation, error: generationError } = await client
    .from("sitemap_generations")
    .select("id,store_id,status,storage_prefix,hostname")
    .eq("id", generationId)
    .eq("store_id", storeId)
    .in("status", ["active", "rolled_back", "ready"])
    .maybeSingle();
  throwSeoDatabaseError(generationError, "Rollback generation could not be loaded.");
  if (!generation) {
    throw new DomainApiError("SITEMAP_GENERATION_NOT_FOUND", "Rollback generation not found.", 404);
  }
  const [{ data: store, error: storeError }, { data: primaryDomain, error: domainError }, segmentResult, configResult] =
    await Promise.all([
      client.from("stores").select("id,handle").eq("id", storeId).is("deleted_at", null).maybeSingle(),
      client.from("store_domains").select("hostname").eq("store_id", storeId)
        .eq("status", "active").eq("is_primary", true).maybeSingle(),
      client.from("sitemap_segments").select("segment_type,segment_number,object_key")
        .eq("generation_id", generationId).order("segment_type").order("segment_number"),
      client.from("indexnow_configurations").select("enabled,key_location_path")
        .eq("store_id", storeId).maybeSingle(),
    ]);
  throwSeoDatabaseError(storeError, "Store could not be loaded for sitemap rollback.");
  throwSeoDatabaseError(domainError, "Primary domain could not be loaded for sitemap rollback.");
  throwSeoDatabaseError(segmentResult.error, "Sitemap segments could not be loaded for rollback.");
  throwSeoDatabaseError(configResult.error, "IndexNow configuration could not be loaded.");
  if (!store || !segmentResult.data?.length) {
    throw new DomainApiError("SITEMAP_GENERATION_INCOMPLETE", "Rollback generation has no compiled segments.", 409);
  }
  const hostname = primaryDomain?.hostname
    ? normalizeHostname(primaryDomain.hostname)
    : "storeblink.com";
  if (normalizeHostname(generation.hostname) !== hostname) {
    throw new DomainApiError(
      "SITEMAP_GENERATION_DOMAIN_MISMATCH",
      "This generation belongs to an older primary domain and cannot be restored.",
      409,
    );
  }
  const files: Record<string, string> = {
    "/sitemap.xml": `${generation.storage_prefix}/sitemap.xml`,
  };
  for (const segment of segmentResult.data) {
    files[`/sitemap_${segment.segment_type}_${segment.segment_number}.xml`] = segment.object_key;
  }
  const canonicalOrigin = primaryDomain?.hostname
    ? `https://${hostname}`
    : `https://storeblink.com/store/${store.handle}`;
  const indexNowKeyPath = configResult.data?.enabled
    ? String(configResult.data.key_location_path)
    : null;
  if (indexNowKeyPath) files[indexNowKeyPath] = `${generation.storage_prefix}/indexnow-key.txt`;
  return {
    storeId,
    storeHandle: store.handle,
    generationId,
    canonicalOrigin,
    hostname,
    files,
    ...(indexNowKeyPath ? { indexNowKeyPath } : {}),
  };
};

const processSeoRollbackCommit = async (request: Request, body: JsonObject) => {
  requireCompilerRequest(request);
  const client = createServiceClient();
  const { data, error } = await client.rpc("rollback_sitemap_generation", {
    p_store_id: requireUuid(body.storeId, "storeId"),
    p_generation_id: requireUuid(body.generationId, "generationId"),
  });
  throwSeoDatabaseError(error, "Sitemap generation could not be restored.");
  return data;
};

const processIndexNowResult = async (request: Request, body: JsonObject) => {
  requireCompilerRequest(request);
  const storeId = requireUuid(body.storeId, "storeId");
  const generationId = requireUuid(body.generationId, "generationId");
  const hostname = normalizeHostname(body.hostname);
  const urls = Array.isArray(body.urls) ? body.urls : [];
  const status = body.status === "submitted" ? "submitted" : "failed";
  if (urls.length < 1 || urls.length > 10_000 || urls.some((value) => {
    if (typeof value !== "string") return true;
    try {
      const url = new URL(value);
      return url.protocol !== "https:" || normalizeHostname(url.hostname) !== hostname;
    } catch {
      return true;
    }
  })) {
    throw new DomainApiError("INVALID_INDEXNOW_BATCH", "IndexNow URLs are invalid.", 400);
  }
  const client = createServiceClient();
  const { error } = await client.from("indexnow_batches").insert({
    store_id: storeId,
    generation_id: generationId,
    hostname,
    urls,
    status,
    attempts: 1,
    submitted_at: status === "submitted" ? new Date().toISOString() : null,
    failure_code: status === "failed" ? "INDEXNOW_SUBMISSION_FAILED" : null,
    failure_message: status === "failed" && typeof body.failureMessage === "string"
      ? body.failureMessage.slice(0, 1000)
      : null,
  });
  throwDatabaseError(error, "IndexNow result could not be saved.");
  await client.from("indexnow_configurations").update({
    last_submitted_at: status === "submitted" ? new Date().toISOString() : null,
    last_failure_code: status === "failed" ? "INDEXNOW_SUBMISSION_FAILED" : null,
    last_failure_message: status === "failed" && typeof body.failureMessage === "string"
      ? body.failureMessage.slice(0, 1000)
      : null,
  }).eq("store_id", storeId);
  return { status };
};

const processSeoHealthCheck = async (request: Request) => {
  requireCompilerRequest(request);
  const client = createServiceClient();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from("sitemap_store_state")
    .select(
      "store_id,dirty_since,dirty_version,dirty_segments,last_compiled_at," +
        "last_failure_at,last_failure_code,last_failure_message",
    )
    .eq("dirty", true)
    .not("dirty_since", "is", null)
    .lt("dirty_since", cutoff)
    .order("dirty_since", { ascending: true })
    .limit(200);
  throwDatabaseError(error, "Sitemap health state could not be loaded.");

  const healthStates = (data ?? []) as unknown as JsonObject[];
  const incidents = healthStates.map((state) => {
    const dirtySince = String(state.dirty_since);
    const dirtyTimestamp = Date.parse(dirtySince);
    return {
      storeId: String(state.store_id),
      dirtySince,
      dirtyVersion: Number(state.dirty_version ?? 0),
      dirtySegments: Array.isArray(state.dirty_segments) ? state.dirty_segments : [],
      ageHours: Number.isFinite(dirtyTimestamp)
        ? Math.floor((Date.now() - dirtyTimestamp) / 3_600_000)
        : 24,
      lastCompiledAt: state.last_compiled_at ? String(state.last_compiled_at) : null,
      lastFailureAt: state.last_failure_at ? String(state.last_failure_at) : null,
      lastFailureCode: state.last_failure_code ? String(state.last_failure_code) : null,
      lastFailureMessage: state.last_failure_message
        ? String(state.last_failure_message).slice(0, 1000)
        : null,
    };
  });
  if (incidents.length) {
    const { error: eventError } = await client.from("domain_events").upsert(
      incidents.map((incident) => ({
        store_id: incident.storeId,
        event_type: "SEO_SITEMAP_STALE",
        event_key: `seo-sitemap-stale:${incident.storeId}:${incident.dirtyVersion}`,
        payload: {
          severity: "error",
          dirtySince: incident.dirtySince,
          ageHours: incident.ageHours,
          dirtySegments: incident.dirtySegments,
          lastFailureCode: incident.lastFailureCode,
          lastFailureMessage: incident.lastFailureMessage,
        },
      })),
      { onConflict: "event_key", ignoreDuplicates: true },
    );
    throwDatabaseError(eventError, "Sitemap health incidents could not be persisted.");
  }
  return incidents;
};

const throwSeoDatabaseError = (
  error: DatabaseError,
  fallback: string,
): void => {
  if (!error) return;
  console.error("SEO database operation failed", { code: error.code });
  if (error.code === "22023") {
    throw new DomainApiError("INVALID_SEO_CONFIGURATION", error.message || fallback, 400);
  }
  if (error.code === "P0002") {
    throw new DomainApiError("SEO_RESOURCE_NOT_FOUND", error.message || fallback, 404);
  }
  if (error.code === "42501") {
    throw new DomainApiError("DOMAIN_ACCESS_DENIED", "You cannot manage SEO for this store.", 403);
  }
  throw new DomainApiError("SEO_DATABASE_ERROR", fallback, 500);
};

const loadSeoDashboard = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const { data, error } = await context.userClient.rpc("get_seo_dashboard", {
    p_store_id: context.storeId,
  });
  throwSeoDatabaseError(error, "SEO dashboard data could not be loaded.");
  return data;
};

const updateSeoMetadata = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const resourceType = typeof body.resourceType === "string" ? body.resourceType : "";
  const resourceId = typeof body.resourceId === "string" ? body.resourceId : "";
  const metadata = body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
    ? body.metadata
    : null;
  if (!resourceType || !resourceId || !metadata) {
    throw new DomainApiError("INVALID_SEO_CONFIGURATION", "SEO metadata is incomplete.", 400);
  }
  const { error } = await context.userClient.rpc("update_seo_metadata", {
    p_store_id: context.storeId,
    p_resource_type: resourceType,
    p_resource_id: resourceId,
    p_metadata: metadata,
  });
  throwSeoDatabaseError(error, "SEO metadata could not be updated.");
  const { data: dashboard, error: dashboardError } = await context.userClient.rpc(
    "get_seo_dashboard",
    { p_store_id: context.storeId },
  );
  throwSeoDatabaseError(dashboardError, "Updated SEO data could not be loaded.");
  return dashboard;
};

const requestSeoRegeneration = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const { error } = await context.userClient.rpc("request_sitemap_regeneration", {
    p_store_id: context.storeId,
  });
  throwSeoDatabaseError(error, "Sitemap regeneration could not be requested.");
  const { data: dashboard, error: dashboardError } = await context.userClient.rpc(
    "get_seo_dashboard",
    { p_store_id: context.storeId },
  );
  throwSeoDatabaseError(dashboardError, "SEO dashboard data could not be loaded.");
  return dashboard;
};

const upsertSeoRedirect = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const { error } = await context.userClient.rpc("upsert_store_redirect", {
    p_store_id: context.storeId,
    p_source_path: body.sourcePath,
    p_destination_path: body.destinationPath,
    p_status_code: Number(body.statusCode ?? 301),
  });
  throwSeoDatabaseError(error, "Storefront redirect could not be saved.");
  const { data: dashboard, error: dashboardError } = await context.userClient.rpc(
    "get_seo_dashboard",
    { p_store_id: context.storeId },
  );
  throwSeoDatabaseError(dashboardError, "SEO dashboard data could not be loaded.");
  return dashboard;
};

const deleteSeoRedirect = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const { error } = await context.userClient.rpc("delete_store_redirect", {
    p_store_id: context.storeId,
    p_redirect_id: requireUuid(body.redirectId, "redirectId"),
  });
  throwSeoDatabaseError(error, "Storefront redirect could not be deleted.");
  const { data: dashboard, error: dashboardError } = await context.userClient.rpc(
    "get_seo_dashboard",
    { p_store_id: context.storeId },
  );
  throwSeoDatabaseError(dashboardError, "SEO dashboard data could not be loaded.");
  return dashboard;
};

const rollbackSeoGeneration = async (request: Request, body: JsonObject) => {
  const context = await createDomainContext(request, body.storeId, true);
  const generationId = requireUuid(body.generationId, "generationId");
  const { data: allowedGeneration, error: generationError } = await context.userClient
    .from("sitemap_generations")
    .select("id")
    .eq("id", generationId)
    .eq("store_id", context.storeId)
    .maybeSingle();
  throwSeoDatabaseError(generationError, "Sitemap generation could not be verified.");
  if (!allowedGeneration) {
    throw new DomainApiError("SITEMAP_GENERATION_NOT_FOUND", "Sitemap generation not found.", 404);
  }
  const secret = Deno.env.get("DOMAIN_CRON_SECRET")?.trim();
  const endpointValue = Deno.env.get("STOREFRONT_WORKER_INTERNAL_URL")?.trim() ||
    "https://storeblink.com/.storeblink/internal/seo/rollback";
  if (!secret) {
    throw new DomainApiError("SEO_ROLLBACK_UNAVAILABLE", "Sitemap rollback is not configured.", 503);
  }
  const endpoint = new URL(endpointValue);
  if (endpoint.protocol !== "https:" || endpoint.pathname !== "/.storeblink/internal/seo/rollback") {
    throw new DomainApiError("SEO_ROLLBACK_UNAVAILABLE", "Sitemap rollback endpoint is invalid.", 503);
  }
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-storeblink-cron-secret": secret,
    },
    body: JSON.stringify({ storeId: context.storeId, generationId }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response?.ok) {
    throw new DomainApiError(
      "SEO_ROLLBACK_FAILED",
      "The public sitemap generation could not be restored.",
      502,
    );
  }
  const { data: dashboard, error: dashboardError } = await context.userClient.rpc(
    "get_seo_dashboard",
    { p_store_id: context.storeId },
  );
  throwSeoDatabaseError(dashboardError, "SEO dashboard data could not be loaded.");
  return dashboard;
};

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return errorResponse(
      request,
      new DomainApiError("METHOD_NOT_ALLOWED", "Use POST for this endpoint.", 405),
    );
  }

  try {
    const body = await readJsonObject(request);
    const action = typeof body.action === "string" ? body.action : "";
    let result: unknown;
    switch (action) {
      case "status": {
        const context = await createDomainContext(request, body.storeId, false);
        result = await getDomainDashboard(context.serviceClient, context.storeId);
        scheduleBackgroundJobs();
        break;
      }
      case "connect-existing":
        result = await connectExistingDomain(request, body);
        scheduleBackgroundJobs();
        break;
      case "set-primary":
        result = await setPrimaryDomain(request, body);
        break;
      case "retry":
        result = await retryDomain(request, body);
        scheduleBackgroundJobs();
        break;
      case "disconnect":
        result = await disableDomain(request, body);
        break;
      case "search":
        result = await searchDomains(request, body);
        break;
      case "claim-included-domain":
        result = await claimIncludedDomain(request, body);
        scheduleBackgroundJobs();
        break;
      case "purchase-domain":
        result = await purchasePaidDomain(request, body);
        scheduleBackgroundJobs();
        break;
      case "initiate-included-transfer":
        result = await initiateIncludedTransfer(request, body);
        scheduleBackgroundJobs();
        break;
      case "google-connect":
        result = await googleWorkflow.beginConnection(request, body);
        break;
      case "google-oauth-callback":
        result = await googleWorkflow.completeConnection(request, body);
        scheduleBackgroundJobs();
        break;
      case "google-retry":
        result = await googleWorkflow.retry(request, body);
        scheduleBackgroundJobs();
        break;
      case "google-disconnect":
        result = await googleWorkflow.disconnect(request, body);
        break;
      case "process-jobs":
        result = await processJobs(request, body);
        break;
      case "seo-compiler-claim":
        result = await processSeoCompilerClaim(request, body);
        break;
      case "seo-compiler-activate":
        result = await processSeoCompilerActivate(request, body);
        break;
      case "seo-compiler-fail":
        result = await processSeoCompilerFail(request, body);
        break;
      case "seo-compiler-rollback-prepare":
        result = await processSeoRollbackPrepare(request, body);
        break;
      case "seo-compiler-rollback-commit":
        result = await processSeoRollbackCommit(request, body);
        break;
      case "seo-indexnow-result":
        result = await processIndexNowResult(request, body);
        break;
      case "seo-health-check":
        result = await processSeoHealthCheck(request);
        break;
      case "seo-dashboard":
        result = await loadSeoDashboard(request, body);
        break;
      case "seo-metadata-update":
        result = await updateSeoMetadata(request, body);
        break;
      case "seo-regenerate":
        result = await requestSeoRegeneration(request, body);
        break;
      case "seo-redirect-upsert":
        result = await upsertSeoRedirect(request, body);
        break;
      case "seo-redirect-delete":
        result = await deleteSeoRedirect(request, body);
        break;
      case "seo-rollback":
        result = await rollbackSeoGeneration(request, body);
        break;
      default:
        throw new DomainApiError("UNKNOWN_ACTION", "Unknown domain operation.", 404);
    }
    return jsonResponse(request, { data: result });
  } catch (error) {
    return errorResponse(request, error);
  }
});
