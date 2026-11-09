-- Adaptive Commerce v3 merchant release-review read model.
--
-- The browser may inspect the state of one exact canonical source revision,
-- but it never receives candidate artifact bytes and cannot select an artifact
-- hash. Review and publication remain separate capability/service boundaries.

CREATE OR REPLACE FUNCTION public.load_adaptive_storefront_release_review(
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
  job_row public.adaptive_storefront_compile_jobs%ROWTYPE;
  shadow_row public.adaptive_storefront_shadow_compilations%ROWTYPE;
  canonical_revision bigint;
  live_pointer_revision bigint := 0;
  live_publication_id uuid;
  live_installation_id uuid;
  live_source_revision bigint;
  live_artifact_hash text;
  current_publication jsonb := NULL;
  latest_job jsonb := NULL;
  shadow_review jsonb := NULL;
  safe_structural_diff jsonb := NULL;
  safe_visual_diff jsonb := NULL;
  safe_changes jsonb := '[]'::jsonb;
  job_is_current boolean := false;
BEGIN
  IF auth.uid() IS NULL
    OR NOT (
      private.has_store_capability(p_store_id, 'theme.read', auth.uid())
      OR private.has_store_capability(p_store_id, 'theme.publish', auth.uid())
    )
  THEN
    RAISE EXCEPTION 'Theme read capability required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_source_revision < 1 THEN
    RAISE EXCEPTION 'Invalid adaptive source revision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations installation
  WHERE installation.id = p_installation_id
    AND installation.store_id = p_store_id
    AND installation.status IN ('staged', 'active');
  canonical_revision := private.current_adaptive_storefront_source_revision(
    p_store_id, p_installation_id
  );
  IF installation_row.id IS NULL
    OR canonical_revision IS NULL
    OR canonical_revision <> p_expected_source_revision
    OR installation_row.source_revision IS DISTINCT FROM canonical_revision
  THEN
    RAISE EXCEPTION 'Adaptive release review source revision conflict'
      USING ERRCODE = '40001';
  END IF;

  SELECT
    pointer.pointer_revision,
    publication.id,
    artifact.installation_id,
    artifact.source_revision,
    artifact.artifact_hash
  INTO
    live_pointer_revision,
    live_publication_id,
    live_installation_id,
    live_source_revision,
    live_artifact_hash
  FROM public.adaptive_storefront_active_publications pointer
  JOIN public.adaptive_storefront_publications publication
    ON publication.id = pointer.publication_id
  JOIN public.adaptive_storefront_runtime_artifacts artifact
    ON artifact.id = publication.artifact_id
  WHERE pointer.store_id = p_store_id;
  live_pointer_revision := COALESCE(live_pointer_revision, 0);
  IF live_publication_id IS NOT NULL THEN
    current_publication := jsonb_build_object(
      'publicationId', live_publication_id,
      'installationId', live_installation_id,
      'sourceRevision', live_source_revision,
      'pointerRevision', live_pointer_revision
    );
  END IF;

  SELECT * INTO job_row
  FROM public.adaptive_storefront_compile_jobs job
  WHERE job.store_id = p_store_id
    AND job.installation_id = p_installation_id
    AND job.expected_source_revision = p_expected_source_revision
    AND (
      job.candidate_source_revision IS NULL
      OR job.candidate_source_revision = p_expected_source_revision
    )
  ORDER BY job.created_at DESC, job.id DESC
  LIMIT 1;

  IF job_row.id IS NOT NULL THEN
    SELECT * INTO shadow_row
    FROM public.adaptive_storefront_shadow_compilations shadow
    WHERE shadow.store_id = p_store_id
      AND shadow.installation_id = p_installation_id
      AND (
        shadow.origin_compile_job_id = job_row.id
        OR shadow.id::text = COALESCE(job_row.result ->> 'shadowId', '')
      )
    ORDER BY
      (shadow.id::text = COALESCE(job_row.result ->> 'shadowId', '')) DESC,
      shadow.created_at DESC
    LIMIT 1;

    IF shadow_row.id IS NOT NULL THEN
      safe_structural_diff := shadow_row.structural_diff - 'legacyHash' - 'adaptiveHash';
      IF jsonb_typeof(shadow_row.structural_diff -> 'changes') = 'array' THEN
        SELECT COALESCE(
          jsonb_agg(change - 'beforeHash' - 'afterHash'),
          '[]'::jsonb
        ) INTO safe_changes
        FROM jsonb_array_elements(shadow_row.structural_diff -> 'changes') change;
        safe_structural_diff := jsonb_set(
          safe_structural_diff,
          '{changes}',
          safe_changes,
          true
        );
      END IF;
      safe_visual_diff := CASE
        WHEN shadow_row.visual_diff IS NULL THEN NULL
        ELSE shadow_row.visual_diff - 'artifactHash' - 'evidenceHash'
      END;
      shadow_review := jsonb_build_object(
        'shadowId', shadow_row.id,
        'status', shadow_row.status,
        'reviewRevision', shadow_row.review_revision,
        'structuralDiff', safe_structural_diff,
        'visualDiff', safe_visual_diff,
        'reviewedAt', shadow_row.reviewed_at
      );
    END IF;

    job_is_current :=
      job_row.state = 'succeeded'
      AND job_row.candidate_artifact_hash IS NOT NULL
      AND live_artifact_hash = job_row.candidate_artifact_hash
      AND live_installation_id = p_installation_id
      AND live_source_revision = p_expected_source_revision;
    latest_job := jsonb_build_object(
      'jobId', job_row.id,
      'state', job_row.state,
      'requestedAt', job_row.created_at,
      'completedAt', job_row.completed_at,
      'error', CASE
        WHEN job_row.error_code IS NULL THEN NULL
        ELSE jsonb_build_object(
          'code', job_row.error_code,
          'message', COALESCE(job_row.error_message, 'Adaptive validation failed.')
        )
      END,
      'shadow', shadow_review,
      'published', COALESCE(job_row.result ->> 'published', 'false') = 'true',
      'isCurrent', job_is_current
    );
  END IF;

  RETURN jsonb_build_object(
    'kind', 'adaptive-release-review-snapshot',
    'storeId', p_store_id,
    'installationId', p_installation_id,
    'sourceRevision', canonical_revision,
    'currentPointerRevision', live_pointer_revision,
    'currentPublication', current_publication,
    'latestJob', latest_job
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_adaptive_storefront_release_review(uuid, uuid, bigint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_adaptive_storefront_release_review(uuid, uuid, bigint)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.load_adaptive_storefront_release_review(uuid, uuid, bigint)
IS 'Capability-checked read model for one exact installation/source revision; returns compile and review state without candidate artifact bytes or a publishable artifact selector.';
