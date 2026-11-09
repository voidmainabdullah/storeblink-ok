-- Adaptive Commerce v3 staged StoreKit activation.
--
-- A browser may stage canonical source, but it cannot supply an artifact or
-- move the active pointer. The trusted compiler activates only the exact
-- accepted shadow candidate in one transaction.

ALTER TABLE public.adaptive_store_kit_installations
  ADD COLUMN IF NOT EXISTS preset_id text,
  ADD COLUMN IF NOT EXISTS design_token_overrides jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(design_token_overrides) = 'array'),
  ADD COLUMN IF NOT EXISTS commerce_bindings jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(commerce_bindings) = 'array'),
  ADD COLUMN IF NOT EXISTS store_definition jsonb
    CHECK (store_definition IS NULL OR jsonb_typeof(store_definition) = 'object'),
  ADD COLUMN IF NOT EXISTS source_revision bigint
    CHECK (source_revision IS NULL OR source_revision > 0),
  ADD COLUMN IF NOT EXISTS source_hash text
    CHECK (source_hash IS NULL OR source_hash ~ '^sha256:[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS stage_request_hash text
    CHECK (stage_request_hash IS NULL OR stage_request_hash ~ '^sha256:[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.adaptive_merchant_patches
  ADD COLUMN IF NOT EXISTS external_patch_id text,
  ADD COLUMN IF NOT EXISTS source_patch jsonb
    CHECK (source_patch IS NULL OR jsonb_typeof(source_patch) = 'object');

-- A semantic base and patch sequence may legitimately be reused by a newer
-- staged installation. Identity is installation-scoped, not store-global.
ALTER TABLE public.adaptive_storefront_base_revisions
  DROP CONSTRAINT IF EXISTS adaptive_storefront_base_revisions_store_id_input_hash_key;
CREATE UNIQUE INDEX IF NOT EXISTS adaptive_base_installation_input_hash_idx
  ON public.adaptive_storefront_base_revisions(installation_id, input_hash);

ALTER TABLE public.adaptive_merchant_patches
  DROP CONSTRAINT IF EXISTS adaptive_merchant_patches_store_id_revision_key;
CREATE UNIQUE INDEX IF NOT EXISTS adaptive_patch_installation_revision_idx
  ON public.adaptive_merchant_patches(installation_id, revision);
CREATE UNIQUE INDEX IF NOT EXISTS adaptive_patch_installation_external_id_idx
  ON public.adaptive_merchant_patches(installation_id, external_patch_id)
  WHERE external_patch_id IS NOT NULL;

ALTER TABLE public.adaptive_storefront_shadow_compilations
  ADD COLUMN IF NOT EXISTS source_revision bigint
    CHECK (source_revision IS NULL OR source_revision > 0),
  ADD COLUMN IF NOT EXISTS source_hash text
    CHECK (source_hash IS NULL OR source_hash ~ '^sha256:[a-f0-9]{64}$'),
  ADD COLUMN IF NOT EXISTS compiled_source_hash text
    CHECK (compiled_source_hash IS NULL OR compiled_source_hash ~ '^sha256:[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION private.adaptive_jsonb_sha256(p_value jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
  SELECT 'sha256:' || encode(digest(convert_to(p_value::text, 'UTF8'), 'sha256'), 'hex');
$$;

-- Preserve installations created by the short-lived one-shot RPC. It never
-- accepted presets, token overrides, or commerce bindings, so those values are
-- truthfully reconstructed as the released default plus empty merchant arrays.
UPDATE public.adaptive_merchant_patches patch
SET external_patch_id = COALESCE(patch.external_patch_id, patch.id::text),
  source_patch = COALESCE(patch.source_patch, jsonb_build_object(
    'id', patch.id::text,
    'storeId', patch.store_id::text,
    'baseRevisionId', base.definition ->> 'revisionId',
    'sequence', patch.revision,
    'status', CASE WHEN patch.state IN ('clean', 'resolved') THEN 'active' ELSE 'conflicted' END,
    'operations', patch.operations,
    'createdAt', patch.created_at,
    'createdBy', COALESCE(patch.created_by::text, 'system')
  ))
FROM public.adaptive_storefront_base_revisions base
WHERE patch.base_revision_id = base.id
  AND (patch.external_patch_id IS NULL OR patch.source_patch IS NULL);

WITH source_parts AS (
  SELECT installation.id,
    installation.store_id,
    installation.store_kit_id,
    installation.store_kit_version,
    installation.lockfile,
    installation.preset_id,
    store.locale,
    store.currency,
    kit.integrity_hash,
    kit.definition ->> 'defaultPresetId' AS default_preset_id,
    base.definition AS base_definition,
    source.revision AS source_revision,
    COALESCE(jsonb_agg(patch.source_patch ORDER BY patch.revision)
      FILTER (WHERE patch.id IS NOT NULL), '[]'::jsonb) AS patches,
    COALESCE(jsonb_agg(patch.external_patch_id ORDER BY patch.revision)
      FILTER (WHERE patch.id IS NOT NULL), '[]'::jsonb) AS patch_ids
  FROM public.adaptive_store_kit_installations installation
  JOIN public.stores store ON store.id = installation.store_id
  JOIN public.adaptive_store_kit_versions kit
    ON kit.store_kit_id = installation.store_kit_id
   AND kit.version = installation.store_kit_version
  JOIN LATERAL (
    SELECT revision.definition
    FROM public.adaptive_storefront_base_revisions revision
    WHERE revision.installation_id = installation.id
    ORDER BY revision.revision DESC LIMIT 1
  ) base ON true
  LEFT JOIN public.adaptive_storefront_source_heads source
    ON source.installation_id = installation.id
  LEFT JOIN public.adaptive_merchant_patches patch
    ON patch.installation_id = installation.id AND patch.state <> 'superseded'
  WHERE installation.store_definition IS NULL OR installation.source_hash IS NULL
  GROUP BY installation.id, store.locale, store.currency, kit.integrity_hash,
    kit.definition, base.definition, source.revision
), assembled AS (
  SELECT source_parts.*,
    jsonb_build_object(
      'kind', 'store-definition',
      'schemaVersion', COALESCE((base_definition ->> 'schemaVersion')::integer, 1),
      'storeId', store_id::text,
      'installationId', id::text,
      'storeKit', jsonb_build_object(
        'id', store_kit_id,
        'version', store_kit_version,
        'integrity', integrity_hash
      ),
      'locale', COALESCE(NULLIF(locale, ''), 'en'),
      'currency', COALESCE(NULLIF(currency, ''), 'USD'),
      'base', base_definition,
      'merchantPatchIds', patch_ids,
      'designTokens', jsonb_build_object(
        'presetId', COALESCE(preset_id, default_preset_id),
        'overrides', '[]'::jsonb
      ),
      'commerceBindings', '[]'::jsonb
    ) AS definition
  FROM source_parts
), canonical AS (
  SELECT assembled.*,
    private.adaptive_jsonb_sha256(jsonb_build_object(
      'storeDefinition', definition,
      'merchantPatches', patches
    )) AS canonical_hash
  FROM assembled
)
UPDATE public.adaptive_store_kit_installations installation
SET preset_id = COALESCE(installation.preset_id, canonical.default_preset_id),
  store_definition = canonical.definition,
  source_revision = COALESCE(canonical.source_revision, 1),
  source_hash = canonical.canonical_hash,
  updated_at = clock_timestamp()
FROM canonical
WHERE installation.id = canonical.id;

CREATE OR REPLACE FUNCTION private.prevent_terminal_adaptive_shadow_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.status IN ('accepted', 'rejected', 'uncomparable') THEN
    RAISE EXCEPTION 'Reviewed adaptive shadow records are immutable'
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS adaptive_shadow_terminal_immutable
  ON public.adaptive_storefront_shadow_compilations;
CREATE TRIGGER adaptive_shadow_terminal_immutable
BEFORE UPDATE OR DELETE ON public.adaptive_storefront_shadow_compilations
FOR EACH ROW EXECUTE FUNCTION private.prevent_terminal_adaptive_shadow_change();

CREATE OR REPLACE FUNCTION public.stage_adaptive_store_kit_installation(
  p_store_id uuid,
  p_store_kit_id text,
  p_store_kit_version text,
  p_lockfile jsonb,
  p_design_tokens jsonb,
  p_base_definition jsonb,
  p_merchant_patches jsonb,
  p_commerce_bindings jsonb,
  p_expected_installation_revision bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  store_row public.stores%ROWTYPE;
  kit_row public.adaptive_store_kit_versions%ROWTYPE;
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  base_revision_id uuid;
  new_installation_id uuid;
  current_revision bigint;
  next_revision bigint;
  current_source_revision bigint;
  request_hash text;
  canonical_source_hash text;
  store_definition jsonb;
  selected_preset_id text;
  patch_ids jsonb;
  pin_count integer;
  replayed boolean := false;
BEGIN
  IF auth.uid() IS NULL
    OR NOT private.has_store_capability(p_store_id, 'theme.edit', auth.uid())
  THEN
    RAISE EXCEPTION 'Theme edit capability required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_lockfile) <> 'object'
    OR jsonb_typeof(p_design_tokens) <> 'object'
    OR NOT (p_design_tokens ? 'presetId')
    OR jsonb_typeof(p_design_tokens -> 'overrides') <> 'array'
    OR jsonb_typeof(p_base_definition) <> 'object'
    OR COALESCE(p_base_definition ->> 'schemaVersion', '') !~ '^[1-9][0-9]*$'
    OR COALESCE(p_base_definition ->> 'baseHash', '') !~ '^sha256:[a-f0-9]{64}$'
    OR COALESCE(p_base_definition ->> 'revisionId', '') = ''
    OR jsonb_typeof(p_base_definition -> 'values') <> 'object'
    OR jsonb_typeof(p_base_definition -> 'collections') <> 'object'
    OR jsonb_typeof(p_merchant_patches) <> 'array'
    OR jsonb_typeof(p_commerce_bindings) <> 'array'
    OR p_expected_installation_revision < 0
    OR length(trim(p_idempotency_key)) NOT BETWEEN 8 AND 200
  THEN
    RAISE EXCEPTION 'Invalid StoreKit staging payload' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_merchant_patches) patch
    WHERE jsonb_typeof(patch) <> 'object'
      OR COALESCE(patch ->> 'id', '') = ''
      OR patch ->> 'storeId' <> p_store_id::text
      OR patch ->> 'baseRevisionId' <> p_base_definition ->> 'revisionId'
      OR patch ->> 'status' <> 'active'
      OR jsonb_typeof(patch -> 'operations') <> 'array'
      OR jsonb_array_length(patch -> 'operations') = 0
  ) OR (
    SELECT count(*) <> count(DISTINCT patch ->> 'id')
    FROM jsonb_array_elements(p_merchant_patches) patch
  ) THEN
    RAISE EXCEPTION 'Invalid or duplicate merchant patch stream' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_merchant_patches) patch,
      LATERAL jsonb_array_elements(patch -> 'operations') operation
    WHERE operation ->> 'op' NOT IN ('set', 'unset', 'insert', 'remove', 'reorder')
      OR COALESCE(operation ->> 'target', '') = ''
  ) THEN
    RAISE EXCEPTION 'Invalid merchant patch operation' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_commerce_bindings) binding
    WHERE jsonb_typeof(binding) <> 'object'
      OR COALESCE(binding ->> 'id', '') = ''
      OR binding #>> '{source,kind}' NOT IN (
        'store', 'product', 'collection', 'page', 'cart', 'search'
      )
      OR COALESCE(binding ->> 'field', '') !~
        '^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)*$'
      OR COALESCE(binding #>> '{target,path}', '') = ''
      OR binding #>> '{target,property}' NOT IN (
        'text', 'label', 'src', 'alt', 'href', 'items', 'price',
        'compareAtPrice', 'inventory', 'variant', 'media', 'visibility'
      )
  ) OR (
    SELECT count(*) <> count(DISTINCT binding ->> 'id')
    FROM jsonb_array_elements(p_commerce_bindings) binding
  ) THEN
    RAISE EXCEPTION 'Invalid or duplicate commerce bindings' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_design_tokens -> 'overrides') override
    WHERE jsonb_typeof(override) <> 'object'
      OR COALESCE(override ->> 'address', '') !~ '^(semantic|component):[A-Za-z0-9._-]+$'
      OR jsonb_typeof(override -> 'value') <> 'object'
      OR override #>> '{value,$type}' NOT IN (
        'color', 'dimension', 'duration', 'fontFamily', 'fontWeight',
        'number', 'cubicBezier', 'string', 'boolean'
      )
      OR NOT ((override -> 'value') ? '$value')
  ) OR (
    SELECT count(*) <> count(DISTINCT override ->> 'address')
    FROM jsonb_array_elements(p_design_tokens -> 'overrides') override
  ) THEN
    RAISE EXCEPTION 'Invalid or duplicate merchant token overrides' USING ERRCODE = '22023';
  END IF;

  request_hash := private.adaptive_jsonb_sha256(jsonb_build_object(
    'storeKitId', p_store_kit_id,
    'storeKitVersion', p_store_kit_version,
    'lockfile', p_lockfile,
    'designTokens', p_design_tokens,
    'base', p_base_definition,
    'merchantPatches', p_merchant_patches,
    'commerceBindings', p_commerce_bindings
  ));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE store_id = p_store_id AND idempotency_key = trim(p_idempotency_key)
  FOR UPDATE;
  IF installation_row.id IS NOT NULL THEN
    IF installation_row.stage_request_hash IS DISTINCT FROM request_hash
      OR installation_row.status <> 'staged'
    THEN
      RAISE EXCEPTION 'Idempotency key belongs to a different staging request'
        USING ERRCODE = '23505';
    END IF;
    replayed := true;
    SELECT id INTO base_revision_id
    FROM public.adaptive_storefront_base_revisions
    WHERE installation_id = installation_row.id
    ORDER BY revision DESC LIMIT 1;
    current_source_revision := private.current_adaptive_storefront_source_revision(
      p_store_id, installation_row.id
    );
  ELSE
    SELECT * INTO store_row
    FROM public.stores
    WHERE id = p_store_id AND deleted_at IS NULL
    FOR UPDATE;
    IF store_row.id IS NULL THEN
      RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO kit_row
    FROM public.adaptive_store_kit_versions
    WHERE store_kit_id = p_store_kit_id
      AND version = p_store_kit_version
      AND status = 'released';
    IF kit_row.store_kit_id IS NULL OR kit_row.lockfile <> p_lockfile THEN
      RAISE EXCEPTION 'Exact released StoreKit lockfile not found' USING ERRCODE = 'P0002';
    END IF;
    IF NOT private.adaptive_lockfile_has_all_routes(p_lockfile)
      OR (SELECT count(*) FROM jsonb_object_keys(p_lockfile -> 'blueprints')) <> 8
    THEN
      RAISE EXCEPTION 'StoreKit lockfile must contain exactly eight routes'
        USING ERRCODE = '23514';
    END IF;
    SELECT count(*) INTO pin_count
    FROM public.adaptive_store_kit_blueprint_pins pin
    JOIN public.adaptive_template_blueprint_versions blueprint
      ON blueprint.blueprint_id = pin.blueprint_id
     AND blueprint.version = pin.blueprint_version
     AND blueprint.status = 'released'
     AND blueprint.integrity_hash = pin.integrity_hash
    WHERE pin.store_kit_id = p_store_kit_id
      AND pin.store_kit_version = p_store_kit_version
      AND p_lockfile #>> ARRAY['blueprints', pin.resource_type, 'id'] = pin.blueprint_id
      AND p_lockfile #>> ARRAY['blueprints', pin.resource_type, 'version'] = pin.blueprint_version
      AND p_lockfile #>> ARRAY['blueprints', pin.resource_type, 'integrity'] = pin.integrity_hash;
    IF pin_count <> 8 THEN
      RAISE EXCEPTION 'StoreKit blueprint lockfile does not match eight released pins'
        USING ERRCODE = '23514';
    END IF;
    PERFORM 1
    FROM public.adaptive_design_pack_versions design_pack,
         public.adaptive_component_library_versions component_library
    WHERE design_pack.design_pack_id = kit_row.design_pack_id
      AND design_pack.version = kit_row.design_pack_version
      AND design_pack.status = 'released'
      AND design_pack.integrity_hash = p_lockfile #>> '{designPack,integrity}'
      AND component_library.component_library_id = kit_row.component_library_id
      AND component_library.version = kit_row.component_library_version
      AND component_library.status = 'released'
      AND component_library.integrity_hash = p_lockfile #>> '{componentLibrary,integrity}';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'StoreKit dependencies are not exact released versions'
        USING ERRCODE = '23514';
    END IF;

    selected_preset_id := p_design_tokens ->> 'presetId';
    IF selected_preset_id IS NOT NULL THEN
      PERFORM 1
      FROM public.adaptive_design_pack_versions design_pack,
        LATERAL jsonb_array_elements(design_pack.definition -> 'presets') preset
      WHERE design_pack.design_pack_id = kit_row.design_pack_id
        AND design_pack.version = kit_row.design_pack_version
        AND preset ->> 'id' = selected_preset_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected preset is not declared by the released DesignPack'
          USING ERRCODE = '23514';
      END IF;
    END IF;

    SELECT COALESCE(jsonb_agg(patch ->> 'id' ORDER BY ordinal), '[]'::jsonb)
    INTO patch_ids
    FROM jsonb_array_elements(p_merchant_patches) WITH ORDINALITY item(patch, ordinal);

    SELECT COALESCE(max(revision), 0) INTO current_revision
    FROM public.adaptive_store_kit_installations
    WHERE store_id = p_store_id;
    IF current_revision <> p_expected_installation_revision THEN
      RAISE EXCEPTION 'Installation revision conflict: expected %, current %',
        p_expected_installation_revision, current_revision USING ERRCODE = '40001';
    END IF;
    next_revision := current_revision + 1;
    new_installation_id := gen_random_uuid();
    store_definition := jsonb_build_object(
      'kind', 'store-definition',
      'schemaVersion', COALESCE((p_base_definition ->> 'schemaVersion')::integer, 1),
      'storeId', p_store_id::text,
      'installationId', new_installation_id::text,
      'storeKit', jsonb_build_object(
        'id', p_store_kit_id,
        'version', p_store_kit_version,
        'integrity', kit_row.integrity_hash
      ),
      'locale', COALESCE(NULLIF(store_row.locale, ''), 'en'),
      'currency', COALESCE(NULLIF(store_row.currency, ''), 'USD'),
      'base', p_base_definition,
      'merchantPatchIds', patch_ids,
      'designTokens', p_design_tokens,
      'commerceBindings', p_commerce_bindings
    );
    canonical_source_hash := private.adaptive_jsonb_sha256(jsonb_build_object(
      'storeDefinition', store_definition,
      'merchantPatches', p_merchant_patches
    ));

    INSERT INTO public.adaptive_store_kit_installations(
      id, store_id, store_kit_id, store_kit_version, lockfile, status, revision,
      idempotency_key, installed_by, preset_id, design_token_overrides,
      commerce_bindings, store_definition, source_hash, stage_request_hash, updated_at
    ) VALUES (
      new_installation_id, p_store_id, p_store_kit_id, p_store_kit_version,
      p_lockfile, 'staged', next_revision, trim(p_idempotency_key), auth.uid(),
      selected_preset_id, p_design_tokens -> 'overrides', p_commerce_bindings,
      store_definition, canonical_source_hash, request_hash, clock_timestamp()
    ) RETURNING * INTO installation_row;

    INSERT INTO public.adaptive_storefront_base_revisions(
      store_id, installation_id, revision, definition, input_hash
    ) VALUES (
      p_store_id, new_installation_id, 1, p_base_definition,
      private.adaptive_jsonb_sha256(p_base_definition)
    ) RETURNING id INTO base_revision_id;

    INSERT INTO public.adaptive_merchant_patches(
      id, store_id, installation_id, base_revision_id, revision, operations,
      conflicts, state, created_by, created_at, external_patch_id, source_patch
    )
    SELECT gen_random_uuid(), p_store_id, new_installation_id, base_revision_id,
      ordinal, patch -> 'operations', '[]'::jsonb, 'clean', auth.uid(),
      clock_timestamp(), patch ->> 'id', patch
    FROM jsonb_array_elements(p_merchant_patches) WITH ORDINALITY item(patch, ordinal);

    current_source_revision := private.current_adaptive_storefront_source_revision(
      p_store_id, new_installation_id
    );
    UPDATE public.adaptive_store_kit_installations
    SET source_revision = current_source_revision, updated_at = clock_timestamp()
    WHERE id = new_installation_id
    RETURNING * INTO installation_row;
  END IF;

  RETURN jsonb_build_object(
    'kind', 'store-kit-installation-stage-result',
    'outcome', CASE WHEN replayed THEN 'replayed' ELSE 'staged' END,
    'idempotencyKey', installation_row.idempotency_key,
    'installation', jsonb_build_object(
      'kind', 'staged-store-kit-installation',
      'id', installation_row.id::text,
      'storeId', installation_row.store_id::text,
      'storeKitId', installation_row.store_kit_id,
      'storeKitVersion', installation_row.store_kit_version,
      'resolvedLockfile', installation_row.lockfile,
      'presetId', installation_row.preset_id,
      'baseRevisionId', base_revision_id::text,
      'baseDocumentRevisionId', installation_row.store_definition #>> '{base,revisionId}',
      'sourceRevision', current_source_revision,
      'sourceHash', installation_row.source_hash,
      'status', installation_row.status,
      'revision', installation_row.revision,
      'installedAt', installation_row.installed_at,
      'updatedAt', installation_row.updated_at
    )
  );
END;
$$;

-- Staged source must be compilable before it can become active.
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
    AND installation.status IN ('staged', 'active');
$$;

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
  WHERE id = p_installation_id AND store_id = p_store_id
    AND status IN ('staged', 'active');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staged or active StoreKit installation not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.assert_adaptive_storefront_source_revision(
    p_store_id, p_installation_id, p_expected_source_revision
  );

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
  legacy_snapshot jsonb;
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
  SELECT publication.snapshot INTO legacy_snapshot
  FROM public.storefront_publications publication
  WHERE publication.store_id = p_store_id
  ORDER BY publication.revision DESC LIMIT 1;
  RETURN jsonb_build_object(
    'sourceRevision', current_revision,
    'sourceHash', installation_row.source_hash,
    'storeDefinition', installation_row.store_definition,
    'merchantPatches', patches,
    'assets', '[]'::jsonb,
    'legacySnapshot', legacy_snapshot
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_adaptive_installation_shadow(
  p_store_id uuid,
  p_installation_id uuid,
  p_source_revision bigint,
  p_source_hash text,
  p_artifact jsonb,
  p_artifact_hash text,
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
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  shadow_row public.adaptive_storefront_shadow_compilations%ROWTYPE;
  current_revision bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned shadow candidate required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id
    AND status IN ('staged', 'active');
  current_revision := private.current_adaptive_storefront_source_revision(
    p_store_id, p_installation_id
  );
  IF installation_row.id IS NULL
    OR installation_row.source_hash IS DISTINCT FROM p_source_hash
    OR installation_row.source_revision IS DISTINCT FROM p_source_revision
    OR current_revision IS DISTINCT FROM p_source_revision
    OR p_source_hash !~ '^sha256:[a-f0-9]{64}$'
    OR jsonb_typeof(p_artifact) <> 'object'
    OR p_artifact_hash !~ '^sha256:[a-f0-9]{64}$'
    OR p_artifact ->> 'artifactHash' <> p_artifact_hash
    OR p_artifact ->> 'storeId' <> p_store_id::text
    OR p_artifact ->> 'installationId' <> p_installation_id::text
    OR COALESCE(p_artifact ->> 'sourceHash', '') !~ '^sha256:[a-f0-9]{64}$'
    OR jsonb_typeof(p_structural_diff) <> 'object'
    OR (p_visual_diff IS NOT NULL AND jsonb_typeof(p_visual_diff) <> 'object')
    OR p_status NOT IN ('pending', 'accepted', 'rejected', 'uncomparable')
  THEN
    RAISE EXCEPTION 'Shadow candidate does not match the exact staged source'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.adaptive_storefront_shadow_compilations(
    store_id, installation_id, artifact_hash, structural_diff, visual_diff,
    status, reviewed_by, reviewed_at, source_revision, source_hash,
    compiled_source_hash
  ) VALUES (
    p_store_id, p_installation_id, p_artifact_hash, p_structural_diff, p_visual_diff,
    p_status, CASE WHEN p_status <> 'pending' THEN auth.uid() END,
    CASE WHEN p_status <> 'pending' THEN clock_timestamp() END,
    p_source_revision, p_source_hash, p_artifact ->> 'sourceHash'
  )
  ON CONFLICT (store_id, installation_id, artifact_hash) DO NOTHING
  RETURNING * INTO shadow_row;
  IF shadow_row.id IS NULL THEN
    SELECT * INTO shadow_row
    FROM public.adaptive_storefront_shadow_compilations
    WHERE store_id = p_store_id
      AND installation_id = p_installation_id
      AND artifact_hash = p_artifact_hash;
    IF shadow_row.source_revision IS DISTINCT FROM p_source_revision
      OR shadow_row.source_hash IS DISTINCT FROM p_source_hash
      OR shadow_row.compiled_source_hash IS DISTINCT FROM p_artifact ->> 'sourceHash'
      OR shadow_row.status IS DISTINCT FROM p_status
    THEN
      RAISE EXCEPTION 'Shadow idempotency conflict' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN shadow_row.id;
END;
$$;

-- Compatibility for the server compiler introduced immediately before this
-- migration. It derives the missing source identities from the persisted job
-- candidate; arbitrary callers cannot bind a hash to the current source.
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
  job_row public.adaptive_storefront_compile_jobs%ROWTYPE;
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
BEGIN
  SELECT * INTO job_row
  FROM public.adaptive_storefront_compile_jobs
  WHERE store_id = p_store_id
    AND installation_id = p_installation_id
    AND candidate_artifact_hash = p_artifact_hash
    AND state IN ('shadowing', 'publishing', 'succeeded')
  ORDER BY created_at DESC LIMIT 1;
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id;
  IF job_row.id IS NULL OR installation_row.source_hash IS NULL THEN
    RAISE EXCEPTION 'Deprecated shadow RPC requires an exact persisted compiler candidate'
      USING ERRCODE = '55000';
  END IF;
  RETURN public.record_adaptive_installation_shadow(
    p_store_id, p_installation_id, job_row.candidate_source_revision,
    installation_row.source_hash, job_row.candidate_artifact,
    job_row.candidate_artifact_hash, p_structural_diff, p_visual_diff, p_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_adaptive_store_kit_installation(
  p_store_id uuid,
  p_installation_id uuid,
  p_shadow_id uuid,
  p_expected_installation_revision bigint,
  p_expected_source_revision bigint,
  p_expected_source_hash text,
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
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  previous_installation_id uuid;
  shadow_row public.adaptive_storefront_shadow_compilations%ROWTYPE;
  artifact_id uuid;
  new_publication_id uuid;
  previous_publication_id uuid;
  current_pointer_revision bigint;
  current_installation_revision bigint;
  current_source_revision bigint;
  next_publication_revision bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned activation required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_installation_revision < 1
    OR p_expected_source_revision < 1
    OR p_expected_source_hash !~ '^sha256:[a-f0-9]{64}$'
    OR p_expected_pointer_revision < 0
    OR jsonb_typeof(p_artifact) <> 'object'
    OR p_artifact_hash !~ '^sha256:[a-f0-9]{64}$'
    OR p_artifact ->> 'artifactHash' <> p_artifact_hash
    OR p_artifact ->> 'storeId' <> p_store_id::text
    OR p_artifact ->> 'installationId' <> p_installation_id::text
    OR p_artifact ->> 'compilerVersion' <> p_compiler_version
    OR COALESCE(p_artifact ->> 'sourceHash', '') !~ '^sha256:[a-f0-9]{64}$'
    OR jsonb_typeof(p_artifact -> 'routes') <> 'object'
    OR NOT (p_artifact -> 'routes' ?& ARRAY[
      'home', 'product', 'collection', 'page', 'blog', 'cart', 'search', '404'
    ])
    OR (SELECT count(*) FROM jsonb_object_keys(p_artifact -> 'routes')) <> 8
  THEN
    RAISE EXCEPTION 'Invalid compiled activation candidate' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));
  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id
  FOR UPDATE;
  SELECT COALESCE(max(revision), 0) INTO current_installation_revision
  FROM public.adaptive_store_kit_installations
  WHERE store_id = p_store_id;
  current_source_revision := private.current_adaptive_storefront_source_revision(
    p_store_id, p_installation_id
  );
  IF installation_row.id IS NULL OR installation_row.status <> 'staged'
    OR installation_row.revision <> p_expected_installation_revision
    OR current_installation_revision <> p_expected_installation_revision
    OR installation_row.source_revision <> p_expected_source_revision
    OR current_source_revision <> p_expected_source_revision
    OR installation_row.source_hash <> p_expected_source_hash
    OR p_artifact #>> '{storeKit,id}' <> installation_row.store_kit_id
    OR p_artifact #>> '{storeKit,version}' <> installation_row.store_kit_version
  THEN
    RAISE EXCEPTION 'Staged installation revision or source conflict'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO shadow_row
  FROM public.adaptive_storefront_shadow_compilations
  WHERE id = p_shadow_id
    AND store_id = p_store_id
    AND installation_id = p_installation_id
    AND artifact_hash = p_artifact_hash
    AND source_revision = p_expected_source_revision
    AND source_hash = p_expected_source_hash
    AND compiled_source_hash = p_artifact ->> 'sourceHash'
    AND status = 'accepted'
  FOR SHARE;
  IF shadow_row.id IS NULL THEN
    RAISE EXCEPTION 'Accepted immutable shadow for exact source and artifact required'
      USING ERRCODE = '23514';
  END IF;

  SELECT publication_id, pointer_revision
  INTO previous_publication_id, current_pointer_revision
  FROM public.adaptive_storefront_active_publications
  WHERE store_id = p_store_id
  FOR UPDATE;
  current_pointer_revision := COALESCE(current_pointer_revision, 0);
  IF current_pointer_revision <> p_expected_pointer_revision THEN
    RAISE EXCEPTION 'Publication pointer conflict: expected %, current %',
      p_expected_pointer_revision, current_pointer_revision USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.adaptive_storefront_runtime_artifacts(
    store_id, installation_id, source_revision, artifact, artifact_hash, compiler_version
  ) VALUES (
    p_store_id, p_installation_id, p_expected_source_revision, p_artifact,
    p_artifact_hash, p_compiler_version
  )
  ON CONFLICT (store_id, artifact_hash) DO NOTHING
  RETURNING id INTO artifact_id;
  IF artifact_id IS NULL THEN
    SELECT id INTO artifact_id
    FROM public.adaptive_storefront_runtime_artifacts
    WHERE store_id = p_store_id AND installation_id = p_installation_id
      AND source_revision = p_expected_source_revision
      AND artifact_hash = p_artifact_hash AND artifact = p_artifact;
    IF artifact_id IS NULL THEN
      RAISE EXCEPTION 'Artifact hash belongs to another candidate'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  SELECT COALESCE(max(revision), 0) + 1 INTO next_publication_revision
  FROM public.adaptive_storefront_publications
  WHERE store_id = p_store_id;
  INSERT INTO public.adaptive_storefront_publications(
    store_id, artifact_id, installation_id, revision, created_by
  ) VALUES (
    p_store_id, artifact_id, p_installation_id, next_publication_revision, auth.uid()
  ) RETURNING id INTO new_publication_id;

  SELECT id INTO previous_installation_id
  FROM public.adaptive_store_kit_installations
  WHERE store_id = p_store_id AND status = 'active'
  FOR UPDATE;
  UPDATE public.adaptive_store_kit_installations
  SET status = 'archived', archived_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE store_id = p_store_id AND status = 'active' AND id <> p_installation_id;
  UPDATE public.adaptive_store_kit_installations
  SET status = 'active', activated_at = clock_timestamp(), archived_at = NULL,
    updated_at = clock_timestamp()
  WHERE id = p_installation_id AND status = 'staged';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Staged installation changed during activation'
      USING ERRCODE = '40001';
  END IF;

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

  UPDATE public.adaptive_storefront_runtime_assignments
  SET publication_id = new_publication_id, assigned_at = clock_timestamp(),
    reason = 'staged-installation-activated'
  WHERE store_id = p_store_id AND runtime = 'adaptive';

  RETURN jsonb_build_object(
    'kind', 'store-kit-installation-activation-result',
    'installationId', p_installation_id::text,
    'previousInstallationId', previous_installation_id::text,
    'installationRevision', installation_row.revision,
    'sourceRevision', p_expected_source_revision,
    'sourceHash', p_expected_source_hash,
    'artifactId', artifact_id::text,
    'artifactHash', p_artifact_hash,
    'publicationId', new_publication_id::text,
    'publicationRevision', next_publication_revision,
    'pointerRevision', current_pointer_revision + 1,
    'status', 'active'
  );
END;
$$;

-- Compiler-job compatibility: a staged job activates; an already active job
-- uses the normal immutable publication path.
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
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  shadow_id uuid;
  activation jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned compiler required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO job_row FROM public.adaptive_storefront_compile_jobs
  WHERE id = p_job_id FOR UPDATE;
  SELECT * INTO installation_row FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id;
  IF job_row.id IS NULL OR installation_row.id IS NULL
    OR job_row.state <> 'publishing'
    OR job_row.store_id <> p_store_id
    OR job_row.installation_id <> p_installation_id
    OR job_row.expected_source_revision <> p_source_revision
    OR job_row.candidate_source_revision <> p_source_revision
    OR job_row.candidate_artifact_hash <> p_artifact_hash
    OR job_row.candidate_artifact IS NULL
  THEN
    RAISE EXCEPTION 'Compiler job candidate identity mismatch' USING ERRCODE = '22023';
  END IF;
  IF installation_row.status = 'active' THEN
    RETURN public.publish_adaptive_storefront(
      p_store_id, p_installation_id, p_source_revision,
      job_row.candidate_artifact, job_row.candidate_artifact_hash,
      job_row.candidate_compiler_version, p_expected_pointer_revision
    );
  END IF;
  SELECT id INTO shadow_id
  FROM public.adaptive_storefront_shadow_compilations
  WHERE store_id = p_store_id AND installation_id = p_installation_id
    AND artifact_hash = p_artifact_hash
    AND source_revision = p_source_revision
    AND source_hash = installation_row.source_hash
    AND compiled_source_hash = job_row.candidate_artifact ->> 'sourceHash'
    AND status = 'accepted';
  activation := public.activate_adaptive_store_kit_installation(
    p_store_id, p_installation_id, shadow_id, installation_row.revision,
    p_source_revision, installation_row.source_hash, job_row.candidate_artifact,
    job_row.candidate_artifact_hash, job_row.candidate_compiler_version,
    p_expected_pointer_revision
  );
  RETURN jsonb_build_object(
    'artifact_id', activation ->> 'artifactId',
    'publication_id', activation ->> 'publicationId',
    'publication_revision', (activation ->> 'publicationRevision')::bigint,
    'pointer_revision', (activation ->> 'pointerRevision')::bigint,
    'artifact_hash', activation ->> 'artifactHash'
  );
END;
$$;

-- The old one-shot RPC archived the live installation before a server artifact
-- existed. Keeping the signature avoids a silent missing-function fallback,
-- but it now fails loudly and cannot mutate state.
CREATE OR REPLACE FUNCTION public.commit_adaptive_store_kit_installation(
  p_store_id uuid,
  p_store_kit_id text,
  p_store_kit_version text,
  p_lockfile jsonb,
  p_base_definition jsonb,
  p_base_input_hash text,
  p_expected_installation_revision bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'Deprecated unsafe install RPC; use stage_adaptive_store_kit_installation'
    USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.stage_adaptive_store_kit_installation(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stage_adaptive_store_kit_installation(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, text
) TO authenticated;
REVOKE ALL ON FUNCTION public.record_adaptive_installation_shadow(
  uuid, uuid, bigint, text, jsonb, text, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_adaptive_installation_shadow(
  uuid, uuid, bigint, text, jsonb, text, jsonb, jsonb, text
) TO service_role;
REVOKE ALL ON FUNCTION public.record_adaptive_shadow_compilation(
  uuid, uuid, text, jsonb, jsonb, text
) FROM authenticated;
REVOKE ALL ON FUNCTION public.activate_adaptive_store_kit_installation(
  uuid, uuid, uuid, bigint, bigint, text, jsonb, text, text, bigint
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_adaptive_store_kit_installation(
  uuid, uuid, uuid, bigint, bigint, text, jsonb, text, text, bigint
) TO service_role;

COMMENT ON FUNCTION public.stage_adaptive_store_kit_installation(
  uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, bigint, text
) IS 'Stages exact released StoreKit source under a stable installation UUID; never swaps an active pointer.';
COMMENT ON FUNCTION public.activate_adaptive_store_kit_installation(
  uuid, uuid, uuid, bigint, bigint, text, jsonb, text, text, bigint
) IS 'Service-only atomic activation of the exact revision/hash candidate bound to an accepted immutable shadow.';
COMMENT ON FUNCTION public.commit_adaptive_store_kit_installation(
  uuid, text, text, jsonb, jsonb, text, bigint, text
) IS 'Deprecated fail-closed compatibility signature. It performs no installation mutation.';
