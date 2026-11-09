-- Adaptive Commerce Design Runtime v3
--
-- This migration is intentionally additive. Existing theme_* and profile
-- projections remain the legacy runtime until a store has an accepted shadow
-- compilation and an explicit adaptive rollout assignment.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Theme Studio is a separately authorized package-authoring surface. It is not
-- implied by ordinary theme editing and is granted only to owner/admin roles.
CREATE OR REPLACE FUNCTION private.allowed_store_capabilities()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT ARRAY[
    'theme.read', 'theme.edit', 'theme.publish', 'theme.studio',
    'catalog.read', 'catalog.edit',
    'orders.read', 'orders.manage',
    'store.settings', 'store.members',
    'domains.manage', 'billing.manage', 'assets.manage'
  ]::text[];
$$;

CREATE OR REPLACE FUNCTION private.role_capabilities(p_role text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, private
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN private.allowed_store_capabilities()
    WHEN 'admin' THEN ARRAY[
      'theme.read', 'theme.edit', 'theme.publish', 'theme.studio',
      'catalog.read', 'catalog.edit',
      'orders.read', 'orders.manage',
      'store.settings', 'store.members', 'domains.manage', 'assets.manage'
    ]::text[]
    WHEN 'designer' THEN ARRAY['theme.read', 'theme.edit', 'assets.manage']::text[]
    WHEN 'catalog_manager' THEN ARRAY['theme.read', 'catalog.read', 'catalog.edit', 'assets.manage']::text[]
    WHEN 'support' THEN ARRAY['theme.read', 'catalog.read', 'orders.read', 'orders.manage']::text[]
    WHEN 'viewer' THEN ARRAY['theme.read', 'catalog.read', 'orders.read']::text[]
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE TABLE IF NOT EXISTS public.adaptive_design_pack_versions (
  design_pack_id text NOT NULL,
  version text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  integrity_hash text NOT NULL CHECK (integrity_hash ~ '^sha256:[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'released', 'revoked')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  PRIMARY KEY (design_pack_id, version)
);

CREATE TABLE IF NOT EXISTS public.adaptive_component_library_versions (
  component_library_id text NOT NULL,
  version text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  integrity_hash text NOT NULL CHECK (integrity_hash ~ '^sha256:[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'released', 'revoked')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  PRIMARY KEY (component_library_id, version)
);

CREATE TABLE IF NOT EXISTS public.adaptive_template_blueprint_versions (
  blueprint_id text NOT NULL,
  version text NOT NULL,
  resource_type text NOT NULL CHECK (
    resource_type IN ('home', 'product', 'collection', 'page', 'blog', 'cart', 'search', '404')
  ),
  schema_version integer NOT NULL CHECK (schema_version > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  integrity_hash text NOT NULL CHECK (integrity_hash ~ '^sha256:[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'released', 'revoked')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  PRIMARY KEY (blueprint_id, version)
);

CREATE TABLE IF NOT EXISTS public.adaptive_store_kit_versions (
  store_kit_id text NOT NULL,
  version text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  engine_version text NOT NULL CHECK (
    engine_version ~ '^[0-9]+\.[0-9]+\.[0-9]+([+-][0-9A-Za-z.-]+)?$'
  ),
  design_pack_id text NOT NULL,
  design_pack_version text NOT NULL,
  component_library_id text NOT NULL,
  component_library_version text NOT NULL,
  lockfile jsonb NOT NULL CHECK (jsonb_typeof(lockfile) = 'object'),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  integrity_hash text NOT NULL CHECK (integrity_hash ~ '^sha256:[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'released', 'revoked')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  PRIMARY KEY (store_kit_id, version),
  FOREIGN KEY (design_pack_id, design_pack_version)
    REFERENCES public.adaptive_design_pack_versions(design_pack_id, version),
  FOREIGN KEY (component_library_id, component_library_version)
    REFERENCES public.adaptive_component_library_versions(component_library_id, version)
);

CREATE TABLE IF NOT EXISTS public.adaptive_store_kit_blueprint_pins (
  store_kit_id text NOT NULL,
  store_kit_version text NOT NULL,
  resource_type text NOT NULL CHECK (
    resource_type IN ('home', 'product', 'collection', 'page', 'blog', 'cart', 'search', '404')
  ),
  blueprint_id text NOT NULL,
  blueprint_version text NOT NULL,
  integrity_hash text NOT NULL CHECK (integrity_hash ~ '^sha256:[a-f0-9]{64}$'),
  PRIMARY KEY (store_kit_id, store_kit_version, resource_type),
  FOREIGN KEY (store_kit_id, store_kit_version)
    REFERENCES public.adaptive_store_kit_versions(store_kit_id, version) ON DELETE CASCADE,
  FOREIGN KEY (blueprint_id, blueprint_version)
    REFERENCES public.adaptive_template_blueprint_versions(blueprint_id, version)
);

CREATE TABLE IF NOT EXISTS public.adaptive_store_kit_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  store_kit_id text NOT NULL,
  store_kit_version text NOT NULL,
  lockfile jsonb NOT NULL CHECK (jsonb_typeof(lockfile) = 'object'),
  status text NOT NULL DEFAULT 'staged'
    CHECK (status IN ('staged', 'active', 'archived', 'failed')),
  revision bigint NOT NULL CHECK (revision > 0),
  idempotency_key text NOT NULL CHECK (length(trim(idempotency_key)) >= 8),
  installed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  archived_at timestamptz,
  FOREIGN KEY (store_kit_id, store_kit_version)
    REFERENCES public.adaptive_store_kit_versions(store_kit_id, version),
  UNIQUE (store_id, revision),
  UNIQUE (store_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS adaptive_store_kit_one_active_idx
  ON public.adaptive_store_kit_installations(store_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_base_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL
    REFERENCES public.adaptive_store_kit_installations(id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision > 0),
  definition jsonb NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  input_hash text NOT NULL CHECK (input_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (installation_id, revision),
  UNIQUE (store_id, input_hash)
);

CREATE TABLE IF NOT EXISTS public.adaptive_merchant_patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL
    REFERENCES public.adaptive_store_kit_installations(id) ON DELETE RESTRICT,
  base_revision_id uuid NOT NULL
    REFERENCES public.adaptive_storefront_base_revisions(id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision > 0),
  operations jsonb NOT NULL CHECK (jsonb_typeof(operations) = 'array'),
  conflicts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(conflicts) = 'array'),
  state text NOT NULL DEFAULT 'clean'
    CHECK (state IN ('clean', 'needs_review', 'resolved', 'superseded')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, revision)
);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_runtime_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  installation_id uuid NOT NULL
    REFERENCES public.adaptive_store_kit_installations(id) ON DELETE RESTRICT,
  source_revision bigint NOT NULL CHECK (source_revision >= 0),
  artifact jsonb NOT NULL CHECK (jsonb_typeof(artifact) = 'object'),
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  compiler_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, artifact_hash)
);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  artifact_id uuid NOT NULL
    REFERENCES public.adaptive_storefront_runtime_artifacts(id) ON DELETE RESTRICT,
  installation_id uuid NOT NULL
    REFERENCES public.adaptive_store_kit_installations(id) ON DELETE RESTRICT,
  revision bigint NOT NULL CHECK (revision > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, revision)
);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_active_publications (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  publication_id uuid NOT NULL
    REFERENCES public.adaptive_storefront_publications(id) ON DELETE RESTRICT,
  previous_publication_id uuid
    REFERENCES public.adaptive_storefront_publications(id) ON DELETE RESTRICT,
  pointer_revision bigint NOT NULL DEFAULT 1 CHECK (pointer_revision > 0),
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_shadow_compilations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  installation_id uuid NOT NULL
    REFERENCES public.adaptive_store_kit_installations(id) ON DELETE CASCADE,
  legacy_publication_id uuid REFERENCES public.storefront_publications(id) ON DELETE SET NULL,
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  structural_diff jsonb NOT NULL CHECK (jsonb_typeof(structural_diff) = 'object'),
  visual_diff jsonb CHECK (visual_diff IS NULL OR jsonb_typeof(visual_diff) = 'object'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'uncomparable')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, installation_id, artifact_hash)
);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_runtime_rollouts (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  rollout_salt text NOT NULL,
  percentage integer NOT NULL DEFAULT 0
    CHECK (percentage IN (0, 1, 10, 50, 100)),
  status text NOT NULL DEFAULT 'disabled'
    CHECK (status IN ('disabled', 'running', 'paused', 'rolled_back', 'complete')),
  kill_switch boolean NOT NULL DEFAULT false,
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(thresholds) = 'object'),
  minimum_sample_size integer NOT NULL DEFAULT 100 CHECK (minimum_sample_size > 0),
  cooldown_seconds integer NOT NULL DEFAULT 900 CHECK (cooldown_seconds >= 0),
  evaluator_state jsonb NOT NULL DEFAULT '{"consecutiveHealthyWindows":0,"consecutiveWarningWindows":0,"consecutiveCriticalWindows":0}'::jsonb
    CHECK (jsonb_typeof(evaluator_state) = 'object'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  last_evaluated_at timestamptz,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_runtime_assignments (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  runtime text NOT NULL DEFAULT 'legacy' CHECK (runtime IN ('legacy', 'adaptive')),
  cohort_bucket integer NOT NULL CHECK (cohort_bucket BETWEEN 0 AND 9999),
  publication_id uuid REFERENCES public.adaptive_storefront_publications(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_rum_events (
  event_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('LCP', 'CLS', 'INP', 'render-error')),
  value double precision NOT NULL CHECK (value >= 0 AND value <= 600000),
  route_type text NOT NULL CHECK (
    route_type IN ('home', 'product', 'collection', 'page', 'blog', 'cart', 'search', '404')
  ),
  runtime text NOT NULL CHECK (runtime IN ('legacy', 'adaptive')),
  cohort_bucket integer NOT NULL CHECK (cohort_bucket BETWEEN 0 AND 9999),
  artifact_hash text CHECK (artifact_hash IS NULL OR artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  publication_id text NOT NULL CHECK (publication_id ~ '^[A-Za-z0-9:_-]{1,128}$'),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z0-9_.-]{1,80}$'),
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS adaptive_rum_store_received_idx
  ON public.adaptive_storefront_rum_events(store_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.adaptive_storefront_runtime_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  rollout_percentage integer NOT NULL,
  action text NOT NULL CHECK (action IN ('pause', 'widen', 'rollback', 'kill')),
  reason_code text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  previous_publication_id uuid REFERENCES public.adaptive_storefront_publications(id) ON DELETE SET NULL,
  resulting_publication_id uuid REFERENCES public.adaptive_storefront_publications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.adaptive_ai_plan_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  intent_hash text NOT NULL CHECK (intent_hash ~ '^sha256:[a-f0-9]{64}$'),
  attempts jsonb NOT NULL CHECK (jsonb_typeof(attempts) = 'array'),
  final_plan jsonb,
  outcome text NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'exhausted')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.prevent_adaptive_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION private.protect_released_adaptive_catalog()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF OLD.status IN ('released', 'revoked') THEN
    RAISE EXCEPTION '% % is immutable after release', TG_TABLE_NAME, OLD.version
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION private.adaptive_lockfile_has_all_routes(p_lockfile jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(p_lockfile -> 'blueprints') = 'object'
    AND (p_lockfile -> 'blueprints') ?&
      ARRAY['home', 'product', 'collection', 'page', 'blog', 'cart', 'search', '404'];
$$;

CREATE OR REPLACE FUNCTION private.protect_released_adaptive_blueprint_pin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  kit_status text;
  target_store_kit_id text;
  target_store_kit_version text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_store_kit_id := NEW.store_kit_id;
    target_store_kit_version := NEW.store_kit_version;
  ELSE
    target_store_kit_id := OLD.store_kit_id;
    target_store_kit_version := OLD.store_kit_version;
  END IF;
  SELECT status INTO kit_status
  FROM public.adaptive_store_kit_versions
  WHERE store_kit_id = target_store_kit_id AND version = target_store_kit_version;
  IF kit_status IN ('released', 'revoked') THEN
    RAISE EXCEPTION 'StoreKit blueprint pins are immutable after release'
      USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_adaptive_store_kit_release()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  resolved_pin_count integer;
  released_dependency_count integer;
BEGIN
  IF NEW.status = 'released' AND OLD.status = 'draft' THEN
    IF NOT private.adaptive_lockfile_has_all_routes(NEW.lockfile) THEN
      RAISE EXCEPTION 'StoreKit lockfile must assign all storefront resource types'
        USING ERRCODE = '23514';
    END IF;
    SELECT count(DISTINCT pin.resource_type),
      count(*) FILTER (
        WHERE blueprint.status = 'released'
          AND blueprint.integrity_hash = pin.integrity_hash
      )
    INTO resolved_pin_count, released_dependency_count
    FROM public.adaptive_store_kit_blueprint_pins pin
    JOIN public.adaptive_template_blueprint_versions blueprint
      ON blueprint.blueprint_id = pin.blueprint_id
     AND blueprint.version = pin.blueprint_version
    WHERE pin.store_kit_id = NEW.store_kit_id
      AND pin.store_kit_version = NEW.version;
    IF resolved_pin_count <> 8 OR released_dependency_count <> 8 THEN
      RAISE EXCEPTION 'StoreKit release requires eight released, hash-matched blueprint pins'
        USING ERRCODE = '23514';
    END IF;
    PERFORM 1
    FROM public.adaptive_design_pack_versions design_pack,
         public.adaptive_component_library_versions component_library
    WHERE design_pack.design_pack_id = NEW.design_pack_id
      AND design_pack.version = NEW.design_pack_version
      AND design_pack.status = 'released'
      AND component_library.component_library_id = NEW.component_library_id
      AND component_library.version = NEW.component_library_version
      AND component_library.status = 'released';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'StoreKit release requires released DesignPack and ComponentLibrary pins'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'adaptive_design_pack_versions',
    'adaptive_component_library_versions',
    'adaptive_template_blueprint_versions',
    'adaptive_store_kit_versions'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_protect_released', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.protect_released_adaptive_catalog()',
      table_name || '_protect_released', table_name
    );
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'adaptive_storefront_base_revisions',
    'adaptive_storefront_runtime_artifacts',
    'adaptive_storefront_publications'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_immutable', table_name);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.prevent_adaptive_immutable_change()',
      table_name || '_immutable', table_name
    );
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS adaptive_store_kit_blueprint_pins_protect_released
  ON public.adaptive_store_kit_blueprint_pins;
CREATE TRIGGER adaptive_store_kit_blueprint_pins_protect_released
BEFORE INSERT OR UPDATE OR DELETE ON public.adaptive_store_kit_blueprint_pins
FOR EACH ROW EXECUTE FUNCTION private.protect_released_adaptive_blueprint_pin();

DROP TRIGGER IF EXISTS adaptive_store_kit_versions_validate_release
  ON public.adaptive_store_kit_versions;
CREATE TRIGGER adaptive_store_kit_versions_validate_release
BEFORE UPDATE OF status ON public.adaptive_store_kit_versions
FOR EACH ROW EXECUTE FUNCTION private.validate_adaptive_store_kit_release();

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
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  current_revision bigint;
  next_revision bigint;
  installation_row public.adaptive_store_kit_installations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_store_capability(p_store_id, 'theme.edit', auth.uid()) THEN
    RAISE EXCEPTION 'Theme edit capability required' USING ERRCODE = '42501';
  END IF;
  IF p_base_definition IS NULL OR jsonb_typeof(p_base_definition) <> 'object'
    OR p_base_input_hash !~ '^sha256:[a-f0-9]{64}$'
    OR NOT private.adaptive_lockfile_has_all_routes(p_lockfile)
  THEN
    RAISE EXCEPTION 'Invalid StoreKit installation payload' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));

  SELECT * INTO installation_row
  FROM public.adaptive_store_kit_installations
  WHERE store_id = p_store_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'installation_id', installation_row.id,
      'revision', installation_row.revision,
      'status', installation_row.status,
      'idempotent', true
    );
  END IF;

  PERFORM 1 FROM public.stores WHERE id = p_store_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1
  FROM public.adaptive_store_kit_versions
  WHERE store_kit_id = p_store_kit_id
    AND version = p_store_kit_version
    AND status = 'released';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'StoreKit release not found' USING ERRCODE = 'P0002';
  END IF;
  IF (
    SELECT count(DISTINCT resource_type)
    FROM public.adaptive_store_kit_blueprint_pins
    WHERE store_kit_id = p_store_kit_id AND store_kit_version = p_store_kit_version
  ) <> 8 THEN
    RAISE EXCEPTION 'Released StoreKit must pin all storefront resource types'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(max(revision), 0) INTO current_revision
  FROM public.adaptive_store_kit_installations
  WHERE store_id = p_store_id;
  IF current_revision <> p_expected_installation_revision THEN
    RAISE EXCEPTION 'Installation revision conflict: expected %, current %',
      p_expected_installation_revision, current_revision USING ERRCODE = '40001';
  END IF;
  next_revision := current_revision + 1;

  UPDATE public.adaptive_store_kit_installations
  SET status = 'archived', archived_at = clock_timestamp()
  WHERE store_id = p_store_id AND status = 'active';

  INSERT INTO public.adaptive_store_kit_installations(
    store_id, store_kit_id, store_kit_version, lockfile, status, revision,
    idempotency_key, installed_by, activated_at
  ) VALUES (
    p_store_id, p_store_kit_id, p_store_kit_version, p_lockfile, 'active', next_revision,
    p_idempotency_key, auth.uid(), clock_timestamp()
  ) RETURNING * INTO installation_row;

  INSERT INTO public.adaptive_storefront_base_revisions(
    store_id, installation_id, revision, definition, input_hash
  ) VALUES (
    p_store_id, installation_row.id, 1, p_base_definition, p_base_input_hash
  );

  RETURN jsonb_build_object(
    'installation_id', installation_row.id,
    'revision', installation_row.revision,
    'status', installation_row.status,
    'idempotent', false
  );
END;
$$;

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
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  shadow_id uuid;
BEGIN
  IF auth.role() <> 'service_role'
    AND (auth.uid() IS NULL OR NOT private.has_store_capability(p_store_id, 'theme.publish', auth.uid()))
  THEN
    RAISE EXCEPTION 'Theme publish capability required' USING ERRCODE = '42501';
  END IF;
  IF p_artifact_hash !~ '^sha256:[a-f0-9]{64}$'
    OR p_status NOT IN ('pending', 'accepted', 'rejected', 'uncomparable')
  THEN
    RAISE EXCEPTION 'Invalid shadow compilation payload' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.adaptive_storefront_shadow_compilations(
    store_id, installation_id, artifact_hash, structural_diff, visual_diff,
    status, reviewed_by, reviewed_at
  ) VALUES (
    p_store_id, p_installation_id, p_artifact_hash, p_structural_diff, p_visual_diff,
    p_status, CASE WHEN p_status IN ('accepted', 'rejected') THEN auth.uid() END,
    CASE WHEN p_status IN ('accepted', 'rejected') THEN clock_timestamp() END
  )
  ON CONFLICT (store_id, installation_id, artifact_hash) DO UPDATE SET
    structural_diff = EXCLUDED.structural_diff,
    visual_diff = EXCLUDED.visual_diff,
    status = EXCLUDED.status,
    reviewed_by = EXCLUDED.reviewed_by,
    reviewed_at = EXCLUDED.reviewed_at
  RETURNING id INTO shadow_id;
  RETURN shadow_id;
END;
$$;

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
  publication_id uuid;
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
  FROM public.adaptive_store_kit_installations
  WHERE id = p_installation_id AND store_id = p_store_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Active StoreKit installation not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM 1
  FROM public.adaptive_storefront_shadow_compilations
  WHERE store_id = p_store_id
    AND installation_id = p_installation_id
    AND artifact_hash = p_artifact_hash
    AND status = 'accepted';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accepted shadow compilation required' USING ERRCODE = '23514';
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
    p_store_id, p_installation_id, p_source_revision, p_artifact,
    p_artifact_hash, p_compiler_version
  )
  ON CONFLICT (store_id, artifact_hash) DO NOTHING
  RETURNING id INTO artifact_id;
  IF artifact_id IS NULL THEN
    SELECT id INTO artifact_id
    FROM public.adaptive_storefront_runtime_artifacts
    WHERE store_id = p_store_id AND artifact_hash = p_artifact_hash;
  END IF;

  SELECT COALESCE(max(revision), 0) + 1 INTO next_publication_revision
  FROM public.adaptive_storefront_publications
  WHERE store_id = p_store_id;
  INSERT INTO public.adaptive_storefront_publications(
    store_id, artifact_id, installation_id, revision, created_by
  ) VALUES (
    p_store_id, artifact_id, p_installation_id, next_publication_revision, auth.uid()
  ) RETURNING id INTO publication_id;

  INSERT INTO public.adaptive_storefront_active_publications(
    store_id, publication_id, previous_publication_id, pointer_revision,
    activated_by, activated_at
  ) VALUES (
    p_store_id, publication_id, previous_publication_id,
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
    'publication_id', publication_id,
    'publication_revision', next_publication_revision,
    'pointer_revision', current_pointer_revision + 1,
    'artifact_hash', p_artifact_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_adaptive_storefront_publication(
  p_store_id uuid,
  p_publication_id uuid,
  p_expected_pointer_revision bigint,
  p_reason text DEFAULT 'manual-rollback'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_publication_id uuid;
  current_pointer_revision bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned activation required' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text, 0));
  PERFORM 1 FROM public.adaptive_storefront_publications
  WHERE id = p_publication_id AND store_id = p_store_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Publication not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT publication_id, pointer_revision
  INTO current_publication_id, current_pointer_revision
  FROM public.adaptive_storefront_active_publications
  WHERE store_id = p_store_id FOR UPDATE;
  IF current_pointer_revision IS NULL OR current_pointer_revision <> p_expected_pointer_revision THEN
    RAISE EXCEPTION 'Publication pointer conflict' USING ERRCODE = '40001';
  END IF;
  UPDATE public.adaptive_storefront_active_publications
  SET previous_publication_id = current_publication_id,
      publication_id = p_publication_id,
      pointer_revision = current_pointer_revision + 1,
      activated_by = auth.uid(),
      activated_at = clock_timestamp()
  WHERE store_id = p_store_id;
  UPDATE public.adaptive_storefront_runtime_assignments
  SET publication_id = p_publication_id,
      reason = left(p_reason, 160),
      assigned_at = clock_timestamp()
  WHERE store_id = p_store_id AND runtime = 'adaptive';
  RETURN jsonb_build_object(
    'publication_id', p_publication_id,
    'previous_publication_id', current_publication_id,
    'pointer_revision', current_pointer_revision + 1,
    'reason', p_reason
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_adaptive_storefront_artifact(
  p_handle text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN rollout.store_id IS NULL
      OR rollout.kill_switch
      OR rollout.status NOT IN ('running', 'complete')
      OR assignment.store_id IS NULL
      OR assignment.runtime <> 'adaptive'
      OR artifact.id IS NULL
      OR assignment.cohort_bucket >= rollout.percentage * 100
    THEN jsonb_build_object(
      'runtime', 'legacy',
      'store_id', store.id,
      'cohort_bucket', assignment.cohort_bucket,
      'publication_id', 'legacy:' || COALESCE(profile.theme_revision, 0)::text
    )
    ELSE jsonb_build_object(
      'runtime', 'adaptive',
      'store_id', store.id,
      'cohort_bucket', assignment.cohort_bucket,
      'publication_id', publication.id,
      'publication_revision', publication.revision,
      'artifact_hash', artifact.artifact_hash,
      'artifact', artifact.artifact
    )
  END
  FROM public.stores store
  JOIN public.profiles profile ON profile.id = store.owner_user_id
  LEFT JOIN public.adaptive_storefront_runtime_rollouts rollout
    ON rollout.store_id = store.id
  LEFT JOIN public.adaptive_storefront_runtime_assignments assignment
    ON assignment.store_id = store.id
  LEFT JOIN public.adaptive_storefront_active_publications active
    ON active.store_id = store.id
  LEFT JOIN public.adaptive_storefront_publications publication
    ON publication.id = active.publication_id
  LEFT JOIN public.adaptive_storefront_runtime_artifacts artifact
    ON artifact.id = publication.artifact_id
  WHERE store.handle = lower(trim(p_handle))
    AND store.status = 'published'
    AND store.deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.ingest_adaptive_storefront_rum(
  p_event_id uuid,
  p_handle text,
  p_metric text,
  p_value double precision,
  p_route_type text,
  p_runtime text,
  p_cohort_bucket integer,
  p_artifact_hash text DEFAULT NULL,
  p_publication_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_store_id uuid;
  expected_cohort_bucket integer;
  expected_runtime text;
  expected_publication_id text;
  expected_artifact_hash text;
BEGIN
  SELECT store.id,
    assignment.cohort_bucket,
    CASE
      WHEN rollout.store_id IS NULL OR rollout.kill_switch
        OR rollout.status NOT IN ('running', 'complete')
        OR assignment.store_id IS NULL
        OR assignment.runtime <> 'adaptive'
        OR assignment.cohort_bucket >= rollout.percentage * 100
        OR artifact.id IS NULL
      THEN 'legacy' ELSE 'adaptive'
    END,
    CASE
      WHEN rollout.store_id IS NULL OR rollout.kill_switch
        OR rollout.status NOT IN ('running', 'complete')
        OR assignment.store_id IS NULL
        OR assignment.runtime <> 'adaptive'
        OR assignment.cohort_bucket >= rollout.percentage * 100
        OR artifact.id IS NULL
      THEN 'legacy:' || COALESCE(profile.theme_revision, 0)::text
      ELSE publication.id::text
    END,
    CASE
      WHEN rollout.store_id IS NOT NULL AND NOT rollout.kill_switch
        AND rollout.status IN ('running', 'complete')
        AND assignment.store_id IS NOT NULL
        AND assignment.runtime = 'adaptive'
        AND assignment.cohort_bucket < rollout.percentage * 100
        AND artifact.id IS NOT NULL
      THEN artifact.artifact_hash ELSE NULL
    END
  INTO target_store_id, expected_cohort_bucket, expected_runtime,
    expected_publication_id, expected_artifact_hash
  FROM public.stores store
  JOIN public.profiles profile ON profile.id = store.owner_user_id
  LEFT JOIN public.adaptive_storefront_runtime_assignments assignment ON assignment.store_id = store.id
  LEFT JOIN public.adaptive_storefront_runtime_rollouts rollout ON rollout.store_id = store.id
  LEFT JOIN public.adaptive_storefront_active_publications active ON active.store_id = store.id
  LEFT JOIN public.adaptive_storefront_publications publication ON publication.id = active.publication_id
  LEFT JOIN public.adaptive_storefront_runtime_artifacts artifact ON artifact.id = publication.artifact_id
  WHERE store.handle = lower(trim(p_handle))
    AND store.status = 'published'
    AND store.deleted_at IS NULL;
  IF target_store_id IS NULL THEN RETURN false; END IF;
  IF expected_cohort_bucket IS NULL OR p_cohort_bucket <> expected_cohort_bucket THEN RETURN false; END IF;
  IF p_runtime <> expected_runtime
    OR p_publication_id IS DISTINCT FROM expected_publication_id
    OR p_artifact_hash IS DISTINCT FROM expected_artifact_hash
    OR (p_metric IN ('LCP', 'INP') AND (p_value < 0 OR p_value > 120000))
    OR (p_metric = 'CLS' AND (p_value < 0 OR p_value > 10))
    OR (p_metric = 'render-error' AND p_value NOT IN (0, 1))
  THEN
    RETURN false;
  END IF;
  IF (
    SELECT count(*) FROM public.adaptive_storefront_rum_events
    WHERE store_id = target_store_id AND received_at > clock_timestamp() - interval '1 minute'
  ) >= 120 THEN
    RETURN false;
  END IF;
  INSERT INTO public.adaptive_storefront_rum_events(
    event_id, store_id, metric, value, route_type, runtime, cohort_bucket,
    artifact_hash, publication_id, error_code
  ) VALUES (
    p_event_id, target_store_id, p_metric, p_value, p_route_type, p_runtime,
    p_cohort_bucket, p_artifact_hash, p_publication_id,
    CASE WHEN p_error_code ~ '^[A-Z0-9_.-]{1,80}$' THEN p_error_code END
  ) ON CONFLICT (event_id) DO NOTHING;
  RETURN true;
EXCEPTION WHEN check_violation OR foreign_key_violation OR not_null_violation THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_adaptive_rollout_evaluation(
  p_store_id uuid,
  p_expected_revision bigint,
  p_evaluation jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rollout_row public.adaptive_storefront_runtime_rollouts%ROWTYPE;
  assignment_row public.adaptive_storefront_runtime_assignments%ROWTYPE;
  recommendation text := COALESCE(p_evaluation ->> 'recommendation', '');
  recommended_percentage integer;
  reason_code text := COALESCE(p_evaluation ->> 'reason', 'rollout-evaluation');
  next_status text;
  next_percentage integer;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned rollout evaluator required' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_evaluation) <> 'object'
    OR recommendation NOT IN ('hold', 'pause', 'widen', 'rollback')
  THEN
    RAISE EXCEPTION 'Invalid rollout evaluation' USING ERRCODE = '22023';
  END IF;
  recommended_percentage := (p_evaluation ->> 'recommendedPercentage')::integer;
  IF recommended_percentage NOT IN (0, 1, 10, 50, 100) THEN
    RAISE EXCEPTION 'Invalid rollout percentage' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO rollout_row
  FROM public.adaptive_storefront_runtime_rollouts
  WHERE store_id = p_store_id
  FOR UPDATE;
  IF rollout_row.store_id IS NULL THEN
    RAISE EXCEPTION 'Rollout config not found' USING ERRCODE = 'P0002';
  END IF;
  IF rollout_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Rollout revision conflict' USING ERRCODE = '40001';
  END IF;
  SELECT * INTO assignment_row
  FROM public.adaptive_storefront_runtime_assignments
  WHERE store_id = p_store_id
  FOR UPDATE;

  next_percentage := rollout_row.percentage;
  next_status := rollout_row.status;
  IF rollout_row.kill_switch THEN
    next_percentage := 0;
    next_status := 'rolled_back';
    recommendation := 'rollback';
    reason_code := 'kill-switch';
  ELSIF recommendation = 'widen' THEN
    IF recommended_percentage <= rollout_row.percentage THEN
      RAISE EXCEPTION 'Widen must increase the rollout percentage' USING ERRCODE = '22023';
    END IF;
    next_percentage := recommended_percentage;
    next_status := CASE WHEN recommended_percentage = 100 THEN 'complete' ELSE 'running' END;
  ELSIF recommendation = 'pause' THEN
    next_status := 'paused';
  ELSIF recommendation = 'rollback' THEN
    IF recommended_percentage >= rollout_row.percentage THEN
      RAISE EXCEPTION 'Rollback must reduce the rollout percentage' USING ERRCODE = '22023';
    END IF;
    next_percentage := recommended_percentage;
    next_status := 'rolled_back';
  END IF;

  IF recommendation = 'rollback' AND assignment_row.store_id IS NOT NULL THEN
    UPDATE public.adaptive_storefront_runtime_assignments
    SET runtime = 'legacy', publication_id = NULL,
      reason = left('automatic:' || reason_code, 160), assigned_at = clock_timestamp()
    WHERE store_id = p_store_id;
  END IF;
  IF recommendation IN ('pause', 'widen', 'rollback') THEN
    INSERT INTO public.adaptive_storefront_runtime_incidents(
      store_id, rollout_percentage, action, reason_code, evidence,
      previous_publication_id, resulting_publication_id
    ) VALUES (
      p_store_id, rollout_row.percentage, recommendation, left(reason_code, 120),
      p_evaluation,
      assignment_row.publication_id,
      CASE WHEN recommendation = 'rollback' THEN NULL ELSE assignment_row.publication_id END
    );
  END IF;
  UPDATE public.adaptive_storefront_runtime_rollouts
  SET percentage = next_percentage,
    status = next_status,
    evaluator_state = COALESCE(p_evaluation -> 'nextState', evaluator_state),
    revision = revision + 1,
    last_evaluated_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE store_id = p_store_id;
  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'recommendation', recommendation,
    'percentage', next_percentage,
    'status', next_status,
    'revision', rollout_row.revision + 1
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_adaptive_storefront_runtime_assignment(
  p_store_id uuid,
  p_runtime text,
  p_cohort_bucket integer,
  p_publication_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rollout_row public.adaptive_storefront_runtime_rollouts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Server-owned rollout controller required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO rollout_row
  FROM public.adaptive_storefront_runtime_rollouts
  WHERE store_id = p_store_id FOR UPDATE;
  IF rollout_row.store_id IS NULL THEN
    RAISE EXCEPTION 'Rollout config not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_runtime NOT IN ('legacy', 'adaptive') OR p_cohort_bucket NOT BETWEEN 0 AND 9999
    OR (p_runtime = 'adaptive' AND (
      rollout_row.kill_switch
      OR rollout_row.status NOT IN ('running', 'complete')
      OR p_cohort_bucket >= rollout_row.percentage * 100
      OR p_publication_id IS NULL
    ))
  THEN
    RAISE EXCEPTION 'Invalid runtime assignment' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.adaptive_storefront_runtime_assignments(
    store_id, runtime, cohort_bucket, publication_id, reason, assigned_at
  ) VALUES (
    p_store_id, p_runtime, p_cohort_bucket,
    CASE WHEN p_runtime = 'adaptive' THEN p_publication_id END,
    left(p_reason, 160), clock_timestamp()
  )
  ON CONFLICT (store_id) DO UPDATE SET
    runtime = EXCLUDED.runtime,
    cohort_bucket = EXCLUDED.cohort_bucket,
    publication_id = EXCLUDED.publication_id,
    reason = EXCLUDED.reason,
    assigned_at = EXCLUDED.assigned_at;
  RETURN jsonb_build_object(
    'store_id', p_store_id,
    'runtime', p_runtime,
    'cohort_bucket', p_cohort_bucket,
    'publication_id', CASE WHEN p_runtime = 'adaptive' THEN p_publication_id END
  );
END;
$$;

ALTER TABLE public.adaptive_design_pack_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_component_library_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_template_blueprint_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_store_kit_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_store_kit_blueprint_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_store_kit_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_base_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_merchant_patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_runtime_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_active_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_shadow_compilations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_runtime_rollouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_runtime_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_rum_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_storefront_runtime_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_ai_plan_audits ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'adaptive_design_pack_versions', 'adaptive_component_library_versions',
    'adaptive_template_blueprint_versions', 'adaptive_store_kit_versions',
    'adaptive_store_kit_blueprint_pins'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Public reads released adaptive catalog" ON public.%I', table_name);
    IF table_name = 'adaptive_store_kit_blueprint_pins' THEN
      EXECUTE format(
        'CREATE POLICY "Public reads released adaptive catalog" ON public.%I FOR SELECT TO anon, authenticated USING (EXISTS (SELECT 1 FROM public.adaptive_store_kit_versions kit WHERE kit.store_kit_id = %I.store_kit_id AND kit.version = %I.store_kit_version AND kit.status = ''released''))',
        table_name, table_name, table_name
      );
    ELSE
      EXECUTE format(
        'CREATE POLICY "Public reads released adaptive catalog" ON public.%I FOR SELECT TO anon, authenticated USING (status = ''released'')',
        table_name
      );
    END IF;
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'adaptive_store_kit_installations', 'adaptive_storefront_base_revisions',
    'adaptive_merchant_patches', 'adaptive_storefront_runtime_artifacts',
    'adaptive_storefront_publications', 'adaptive_storefront_active_publications',
    'adaptive_storefront_shadow_compilations', 'adaptive_storefront_runtime_rollouts',
    'adaptive_storefront_runtime_assignments', 'adaptive_storefront_runtime_incidents',
    'adaptive_ai_plan_audits'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Theme readers inspect adaptive state" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "Theme readers inspect adaptive state" ON public.%I FOR SELECT TO authenticated USING (private.has_store_capability(store_id, ''theme.read'', auth.uid()))',
      table_name
    );
  END LOOP;
END;
$$;

GRANT SELECT ON public.adaptive_design_pack_versions TO anon, authenticated;
GRANT SELECT ON public.adaptive_component_library_versions TO anon, authenticated;
GRANT SELECT ON public.adaptive_template_blueprint_versions TO anon, authenticated;
GRANT SELECT ON public.adaptive_store_kit_versions TO anon, authenticated;
GRANT SELECT ON public.adaptive_store_kit_blueprint_pins TO anon, authenticated;

GRANT SELECT ON public.adaptive_store_kit_installations TO authenticated;
GRANT SELECT ON public.adaptive_storefront_base_revisions TO authenticated;
GRANT SELECT ON public.adaptive_merchant_patches TO authenticated;
GRANT SELECT ON public.adaptive_storefront_runtime_artifacts TO authenticated;
GRANT SELECT ON public.adaptive_storefront_publications TO authenticated;
GRANT SELECT ON public.adaptive_storefront_active_publications TO authenticated;
GRANT SELECT ON public.adaptive_storefront_shadow_compilations TO authenticated;
GRANT SELECT ON public.adaptive_storefront_runtime_rollouts TO authenticated;
GRANT SELECT ON public.adaptive_storefront_runtime_assignments TO authenticated;
GRANT SELECT ON public.adaptive_storefront_runtime_incidents TO authenticated;
GRANT SELECT ON public.adaptive_ai_plan_audits TO authenticated;

REVOKE ALL ON FUNCTION public.commit_adaptive_store_kit_installation(uuid, text, text, jsonb, jsonb, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commit_adaptive_store_kit_installation(uuid, text, text, jsonb, jsonb, text, bigint, text) TO authenticated;
REVOKE ALL ON FUNCTION public.record_adaptive_shadow_compilation(uuid, uuid, text, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_adaptive_shadow_compilation(uuid, uuid, text, jsonb, jsonb, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_adaptive_storefront(uuid, uuid, bigint, jsonb, text, text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_adaptive_storefront(uuid, uuid, bigint, jsonb, text, text, bigint) TO service_role;
REVOKE ALL ON FUNCTION public.activate_adaptive_storefront_publication(uuid, uuid, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_adaptive_storefront_publication(uuid, uuid, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.set_adaptive_storefront_runtime_assignment(uuid, text, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_adaptive_storefront_runtime_assignment(uuid, text, integer, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.commit_adaptive_rollout_evaluation(uuid, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_adaptive_rollout_evaluation(uuid, bigint, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.get_public_adaptive_storefront_artifact(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_adaptive_storefront_artifact(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.ingest_adaptive_storefront_rum(uuid, text, text, double precision, text, text, integer, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ingest_adaptive_storefront_rum(uuid, text, text, double precision, text, text, integer, text, text, text) TO anon, authenticated;

COMMENT ON TABLE public.adaptive_storefront_runtime_artifacts IS
  'Immutable deterministic storefront compiler artifacts. Scene Graph is an IR inside the artifact, not merchant source state.';
COMMENT ON TABLE public.adaptive_storefront_active_publications IS
  'Single atomic live pointer. Rollback swaps this pointer and never rewrites an artifact or publication.';
COMMENT ON FUNCTION public.publish_adaptive_storefront(uuid, uuid, bigint, jsonb, text, text, bigint) IS
  'Service-role-only atomic artifact, publication, and active-pointer commit after accepted shadow review.';
