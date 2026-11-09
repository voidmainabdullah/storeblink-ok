-- Repair the editor catalog contract and expose narrow, read-only platform
-- administration projections. Staff assignments remain operational data and
-- are intentionally not hard-coded into this schema migration.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS sold_count bigint;

UPDATE public.items
SET sold_count = 0
WHERE sold_count IS NULL;

ALTER TABLE public.items
  ALTER COLUMN sold_count SET DEFAULT 0,
  ALTER COLUMN sold_count SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.items'::regclass
      AND conname = 'items_sold_count_nonnegative'
  ) THEN
    ALTER TABLE public.items
      ADD CONSTRAINT items_sold_count_nonnegative CHECK (sold_count >= 0);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS items_store_best_sellers_idx
  ON public.items(store_id, sold_count DESC, created_at DESC)
  WHERE is_published = true AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION private.is_active_platform_staff(
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND p_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.platform_staff ps
      WHERE ps.user_id = p_user_id
        AND ps.active = true
    );
$$;

REVOKE ALL ON FUNCTION private.is_active_platform_staff(uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_platform_staff_access()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'userId', ps.user_id,
    'email', au.email,
    'role', ps.role,
    'active', ps.active
  )
  INTO result
  FROM public.platform_staff ps
  JOIN auth.users au ON au.id = ps.user_id
  WHERE ps.user_id = auth.uid()
    AND ps.active = true;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Platform staff access required' USING ERRCODE = '42501';
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_platform_domain_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  staff_role text;
  recent_domains jsonb;
BEGIN
  IF NOT private.is_active_platform_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Platform staff access required' USING ERRCODE = '42501';
  END IF;

  IF NOT private.has_aal2() THEN
    RAISE EXCEPTION 'AAL2 verification required' USING ERRCODE = '42501';
  END IF;

  SELECT ps.role
  INTO staff_role
  FROM public.platform_staff ps
  WHERE ps.user_id = auth.uid()
    AND ps.active = true;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', domain_row.id,
        'hostname', domain_row.hostname,
        'storeId', domain_row.store_id,
        'storeName', domain_row.store_name,
        'status', domain_row.status,
        'dnsStatus', domain_row.dns_status,
        'sslStatus', domain_row.ssl_status,
        'updatedAt', domain_row.updated_at
      )
      ORDER BY domain_row.updated_at DESC
    ),
    '[]'::jsonb
  )
  INTO recent_domains
  FROM (
    SELECT
      d.id,
      d.hostname,
      d.store_id,
      s.name AS store_name,
      d.status,
      d.dns_status,
      d.ssl_status,
      d.updated_at
    FROM public.store_domains d
    JOIN public.stores s ON s.id = d.store_id
    ORDER BY d.updated_at DESC
    LIMIT 20
  ) AS domain_row;

  RETURN jsonb_build_object(
    'generatedAt', now(),
    'staffRole', staff_role,
    'counts', jsonb_build_object(
      'stores', (SELECT count(*) FROM public.stores WHERE deleted_at IS NULL),
      'domains', (SELECT count(*) FROM public.store_domains),
      'activeDomains', (
        SELECT count(*) FROM public.store_domains WHERE status = 'active'
      ),
      'actionRequiredDomains', (
        SELECT count(*)
        FROM public.store_domains
        WHERE status IN ('action_required', 'failed')
      ),
      'pendingSslDomains', (
        SELECT count(*)
        FROM public.store_domains
        WHERE status <> 'disabled' AND ssl_status <> 'active'
      ),
      'pendingVerifications', (
        SELECT count(*)
        FROM public.domain_verifications
        WHERE status IN ('pending', 'validating')
      ),
      'queuedJobs', (
        SELECT count(*)
        FROM public.seo_sync_jobs
        WHERE status IN ('queued', 'running', 'retry')
      ),
      'failedJobs', (
        SELECT count(*) FROM public.seo_sync_jobs WHERE status = 'dead'
      ),
      'pendingPurchases', (
        SELECT count(*)
        FROM public.domain_purchase_orders
        WHERE status IN ('requested', 'submitted', 'pending_setup')
      ),
      'activeTransfers', (
        SELECT count(*)
        FROM public.domain_transfer_requests
        WHERE status IN ('requested', 'submitted', 'awaiting_registrant', 'transferring')
      ),
      'connectedGoogleAccounts', (
        SELECT count(*) FROM public.google_integrations WHERE status = 'connected'
      )
    ),
    'recentDomains', recent_domains
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_platform_staff_access()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_staff_access()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_platform_domain_overview()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_domain_overview()
  TO authenticated, service_role;
