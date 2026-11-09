-- StoreBlink custom-domain, provider orchestration, and SEO platform foundation.
-- Provider credentials and token ciphertext remain service-only. Merchant clients
-- receive sanitized state through the domain-orchestrator Edge Function.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.normalize_domain_hostname(p_hostname text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
DECLARE
  normalized text := lower(trim(both from p_hostname));
  label text;
BEGIN
  normalized := regexp_replace(normalized, '\.$', '');
  IF length(normalized) < 4 OR length(normalized) > 253 THEN
    RAISE EXCEPTION 'Invalid domain hostname' USING ERRCODE = '22023';
  END IF;
  IF normalized ~ '://|[/\\@:#?]' OR normalized !~ '^[a-z0-9.-]+$' THEN
    RAISE EXCEPTION 'Invalid domain hostname' USING ERRCODE = '22023';
  END IF;
  IF normalized !~ '^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$' THEN
    RAISE EXCEPTION 'Invalid domain hostname' USING ERRCODE = '22023';
  END IF;
  FOREACH label IN ARRAY string_to_array(normalized, '.') LOOP
    IF length(label) > 63 OR label LIKE '-%' OR label LIKE '%-' THEN
      RAISE EXCEPTION 'Invalid domain hostname' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF normalized IN ('localhost', 'example.com', 'example.net', 'example.org')
    OR normalized LIKE '%.localhost'
    OR normalized LIKE '%.local'
    OR normalized LIKE '%.internal'
    OR normalized LIKE '%.invalid'
    OR normalized LIKE '%.test'
  THEN
    RAISE EXCEPTION 'Reserved domains cannot be connected' USING ERRCODE = '22023';
  END IF;
  RETURN normalized;
END;
$$;

CREATE TABLE public.store_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  source text NOT NULL DEFAULT 'existing'
    CHECK (source IN ('existing', 'hostinger_purchase', 'hostinger_transfer', 'platform')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending', 'verification_pending', 'provisioning', 'ssl_pending',
      'active', 'action_required', 'failed', 'disabled'
    )),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'validating', 'verified', 'failed', 'expired')),
  dns_status text NOT NULL DEFAULT 'pending'
    CHECK (dns_status IN ('pending', 'configured', 'active', 'misconfigured', 'failed')),
  ssl_status text NOT NULL DEFAULT 'pending'
    CHECK (ssl_status IN (
      'pending', 'initializing', 'pending_validation', 'pending_issuance',
      'pending_deployment', 'active', 'failed', 'expired'
    )),
  seo_status text NOT NULL DEFAULT 'waiting_for_domain'
    CHECK (seo_status IN (
      'waiting_for_domain', 'domain_ready', 'waiting_for_google',
      'verification_token_ready', 'google_verified', 'property_added',
      'sitemap_ready', 'sitemap_submitted', 'monitoring', 'error'
    )),
  is_primary boolean NOT NULL DEFAULT false,
  redirect_to_primary boolean NOT NULL DEFAULT true,
  cname_target text NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  claim_expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  activated_at timestamptz,
  last_checked_at timestamptz,
  provider_updated_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_domains_normalized_hostname CHECK (
    hostname = private.normalize_domain_hostname(hostname)
  )
);

CREATE UNIQUE INDEX store_domains_hostname_uidx ON public.store_domains(hostname);
CREATE UNIQUE INDEX store_domains_primary_per_store_uidx
  ON public.store_domains(store_id) WHERE is_primary;
CREATE INDEX store_domains_store_status_idx ON public.store_domains(store_id, status, updated_at DESC);
CREATE INDEX store_domains_pending_idx
  ON public.store_domains(status, last_checked_at NULLS FIRST)
  WHERE status NOT IN ('active', 'disabled');

CREATE TABLE public.domain_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.store_domains(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('cname', 'txt', 'http')),
  record_name text NOT NULL,
  record_type text NOT NULL CHECK (record_type IN ('CNAME', 'TXT')),
  record_value text NOT NULL,
  token_hash text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validating', 'verified', 'failed', 'expired')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_id, method)
);
CREATE INDEX domain_verifications_store_idx ON public.domain_verifications(store_id, status);

CREATE TABLE public.cloudflare_custom_hostnames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL UNIQUE REFERENCES public.store_domains(id) ON DELETE CASCADE,
  cloudflare_hostname_id text UNIQUE,
  hostname_status text NOT NULL DEFAULT 'pending',
  ssl_status text NOT NULL DEFAULT 'pending',
  ownership_status text NOT NULL DEFAULT 'pending',
  validation_method text NOT NULL DEFAULT 'http' CHECK (validation_method IN ('http', 'txt', 'email')),
  validation_records jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cloudflare_custom_hostnames_store_idx
  ON public.cloudflare_custom_hostnames(store_id, ssl_status);

CREATE TABLE public.domain_registration_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  provider text NOT NULL DEFAULT 'hostinger' CHECK (provider = 'hostinger'),
  provider_item_id text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  renewal_amount_minor integer NOT NULL CHECK (renewal_amount_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  period integer NOT NULL CHECK (period > 0),
  period_unit text NOT NULL CHECK (period_unit IN ('day', 'week', 'month', 'year', 'none')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'used', 'expired')),
  quoted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX domain_registration_quotes_lookup_idx
  ON public.domain_registration_quotes(store_id, hostname, status, expires_at DESC);

CREATE TABLE public.domain_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.store_domains(id) ON DELETE SET NULL,
  hostname text NOT NULL,
  provider text NOT NULL DEFAULT 'hostinger' CHECK (provider = 'hostinger'),
  purchase_kind text NOT NULL DEFAULT 'included' CHECK (purchase_kind IN ('included', 'paid')),
  quote_id uuid REFERENCES public.domain_registration_quotes(id) ON DELETE SET NULL,
  provider_item_id text,
  provider_order_id text,
  quoted_amount_minor integer CHECK (quoted_amount_minor IS NULL OR quoted_amount_minor >= 0),
  final_amount_minor integer CHECK (final_amount_minor IS NULL OR final_amount_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  provider_status text,
  provider_requested_at timestamptz,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'submitted', 'pending_setup', 'active', 'failed', 'cancelled')),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, hostname)
);

CREATE TABLE public.domain_transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.store_domains(id) ON DELETE SET NULL,
  hostname text NOT NULL,
  provider text NOT NULL DEFAULT 'hostinger' CHECK (provider = 'hostinger'),
  provider_transfer_id text,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested', 'submitted', 'awaiting_registrant', 'transferring',
      'completed', 'failed', 'cancelled'
    )),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmation_email_masked text,
  initiated_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, hostname)
);

CREATE TABLE public.google_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE CASCADE,
  google_account_email text,
  refresh_token_ciphertext text,
  token_key_version integer,
  granted_scopes text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'connecting', 'connected', 'reauthorization_required', 'failed')),
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token_expires_at timestamptz,
  last_synced_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.google_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state_hash text NOT NULL UNIQUE,
  return_to text NOT NULL DEFAULT '/domain/connect/status',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.google_site_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.store_domains(id) ON DELETE CASCADE,
  method text NOT NULL DEFAULT 'META' CHECK (method IN ('META', 'DNS_TXT')),
  token_ciphertext text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'token_ready', 'verified', 'failed')),
  verified_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_id)
);

CREATE TABLE public.search_console_properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.store_domains(id) ON DELETE CASCADE,
  site_url text NOT NULL,
  permission_level text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'permission_lost', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_id, site_url)
);

CREATE TABLE public.sitemap_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.store_domains(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.search_console_properties(id) ON DELETE SET NULL,
  sitemap_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'submitted', 'failed')),
  submitted_at timestamptz,
  last_checked_at timestamptz,
  discovered_urls integer CHECK (discovered_urls IS NULL OR discovered_urls >= 0),
  indexed_urls integer CHECK (indexed_urls IS NULL OR indexed_urls >= 0),
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_id, sitemap_url)
);

CREATE TABLE public.search_console_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.store_domains(id) ON DELETE CASCADE,
  metric_date date NOT NULL,
  clicks numeric NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  impressions numeric NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  ctr numeric NOT NULL DEFAULT 0 CHECK (ctr >= 0),
  average_position numeric,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_id, metric_date, dimensions)
);

CREATE TABLE public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.store_domains(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX domain_events_unprocessed_idx ON public.domain_events(occurred_at) WHERE processed_at IS NULL;

CREATE TABLE public.seo_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.store_domains(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN (
    'verify-domain', 'provision-domain', 'cloudflare-create-hostname',
    'cloudflare-delete-hostname',
    'cloudflare-poll-ssl-status', 'hostinger-purchase-domain',
    'hostinger-poll-domain-status', 'hostinger-poll-transfer-status',
    'google-site-verify', 'google-property-create', 'sitemap-refresh',
    'sitemap-submit', 'search-console-sync', 'url-inspection-sync'
  )),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'retry', 'completed', 'cancelled', 'dead')),
  idempotency_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 12 CHECK (max_attempts BETWEEN 1 AND 240),
  run_after timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error_code text,
  last_error_message text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX seo_sync_jobs_runnable_idx
  ON public.seo_sync_jobs(run_after, created_at)
  WHERE status IN ('queued', 'retry');

CREATE TABLE public.platform_staff (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('support', 'operations', 'infra_admin', 'security_admin')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.platform_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('cloudflare', 'hostinger', 'google')),
  credential_name text NOT NULL,
  ciphertext text NOT NULL,
  key_version integer NOT NULL,
  last_four text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'rotating', 'revoked')),
  created_by uuid NOT NULL REFERENCES public.platform_staff(user_id) ON DELETE RESTRICT,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, credential_name)
);

CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES public.platform_staff(user_id) ON DELETE SET NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  before_state jsonb,
  after_state jsonb,
  request_id text,
  source_ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON public.admin_audit_log(created_at DESC);

CREATE OR REPLACE FUNCTION private.domain_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'store_domains', 'domain_verifications', 'cloudflare_custom_hostnames',
    'domain_registration_quotes', 'domain_purchase_orders', 'domain_transfer_requests', 'google_integrations',
    'google_site_verifications', 'search_console_properties', 'sitemap_submissions',
    'seo_sync_jobs', 'platform_staff', 'platform_credentials'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS domain_set_updated_at ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER domain_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.domain_set_updated_at()',
      table_name
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_domain_management(
  p_store_id uuid,
  p_require_aal2 boolean DEFAULT true
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
  SELECT auth.uid() IS NOT NULL
    AND private.has_store_capability(p_store_id, 'domains.manage', auth.uid())
    AND (NOT p_require_aal2 OR private.has_aal2());
$$;

CREATE OR REPLACE FUNCTION public.resolve_public_storefront_by_domain(p_hostname text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  requested_hostname text;
  domain_row public.store_domains%ROWTYPE;
  primary_hostname text;
  store_row public.stores%ROWTYPE;
BEGIN
  BEGIN
    requested_hostname := private.normalize_domain_hostname(p_hostname);
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  SELECT * INTO domain_row
  FROM public.store_domains d
  WHERE d.hostname = requested_hostname
    AND d.status = 'active';
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT * INTO store_row
  FROM public.stores s
  WHERE s.id = domain_row.store_id
    AND s.status = 'published'
    AND s.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT d.hostname INTO primary_hostname
  FROM public.store_domains d
  WHERE d.store_id = store_row.id
    AND d.is_primary
    AND d.status = 'active'
  LIMIT 1;

  RETURN jsonb_build_object(
    'storeId', store_row.id,
    'storeHandle', store_row.handle,
    'requestedHostname', requested_hostname,
    'primaryHostname', COALESCE(primary_hostname, requested_hostname),
    'redirectRequired', domain_row.redirect_to_primary
      AND primary_hostname IS NOT NULL
      AND primary_hostname <> requested_hostname
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_paid_domain_purchase_order(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_quote_id uuid
)
RETURNS public.domain_purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  selected_quote public.domain_registration_quotes%ROWTYPE;
  existing_order public.domain_purchase_orders%ROWTYPE;
  created_order public.domain_purchase_orders%ROWTYPE;
BEGIN
  IF NOT private.has_store_capability(p_store_id, 'domains.manage', p_actor_user_id)
     OR NOT private.has_store_capability(p_store_id, 'billing.manage', p_actor_user_id) THEN
    RAISE EXCEPTION 'Domain purchase is not permitted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO selected_quote
  FROM public.domain_registration_quotes
  WHERE id = p_quote_id AND store_id = p_store_id
  FOR UPDATE;

  IF NOT FOUND OR selected_quote.status <> 'open' OR selected_quote.expires_at <= now() THEN
    IF FOUND AND selected_quote.status = 'open' THEN
      UPDATE public.domain_registration_quotes SET status = 'expired' WHERE id = selected_quote.id;
    END IF;
    RAISE EXCEPTION 'Registration quote is invalid or expired' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.store_domains
    WHERE hostname = selected_quote.hostname AND status <> 'disabled'
  ) THEN
    RAISE EXCEPTION 'Domain is already claimed' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO existing_order
  FROM public.domain_purchase_orders
  WHERE store_id = p_store_id AND hostname = selected_quote.hostname
  FOR UPDATE;

  IF FOUND AND existing_order.status NOT IN ('failed', 'cancelled') THEN
    RAISE EXCEPTION 'Purchase is already being processed' USING ERRCODE = '23505';
  END IF;

  IF FOUND THEN
    UPDATE public.domain_purchase_orders
    SET domain_id = NULL,
        purchase_kind = 'paid',
        quote_id = selected_quote.id,
        provider_item_id = selected_quote.provider_item_id,
        provider_order_id = NULL,
        quoted_amount_minor = selected_quote.amount_minor,
        final_amount_minor = NULL,
        currency = selected_quote.currency,
        provider_status = NULL,
        provider_requested_at = NULL,
        status = 'requested',
        requested_by = p_actor_user_id,
        failure_code = NULL,
        failure_message = NULL
    WHERE id = existing_order.id
    RETURNING * INTO created_order;
  ELSE
    INSERT INTO public.domain_purchase_orders(
      store_id, hostname, purchase_kind, quote_id, provider_item_id,
      quoted_amount_minor, currency, status, requested_by
    ) VALUES (
      p_store_id, selected_quote.hostname, 'paid', selected_quote.id,
      selected_quote.provider_item_id, selected_quote.amount_minor,
      selected_quote.currency, 'requested', p_actor_user_id
    ) RETURNING * INTO created_order;
  END IF;

  UPDATE public.domain_registration_quotes
  SET status = 'used', used_at = now()
  WHERE id = selected_quote.id;

  RETURN created_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_existing_domain_claim(
  p_store_id uuid,
  p_actor_user_id uuid,
  p_hostname text,
  p_cname_target text
)
RETURNS public.store_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  normalized_hostname text := private.normalize_domain_hostname(p_hostname);
  normalized_target text := private.normalize_domain_hostname(p_cname_target);
  existing_domain public.store_domains%ROWTYPE;
  created_domain public.store_domains%ROWTYPE;
BEGIN
  IF NOT private.has_store_capability(p_store_id, 'domains.manage', p_actor_user_id) THEN
    RAISE EXCEPTION 'Domain management is not permitted' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_domain
  FROM public.store_domains
  WHERE hostname = normalized_hostname
  FOR UPDATE;

  IF FOUND THEN
    IF existing_domain.store_id = p_store_id THEN
      IF existing_domain.status = 'disabled' THEN
        IF EXISTS (
          SELECT 1 FROM public.cloudflare_custom_hostnames
          WHERE domain_id = existing_domain.id
        ) THEN
          RAISE EXCEPTION 'Domain disconnection is still being finalized' USING ERRCODE = '55000';
        END IF;

        UPDATE public.store_domains
        SET status = 'verification_pending',
            verification_status = 'pending',
            dns_status = 'pending',
            ssl_status = 'pending',
            seo_status = 'waiting_for_domain',
            is_primary = false,
            cname_target = normalized_target,
            created_by = p_actor_user_id,
            claim_expires_at = now() + interval '24 hours',
            activated_at = NULL,
            last_checked_at = NULL,
            failure_code = NULL,
            failure_message = NULL
        WHERE id = existing_domain.id
        RETURNING * INTO existing_domain;

        INSERT INTO public.domain_verifications(
          store_id, domain_id, method, record_name, record_type, record_value,
          status, expires_at, verified_at, last_error
        ) VALUES (
          p_store_id, existing_domain.id, 'cname', normalized_hostname, 'CNAME',
          normalized_target, 'pending', now() + interval '24 hours', NULL, NULL
        )
        ON CONFLICT (domain_id, method) DO UPDATE
        SET record_name = EXCLUDED.record_name,
            record_type = EXCLUDED.record_type,
            record_value = EXCLUDED.record_value,
            status = 'pending',
            expires_at = EXCLUDED.expires_at,
            verified_at = NULL,
            last_error = NULL;

        INSERT INTO public.cloudflare_custom_hostnames(store_id, domain_id)
        VALUES (p_store_id, existing_domain.id);

        INSERT INTO public.seo_sync_jobs(
          store_id, domain_id, job_type, idempotency_key, max_attempts,
          payload
        ) VALUES (
          p_store_id,
          existing_domain.id,
          'cloudflare-create-hostname',
          'cloudflare-create-hostname:' || existing_domain.id || ':reconnect:' || txid_current(),
          12,
          jsonb_build_object('hostname', normalized_hostname)
        );
      END IF;
      RETURN existing_domain;
    END IF;
    IF existing_domain.status <> 'active' AND existing_domain.claim_expires_at < now() THEN
      DELETE FROM public.store_domains WHERE id = existing_domain.id;
    ELSE
      RAISE EXCEPTION 'Domain is already claimed' USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.store_domains(
    store_id, hostname, source, status, verification_status, dns_status,
    ssl_status, seo_status, cname_target, created_by
  ) VALUES (
    p_store_id, normalized_hostname, 'existing', 'verification_pending',
    'pending', 'pending', 'pending', 'waiting_for_domain', normalized_target,
    p_actor_user_id
  ) RETURNING * INTO created_domain;

  INSERT INTO public.domain_verifications(
    store_id, domain_id, method, record_name, record_type, record_value
  ) VALUES (
    p_store_id, created_domain.id, 'cname', normalized_hostname, 'CNAME', normalized_target
  );

  INSERT INTO public.cloudflare_custom_hostnames(store_id, domain_id)
  VALUES (p_store_id, created_domain.id);

  INSERT INTO public.seo_sync_jobs(
    store_id, domain_id, job_type, idempotency_key, max_attempts,
    payload
  ) VALUES (
    p_store_id,
    created_domain.id,
    'cloudflare-create-hostname',
    'cloudflare-create-hostname:' || created_domain.id,
    12,
    jsonb_build_object('hostname', normalized_hostname)
  );

  RETURN created_domain;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_primary_store_domain(
  p_store_id uuid,
  p_domain_id uuid
)
RETURNS public.store_domains
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE selected_domain public.store_domains%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.store_domains WHERE store_id = p_store_id FOR UPDATE;
  SELECT * INTO selected_domain
  FROM public.store_domains
  WHERE id = p_domain_id AND store_id = p_store_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only an active domain can be primary' USING ERRCODE = '22023';
  END IF;
  UPDATE public.store_domains SET is_primary = false
  WHERE store_id = p_store_id AND is_primary;
  UPDATE public.store_domains SET is_primary = true
  WHERE id = p_domain_id
  RETURNING * INTO selected_domain;
  RETURN selected_domain;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_seo_sync_jobs(
  p_worker text,
  p_limit integer DEFAULT 10
)
RETURNS SETOF public.seo_sync_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH candidates AS (
    SELECT id
    FROM public.seo_sync_jobs
    WHERE status IN ('queued', 'retry')
      AND run_after <= now()
      AND (locked_at IS NULL OR locked_at < now() - interval '10 minutes')
    ORDER BY run_after, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(p_limit, 1), 50)
  ), claimed AS (
    UPDATE public.seo_sync_jobs jobs
    SET status = 'running',
        attempts = jobs.attempts + 1,
        locked_at = now(),
        locked_by = left(p_worker, 120),
        updated_at = now()
    FROM candidates
    WHERE jobs.id = candidates.id
    RETURNING jobs.*
  )
  SELECT * FROM claimed;
$$;

CREATE OR REPLACE FUNCTION public.finish_seo_sync_job(
  p_job_id uuid,
  p_worker text,
  p_success boolean,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS public.seo_sync_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE job public.seo_sync_jobs%ROWTYPE;
BEGIN
  UPDATE public.seo_sync_jobs
  SET status = CASE
        WHEN p_success THEN 'completed'
        WHEN attempts >= max_attempts THEN 'dead'
        ELSE 'retry'
      END,
      run_after = CASE
        WHEN p_success OR attempts >= max_attempts THEN run_after
        ELSE now() + make_interval(secs => LEAST(3600, (power(2, attempts)::integer * 15)))
      END,
      completed_at = CASE WHEN p_success THEN now() ELSE NULL END,
      last_error_code = CASE WHEN p_success THEN NULL ELSE left(p_error_code, 120) END,
      last_error_message = CASE WHEN p_success THEN NULL ELSE left(p_error_message, 1000) END,
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
  WHERE id = p_job_id AND locked_by = left(p_worker, 120)
  RETURNING * INTO job;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job is not owned by this worker' USING ERRCODE = '42501';
  END IF;
  RETURN job;
END;
$$;

CREATE OR REPLACE FUNCTION private.capture_domain_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.domain_events(store_id, domain_id, event_type, event_key, payload)
    VALUES (NEW.store_id, NEW.id, 'DOMAIN_ADDED', 'domain-added:' || NEW.id, jsonb_build_object('hostname', NEW.hostname))
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status = 'active' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.domain_events(store_id, domain_id, event_type, event_key, payload)
    VALUES (NEW.store_id, NEW.id, 'DOMAIN_ACTIVATED', 'domain-active:' || NEW.id, jsonb_build_object('hostname', NEW.hostname))
    ON CONFLICT (event_key) DO NOTHING;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.is_primary AND OLD.is_primary IS DISTINCT FROM NEW.is_primary THEN
    INSERT INTO public.domain_events(store_id, domain_id, event_type, event_key, payload)
    VALUES (
      NEW.store_id,
      NEW.id,
      'PRIMARY_DOMAIN_CHANGED',
      'domain-primary:' || NEW.id || ':' || extract(epoch FROM NEW.updated_at)::bigint,
      jsonb_build_object('hostname', NEW.hostname)
    ) ON CONFLICT (event_key) DO NOTHING;
    INSERT INTO public.seo_sync_jobs(store_id, domain_id, job_type, idempotency_key)
    VALUES (
      NEW.store_id,
      NEW.id,
      'sitemap-refresh',
      'sitemap-primary:' || NEW.store_id || ':' || extract(epoch FROM NEW.updated_at)::bigint
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER store_domains_capture_events
AFTER INSERT OR UPDATE OF status, is_primary ON public.store_domains
FOR EACH ROW EXECUTE FUNCTION private.capture_domain_events();

CREATE OR REPLACE FUNCTION private.enqueue_sitemap_refresh()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  target_store_id uuid;
  resource_id text;
BEGIN
  target_store_id := NULLIF(row_data ->> 'store_id', '')::uuid;
  IF target_store_id IS NULL THEN
    target_store_id := NULLIF(row_data ->> 'user_id', '')::uuid;
  END IF;
  IF target_store_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  resource_id := COALESCE(row_data ->> 'id', txid_current()::text);
  INSERT INTO public.seo_sync_jobs(store_id, job_type, idempotency_key, payload)
  VALUES (
    target_store_id,
    'sitemap-refresh',
    'sitemap:' || TG_TABLE_NAME || ':' || TG_OP || ':' || resource_id || ':' || txid_current(),
    jsonb_build_object('sourceTable', TG_TABLE_NAME, 'operation', TG_OP, 'resourceId', resource_id)
  ) ON CONFLICT (idempotency_key) DO NOTHING;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['items', 'store_pages', 'store_collections', 'store_redirects'] LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS enqueue_sitemap_refresh ON public.%I', table_name);
      EXECUTE format(
        'CREATE TRIGGER enqueue_sitemap_refresh AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.enqueue_sitemap_refresh()',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.store_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloudflare_custom_hostnames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_registration_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_site_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_console_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitemap_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_console_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_domains_merchant_read ON public.store_domains
FOR SELECT TO authenticated
USING (private.has_store_capability(store_id, 'domains.manage', auth.uid()));

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'domain_verifications', 'cloudflare_custom_hostnames', 'domain_purchase_orders',
    'domain_transfer_requests', 'google_integrations', 'google_oauth_states',
    'google_site_verifications', 'search_console_properties', 'sitemap_submissions',
    'search_console_metrics', 'domain_events', 'seo_sync_jobs'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_store_capability(store_id, ''domains.manage'', auth.uid()))',
      table_name || '_merchant_read',
      table_name
    );
  END LOOP;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'store_domains', 'domain_verifications', 'cloudflare_custom_hostnames',
    'domain_registration_quotes', 'domain_purchase_orders', 'domain_transfer_requests', 'google_integrations',
    'google_oauth_states', 'google_site_verifications', 'search_console_properties',
    'sitemap_submissions', 'search_console_metrics', 'domain_events', 'seo_sync_jobs',
    'platform_staff', 'platform_credentials', 'admin_audit_log'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', table_name);
  END LOOP;
END;
$$;

-- Browser clients can read only merchant-safe status projections. Tables that
-- contain provider payloads, token ciphertext, OAuth state, or worker internals
-- remain service-role only even when a tenant RLS policy would otherwise match.
GRANT SELECT ON public.store_domains TO authenticated;
GRANT SELECT ON public.domain_verifications TO authenticated;
GRANT SELECT ON public.domain_purchase_orders TO authenticated;
GRANT SELECT ON public.domain_transfer_requests TO authenticated;
GRANT SELECT ON public.google_site_verifications TO authenticated;
GRANT SELECT ON public.search_console_properties TO authenticated;
GRANT SELECT ON public.sitemap_submissions TO authenticated;
GRANT SELECT ON public.search_console_metrics TO authenticated;

REVOKE ALL ON FUNCTION public.authorize_domain_management(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.authorize_domain_management(uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_public_storefront_by_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_public_storefront_by_domain(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_existing_domain_claim(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_existing_domain_claim(uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_paid_domain_purchase_order(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_paid_domain_purchase_order(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.set_primary_store_domain(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_primary_store_domain(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_seo_sync_jobs(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_seo_sync_jobs(text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.finish_seo_sync_job(uuid, text, boolean, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_seo_sync_job(uuid, text, boolean, text, text) TO service_role;

COMMENT ON TABLE public.store_domains IS 'Tenant domain lifecycle and sanitized status. Provider details live in dedicated restricted tables.';
COMMENT ON TABLE public.seo_sync_jobs IS 'Idempotent provider and SEO job outbox with bounded retries and dead-letter status.';
COMMENT ON FUNCTION public.resolve_public_storefront_by_domain(text) IS 'Narrow anonymous host-to-published-store resolver for custom-domain routing.';
