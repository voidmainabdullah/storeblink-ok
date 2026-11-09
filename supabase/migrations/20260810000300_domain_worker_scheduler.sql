-- Run durable domain-provider jobs independently of an open merchant browser.
-- Endpoint and cron authentication values live in Supabase Vault and are
-- deliberately not embedded in migration history.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.invoke_domain_orchestrator_worker()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, vault, net
AS $$
DECLARE
  worker_url text;
  worker_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO worker_url
  FROM vault.decrypted_secrets
  WHERE name = 'domain_orchestrator_worker_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO worker_secret
  FROM vault.decrypted_secrets
  WHERE name = 'domain_cron_secret'
  LIMIT 1;

  IF worker_url IS NULL OR worker_secret IS NULL THEN
    RAISE WARNING 'Domain worker Vault secrets are not configured';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := worker_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-storeblink-cron-secret', worker_secret
    ),
    body := jsonb_build_object('action', 'process-jobs', 'limit', 25),
    timeout_milliseconds := 10000
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_domain_orchestrator_worker()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'storeblink-domain-orchestrator-worker'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'storeblink-domain-orchestrator-worker',
    '* * * * *',
    'SELECT private.invoke_domain_orchestrator_worker();'
  );
END;
$$;

COMMENT ON FUNCTION private.invoke_domain_orchestrator_worker() IS
  'Invokes the domain job worker with URL and authentication loaded from Supabase Vault.';
