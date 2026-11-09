-- Adaptive Commerce v3 trusted compiler jobs and scheduled rollout reads.
--
-- Browser roles cannot claim compiler ownership. Source loading, job mutation,
-- publication checks, and rollout evaluation reads are service-role only.

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_source_heads (
  installation_id uuid PRIMARY KEY
    REFERENCES public.adaptive_store_kit_installations(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, installation_id)
);

INSERT INTO public.adaptive_storefront_source_heads(installation_id, store_id, revision)
SELECT installation.id, installation.store_id, 1
FROM public.adaptive_store_kit_installations installation
ON CONFLICT (installation_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_compile_jobs (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL
    REFERENCES public.adaptive_store_kit_installations(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 160),
  request_hash text NOT NULL CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
  expected_source_revision bigint NOT NULL CHECK (expected_source_revision > 0),
  expected_pointer_revision bigint NOT NULL CHECK (expected_pointer_revision >= 0),
  intent text NOT NULL CHECK (intent IN ('shadow-only', 'publish')),
  state text NOT NULL DEFAULT 'claimed' CHECK (state IN (
    'claimed', 'loading-source', 'compiling', 'quality-gate', 'shadowing',
    'publishing', 'succeeded', 'failed'
  )),
  candidate_artifact jsonb CHECK (
    candidate_artifact IS NULL OR jsonb_typeof(candidate_artifact) = 'object'
  ),
  candidate_artifact_hash text CHECK (
    candidate_artifact_hash IS NULL OR candidate_artifact_hash ~ '^sha256:[a-f0-9]{64}$'
  ),
  candidate_compiler_version text,
  candidate_source_revision bigint CHECK (
    candidate_source_revision IS NULL OR candidate_source_revision > 0
  ),
  result jsonb CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9.-]{1,120}$'),
  error_message text CHECK (error_message IS NULL OR length(error_message) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (store_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS adaptive_compile_jobs_store_created_idx
  ON public.adaptive_storefront_compile_jobs(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_compile_job_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id uuid NOT NULL
    REFERENCES public.adaptive_storefront_compile_jobs(id) ON DELETE CASCADE,
  state text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.bump_adaptive_storefront_source_head()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_store_id uuid;
  target_installation_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_store_id := OLD.store_id;
    target_installation_id := OLD.installation_id;
  ELSE
    target_store_id := NEW.store_id;
    target_installation_id := NEW.installation_id;
  END IF;
  -- This is the same per-store lock used by publish_adaptive_storefront. A
  -- concurrent source write therefore commits entirely before or after publish.
  PERFORM pg_advisory_xact_lock(hashtextextended(target_store_id::text, 0));
  INSERT INTO public.adaptive_storefront_source_heads(
    installation_id, store_id, revision, updated_at
  ) VALUES (
    target_installation_id, target_store_id, 1, clock_timestamp()
  )
  ON CONFLICT (installation_id) DO UPDATE SET
    revision = public.adaptive_storefront_source_heads.revision + 1,
    updated_at = clock_timestamp();
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS adaptive_base_revision_bump_source_head
  ON public.adaptive_storefront_base_revisions;
CREATE TRIGGER adaptive_base_revision_bump_source_head
  BEFORE INSERT ON public.adaptive_storefront_base_revisions
  FOR EACH ROW EXECUTE FUNCTION private.bump_adaptive_storefront_source_head();

DROP TRIGGER IF EXISTS adaptive_merchant_patch_bump_source_head
  ON public.adaptive_merchant_patches;
CREATE TRIGGER adaptive_merchant_patch_bump_source_head
  BEFORE INSERT OR UPDATE OR DELETE ON public.adaptive_merchant_patches
  FOR EACH ROW EXECUTE FUNCTION private.bump_adaptive_storefront_source_head();

CREATE OR REPLACE FUNCTION private.current_adaptive_storefront_source_revision(
  p_store_id uuid,
  p_installation_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT source.revision
  FROM public.adaptive_storefront_source_heads source
  JOIN public.adaptive_store_kit_installations installation
    ON installation.id = source.installation_id
   AND installation.store_id = source.store_id
  WHERE source.store_id = p_store_id
    AND source.installation_id = p_installation_id
    AND installation.status = 'active';
$$;

CREATE OR REPLACE FUNCTION private.reject_stale_adaptive_runtime_artifact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  current_revision bigint;
BEGIN
  current_revision := private.current_adaptive_storefront_source_revision(
    NEW.store_id,
    NEW.installation_id
  );
  IF current_revision IS NULL OR current_revision <> NEW.source_revision THEN
    RAISE EXCEPTION 'Adaptive storefront source changed during compilation'
      USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS adaptive_runtime_artifact_source_revision_guard
  ON public.adaptive_storefront_runtime_artifacts;
CREATE TRIGGER adaptive_runtime_artifact_source_revision_guard
  BEFORE INSERT ON public.adaptive_storefront_runtime_artifacts
  FOR EACH ROW EXECUTE FUNCTION private.reject_stale_adaptive_runtime_artifact();

CREATE OR REPLACE FUNCTION public.claim_adaptive_storefront_compile_job(
  p_job_id uuid,
  p_store_id uuid,
  p_installation_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_expected_source_revision bigint,
  p_expected_pointer_revision bigint,
  p_intent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  job_row public.adaptive_storefront_compile_jobs%ROWTYPE;
  was_claimed boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  IF length(trim(p_idempotency_key)) NOT BETWEEN 8 AND 160
    OR p_request_hash !~ '^sha256:[a-f0-9]{64}$'
    OR p_expected_source_revision < 1
    OR p_expected_pointer_revision < 0
    OR p_intent NOT IN ('shadow-only', 'publish')
  THEN
    RAISE EXCEPTION 'Invalid compiler job request' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active StoreKit installation not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.adaptive_storefront_compile_jobs(
    id, store_id, installation_id, idempotency_key, request_hash,
    expected_source_revision, expected_pointer_revision, intent
  ) VALUES (
    p_job_id, p_store_id, p_installation_id, trim(p_idempotency_key), p_request_hash,
    p_expected_source_revision, p_expected_pointer_revision, p_intent
  )
  ON CONFLICT (store_id, idempotency_key) DO NOTHING
  RETURNING * INTO job_row;
  IF job_row.id IS NOT NULL THEN
    was_claimed := true;
    INSERT INTO public.adaptive_storefront_compile_job_events(job_id, state)
    VALUES (job_row.id, 'claimed');
  ELSE
    SELECT * INTO job_row
    FROM public.adaptive_storefront_compile_jobs
    WHERE store_id = p_store_id AND idempotency_key = trim(p_idempotency_key)
    FOR UPDATE;
    IF job_row.request_hash <> p_request_hash THEN
      RAISE EXCEPTION 'Idempotency key belongs to a different compiler request'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'claimed', was_claimed,
    'jobId', job_row.id,
    'state', job_row.state,
    'createdAt', job_row.created_at,
    'result', job_row.result,
    'errorCode', job_row.error_code,
    'errorMessage', job_row.error_message
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_adaptive_storefront_compile_job(
  p_job_id uuid,
  p_expected_state text,
  p_next_state text,
  p_result jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_state text;
  allowed boolean;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  SELECT state INTO current_state FROM public.adaptive_storefront_compile_jobs
  WHERE id = p_job_id FOR UPDATE;
  IF current_state IS NULL THEN
    RAISE EXCEPTION 'Compiler job not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_state <> p_expected_state THEN
    RAISE EXCEPTION 'Compiler job state conflict: expected %, current %',
      p_expected_state, current_state USING ERRCODE = '40001';
  END IF;
  allowed := (current_state, p_next_state) IN (
    ('claimed', 'loading-source'),
    ('loading-source', 'compiling'),
    ('compiling', 'quality-gate'),
    ('quality-gate', 'shadowing'),
    ('shadowing', 'publishing'),
    ('shadowing', 'succeeded'),
    ('publishing', 'succeeded')
  );
  IF NOT allowed OR (p_next_state = 'succeeded' AND p_result IS NULL) THEN
    RAISE EXCEPTION 'Invalid compiler job transition from % to %',
      current_state, p_next_state USING ERRCODE = '22023';
  END IF;
  UPDATE public.adaptive_storefront_compile_jobs
  SET state = p_next_state,
    result = CASE WHEN p_next_state = 'succeeded' THEN p_result ELSE result END,
    updated_at = clock_timestamp(),
    completed_at = CASE WHEN p_next_state = 'succeeded' THEN clock_timestamp() END
  WHERE id = p_job_id;
  INSERT INTO public.adaptive_storefront_compile_job_events(job_id, state, details)
  VALUES (
    p_job_id,
    p_next_state,
    CASE WHEN p_next_state = 'succeeded'
      THEN jsonb_build_object('artifactHash', p_result ->> 'artifactHash')
      ELSE '{}'::jsonb END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_adaptive_storefront_compile_job(
  p_job_id uuid,
  p_error_code text,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_state text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  SELECT state INTO current_state FROM public.adaptive_storefront_compile_jobs
  WHERE id = p_job_id FOR UPDATE;
  IF current_state IS NULL THEN
    RAISE EXCEPTION 'Compiler job not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_state IN ('succeeded', 'failed') THEN RETURN; END IF;
  UPDATE public.adaptive_storefront_compile_jobs
  SET state = 'failed', error_code = left(p_error_code, 120),
    error_message = left(p_error_message, 500), updated_at = clock_timestamp(),
    completed_at = clock_timestamp()
  WHERE id = p_job_id;
  INSERT INTO public.adaptive_storefront_compile_job_events(job_id, state, details)
  VALUES (p_job_id, 'failed', jsonb_build_object('errorCode', left(p_error_code, 120)));
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_adaptive_storefront_source_revision(
  p_store_id uuid,
  p_installation_id uuid,
  p_expected_source_revision bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  current_revision bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  current_revision := private.current_adaptive_storefront_source_revision(
    p_store_id,
    p_installation_id
  );
  IF current_revision IS NULL OR current_revision <> p_expected_source_revision THEN
    RAISE EXCEPTION 'Adaptive storefront source revision conflict'
      USING ERRCODE = '40001';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.persist_adaptive_storefront_compile_candidate(
  p_job_id uuid,
  p_expected_state text,
  p_source_revision bigint,
  p_artifact jsonb,
  p_artifact_hash text,
  p_compiler_version text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  job_row public.adaptive_storefront_compile_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO job_row FROM public.adaptive_storefront_compile_jobs
  WHERE id = p_job_id FOR UPDATE;
  IF job_row.id IS NULL THEN
    RAISE EXCEPTION 'Compiler job not found' USING ERRCODE = 'P0002';
  END IF;
  IF job_row.state <> p_expected_state OR p_expected_state <> 'quality-gate' THEN
    RAISE EXCEPTION 'Compiler candidate state conflict' USING ERRCODE = '40001';
  END IF;
  IF p_source_revision <> job_row.expected_source_revision
    OR p_artifact_hash !~ '^sha256:[a-f0-9]{64}$'
    OR jsonb_typeof(p_artifact) <> 'object'
    OR p_artifact ->> 'artifactHash' <> p_artifact_hash
    OR p_artifact ->> 'storeId' <> job_row.store_id::text
    OR p_artifact ->> 'installationId' <> job_row.installation_id::text
    OR p_artifact ->> 'compilerVersion' <> p_compiler_version
    OR jsonb_typeof(p_artifact -> 'routes') <> 'object'
    OR NOT (p_artifact -> 'routes' ?& ARRAY[
      'home', 'product', 'collection', 'page', 'blog', 'cart', 'search', '404'
    ])
    OR jsonb_object_length(p_artifact -> 'routes') <> 8
  THEN
    RAISE EXCEPTION 'Invalid server compiler candidate' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_adaptive_storefront_source_revision(
    job_row.store_id,
    job_row.installation_id,
    p_source_revision
  );
  UPDATE public.adaptive_storefront_compile_jobs
  SET candidate_artifact = p_artifact,
    candidate_artifact_hash = p_artifact_hash,
    candidate_compiler_version = p_compiler_version,
    candidate_source_revision = p_source_revision,
    updated_at = clock_timestamp()
  WHERE id = p_job_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_adaptive_storefront_compile_job(
  p_job_id uuid,
  p_store_id uuid,
  p_installation_id uuid,
  p_source_revision bigint,
  p_artifact_hash text,
  p_expected_pointer_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  job_row public.adaptive_storefront_compile_jobs%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO job_row FROM public.adaptive_storefront_compile_jobs
  WHERE id = p_job_id FOR UPDATE;
  IF job_row.id IS NULL THEN
    RAISE EXCEPTION 'Compiler job not found' USING ERRCODE = 'P0002';
  END IF;
  IF job_row.state <> 'publishing'
    OR job_row.store_id <> p_store_id
    OR job_row.installation_id <> p_installation_id
    OR job_row.expected_source_revision <> p_source_revision
    OR job_row.candidate_source_revision <> p_source_revision
    OR job_row.candidate_artifact_hash <> p_artifact_hash
    OR job_row.candidate_artifact IS NULL
  THEN
    RAISE EXCEPTION 'Compiler job candidate identity mismatch' USING ERRCODE = '22023';
  END IF;
  RETURN public.publish_adaptive_storefront(
    p_store_id,
    p_installation_id,
    p_source_revision,
    job_row.candidate_artifact,
    job_row.candidate_artifact_hash,
    job_row.candidate_compiler_version,
    p_expected_pointer_revision
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_adaptive_storefront_compile_source(
  p_store_id uuid,
  p_installation_id uuid,
  p_expected_source_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  store_row public.stores%ROWTYPE;
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  kit_row public.adaptive_store_kit_versions%ROWTYPE;
  base_row public.adaptive_storefront_base_revisions%ROWTYPE;
  current_revision bigint;
  patch_ids jsonb;
  patches jsonb;
  legacy_snapshot jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id AND status = 'active';
  IF installation_row.id IS NULL THEN
    RAISE EXCEPTION 'Active StoreKit installation not found' USING ERRCODE = 'P0002';
  END IF;
  current_revision := private.current_adaptive_storefront_source_revision(
    p_store_id,
    p_installation_id
  );
  IF current_revision IS NULL OR current_revision <> p_expected_source_revision THEN
    RAISE EXCEPTION 'Adaptive storefront source revision conflict'
      USING ERRCODE = '40001';
  END IF;
  SELECT * INTO store_row FROM public.stores WHERE id = p_store_id;
  SELECT * INTO kit_row FROM public.adaptive_store_kit_versions
  WHERE store_kit_id = installation_row.store_kit_id
    AND version = installation_row.store_kit_version
    AND status = 'released';
  IF kit_row.store_kit_id IS NULL THEN
    RAISE EXCEPTION 'Released StoreKit catalog entry not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO base_row
  FROM public.adaptive_storefront_base_revisions
  WHERE installation_id = p_installation_id
  ORDER BY revision DESC LIMIT 1;
  IF base_row.id IS NULL THEN
    RAISE EXCEPTION 'Storefront base revision not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(jsonb_agg(patch.id::text ORDER BY patch.revision), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', patch.id::text,
      'storeId', patch.store_id::text,
      'baseRevisionId', base_row.definition ->> 'revisionId',
      'sequence', patch.revision,
      'status', CASE WHEN patch.state IN ('clean', 'resolved') THEN 'active' ELSE 'conflicted' END,
      'operations', patch.operations,
      'createdAt', patch.created_at,
      'createdBy', COALESCE(patch.created_by::text, 'system')
    ) ORDER BY patch.revision), '[]'::jsonb)
  INTO patch_ids, patches
  FROM public.adaptive_merchant_patches patch
  WHERE patch.installation_id = p_installation_id
    AND patch.base_revision_id = base_row.id
    AND patch.state <> 'superseded';

  SELECT publication.snapshot INTO legacy_snapshot
  FROM public.storefront_publications publication
  WHERE publication.store_id = p_store_id
  ORDER BY publication.revision DESC LIMIT 1;

  RETURN jsonb_build_object(
    'sourceRevision', current_revision,
    'storeDefinition', jsonb_build_object(
      'kind', 'store-definition',
      'schemaVersion', COALESCE((base_row.definition ->> 'schemaVersion')::integer, 1),
      'storeId', p_store_id::text,
      'installationId', p_installation_id::text,
      'storeKit', jsonb_build_object(
        'id', installation_row.store_kit_id,
        'version', installation_row.store_kit_version,
        'integrity', kit_row.integrity_hash
      ),
      'locale', store_row.locale,
      'currency', store_row.currency,
      'base', base_row.definition,
      'merchantPatchIds', patch_ids,
      'designTokens', jsonb_build_object(
        'presetId', kit_row.definition ->> 'defaultPresetId',
        'overrides', '[]'::jsonb
      ),
      'commerceBindings', '[]'::jsonb
    ),
    'merchantPatches', patches,
    'assets', '[]'::jsonb,
    'legacySnapshot', legacy_snapshot
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_adaptive_storefront_compile_catalog(
  p_store_id uuid,
  p_installation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  kit_row public.adaptive_store_kit_versions%ROWTYPE;
  design_pack jsonb;
  component_library jsonb;
  blueprints jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id
    AND status IN ('staged', 'active');
  IF installation_row.id IS NULL THEN
    RAISE EXCEPTION 'Staged or active StoreKit installation not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO kit_row FROM public.adaptive_store_kit_versions
  WHERE store_kit_id = installation_row.store_kit_id
    AND version = installation_row.store_kit_version
    AND status = 'released';
  IF kit_row.store_kit_id IS NULL OR kit_row.lockfile <> installation_row.lockfile THEN
    RAISE EXCEPTION 'Exact released StoreKit catalog entry not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT pack.definition || jsonb_build_object('integrity', pack.integrity_hash)
  INTO design_pack
  FROM public.adaptive_design_pack_versions pack
  WHERE pack.design_pack_id = kit_row.design_pack_id
    AND pack.version = kit_row.design_pack_version
    AND pack.status = 'released'
    AND pack.integrity_hash = installation_row.lockfile #>> '{designPack,integrity}';
  SELECT library.definition || jsonb_build_object('integrity', library.integrity_hash)
  INTO component_library
  FROM public.adaptive_component_library_versions library
  WHERE library.component_library_id = kit_row.component_library_id
    AND library.version = kit_row.component_library_version
    AND library.status = 'released'
    AND library.integrity_hash = installation_row.lockfile #>> '{componentLibrary,integrity}';
  SELECT COALESCE(jsonb_agg(
    blueprint.definition || jsonb_build_object('integrity', blueprint.integrity_hash)
    ORDER BY pin.resource_type
  ), '[]'::jsonb) INTO blueprints
  FROM public.adaptive_store_kit_blueprint_pins pin
  JOIN public.adaptive_template_blueprint_versions blueprint
    ON blueprint.blueprint_id = pin.blueprint_id
   AND blueprint.version = pin.blueprint_version
   AND blueprint.integrity_hash = pin.integrity_hash
   AND blueprint.status = 'released'
  WHERE pin.store_kit_id = kit_row.store_kit_id
    AND pin.store_kit_version = kit_row.version
    AND installation_row.lockfile #>> ARRAY['blueprints', pin.resource_type, 'id'] = pin.blueprint_id
    AND installation_row.lockfile #>> ARRAY['blueprints', pin.resource_type, 'version'] = pin.blueprint_version
    AND installation_row.lockfile #>> ARRAY['blueprints', pin.resource_type, 'integrity'] = pin.integrity_hash;
  IF design_pack IS NULL OR component_library IS NULL OR jsonb_array_length(blueprints) <> 8 THEN
    RAISE EXCEPTION 'Exact released StoreKit dependency graph is incomplete'
      USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object(
    'storeKit', kit_row.definition || jsonb_build_object('integrity', kit_row.integrity_hash),
    'designPack', design_pack,
    'componentLibrary', component_library,
    'blueprints', blueprints
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.load_adaptive_rollout_evaluation_input(
  p_store_id uuid,
  p_window_minutes integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rollout_row public.adaptive_storefront_runtime_rollouts%ROWTYPE;
  publication_id uuid;
  samples jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned rollout evaluator required' USING ERRCODE = '42501';
  END IF;
  IF p_window_minutes NOT BETWEEN 1 AND 1440 THEN
    RAISE EXCEPTION 'Invalid rollout evaluation window' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO rollout_row
  FROM public.adaptive_storefront_runtime_rollouts
  WHERE store_id = p_store_id;
  IF rollout_row.store_id IS NULL THEN
    RAISE EXCEPTION 'Rollout config not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT active.publication_id INTO publication_id
  FROM public.adaptive_storefront_active_publications active
  WHERE active.store_id = p_store_id;
  IF publication_id IS NULL THEN
    RAISE EXCEPTION 'Active adaptive publication not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'schemaVersion', 1,
    'storeId', event.store_id::text,
    'cohort', 'v3-canary',
    'artifact', 'v3',
    'publicationId', event.publication_id,
    'metric', event.metric,
    'value', event.value,
    'observedAt', event.received_at,
    'context', '{}'::jsonb
  ) ORDER BY event.received_at), '[]'::jsonb) INTO samples
  FROM public.adaptive_storefront_rum_events event
  WHERE event.store_id = p_store_id
    AND event.runtime = 'adaptive'
    AND event.publication_id = publication_id::text
    AND event.received_at >= clock_timestamp() - make_interval(mins => p_window_minutes);

  RETURN jsonb_build_object(
    'rolloutId', 'rollout-' || p_store_id::text,
    'publicationId', publication_id::text,
    'currentPercentage', rollout_row.percentage,
    'revision', rollout_row.revision,
    'killSwitch', rollout_row.kill_switch,
    'state', rollout_row.evaluator_state,
    'config', jsonb_build_object(
      'minimumSamplesPerMetric', rollout_row.minimum_sample_size,
      'cooldownMs', rollout_row.cooldown_seconds * 1000,
      'thresholds', rollout_row.thresholds
    ),
    'samples', samples
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_adaptive_rollouts_due_for_evaluation(
  p_limit integer DEFAULT 100
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  store_ids uuid[];
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned rollout evaluator required' USING ERRCODE = '42501';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid rollout evaluation batch size' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(array_agg(candidate.store_id), ARRAY[]::uuid[]) INTO store_ids
  FROM (
    SELECT rollout.store_id
    FROM public.adaptive_storefront_runtime_rollouts rollout
    JOIN public.adaptive_storefront_active_publications active
      ON active.store_id = rollout.store_id
    WHERE rollout.kill_switch
      OR rollout.status IN ('running', 'complete')
    ORDER BY rollout.kill_switch DESC, rollout.last_evaluated_at NULLS FIRST, rollout.store_id
    LIMIT p_limit
  ) candidate;
  RETURN store_ids;
END;
$$;

ALTER TABLE public.adaptive_storefront_source_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_compile_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_compile_job_events ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS adaptive_compile_job_events_immutable
  ON public.adaptive_storefront_compile_job_events;
CREATE TRIGGER adaptive_compile_job_events_immutable
  BEFORE UPDATE OR DELETE ON public.adaptive_storefront_compile_job_events
  FOR EACH ROW EXECUTE FUNCTION private.prevent_adaptive_immutable_change();

DROP TRIGGER IF EXISTS adaptive_runtime_incidents_immutable
  ON public.adaptive_storefront_runtime_incidents;
CREATE TRIGGER adaptive_runtime_incidents_immutable
  BEFORE UPDATE OR DELETE ON public.adaptive_storefront_runtime_incidents
  FOR EACH ROW EXECUTE FUNCTION private.prevent_adaptive_immutable_change();

REVOKE ALL ON public.adaptive_storefront_source_heads FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.adaptive_storefront_compile_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.adaptive_storefront_compile_job_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.adaptive_storefront_source_heads TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.adaptive_storefront_compile_jobs TO service_role;
GRANT SELECT, INSERT ON public.adaptive_storefront_compile_job_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.adaptive_storefront_compile_job_events_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.claim_adaptive_storefront_compile_job(uuid, uuid, uuid, text, text, bigint, bigint, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_adaptive_storefront_compile_job(uuid, uuid, uuid, text, text, bigint, bigint, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.transition_adaptive_storefront_compile_job(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_adaptive_storefront_compile_job(uuid, text, text, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.fail_adaptive_storefront_compile_job(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_adaptive_storefront_compile_job(uuid, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.assert_adaptive_storefront_source_revision(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_adaptive_storefront_source_revision(uuid, uuid, bigint)
  TO service_role;
REVOKE ALL ON FUNCTION public.persist_adaptive_storefront_compile_candidate(uuid, text, bigint, jsonb, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_adaptive_storefront_compile_candidate(uuid, text, bigint, jsonb, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.publish_adaptive_storefront_compile_job(uuid, uuid, uuid, bigint, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_adaptive_storefront_compile_job(uuid, uuid, uuid, bigint, text, bigint)
  TO service_role;
REVOKE ALL ON FUNCTION public.load_adaptive_storefront_compile_source(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_adaptive_storefront_compile_source(uuid, uuid, bigint)
  TO service_role;
REVOKE ALL ON FUNCTION public.load_adaptive_storefront_compile_catalog(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_adaptive_storefront_compile_catalog(uuid, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.load_adaptive_rollout_evaluation_input(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.load_adaptive_rollout_evaluation_input(uuid, integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.list_adaptive_rollouts_due_for_evaluation(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_adaptive_rollouts_due_for_evaluation(integer)
  TO service_role;

-- Shadow evidence is compiler output. Review UIs may request a server action,
-- but cannot submit accepted evidence directly with an authenticated JWT.
REVOKE ALL ON FUNCTION public.record_adaptive_shadow_compilation(uuid, uuid, text, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_adaptive_shadow_compilation(uuid, uuid, text, jsonb, jsonb, text)
  TO service_role;

COMMENT ON TABLE public.adaptive_storefront_compile_jobs IS
  'Server-owned idempotent compile orchestration. Browser callers cannot submit artifacts or claim compiler ownership.';
COMMENT ON FUNCTION public.load_adaptive_storefront_compile_source(uuid, uuid, bigint) IS
  'Loads one canonical revision for trusted batch compilation; fails on stale expected revision.';
COMMENT ON FUNCTION public.load_adaptive_rollout_evaluation_input(uuid, integer) IS
  'Loads tagged, bounded adaptive RUM for the trusted scheduled rollout evaluator.';
