-- Production Google Search automation for active StoreBlink storefront domains.
-- OAuth credentials and verification tokens remain service-role only and encrypted.

DELETE FROM public.google_oauth_states;

ALTER TABLE public.google_oauth_states
  ADD COLUMN IF NOT EXISTS code_verifier_ciphertext text,
  ADD COLUMN IF NOT EXISTS code_challenge_method text NOT NULL DEFAULT 'S256',
  ADD COLUMN IF NOT EXISTS redirect_uri text NOT NULL
    DEFAULT 'https://storeblink.com/domain/connect/google/callback';

ALTER TABLE public.google_oauth_states
  ALTER COLUMN code_verifier_ciphertext SET NOT NULL;

ALTER TABLE public.google_oauth_states
  DROP CONSTRAINT IF EXISTS google_oauth_states_code_challenge_method_check;
ALTER TABLE public.google_oauth_states
  ADD CONSTRAINT google_oauth_states_code_challenge_method_check
  CHECK (code_challenge_method = 'S256');

CREATE INDEX IF NOT EXISTS google_oauth_states_expiry_idx
  ON public.google_oauth_states(expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.search_console_properties
  ADD COLUMN IF NOT EXISTS last_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_code text,
  ADD COLUMN IF NOT EXISTS failure_message text;

CREATE TABLE IF NOT EXISTS public.url_inspection_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES public.store_domains(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.search_console_properties(id) ON DELETE SET NULL,
  inspected_url text NOT NULL,
  verdict text NOT NULL DEFAULT 'VERDICT_UNSPECIFIED',
  coverage_state text,
  robots_txt_state text,
  indexing_state text,
  page_fetch_state text,
  crawled_as text,
  last_crawl_time timestamptz,
  google_canonical text,
  user_canonical text,
  inspection_result_link text,
  last_checked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain_id, inspected_url)
);

CREATE INDEX IF NOT EXISTS url_inspection_results_store_checked_idx
  ON public.url_inspection_results(store_id, last_checked_at DESC);
CREATE INDEX IF NOT EXISTS url_inspection_results_domain_verdict_idx
  ON public.url_inspection_results(domain_id, verdict, last_checked_at DESC);

DROP TRIGGER IF EXISTS domain_set_updated_at ON public.url_inspection_results;
CREATE TRIGGER domain_set_updated_at
BEFORE UPDATE ON public.url_inspection_results
FOR EACH ROW EXECUTE FUNCTION private.domain_set_updated_at();

ALTER TABLE public.url_inspection_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS url_inspection_results_merchant_read
  ON public.url_inspection_results;
CREATE POLICY url_inspection_results_merchant_read
  ON public.url_inspection_results
  FOR SELECT TO authenticated
  USING (private.has_store_capability(store_id, 'domains.manage', auth.uid()));

REVOKE ALL ON public.url_inspection_results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.url_inspection_results TO authenticated;

CREATE OR REPLACE FUNCTION private.enqueue_google_monitoring_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_count integer := 0;
  affected integer := 0;
BEGIN
  DELETE FROM public.google_oauth_states
  WHERE expires_at < now() - interval '1 day'
     OR consumed_at < now() - interval '1 day';

  INSERT INTO public.seo_sync_jobs(
    store_id, domain_id, job_type, idempotency_key, payload, max_attempts
  )
  SELECT
    domains.store_id,
    domains.id,
    'search-console-sync',
    'search-console-sync:' || domains.id || ':' || current_date::text,
    jsonb_build_object('scheduledDate', current_date::text),
    6
  FROM public.store_domains domains
  JOIN public.google_integrations integrations
    ON integrations.store_id = domains.store_id
   AND integrations.status = 'connected'
  JOIN public.search_console_properties properties
    ON properties.domain_id = domains.id
   AND properties.status = 'active'
  WHERE domains.status = 'active'
    AND domains.is_primary
  ON CONFLICT (idempotency_key) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  inserted_count := inserted_count + affected;

  INSERT INTO public.seo_sync_jobs(
    store_id, domain_id, job_type, idempotency_key, payload, max_attempts
  )
  SELECT
    domains.store_id,
    domains.id,
    'url-inspection-sync',
    'url-inspection-sync:' || domains.id || ':' || current_date::text,
    jsonb_build_object('scheduledDate', current_date::text, 'limit', 10),
    4
  FROM public.store_domains domains
  JOIN public.google_integrations integrations
    ON integrations.store_id = domains.store_id
   AND integrations.status = 'connected'
  JOIN public.search_console_properties properties
    ON properties.domain_id = domains.id
   AND properties.status = 'active'
  WHERE domains.status = 'active'
    AND domains.is_primary
  ON CONFLICT (idempotency_key) DO NOTHING;
  GET DIAGNOSTICS affected = ROW_COUNT;
  inserted_count := inserted_count + affected;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_google_monitoring_jobs()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE WARNING 'pg_cron is unavailable; Google monitoring schedule was not installed';
    RETURN;
  END IF;

  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'storeblink-google-search-monitoring'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'storeblink-google-search-monitoring',
    '17 2 * * *',
    'SELECT private.enqueue_google_monitoring_jobs();'
  );
END;
$$;

COMMENT ON TABLE public.url_inspection_results IS
  'Sanitized per-URL Google index coverage status. OAuth tokens and raw provider credentials are never stored here.';
COMMENT ON FUNCTION private.enqueue_google_monitoring_jobs() IS
  'Queues one daily Search Analytics and bounded URL Inspection sync per connected primary storefront domain.';
