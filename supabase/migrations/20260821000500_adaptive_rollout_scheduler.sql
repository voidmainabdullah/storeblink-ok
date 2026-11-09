-- One schedule owner for Adaptive Commerce rollout evaluation. The database
-- invokes the narrow Supabase Edge tick; that tick forwards only an evaluation
-- id/time to the protected StoreBlink Worker handler. Endpoint and secret
-- values live in Vault and are never embedded in migration history.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION private.invoke_adaptive_rollout_evaluator()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, vault, net
AS $$
DECLARE
  edge_url text;
  cron_secret text;
  request_id bigint;
BEGIN
  SELECT decrypted_secret
  INTO edge_url
  FROM vault.decrypted_secrets
  WHERE name = 'adaptive_rollout_edge_url'
  LIMIT 1;

  SELECT decrypted_secret
  INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'adaptive_rollout_cron_secret'
  LIMIT 1;

  IF edge_url IS NULL OR cron_secret IS NULL THEN
    RAISE WARNING 'Adaptive rollout scheduler Vault secrets are not configured';
    RETURN NULL;
  END IF;
  IF edge_url !~ '^https://[a-z0-9]+[.]supabase[.]co/functions/v1/evaluate-adaptive-rollouts$' THEN
    RAISE WARNING 'Adaptive rollout Edge URL is invalid';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-storeblink-cron-secret', cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_adaptive_rollout_evaluator()
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'storeblink-adaptive-rollout-evaluator'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'storeblink-adaptive-rollout-evaluator',
    '*/5 * * * *',
    'SELECT private.invoke_adaptive_rollout_evaluator();'
  );
END;
$$;

COMMENT ON FUNCTION private.invoke_adaptive_rollout_evaluator() IS
  'Invokes the secret-authenticated Adaptive Commerce rollout Edge tick using endpoint and authentication stored in Supabase Vault.';
