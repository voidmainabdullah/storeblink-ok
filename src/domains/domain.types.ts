import { z } from "zod";

export const domainStatusSchema = z.enum([
  "pending",
  "verification_pending",
  "provisioning",
  "ssl_pending",
  "active",
  "action_required",
  "failed",
  "disabled",
]);

const providerCapabilitySchema = z.object({
  available: z.boolean(),
  reason: z.string().nullable(),
});

const verificationSchema = z.object({
  domain_id: z.string().uuid(),
  method: z.enum(["cname", "txt", "http"]),
  record_name: z.string(),
  record_type: z.enum(["CNAME", "TXT"]),
  record_value: z.string(),
  status: z.string(),
  expires_at: z.string(),
  verified_at: z.string().nullable().optional(),
  last_error: z.string().nullable().optional(),
});

const certificateSchema = z.object({
  domain_id: z.string().uuid(),
  hostname_status: z.string(),
  ssl_status: z.string(),
  ownership_status: z.string(),
  validation_method: z.string(),
  validation_records: z.array(z.record(z.unknown())),
  last_synced_at: z.string().nullable(),
});

export const connectedDomainSchema = z.object({
  id: z.string().uuid(),
  hostname: z.string(),
  source: z.enum(["existing", "hostinger_purchase", "hostinger_transfer", "platform"]),
  status: domainStatusSchema,
  verification_status: z.string(),
  dns_status: z.string(),
  ssl_status: z.string(),
  seo_status: z.string(),
  is_primary: z.boolean(),
  redirect_to_primary: z.boolean(),
  cname_target: z.string(),
  claim_expires_at: z.string(),
  activated_at: z.string().nullable(),
  last_checked_at: z.string().nullable(),
  failure_code: z.string().nullable(),
  failure_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  verification: verificationSchema.nullable(),
  certificate: certificateSchema.nullable(),
});

const domainPurchaseOrderSchema = z.object({
  id: z.string().uuid(),
  domain_id: z.string().uuid().nullable(),
  hostname: z.string(),
  purchase_kind: z.enum(["included", "paid"]),
  status: z.enum(["requested", "submitted", "pending_setup", "active", "failed", "cancelled"]),
  quoted_amount_minor: z.number().int().nonnegative().nullable(),
  final_amount_minor: z.number().int().nonnegative().nullable(),
  currency: z.string().nullable(),
  provider_status: z.string().nullable(),
  failure_code: z.string().nullable(),
  failure_message: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const domainDashboardSchema = z.object({
  storeId: z.string().uuid(),
  domains: z.array(connectedDomainSchema),
  purchaseOrders: z.array(domainPurchaseOrderSchema),
  transferRequests: z.array(z.record(z.unknown())),
  google: z.record(z.unknown()),
  siteVerifications: z.array(z.record(z.unknown())),
  searchConsoleProperties: z.array(z.record(z.unknown())),
  sitemapSubmissions: z.array(z.record(z.unknown())),
  searchMetrics: z.array(z.record(z.unknown())),
  urlInspectionResults: z.array(z.record(z.unknown())).default([]),
  capabilities: z.object({
    existingDomain: providerCapabilitySchema,
    domainSearch: providerCapabilitySchema,
    includedRegistration: providerCapabilitySchema,
    paidRegistration: providerCapabilitySchema,
    includedTransfer: providerCapabilitySchema,
    googleSearch: providerCapabilitySchema,
  }),
  generatedAt: z.string(),
});

export const googleAuthorizationSchema = z.object({
  authorizationUrl: z.string().url().refine(
    (value) => new URL(value).hostname === "accounts.google.com",
    "Unexpected Google authorization host.",
  ),
  expiresAt: z.string().datetime(),
});

export const domainSearchResultSchema = z.object({
  domain: z.string().nullable(),
  available: z.boolean(),
  alternative: z.boolean(),
  restriction: z.string().nullable(),
  quote: z.object({
    id: z.string().uuid(),
    amountMinor: z.number().int().nonnegative(),
    renewalAmountMinor: z.number().int().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    period: z.number().int().positive(),
    periodUnit: z.enum(["day", "week", "month", "year", "none"]),
    expiresAt: z.string().datetime(),
  }).nullable(),
  quoteUnavailableReason: z.string().nullable(),
});

export type ConnectedDomain = z.infer<typeof connectedDomainSchema>;
export type DomainDashboard = z.infer<typeof domainDashboardSchema>;
export type DomainPurchaseOrder = z.infer<typeof domainPurchaseOrderSchema>;
export type DomainSearchResult = z.infer<typeof domainSearchResultSchema>;
export type DomainStatus = z.infer<typeof domainStatusSchema>;
export type GoogleAuthorization = z.infer<typeof googleAuthorizationSchema>;
