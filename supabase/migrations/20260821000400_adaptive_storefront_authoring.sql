-- Adaptive Commerce v3 merchant authoring source boundary.
--
-- This migration exposes canonical, declarative source only. Browser sessions
-- can load and atomically append merchant intent, but cannot claim compiler
-- jobs, persist artifacts, accept shadows, or move publication pointers.

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_authoring_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL
    REFERENCES public.adaptive_store_kit_installations(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 160),
  request_hash text NOT NULL CHECK (request_hash ~ '^sha256:[a-f0-9]{64}$'),
  source_revision bigint NOT NULL CHECK (source_revision > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^sha256:[a-f0-9]{64}$'),
  patch_id uuid REFERENCES public.adaptive_merchant_patches(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, idempotency_key)
);

ALTER TABLE public.adaptive_storefront_authoring_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.adaptive_storefront_authoring_saves FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.load_adaptive_storefront_authoring_source(
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  base_row public.adaptive_storefront_base_revisions%ROWTYPE;
  kit_row public.adaptive_store_kit_versions%ROWTYPE;
  design_pack_definition jsonb;
  component_library_definition jsonb;
  blueprint_definitions jsonb;
  patches jsonb;
  current_source_revision bigint;
  published_source_revision bigint;
BEGIN
  IF auth.uid() IS NULL
    OR NOT private.has_store_capability(p_store_id, 'theme.read', auth.uid())
  THEN
    RAISE EXCEPTION 'Theme read capability required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations installation
  WHERE installation.store_id = p_store_id
    AND installation.status IN ('staged', 'active')
  ORDER BY CASE installation.status WHEN 'staged' THEN 0 ELSE 1 END,
    installation.revision DESC
  LIMIT 1;
  IF installation_row.id IS NULL THEN
    RETURN NULL;
  END IF;
  IF installation_row.store_definition IS NULL
    OR installation_row.source_hash IS NULL
  THEN
    RAISE EXCEPTION 'Adaptive authoring source is incomplete'
      USING ERRCODE = '55000';
  END IF;

  current_source_revision := private.current_adaptive_storefront_source_revision(
    p_store_id, installation_row.id
  );
  IF current_source_revision IS NULL
    OR installation_row.source_revision IS DISTINCT FROM current_source_revision
  THEN
    RAISE EXCEPTION 'Adaptive authoring source revision is inconsistent'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO base_row
  FROM public.adaptive_storefront_base_revisions revision
  WHERE revision.store_id = p_store_id
    AND revision.installation_id = installation_row.id
  ORDER BY revision.revision DESC
  LIMIT 1;
  IF base_row.id IS NULL THEN
    RAISE EXCEPTION 'Adaptive authoring base revision not found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(
    COALESCE(
      patch.source_patch,
      jsonb_build_object(
        'id', COALESCE(patch.external_patch_id, patch.id::text),
        'storeId', patch.store_id::text,
        'baseRevisionId', base_row.definition ->> 'revisionId',
        'sequence', patch.revision,
        'status', CASE
          WHEN patch.state IN ('clean', 'resolved') THEN 'active'
          WHEN patch.state = 'superseded' THEN 'superseded'
          ELSE 'conflicted'
        END,
        'operations', patch.operations,
        'createdAt', patch.created_at,
        'createdBy', COALESCE(patch.created_by::text, 'system')
      )
    ) ORDER BY patch.revision
  ), '[]'::jsonb)
  INTO patches
  FROM public.adaptive_merchant_patches patch
  WHERE patch.store_id = p_store_id
    AND patch.installation_id = installation_row.id
    AND patch.base_revision_id = base_row.id
    AND patch.state <> 'superseded';

  SELECT * INTO kit_row
  FROM public.adaptive_store_kit_versions kit
  WHERE kit.store_kit_id = installation_row.store_kit_id
    AND kit.version = installation_row.store_kit_version
    AND kit.status = 'released';
  IF kit_row.store_kit_id IS NULL THEN
    RAISE EXCEPTION 'Released StoreKit authoring catalog not found'
      USING ERRCODE = 'P0002';
  END IF;
  SELECT design_pack.definition INTO design_pack_definition
  FROM public.adaptive_design_pack_versions design_pack
  WHERE design_pack.design_pack_id = kit_row.design_pack_id
    AND design_pack.version = kit_row.design_pack_version
    AND design_pack.status = 'released';
  SELECT component_library.definition INTO component_library_definition
  FROM public.adaptive_component_library_versions component_library
  WHERE component_library.component_library_id = kit_row.component_library_id
    AND component_library.version = kit_row.component_library_version
    AND component_library.status = 'released';
  SELECT jsonb_agg(blueprint.definition ORDER BY
    array_position(ARRAY['home','product','collection','page','blog','cart','search','404'], pin.resource_type)
  ) INTO blueprint_definitions
  FROM public.adaptive_store_kit_blueprint_pins pin
  JOIN public.adaptive_template_blueprint_versions blueprint
    ON blueprint.blueprint_id = pin.blueprint_id
   AND blueprint.version = pin.blueprint_version
   AND blueprint.status = 'released'
  WHERE pin.store_kit_id = kit_row.store_kit_id
    AND pin.store_kit_version = kit_row.version;
  IF design_pack_definition IS NULL
    OR component_library_definition IS NULL
    OR jsonb_array_length(COALESCE(blueprint_definitions, '[]'::jsonb)) <> 8
  THEN
    RAISE EXCEPTION 'Complete released authoring catalog is required'
      USING ERRCODE = '23514';
  END IF;

  SELECT artifact.source_revision INTO published_source_revision
  FROM public.adaptive_storefront_active_publications pointer
  JOIN public.adaptive_storefront_publications publication
    ON publication.id = pointer.publication_id
  JOIN public.adaptive_storefront_runtime_artifacts artifact
    ON artifact.id = publication.artifact_id
  WHERE pointer.store_id = p_store_id
    AND publication.installation_id = installation_row.id;

  RETURN jsonb_build_object(
    'kind', 'adaptive-storefront-authoring-source',
    'storeId', p_store_id::text,
    'installationId', installation_row.id::text,
    'installationStatus', installation_row.status,
    'installationRevision', installation_row.revision,
    'sourceRevision', current_source_revision,
    'sourceHash', installation_row.source_hash,
    'baseRevisionRowId', base_row.id::text,
    'storeDefinition', installation_row.store_definition,
    'merchantPatches', patches,
    'catalog', jsonb_build_object(
      'designPack', design_pack_definition,
      'componentLibrary', component_library_definition,
      'blueprints', blueprint_definitions
    ),
    'publishedSourceRevision', published_source_revision,
    'reviewState', CASE
      WHEN published_source_revision = current_source_revision THEN 'current'
      ELSE 'review-needed'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_adaptive_storefront_authoring_patch(
  p_store_id uuid,
  p_installation_id uuid,
  p_expected_source_revision bigint,
  p_idempotency_key text,
  p_operations jsonb,
  p_design_tokens jsonb,
  p_commerce_bindings jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
  base_row public.adaptive_storefront_base_revisions%ROWTYPE;
  kit_row public.adaptive_store_kit_versions%ROWTYPE;
  save_row public.adaptive_storefront_authoring_saves%ROWTYPE;
  current_source_revision bigint;
  next_source_revision bigint;
  next_patch_revision bigint;
  inserted_patch_id uuid;
  request_hash text;
  next_source_hash text;
  next_store_definition jsonb;
  canonical_patch jsonb;
  canonical_patches jsonb;
  selected_preset_id text;
  component_library_definition jsonb;
BEGIN
  IF auth.uid() IS NULL
    OR NOT private.has_store_capability(p_store_id, 'theme.edit', auth.uid())
  THEN
    RAISE EXCEPTION 'Theme edit capability required' USING ERRCODE = '42501';
  END IF;
  IF p_expected_source_revision < 1
    OR length(trim(p_idempotency_key)) NOT BETWEEN 8 AND 160
    OR jsonb_typeof(p_operations) <> 'array'
    OR jsonb_array_length(p_operations) > 100
    OR jsonb_typeof(p_design_tokens) <> 'object'
    OR NOT (p_design_tokens ? 'presetId')
    OR jsonb_typeof(p_design_tokens -> 'overrides') <> 'array'
    OR jsonb_typeof(p_commerce_bindings) <> 'array'
  THEN
    RAISE EXCEPTION 'Invalid adaptive authoring save payload' USING ERRCODE = '22023';
  END IF;

  request_hash := private.adaptive_jsonb_sha256(jsonb_build_object(
    'installationId', p_installation_id::text,
    'expectedSourceRevision', p_expected_source_revision,
    'operations', p_operations,
    'designTokens', p_design_tokens,
    'commerceBindings', p_commerce_bindings
  ));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));

  SELECT * INTO save_row
  FROM public.adaptive_storefront_authoring_saves save
  WHERE save.store_id = p_store_id
    AND save.idempotency_key = trim(p_idempotency_key)
  FOR UPDATE;
  IF save_row.id IS NOT NULL THEN
    IF save_row.installation_id <> p_installation_id
      OR save_row.request_hash <> request_hash
    THEN
      RAISE EXCEPTION 'Authoring idempotency key belongs to another request'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'kind', 'adaptive-storefront-authoring-save-result',
      'outcome', 'replayed',
      'storeId', save_row.store_id::text,
      'installationId', save_row.installation_id::text,
      'sourceRevision', save_row.source_revision,
      'sourceHash', save_row.source_hash,
      'patchId', save_row.patch_id::text,
      'reviewState', 'review-needed',
      'compileJobEnqueued', false
    );
  END IF;

  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations installation
  WHERE installation.id = p_installation_id
    AND installation.store_id = p_store_id
    AND installation.status IN ('staged', 'active')
  FOR UPDATE;
  IF installation_row.id IS NULL OR installation_row.store_definition IS NULL THEN
    RAISE EXCEPTION 'Adaptive authoring source not found' USING ERRCODE = 'P0002';
  END IF;
  current_source_revision := private.current_adaptive_storefront_source_revision(
    p_store_id, p_installation_id
  );
  IF current_source_revision IS NULL
    OR current_source_revision <> p_expected_source_revision
    OR installation_row.source_revision IS DISTINCT FROM current_source_revision
  THEN
    RAISE EXCEPTION 'Adaptive authoring source revision conflict'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO base_row
  FROM public.adaptive_storefront_base_revisions revision
  WHERE revision.store_id = p_store_id
    AND revision.installation_id = p_installation_id
  ORDER BY revision.revision DESC LIMIT 1;
  IF base_row.id IS NULL THEN
    RAISE EXCEPTION 'Adaptive authoring base revision not found' USING ERRCODE = 'P0002';
  END IF;

  -- Phase 3 permits scalar semantic updates and ordering of the compiler-owned
  -- route section collection. Arbitrary insertion/removal remains unavailable.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_operations) operation
    WHERE jsonb_typeof(operation) <> 'object'
      OR COALESCE(operation ->> 'target', '') !~ '^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'
      OR length(operation::text) > 20000
      OR CASE operation ->> 'op'
        WHEN 'set' THEN
          NOT (operation ? 'value')
          OR NOT (base_row.definition -> 'values' ? (operation ->> 'target'))
          OR jsonb_typeof(operation -> 'value') IS DISTINCT FROM jsonb_typeof(
            base_row.definition -> 'values' -> (operation ->> 'target')
          )
          OR (
            operation ->> 'target' LIKE '%.settings.%'
            AND operation ->> 'target' !~ '\.settings\.(variant|visible)$'
          )
        WHEN 'reorder' THEN
          COALESCE(operation ->> 'key', '') = ''
          OR NOT (operation ? 'beforeKey')
          OR operation ->> 'target' NOT IN (
            'home.sections', 'product.sections', 'collection.sections',
            'page.sections', 'blog.sections', 'cart.sections',
            'search.sections', 'not-found.sections'
          )
          OR NOT (base_row.definition -> 'collections' ? (operation ->> 'target'))
          OR NOT (
            base_row.definition -> 'collections' -> (operation ->> 'target') -> 'items'
              ? (operation ->> 'key')
          )
          OR (
            operation -> 'beforeKey' IS NOT NULL
            AND jsonb_typeof(operation -> 'beforeKey') <> 'null'
            AND NOT (
              base_row.definition -> 'collections' -> (operation ->> 'target') -> 'items'
                ? (operation ->> 'beforeKey')
            )
          )
        ELSE true
      END
  ) OR (
    SELECT count(*) <> count(DISTINCT operation ->> 'target')
    FROM jsonb_array_elements(p_operations) operation
    WHERE operation ->> 'op' = 'set'
  ) THEN
    RAISE EXCEPTION 'Authoring operations must set declared values or reorder a declared section collection'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO kit_row
  FROM public.adaptive_store_kit_versions kit
  WHERE kit.store_kit_id = installation_row.store_kit_id
    AND kit.version = installation_row.store_kit_version
    AND kit.status = 'released';
  IF kit_row.store_kit_id IS NULL THEN
    RAISE EXCEPTION 'Released StoreKit authoring catalog not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT component_library.definition INTO component_library_definition
  FROM public.adaptive_component_library_versions component_library
  WHERE component_library.component_library_id = kit_row.component_library_id
    AND component_library.version = kit_row.component_library_version
    AND component_library.status = 'released';
  IF component_library_definition IS NULL THEN
    RAISE EXCEPTION 'Released ComponentLibrary authoring policy not found'
      USING ERRCODE = 'P0002';
  END IF;

  -- Only compiler-recognized section properties and controls explicitly owned
  -- by the released ComponentLibrary may become durable merchant intent.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_operations) operation
    WHERE operation ->> 'op' = 'set'
      AND (
        (
          operation ->> 'target' ~ '\.settings\.visible$'
          AND NOT EXISTS (
            SELECT 1
            FROM public.adaptive_store_kit_blueprint_pins pin
            JOIN public.adaptive_template_blueprint_versions blueprint
              ON blueprint.blueprint_id = pin.blueprint_id
             AND blueprint.version = pin.blueprint_version
             AND blueprint.status = 'released'
            CROSS JOIN LATERAL jsonb_array_elements(blueprint.definition -> 'sections') section
            WHERE pin.store_kit_id = kit_row.store_kit_id
              AND pin.store_kit_version = kit_row.version
              AND (section ->> 'path') || '.settings.visible' = operation ->> 'target'
          )
        ) OR (
          operation ->> 'target' ~ '\.settings\.variant$'
          AND NOT EXISTS (
            SELECT 1
            FROM public.adaptive_store_kit_blueprint_pins pin
            JOIN public.adaptive_template_blueprint_versions blueprint
              ON blueprint.blueprint_id = pin.blueprint_id
             AND blueprint.version = pin.blueprint_version
             AND blueprint.status = 'released'
            CROSS JOIN LATERAL jsonb_array_elements(blueprint.definition -> 'sections') section
            CROSS JOIN LATERAL jsonb_array_elements(
              component_library_definition -> 'components'
                -> (section ->> 'componentId') -> 'variants'
            ) variant
            WHERE pin.store_kit_id = kit_row.store_kit_id
              AND pin.store_kit_version = kit_row.version
              AND (section ->> 'path') || '.settings.variant' = operation ->> 'target'
              AND component_library_definition -> 'components'
                -> (section ->> 'componentId') -> 'customization'
                ->> 'allowVariantChange' = 'true'
              AND variant ->> 'id' = operation ->> 'value'
          )
        ) OR (
          operation ->> 'target' NOT LIKE '%.settings.%'
          AND NOT EXISTS (
            SELECT 1
            FROM public.adaptive_store_kit_blueprint_pins pin
            JOIN public.adaptive_template_blueprint_versions blueprint
              ON blueprint.blueprint_id = pin.blueprint_id
             AND blueprint.version = pin.blueprint_version
             AND blueprint.status = 'released'
            CROSS JOIN LATERAL jsonb_array_elements(blueprint.definition -> 'sections') section
            CROSS JOIN LATERAL jsonb_array_elements(
              component_library_definition -> 'components'
                -> (section ->> 'componentId') -> 'properties'
            ) property
            WHERE pin.store_kit_id = kit_row.store_kit_id
              AND pin.store_kit_version = kit_row.version
              AND (section ->> 'path') || '.' || (property ->> 'id') = operation ->> 'target'
              AND component_library_definition -> 'components'
                -> (section ->> 'componentId') -> 'customization'
                -> 'editableProperties' ? (property ->> 'id')
              AND CASE property ->> 'valueType'
                WHEN 'number' THEN jsonb_typeof(operation -> 'value') = 'number'
                WHEN 'boolean' THEN jsonb_typeof(operation -> 'value') = 'boolean'
                WHEN 'string' THEN jsonb_typeof(operation -> 'value') = 'string'
                WHEN 'rich-text' THEN jsonb_typeof(operation -> 'value') = 'string'
                WHEN 'color' THEN jsonb_typeof(operation -> 'value') = 'string'
                ELSE false
              END
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'Authoring properties and section controls must be certified and merchant-editable'
      USING ERRCODE = '22023';
  END IF;
  selected_preset_id := p_design_tokens ->> 'presetId';
  IF selected_preset_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.adaptive_design_pack_versions design_pack,
      LATERAL jsonb_array_elements(design_pack.definition -> 'presets') preset
    WHERE design_pack.design_pack_id = kit_row.design_pack_id
      AND design_pack.version = kit_row.design_pack_version
      AND design_pack.status = 'released'
      AND preset ->> 'id' = selected_preset_id
  ) THEN
    RAISE EXCEPTION 'Selected preset is not certified by this DesignPack'
      USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_design_tokens -> 'overrides') override
    JOIN public.adaptive_design_pack_versions design_pack
      ON design_pack.design_pack_id = kit_row.design_pack_id
     AND design_pack.version = kit_row.design_pack_version
     AND design_pack.status = 'released'
    WHERE jsonb_typeof(override) <> 'object'
      OR COALESCE(override ->> 'address', '') !~ '^(semantic|component):[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$'
      OR jsonb_typeof(override -> 'value') <> 'object'
      OR COALESCE(override #>> '{value,$type}', '') NOT IN (
        'color','dimension','duration','fontFamily','fontWeight','number','cubicBezier','string','boolean'
      )
      OR NOT (override -> 'value' ? '$value')
      OR NOT (
        design_pack.definition -> 'tokens'
          -> split_part(override ->> 'address', ':', 1)
          ? split_part(override ->> 'address', ':', 2)
      )
      OR NOT (
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(
            installation_row.store_definition #> '{designTokens,overrides}', '[]'::jsonb
          )) current_override
          WHERE current_override = override
        )
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(COALESCE(design_pack.definition -> 'presets', '[]'::jsonb)) preset,
            LATERAL jsonb_array_elements(COALESCE(preset -> 'overrides', '[]'::jsonb)) allowed_override
          WHERE allowed_override = override
        )
        OR design_pack.definition -> 'tokens'
          -> split_part(override ->> 'address', ':', 1)
          -> split_part(override ->> 'address', ':', 2) = override -> 'value'
      )
  ) OR (
    SELECT count(*) <> count(DISTINCT override ->> 'address')
    FROM jsonb_array_elements(p_design_tokens -> 'overrides') override
  ) THEN
    RAISE EXCEPTION 'Token overrides must target unique certified semantic or component tokens'
      USING ERRCODE = '22023';
  END IF;

  -- Only selectors on existing bindings are merchant-owned. Source kinds,
  -- fields, target paths/properties, fallbacks, and required flags remain
  -- compiler/catalog-owned and cannot be rewritten by the browser.
  IF jsonb_array_length(p_commerce_bindings) <>
      jsonb_array_length(installation_row.store_definition -> 'commerceBindings')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_commerce_bindings) AS candidate_entry(candidate)
      LEFT JOIN LATERAL (
        SELECT existing
        FROM jsonb_array_elements(
          installation_row.store_definition -> 'commerceBindings'
        ) AS existing_entry(existing)
        WHERE existing ->> 'id' = candidate ->> 'id'
      ) current ON true
      WHERE jsonb_typeof(candidate) <> 'object'
        OR current.existing IS NULL
        OR COALESCE(candidate #>> '{source,kind}', '') NOT IN (
          'store','product','collection','page','cart','search'
        )
        OR (candidate #> '{source,selector}' IS NOT NULL
          AND COALESCE(candidate #>> '{source,selector}', '') = '')
        OR ((candidate -> 'source') - 'selector') <> ((current.existing -> 'source') - 'selector')
        OR (candidate - 'source') <> (current.existing - 'source')
    )
  THEN
    RAISE EXCEPTION 'Commerce authoring may change selectors on existing bindings only'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_array_length(p_operations) = 0
    AND installation_row.store_definition -> 'designTokens' = p_design_tokens
    AND installation_row.store_definition -> 'commerceBindings' = p_commerce_bindings
  THEN
    RAISE EXCEPTION 'Authoring save contains no changes' USING ERRCODE = '22023';
  END IF;

  next_store_definition := jsonb_set(
    jsonb_set(installation_row.store_definition, '{designTokens}', p_design_tokens, false),
    '{commerceBindings}', p_commerce_bindings, false
  );
  IF jsonb_array_length(p_operations) > 0 THEN
    SELECT COALESCE(max(patch.revision), 0) + 1 INTO next_patch_revision
    FROM public.adaptive_merchant_patches patch
    WHERE patch.installation_id = p_installation_id;
    canonical_patch := jsonb_build_object(
      'id', trim(p_idempotency_key),
      'storeId', p_store_id::text,
      'baseRevisionId', base_row.definition ->> 'revisionId',
      'sequence', next_patch_revision,
      'status', 'active',
      'operations', p_operations,
      'createdAt', clock_timestamp(),
      'createdBy', auth.uid()::text
    );
    INSERT INTO public.adaptive_merchant_patches(
      store_id, installation_id, base_revision_id, revision, operations,
      conflicts, state, created_by, external_patch_id, source_patch
    ) VALUES (
      p_store_id, p_installation_id, base_row.id, next_patch_revision,
      p_operations, '[]'::jsonb, 'clean', auth.uid(), trim(p_idempotency_key),
      canonical_patch
    ) RETURNING id INTO inserted_patch_id;
    next_store_definition := jsonb_set(
      next_store_definition,
      '{merchantPatchIds}',
      (next_store_definition -> 'merchantPatchIds') || to_jsonb(trim(p_idempotency_key)),
      false
    );
  ELSE
    UPDATE public.adaptive_storefront_source_heads source
    SET revision = source.revision + 1, updated_at = clock_timestamp()
    WHERE source.store_id = p_store_id
      AND source.installation_id = p_installation_id
    RETURNING source.revision INTO next_source_revision;
    IF next_source_revision IS NULL THEN
      RAISE EXCEPTION 'Adaptive authoring source head not found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  next_source_revision := private.current_adaptive_storefront_source_revision(
    p_store_id, p_installation_id
  );
  SELECT COALESCE(jsonb_agg(patch.source_patch ORDER BY patch.revision), '[]'::jsonb)
  INTO canonical_patches
  FROM public.adaptive_merchant_patches patch
  WHERE patch.installation_id = p_installation_id
    AND patch.base_revision_id = base_row.id
    AND patch.state <> 'superseded';
  next_source_hash := private.adaptive_jsonb_sha256(jsonb_build_object(
    'storeDefinition', next_store_definition,
    'merchantPatches', canonical_patches
  ));
  UPDATE public.adaptive_store_kit_installations
  SET preset_id = selected_preset_id,
    design_token_overrides = p_design_tokens -> 'overrides',
    commerce_bindings = p_commerce_bindings,
    store_definition = next_store_definition,
    source_revision = next_source_revision,
    source_hash = next_source_hash,
    updated_at = clock_timestamp()
  WHERE id = p_installation_id;

  INSERT INTO public.adaptive_storefront_authoring_saves(
    store_id, installation_id, idempotency_key, request_hash,
    source_revision, source_hash, patch_id, created_by
  ) VALUES (
    p_store_id, p_installation_id, trim(p_idempotency_key), request_hash,
    next_source_revision, next_source_hash, inserted_patch_id, auth.uid()
  );

  RETURN jsonb_build_object(
    'kind', 'adaptive-storefront-authoring-save-result',
    'outcome', 'saved',
    'storeId', p_store_id::text,
    'installationId', p_installation_id::text,
    'sourceRevision', next_source_revision,
    'sourceHash', next_source_hash,
    'patchId', inserted_patch_id::text,
    'reviewState', 'review-needed',
    'compileJobEnqueued', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.load_adaptive_storefront_authoring_source(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.load_adaptive_storefront_authoring_source(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.save_adaptive_storefront_authoring_patch(
  uuid, uuid, bigint, text, jsonb, jsonb, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_adaptive_storefront_authoring_patch(
  uuid, uuid, bigint, text, jsonb, jsonb, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.load_adaptive_storefront_authoring_source(uuid)
IS 'Loads canonical staged/active adaptive source plus released declarative authoring policies for a theme.read merchant.';
COMMENT ON FUNCTION public.save_adaptive_storefront_authoring_patch(
  uuid, uuid, bigint, text, jsonb, jsonb, jsonb
)
IS 'Atomically appends one ordered semantic merchant patch and/or certified design/binding choices with revision and idempotency checks; never compiles or publishes.';
