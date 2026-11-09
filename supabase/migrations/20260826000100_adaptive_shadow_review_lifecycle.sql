-- Adaptive Commerce v3 manual shadow-review lifecycle.
--
-- Comparable structural differences are reviewable, not failed releases. The
-- browser can decide only an exact pending shadow id under optimistic revision
-- and idempotency checks. Artifact bytes, hashes, compiler versions, and source
-- identities continue to come exclusively from the persisted service candidate.

ALTER TABLE public.adaptive_storefront_shadow_compilations
  ADD COLUMN IF NOT EXISTS origin_compile_job_id uuid
    REFERENCES public.adaptive_storefront_compile_jobs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS review_revision bigint NOT NULL DEFAULT 0
    CHECK (review_revision >= 0);

-- The v3 installation migration made terminal evidence immutable before job
-- identity existed. Drop that trigger only for the controlled backfill below;
-- a stricter transition trigger is installed immediately afterwards.
DROP TRIGGER IF EXISTS adaptive_shadow_terminal_immutable
  ON public.adaptive_storefront_shadow_compilations;

WITH matched AS (
  SELECT DISTINCT ON (shadow.id)
    shadow.id AS shadow_id,
    job.id AS job_id
  FROM public.adaptive_storefront_shadow_compilations shadow
  JOIN public.adaptive_storefront_compile_jobs job
    ON job.store_id = shadow.store_id
   AND job.installation_id = shadow.installation_id
   AND job.candidate_artifact_hash = shadow.artifact_hash
   AND job.candidate_source_revision = shadow.source_revision
   AND job.candidate_artifact ->> 'sourceHash' = shadow.compiled_source_hash
  ORDER BY shadow.id, job.completed_at DESC NULLS LAST, job.created_at DESC
)
UPDATE public.adaptive_storefront_shadow_compilations shadow
SET origin_compile_job_id = matched.job_id
FROM matched
WHERE shadow.id = matched.shadow_id
  AND shadow.origin_compile_job_id IS NULL;

CREATE INDEX IF NOT EXISTS adaptive_shadow_origin_job_idx
  ON public.adaptive_storefront_shadow_compilations(origin_compile_job_id)
  WHERE origin_compile_job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.adaptive_shadow_review_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  shadow_id uuid NOT NULL
    REFERENCES public.adaptive_storefront_shadow_compilations(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 160),
  request_hash text NOT NULL CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
  expected_review_revision bigint NOT NULL CHECK (expected_review_revision >= 0),
  decision text NOT NULL CHECK (decision IN ('accept', 'reject')),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  reviewed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

ALTER TABLE public.adaptive_shadow_review_commands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adaptive_shadow_review_commands FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_adaptive_shadow_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Adaptive shadow evidence is immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.installation_id IS DISTINCT FROM OLD.installation_id
    OR NEW.legacy_publication_id IS DISTINCT FROM OLD.legacy_publication_id
    OR NEW.artifact_hash IS DISTINCT FROM OLD.artifact_hash
    OR NEW.structural_diff IS DISTINCT FROM OLD.structural_diff
    OR NEW.source_revision IS DISTINCT FROM OLD.source_revision
    OR NEW.source_hash IS DISTINCT FROM OLD.source_hash
    OR NEW.compiled_source_hash IS DISTINCT FROM OLD.compiled_source_hash
    OR NEW.origin_compile_job_id IS DISTINCT FROM OLD.origin_compile_job_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Adaptive shadow candidate identity is immutable'
      USING ERRCODE = '55000';
  END IF;

  -- A service-owned visual comparator may make an otherwise opaque legacy
  -- result reviewable. It may never accept the candidate by itself.
  IF OLD.status = 'uncomparable'
    AND auth.role() = 'service_role'
    AND NEW.status = 'pending'
    AND OLD.visual_diff IS NULL
    AND jsonb_typeof(NEW.visual_diff) = 'object'
    AND NEW.review_revision = OLD.review_revision + 1
    AND NEW.reviewed_by IS NULL
    AND NEW.reviewed_at IS NULL
  THEN
    RETURN NEW;
  END IF;

  -- A capability-checked review RPC is the only intended pending transition.
  IF OLD.status = 'pending'
    AND NEW.status IN ('accepted', 'rejected')
    AND NEW.visual_diff IS NOT DISTINCT FROM OLD.visual_diff
    AND NEW.review_revision = OLD.review_revision + 1
    AND NEW.reviewed_by IS NOT NULL
    AND NEW.reviewed_at IS NOT NULL
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid or terminal adaptive shadow transition'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER adaptive_shadow_terminal_immutable
BEFORE UPDATE OR DELETE ON public.adaptive_storefront_shadow_compilations
FOR EACH ROW EXECUTE FUNCTION private.guard_adaptive_shadow_transition();

CREATE TRIGGER adaptive_shadow_review_commands_immutable
BEFORE UPDATE OR DELETE ON public.adaptive_shadow_review_commands
FOR EACH ROW EXECUTE FUNCTION private.prevent_adaptive_immutable_change();

CREATE OR REPLACE FUNCTION public.record_adaptive_compile_job_shadow(
  p_job_id uuid,
  p_structural_diff jsonb,
  p_visual_diff jsonb DEFAULT NULL,
  p_status text DEFAULT 'pending'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  job_row public.adaptive_storefront_compile_jobs%ROWTYPE;
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  shadow_row public.adaptive_storefront_shadow_compilations%ROWTYPE;
  current_revision bigint;
  structural_status text;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned shadow candidate required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO job_row
  FROM public.adaptive_storefront_compile_jobs
  WHERE id = p_job_id
  FOR UPDATE;
  IF job_row.id IS NULL OR job_row.state <> 'shadowing'
    OR job_row.candidate_artifact IS NULL
    OR job_row.candidate_artifact_hash IS NULL
    OR job_row.candidate_source_revision IS NULL
  THEN
    RAISE EXCEPTION 'Exact persisted shadowing candidate required'
      USING ERRCODE = '55000';
  END IF;
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE id = job_row.installation_id AND store_id = job_row.store_id;
  current_revision := private.current_adaptive_storefront_source_revision(
    job_row.store_id, job_row.installation_id
  );
  structural_status := p_structural_diff ->> 'status';
  IF installation_row.id IS NULL
    OR installation_row.status NOT IN ('staged', 'active')
    OR installation_row.source_revision IS DISTINCT FROM job_row.candidate_source_revision
    OR current_revision IS DISTINCT FROM job_row.candidate_source_revision
    OR installation_row.source_hash IS NULL
    OR job_row.candidate_artifact ->> 'artifactHash' <> job_row.candidate_artifact_hash
    OR job_row.candidate_artifact ->> 'storeId' <> job_row.store_id::text
    OR job_row.candidate_artifact ->> 'installationId' <> job_row.installation_id::text
    OR COALESCE(job_row.candidate_artifact ->> 'sourceHash', '') !~ '^sha256:[a-f0-9]{64}$'
    OR jsonb_typeof(p_structural_diff) <> 'object'
    OR p_visual_diff IS NOT NULL
    OR NOT (
      (structural_status = 'equal' AND p_status = 'accepted')
      OR (structural_status = 'different' AND p_status = 'pending')
      OR (structural_status = 'uncomparable' AND p_status = 'uncomparable')
    )
  THEN
    RAISE EXCEPTION 'Shadow status does not match the trusted structural result'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.adaptive_storefront_shadow_compilations(
    store_id, installation_id, artifact_hash, structural_diff, visual_diff,
    status, reviewed_by, reviewed_at, source_revision, source_hash,
    compiled_source_hash, origin_compile_job_id, review_revision
  ) VALUES (
    job_row.store_id, job_row.installation_id, job_row.candidate_artifact_hash,
    p_structural_diff, NULL, p_status, NULL,
    CASE WHEN p_status = 'accepted' THEN clock_timestamp() END,
    job_row.candidate_source_revision, installation_row.source_hash,
    job_row.candidate_artifact ->> 'sourceHash', job_row.id, 0
  )
  ON CONFLICT (store_id, installation_id, artifact_hash) DO NOTHING
  RETURNING * INTO shadow_row;

  IF shadow_row.id IS NULL THEN
    SELECT * INTO shadow_row
    FROM public.adaptive_storefront_shadow_compilations
    WHERE store_id = job_row.store_id
      AND installation_id = job_row.installation_id
      AND artifact_hash = job_row.candidate_artifact_hash;
    IF shadow_row.source_revision IS DISTINCT FROM job_row.candidate_source_revision
      OR shadow_row.source_hash IS DISTINCT FROM installation_row.source_hash
      OR shadow_row.compiled_source_hash IS DISTINCT FROM job_row.candidate_artifact ->> 'sourceHash'
      OR shadow_row.structural_diff IS DISTINCT FROM p_structural_diff
      OR shadow_row.status IS DISTINCT FROM p_status
    THEN
      RAISE EXCEPTION 'Shadow candidate idempotency conflict' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN shadow_row.id;
END;
$$;

-- Keep the prior server gateway signature fail-closed and derive the job id;
-- it can no longer write a terminal status for a structural difference.
CREATE OR REPLACE FUNCTION public.record_adaptive_shadow_compilation(
  p_store_id uuid,
  p_installation_id uuid,
  p_artifact_hash text,
  p_structural_diff jsonb,
  p_visual_diff jsonb DEFAULT NULL,
  p_status text DEFAULT 'pending'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  job_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned shadow candidate required' USING ERRCODE = '42501';
  END IF;
  SELECT job.id INTO job_id
  FROM public.adaptive_storefront_compile_jobs job
  WHERE job.store_id = p_store_id
    AND job.installation_id = p_installation_id
    AND job.candidate_artifact_hash = p_artifact_hash
    AND job.state = 'shadowing'
  ORDER BY job.created_at DESC LIMIT 1;
  IF job_id IS NULL THEN
    RAISE EXCEPTION 'Exact persisted shadowing candidate required' USING ERRCODE = '55000';
  END IF;
  RETURN public.record_adaptive_compile_job_shadow(
    job_id, p_structural_diff, p_visual_diff, p_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_adaptive_shadow_visual_evidence(
  p_shadow_id uuid,
  p_expected_review_revision bigint,
  p_evidence jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  shadow_row public.adaptive_storefront_shadow_compilations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted visual comparator required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO shadow_row
  FROM public.adaptive_storefront_shadow_compilations
  WHERE id = p_shadow_id
  FOR UPDATE;
  IF shadow_row.id IS NULL
    OR shadow_row.status <> 'uncomparable'
    OR shadow_row.review_revision <> p_expected_review_revision
    OR shadow_row.visual_diff IS NOT NULL
    OR jsonb_typeof(p_evidence) <> 'object'
    OR p_evidence ->> 'kind' <> 'adaptive-shadow-visual-evidence'
    OR p_evidence ->> 'outcome' <> 'comparable'
    OR p_evidence ->> 'artifactHash' <> shadow_row.artifact_hash
    OR COALESCE(p_evidence ->> 'evidenceHash', '') !~ '^sha256:[a-f0-9]{64}$'
    OR shadow_row.origin_compile_job_id IS NULL
  THEN
    RAISE EXCEPTION 'Comparable service-owned visual evidence required'
      USING ERRCODE = '22023';
  END IF;
  PERFORM 1
  FROM public.adaptive_storefront_compile_jobs job
  WHERE job.id = shadow_row.origin_compile_job_id
    AND job.store_id = shadow_row.store_id
    AND job.installation_id = shadow_row.installation_id
    AND job.candidate_artifact_hash = shadow_row.artifact_hash
    AND job.state = 'succeeded';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Persisted compiler candidate is not reviewable'
      USING ERRCODE = '55000';
  END IF;
  UPDATE public.adaptive_storefront_shadow_compilations
  SET visual_diff = p_evidence,
    status = 'pending',
    review_revision = review_revision + 1
  WHERE id = shadow_row.id
  RETURNING * INTO shadow_row;
  RETURN jsonb_build_object(
    'shadowId', shadow_row.id,
    'status', shadow_row.status,
    'reviewRevision', shadow_row.review_revision
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_adaptive_shadow_compilation(
  p_store_id uuid,
  p_shadow_id uuid,
  p_expected_review_revision bigint,
  p_idempotency_key text,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  shadow_row public.adaptive_storefront_shadow_compilations%ROWTYPE;
  job_row public.adaptive_storefront_compile_jobs%ROWTYPE;
  command_row public.adaptive_shadow_review_commands%ROWTYPE;
  request_hash text;
  review_result jsonb;
  next_status text;
BEGIN
  IF auth.uid() IS NULL
    OR NOT private.has_store_capability(p_store_id, 'theme.publish', auth.uid())
  THEN
    RAISE EXCEPTION 'Theme publish capability required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_review_revision < 0
    OR length(trim(p_idempotency_key)) NOT BETWEEN 8 AND 160
    OR p_decision NOT IN ('accept', 'reject')
  THEN
    RAISE EXCEPTION 'Invalid shadow review request' USING ERRCODE = '22023';
  END IF;
  request_hash := private.adaptive_jsonb_sha256(jsonb_build_object(
    'storeId', p_store_id::text,
    'shadowId', p_shadow_id::text,
    'expectedReviewRevision', p_expected_review_revision,
    'decision', p_decision
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));
  SELECT * INTO command_row
  FROM public.adaptive_shadow_review_commands command
  WHERE command.store_id = p_store_id
    AND command.idempotency_key = trim(p_idempotency_key)
  FOR UPDATE;
  IF command_row.id IS NOT NULL THEN
    IF command_row.request_hash <> request_hash THEN
      RAISE EXCEPTION 'Idempotency key belongs to another shadow review'
        USING ERRCODE = '23505';
    END IF;
    RETURN command_row.result;
  END IF;

  SELECT * INTO shadow_row
  FROM public.adaptive_storefront_shadow_compilations shadow
  WHERE shadow.id = p_shadow_id AND shadow.store_id = p_store_id
  FOR UPDATE;
  IF shadow_row.id IS NULL THEN
    RAISE EXCEPTION 'Pending shadow review not found' USING ERRCODE = 'P0002';
  END IF;
  IF shadow_row.status <> 'pending'
    OR shadow_row.review_revision <> p_expected_review_revision
  THEN
    RAISE EXCEPTION 'Shadow review revision or state conflict' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO job_row
  FROM public.adaptive_storefront_compile_jobs job
  WHERE job.store_id = shadow_row.store_id
    AND job.installation_id = shadow_row.installation_id
    AND job.candidate_artifact_hash = shadow_row.artifact_hash
    AND job.candidate_source_revision = shadow_row.source_revision
    AND job.candidate_artifact ->> 'sourceHash' = shadow_row.compiled_source_hash
    AND job.state = 'succeeded'
    AND job.result ->> 'shadowId' = shadow_row.id::text
    AND COALESCE((job.result ->> 'published')::boolean, false) = false
  ORDER BY job.completed_at DESC NULLS LAST, job.created_at DESC
  LIMIT 1;
  IF job_row.id IS NULL THEN
    RAISE EXCEPTION 'Exact persisted compiler candidate is not reviewable'
      USING ERRCODE = '55000';
  END IF;

  next_status := CASE p_decision WHEN 'accept' THEN 'accepted' ELSE 'rejected' END;
  UPDATE public.adaptive_storefront_shadow_compilations
  SET status = next_status,
    review_revision = review_revision + 1,
    reviewed_by = auth.uid(),
    reviewed_at = clock_timestamp()
  WHERE id = shadow_row.id
  RETURNING * INTO shadow_row;
  review_result := jsonb_build_object(
    'shadowId', shadow_row.id,
    'status', shadow_row.status,
    'reviewRevision', shadow_row.review_revision,
    'jobId', job_row.id,
    'publishEligible', shadow_row.status = 'accepted'
  );
  INSERT INTO public.adaptive_shadow_review_commands(
    store_id, shadow_id, idempotency_key, request_hash,
    expected_review_revision, decision, result, reviewed_by
  ) VALUES (
    p_store_id, p_shadow_id, trim(p_idempotency_key), request_hash,
    p_expected_review_revision, p_decision, review_result, auth.uid()
  );
  RETURN review_result;
END;
$$;

-- Qualify the live-pointer read from the v3 foundation. The original function
-- used a PL/pgSQL variable with the same name as the table column, which makes
-- the active-installation publish branch ambiguous on PostgreSQL.
CREATE OR REPLACE FUNCTION public.publish_adaptive_storefront(
  p_store_id uuid,
  p_installation_id uuid,
  p_source_revision bigint,
  p_artifact jsonb,
  p_artifact_hash text,
  p_compiler_version text,
  p_expected_pointer_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  artifact_id uuid;
  new_publication_id uuid;
  previous_publication_id uuid;
  current_pointer_revision bigint;
  next_publication_revision bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  IF p_artifact IS NULL OR jsonb_typeof(p_artifact) <> 'object'
    OR p_artifact_hash !~ '^sha256:[a-f0-9]{64}$'
    OR COALESCE(p_artifact ->> 'artifactHash', '') <> p_artifact_hash
  THEN
    RAISE EXCEPTION 'Invalid compiled artifact' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));
  PERFORM 1
  FROM public.adaptive_store_kit_installations installation
  WHERE installation.id = p_installation_id
    AND installation.store_id = p_store_id
    AND installation.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active StoreKit installation not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1
  FROM public.adaptive_storefront_shadow_compilations shadow
  WHERE shadow.store_id = p_store_id
    AND shadow.installation_id = p_installation_id
    AND shadow.artifact_hash = p_artifact_hash
    AND shadow.status = 'accepted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted shadow compilation required' USING ERRCODE = '23514';
  END IF;
  SELECT active.publication_id, active.pointer_revision
  INTO previous_publication_id, current_pointer_revision
  FROM public.adaptive_storefront_active_publications active
  WHERE active.store_id = p_store_id
  FOR UPDATE;
  current_pointer_revision := COALESCE(current_pointer_revision, 0);
  IF current_pointer_revision <> p_expected_pointer_revision THEN
    RAISE EXCEPTION 'Publication pointer conflict: expected %, current %',
      p_expected_pointer_revision, current_pointer_revision USING ERRCODE = '40001';
  END IF;
  INSERT INTO public.adaptive_storefront_runtime_artifacts(
    store_id, installation_id, source_revision, artifact, artifact_hash, compiler_version
  ) VALUES (
    p_store_id, p_installation_id, p_source_revision, p_artifact,
    p_artifact_hash, p_compiler_version
  )
  ON CONFLICT (store_id, artifact_hash) DO NOTHING
  RETURNING id INTO artifact_id;
  IF artifact_id IS NULL THEN
    SELECT artifact.id INTO artifact_id
    FROM public.adaptive_storefront_runtime_artifacts artifact
    WHERE artifact.store_id = p_store_id
      AND artifact.installation_id = p_installation_id
      AND artifact.source_revision = p_source_revision
      AND artifact.artifact_hash = p_artifact_hash
      AND artifact.artifact = p_artifact;
    IF artifact_id IS NULL THEN
      RAISE EXCEPTION 'Artifact hash belongs to another candidate'
        USING ERRCODE = '23505';
    END IF;
  END IF;
  SELECT COALESCE(max(publication.revision), 0) + 1 INTO next_publication_revision
  FROM public.adaptive_storefront_publications publication
  WHERE publication.store_id = p_store_id;
  INSERT INTO public.adaptive_storefront_publications(
    store_id, artifact_id, installation_id, revision, created_by
  ) VALUES (
    p_store_id, artifact_id, p_installation_id, next_publication_revision, auth.uid()
  ) RETURNING id INTO new_publication_id;
  INSERT INTO public.adaptive_storefront_active_publications(
    store_id, publication_id, previous_publication_id, pointer_revision,
    activated_by, activated_at
  ) VALUES (
    p_store_id, new_publication_id, previous_publication_id,
    current_pointer_revision + 1, auth.uid(), clock_timestamp()
  )
  ON CONFLICT (store_id) DO UPDATE SET
    previous_publication_id = public.adaptive_storefront_active_publications.publication_id,
    publication_id = EXCLUDED.publication_id,
    pointer_revision = EXCLUDED.pointer_revision,
    activated_by = EXCLUDED.activated_by,
    activated_at = EXCLUDED.activated_at;
  RETURN jsonb_build_object(
    'artifact_id', artifact_id,
    'publication_id', new_publication_id,
    'publication_revision', next_publication_revision,
    'pointer_revision', current_pointer_revision + 1,
    'artifact_hash', p_artifact_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_reviewed_adaptive_storefront_compile_job(
  p_store_id uuid,
  p_job_id uuid,
  p_expected_pointer_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  job_row public.adaptive_storefront_compile_jobs%ROWTYPE;
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  shadow_row public.adaptive_storefront_shadow_compilations%ROWTYPE;
  publication jsonb;
  shadow_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Trusted reviewed publication worker required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_pointer_revision < 0 THEN
    RAISE EXCEPTION 'Invalid expected publication pointer revision' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));
  SELECT * INTO job_row
  FROM public.adaptive_storefront_compile_jobs job
  WHERE job.id = p_job_id AND job.store_id = p_store_id
  FOR UPDATE;
  IF job_row.id IS NULL THEN
    RAISE EXCEPTION 'Reviewed compiler job not found' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE((job_row.result ->> 'published')::boolean, false) THEN
    RETURN jsonb_build_object(
      'publication_id', job_row.result ->> 'publicationId',
      'pointer_revision', (job_row.result ->> 'pointerRevision')::bigint,
      'artifact_hash', job_row.candidate_artifact_hash,
      'idempotent', true
    );
  END IF;
  IF job_row.state <> 'succeeded'
    OR job_row.candidate_artifact IS NULL
    OR job_row.candidate_artifact_hash IS NULL
    OR job_row.candidate_compiler_version IS NULL
    OR job_row.candidate_source_revision IS NULL
    OR job_row.result IS NULL
  THEN
    RAISE EXCEPTION 'Persisted compiler candidate is not publishable'
      USING ERRCODE = '55000';
  END IF;
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations installation
  WHERE installation.id = job_row.installation_id
    AND installation.store_id = p_store_id
  FOR UPDATE;
  IF installation_row.id IS NULL
    OR installation_row.status NOT IN ('staged', 'active')
    OR installation_row.source_revision IS DISTINCT FROM job_row.candidate_source_revision
    OR private.current_adaptive_storefront_source_revision(
      p_store_id, job_row.installation_id
    ) IS DISTINCT FROM job_row.candidate_source_revision
  THEN
    RAISE EXCEPTION 'Canonical source changed after shadow review'
      USING ERRCODE = '40001';
  END IF;
  shadow_id := (job_row.result ->> 'shadowId')::uuid;
  SELECT * INTO shadow_row
  FROM public.adaptive_storefront_shadow_compilations shadow
  WHERE shadow.id = shadow_id
    AND shadow.store_id = p_store_id
    AND shadow.installation_id = job_row.installation_id
    AND shadow.artifact_hash = job_row.candidate_artifact_hash
    AND shadow.source_revision = job_row.candidate_source_revision
    AND shadow.source_hash = installation_row.source_hash
    AND shadow.compiled_source_hash = job_row.candidate_artifact ->> 'sourceHash'
    AND shadow.status = 'accepted'
  FOR SHARE;
  IF shadow_row.id IS NULL THEN
    RAISE EXCEPTION 'Accepted exact shadow review required' USING ERRCODE = '23514';
  END IF;

  IF installation_row.status = 'active' THEN
    publication := public.publish_adaptive_storefront(
      p_store_id, installation_row.id, job_row.candidate_source_revision,
      job_row.candidate_artifact, job_row.candidate_artifact_hash,
      job_row.candidate_compiler_version, p_expected_pointer_revision
    );
  ELSE
    publication := public.activate_adaptive_store_kit_installation(
      p_store_id, installation_row.id, shadow_row.id, installation_row.revision,
      job_row.candidate_source_revision, installation_row.source_hash,
      job_row.candidate_artifact, job_row.candidate_artifact_hash,
      job_row.candidate_compiler_version, p_expected_pointer_revision
    );
    publication := jsonb_build_object(
      'publication_id', publication ->> 'publicationId',
      'pointer_revision', (publication ->> 'pointerRevision')::bigint,
      'artifact_hash', publication ->> 'artifactHash'
    );
  END IF;

  UPDATE public.adaptive_storefront_compile_jobs
  SET result = result || jsonb_build_object(
      'shadowStatus', 'accepted',
      'publicationId', publication ->> 'publication_id',
      'pointerRevision', (publication ->> 'pointer_revision')::bigint,
      'published', true
    ),
    updated_at = clock_timestamp(),
    completed_at = COALESCE(completed_at, clock_timestamp())
  WHERE id = job_row.id;
  INSERT INTO public.adaptive_storefront_compile_job_events(job_id, state, details)
  VALUES (
    job_row.id,
    'published-reviewed',
    jsonb_build_object('shadowId', shadow_row.id, 'pointerRevision', publication -> 'pointer_revision')
  );
  RETURN publication || jsonb_build_object('idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION public.record_adaptive_compile_job_shadow(uuid, jsonb, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_adaptive_compile_job_shadow(uuid, jsonb, jsonb, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.record_adaptive_shadow_visual_evidence(uuid, bigint, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_adaptive_shadow_visual_evidence(uuid, bigint, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.review_adaptive_shadow_compilation(uuid, uuid, bigint, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_adaptive_shadow_compilation(uuid, uuid, bigint, text, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.publish_reviewed_adaptive_storefront_compile_job(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_reviewed_adaptive_storefront_compile_job(uuid, uuid, bigint)
  TO service_role;

COMMENT ON FUNCTION public.review_adaptive_shadow_compilation(uuid, uuid, bigint, text, text)
IS 'Capability-checked accept/reject of one exact persisted pending shadow with optimistic revision and idempotency; accepts no artifact identity.';
COMMENT ON FUNCTION public.publish_reviewed_adaptive_storefront_compile_job(uuid, uuid, bigint)
IS 'Service-only atomic publication of the exact persisted candidate and accepted shadow; never recompiles or accepts browser artifact bytes.';

-- Once an adaptive publication is live it is the exact comparison baseline for
-- later adaptive edits. Only the first migration from an opaque legacy snapshot
-- needs a certified legacy adapter or service-owned visual evidence.
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
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  current_revision bigint;
  patches jsonb;
  comparison_snapshot jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id
    AND status IN ('staged', 'active');
  IF installation_row.id IS NULL OR installation_row.store_definition IS NULL
    OR installation_row.source_hash IS NULL
  THEN
    RAISE EXCEPTION 'Canonical staged StoreKit source not found' USING ERRCODE = 'P0002';
  END IF;
  current_revision := private.current_adaptive_storefront_source_revision(
    p_store_id, p_installation_id
  );
  IF current_revision IS NULL OR current_revision <> p_expected_source_revision
    OR installation_row.source_revision <> current_revision
  THEN
    RAISE EXCEPTION 'Adaptive storefront source revision conflict'
      USING ERRCODE = '40001';
  END IF;
  SELECT COALESCE(jsonb_agg(patch.source_patch ORDER BY patch.revision), '[]'::jsonb)
  INTO patches
  FROM public.adaptive_merchant_patches patch
  WHERE patch.installation_id = p_installation_id
    AND patch.source_patch IS NOT NULL
    AND patch.state <> 'superseded';

  SELECT artifact.artifact INTO comparison_snapshot
  FROM public.adaptive_storefront_active_publications pointer
  JOIN public.adaptive_storefront_publications publication
    ON publication.id = pointer.publication_id
  JOIN public.adaptive_storefront_runtime_artifacts artifact
    ON artifact.id = publication.artifact_id
  WHERE pointer.store_id = p_store_id;
  IF comparison_snapshot IS NULL THEN
    SELECT publication.snapshot INTO comparison_snapshot
    FROM public.storefront_publications publication
    WHERE publication.store_id = p_store_id
    ORDER BY publication.revision DESC LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'sourceRevision', current_revision,
    'sourceHash', installation_row.source_hash,
    'storeDefinition', installation_row.store_definition,
    'merchantPatches', patches,
    'assets', '[]'::jsonb,
    'legacySnapshot', comparison_snapshot
  );
END;
$$;

COMMENT ON FUNCTION public.load_adaptive_storefront_compile_source(uuid, uuid, bigint)
IS 'Loads canonical source and prefers the exact active adaptive artifact as the shadow baseline; falls back to the legacy publication only before adaptive activation.';
