-- StoreBlink SEO and Sitemap Engine v2.
-- Source catalog/page data remains in the existing tenant tables. This
-- registry owns indexability and metadata; compiled artifacts are immutable.

-- This migration replaces triggers after backfilling foreign-keyed SEO rows.
-- Acquire DDL locks before the backfill so editor autosaves cannot take row
-- locks in the opposite order and deadlock the later trigger replacement.
SET LOCAL lock_timeout = '90s';
LOCK TABLE public.stores IN ACCESS EXCLUSIVE MODE;
LOCK TABLE
  public.profiles,
  public.items,
  public.store_pages,
  public.store_collections,
  public.product_variants,
  public.inventory_levels,
  public.collection_products,
  public.store_domains
IN ACCESS EXCLUSIVE MODE;

-- Version every encrypted Google artifact before rotating the server-side key.
-- Existing production ciphertext uses the v1 envelope.
ALTER TABLE public.google_oauth_states
  ADD COLUMN IF NOT EXISTS token_key_version integer;
ALTER TABLE public.google_site_verifications
  ADD COLUMN IF NOT EXISTS token_key_version integer;

UPDATE public.google_integrations
SET token_key_version = 1
WHERE refresh_token_ciphertext IS NOT NULL
  AND token_key_version IS NULL;
UPDATE public.google_oauth_states
SET token_key_version = 1
WHERE code_verifier_ciphertext IS NOT NULL
  AND token_key_version IS NULL;
UPDATE public.google_site_verifications
SET token_key_version = 1
WHERE token_ciphertext IS NOT NULL
  AND token_key_version IS NULL;

ALTER TABLE public.google_integrations
  DROP CONSTRAINT IF EXISTS google_integrations_token_key_version_check;
ALTER TABLE public.google_integrations
  ADD CONSTRAINT google_integrations_token_key_version_check
  CHECK (token_key_version IS NULL OR token_key_version > 0);
ALTER TABLE public.google_oauth_states
  DROP CONSTRAINT IF EXISTS google_oauth_states_token_key_version_check;
ALTER TABLE public.google_oauth_states
  ADD CONSTRAINT google_oauth_states_token_key_version_check
  CHECK (token_key_version IS NULL OR token_key_version > 0);
ALTER TABLE public.google_site_verifications
  DROP CONSTRAINT IF EXISTS google_site_verifications_token_key_version_check;
ALTER TABLE public.google_site_verifications
  ADD CONSTRAINT google_site_verifications_token_key_version_check
  CHECK (token_key_version IS NULL OR token_key_version > 0);

CREATE TABLE IF NOT EXISTS public.seo_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN (
    'system_page', 'custom_page', 'product', 'collection', 'blog'
  )),
  resource_id text NOT NULL,
  route text NOT NULL CHECK (route ~ '^/'),
  title text NOT NULL,
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  is_private boolean NOT NULL DEFAULT false,
  public_content_updated_at timestamptz NOT NULL DEFAULT now(),
  source_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS seo_resources_store_status_idx
  ON public.seo_resources(store_id, status, resource_type, public_content_updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS seo_resources_store_route_live_idx
  ON public.seo_resources(store_id, route)
  WHERE status <> 'archived';

CREATE TABLE IF NOT EXISTS public.seo_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN (
    'system_page', 'custom_page', 'product', 'collection', 'blog'
  )),
  resource_id text NOT NULL,
  seo_title text CHECK (seo_title IS NULL OR char_length(seo_title) <= 120),
  meta_description text CHECK (meta_description IS NULL OR char_length(meta_description) <= 320),
  indexing text NOT NULL DEFAULT 'index_follow' CHECK (indexing IN (
    'index_follow', 'noindex_follow', 'noindex_nofollow'
  )),
  canonical_mode text NOT NULL DEFAULT 'automatic' CHECK (canonical_mode IN ('automatic', 'custom')),
  custom_canonical_url text CHECK (
    custom_canonical_url IS NULL OR custom_canonical_url ~ '^https://'
  ),
  social_title text CHECK (social_title IS NULL OR char_length(social_title) <= 120),
  social_description text CHECK (social_description IS NULL OR char_length(social_description) <= 320),
  social_image_id text,
  custom_meta_tags jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(custom_meta_tags) = 'array'),
  alternates jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(alternates) = 'array'),
  public_content_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, resource_type, resource_id),
  FOREIGN KEY (store_id, resource_type, resource_id)
    REFERENCES public.seo_resources(store_id, resource_type, resource_id)
    ON DELETE CASCADE,
  CHECK (
    canonical_mode = 'automatic'
    OR custom_canonical_url IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.sitemap_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  generation bigint NOT NULL CHECK (generation > 0),
  status text NOT NULL DEFAULT 'building' CHECK (status IN (
    'building', 'validating', 'ready', 'active', 'failed', 'rolled_back'
  )),
  storage_prefix text NOT NULL,
  hostname text NOT NULL,
  url_count integer NOT NULL DEFAULT 0 CHECK (url_count >= 0),
  segment_count integer NOT NULL DEFAULT 0 CHECK (segment_count >= 0),
  content_hash text,
  source_dirty_version bigint NOT NULL DEFAULT 0 CHECK (source_dirty_version >= 0),
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_errors) = 'array'),
  previous_active_generation_id uuid REFERENCES public.sitemap_generations(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, generation),
  UNIQUE (storage_prefix)
);

CREATE UNIQUE INDEX IF NOT EXISTS sitemap_generations_one_active_idx
  ON public.sitemap_generations(store_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS sitemap_generations_store_created_idx
  ON public.sitemap_generations(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sitemap_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  generation_id uuid NOT NULL REFERENCES public.sitemap_generations(id) ON DELETE CASCADE,
  segment_type text NOT NULL CHECK (segment_type IN ('pages', 'products', 'collections', 'blogs')),
  segment_number integer NOT NULL CHECK (segment_number > 0),
  object_key text NOT NULL,
  url_count integer NOT NULL CHECK (url_count BETWEEN 0 AND 25000),
  uncompressed_bytes bigint NOT NULL CHECK (uncompressed_bytes BETWEEN 0 AND 52428800),
  content_hash text NOT NULL,
  last_modified timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (generation_id, segment_type, segment_number),
  UNIQUE (object_key)
);

CREATE TABLE IF NOT EXISTS public.sitemap_store_state (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  active_generation_id uuid REFERENCES public.sitemap_generations(id) ON DELETE SET NULL,
  dirty boolean NOT NULL DEFAULT true,
  dirty_version bigint NOT NULL DEFAULT 1 CHECK (dirty_version >= 0),
  dirty_segments text[] NOT NULL DEFAULT ARRAY['pages','products','collections']::text[],
  indexnow_full_refresh boolean NOT NULL DEFAULT true,
  changed_resource_keys text[] NOT NULL DEFAULT ARRAY[]::text[],
  dirty_since timestamptz NOT NULL DEFAULT now(),
  last_event_at timestamptz NOT NULL DEFAULT now(),
  last_compiled_at timestamptz,
  last_failure_at timestamptz,
  last_failure_code text,
  last_failure_message text,
  compile_locked_at timestamptz,
  compile_locked_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sitemap_store_state_dirty_idx
  ON public.sitemap_store_state(dirty_since)
  WHERE dirty = true;

CREATE TABLE IF NOT EXISTS public.indexnow_configurations (
  store_id uuid PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
  key_value text NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', '')
    CHECK (key_value ~ '^[a-zA-Z0-9_-]{8,128}$'),
  key_location_path text NOT NULL DEFAULT '/indexnow-key.txt' CHECK (key_location_path ~ '^/[a-zA-Z0-9._/-]+$'),
  enabled boolean NOT NULL DEFAULT true,
  last_submitted_at timestamptz,
  last_failure_code text,
  last_failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.set_indexnow_key_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF NEW.key_location_path IS NULL OR NEW.key_location_path = '/indexnow-key.txt' THEN
    NEW.key_location_path := '/' || NEW.key_value || '.txt';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS indexnow_set_key_location ON public.indexnow_configurations;
CREATE TRIGGER indexnow_set_key_location
BEFORE INSERT OR UPDATE OF key_value ON public.indexnow_configurations
FOR EACH ROW EXECUTE FUNCTION private.set_indexnow_key_location();

UPDATE public.indexnow_configurations
SET key_location_path = '/' || key_value || '.txt', updated_at = clock_timestamp()
WHERE key_location_path = '/indexnow-key.txt';

CREATE TABLE IF NOT EXISTS public.indexnow_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  generation_id uuid REFERENCES public.sitemap_generations(id) ON DELETE SET NULL,
  hostname text NOT NULL,
  urls jsonb NOT NULL CHECK (jsonb_typeof(urls) = 'array'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'submitted', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  submitted_at timestamptz,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS indexnow_batches_queue_idx
  ON public.indexnow_batches(created_at)
  WHERE status IN ('queued', 'failed');

ALTER TABLE public.seo_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitemap_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitemap_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sitemap_store_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexnow_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indexnow_batches ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'seo_resources', 'seo_metadata', 'sitemap_generations',
    'sitemap_segments', 'sitemap_store_state', 'indexnow_batches'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_merchant_read', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_store_capability(store_id, ''domains.manage'', auth.uid()))',
      table_name || '_merchant_read', table_name
    );
  END LOOP;
END;
$$;

REVOKE ALL ON public.seo_resources, public.seo_metadata,
  public.sitemap_generations, public.sitemap_segments,
  public.sitemap_store_state, public.indexnow_configurations,
  public.indexnow_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seo_resources, public.seo_metadata,
  public.sitemap_generations, public.sitemap_segments,
  public.sitemap_store_state, public.indexnow_batches TO authenticated;

CREATE OR REPLACE FUNCTION private.mark_sitemap_dirty(
  p_store_id uuid,
  p_segments text[],
  p_event_type text,
  p_resource_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_segments text[];
  resource_key text;
  force_full_refresh boolean;
  bucket timestamptz := date_trunc('minute', clock_timestamp());
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT segment
    FROM unnest(COALESCE(p_segments, ARRAY[]::text[])) AS segment
    WHERE segment IN ('pages', 'products', 'collections', 'blogs')
    ORDER BY segment
  ) INTO normalized_segments;
  IF p_store_id IS NULL OR cardinality(normalized_segments) = 0 THEN RETURN; END IF;

  IF p_resource_id IS NOT NULL THEN
    SELECT resource_type || ':' || resource_id INTO resource_key
    FROM public.seo_resources
    WHERE store_id = p_store_id AND resource_id = p_resource_id
    ORDER BY resource_type
    LIMIT 1;
  END IF;
  force_full_refresh := resource_key IS NULL OR p_event_type IN (
    'SEO_REGENERATION_REQUESTED', 'SITEMAP_REFRESH_JOB',
    'STORE_CREATED', 'STORE_PUBLICATION_CHANGED', 'PRIMARY_DOMAIN_CHANGED',
    'REDIRECT_CHANGED', 'REDIRECT_DELETED'
  );

  INSERT INTO public.sitemap_store_state(
    store_id, dirty, dirty_segments, indexnow_full_refresh,
    changed_resource_keys, dirty_since, last_event_at, updated_at
  ) VALUES (
    p_store_id, true, normalized_segments, force_full_refresh,
    CASE WHEN force_full_refresh THEN ARRAY[]::text[] ELSE ARRAY[resource_key] END,
    clock_timestamp(), clock_timestamp(), clock_timestamp()
  ) ON CONFLICT (store_id) DO UPDATE SET
    dirty = true,
    dirty_version = public.sitemap_store_state.dirty_version + 1,
    dirty_segments = ARRAY(
      SELECT DISTINCT segment
      FROM unnest(public.sitemap_store_state.dirty_segments || EXCLUDED.dirty_segments) AS segment
      ORDER BY segment
    ),
    indexnow_full_refresh = public.sitemap_store_state.indexnow_full_refresh
      OR EXCLUDED.indexnow_full_refresh
      OR cardinality(
        public.sitemap_store_state.changed_resource_keys || EXCLUDED.changed_resource_keys
      ) > 10000,
    changed_resource_keys = CASE
      WHEN public.sitemap_store_state.indexnow_full_refresh
        OR EXCLUDED.indexnow_full_refresh
        OR cardinality(
          public.sitemap_store_state.changed_resource_keys || EXCLUDED.changed_resource_keys
        ) > 10000
      THEN ARRAY[]::text[]
      ELSE ARRAY(
        SELECT DISTINCT key
        FROM unnest(
          public.sitemap_store_state.changed_resource_keys || EXCLUDED.changed_resource_keys
        ) AS key
        ORDER BY key
      )
    END,
    dirty_since = CASE
      WHEN public.sitemap_store_state.dirty THEN public.sitemap_store_state.dirty_since
      ELSE EXCLUDED.dirty_since
    END,
    last_event_at = EXCLUDED.last_event_at,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.domain_events(store_id, event_type, event_key, payload)
  VALUES (
    p_store_id,
    left(p_event_type, 120),
    'seo-dirty:' || p_store_id || ':' || left(p_event_type, 60) || ':' || extract(epoch FROM bucket)::bigint,
    jsonb_build_object(
      'segments', normalized_segments,
      'resourceId', p_resource_id,
      'resourceKey', resource_key,
      'indexNowFullRefresh', force_full_refresh
    )
  ) ON CONFLICT (event_key) DO UPDATE SET
    payload = public.domain_events.payload || EXCLUDED.payload;

END;
$$;

REVOKE ALL ON FUNCTION private.mark_sitemap_dirty(uuid, text[], text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_seo_resource_from_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  target_store_id uuid := NULLIF(row_data ->> 'store_id', '')::uuid;
  target_type text;
  target_id text := row_data ->> 'id';
  target_route text;
  target_title text;
  target_status text;
  target_source_updated_at timestamptz := COALESCE(
    NULLIF(row_data ->> 'updated_at', '')::timestamptz,
    clock_timestamp()
  );
  target_public_updated_at timestamptz := clock_timestamp();
  target_segments text[];
  target_event text;
BEGIN
  IF target_store_id IS NULL THEN
    target_store_id := NULLIF(row_data ->> 'user_id', '')::uuid;
  END IF;
  IF target_store_id IS NULL OR target_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME = 'items' THEN
    target_type := 'product';
    target_route := '/products/' || COALESCE(NULLIF(row_data ->> 'handle', ''), target_id);
    target_title := COALESCE(NULLIF(row_data ->> 'name', ''), 'Product');
    target_status := CASE
      WHEN TG_OP = 'DELETE' OR row_data ->> 'deleted_at' IS NOT NULL THEN 'archived'
      WHEN COALESCE((row_data ->> 'is_published')::boolean, false) THEN 'published'
      ELSE 'draft'
    END;
    target_segments := ARRAY['products'];
    target_event := 'PRODUCT_PUBLISHED';
  ELSIF TG_TABLE_NAME = 'store_pages' THEN
    target_type := CASE WHEN row_data ->> 'category' = 'system' THEN 'system_page' ELSE 'custom_page' END;
    target_route := CASE row_data ->> 'page_kind'
      WHEN 'about' THEN '/about'
      WHEN 'contact' THEN '/contact'
      ELSE '/pages/' || COALESCE(NULLIF(row_data ->> 'handle', ''), target_id)
    END;
    target_title := COALESCE(NULLIF(row_data ->> 'title', ''), 'Page');
    target_status := CASE
      WHEN TG_OP = 'DELETE' OR row_data ->> 'deleted_at' IS NOT NULL THEN 'archived'
      WHEN row_data ->> 'status' = 'published' THEN 'published'
      ELSE 'draft'
    END;
    target_segments := ARRAY['pages'];
    target_event := 'PAGE_PUBLISHED';
  ELSE
    target_type := 'collection';
    target_route := '/collections/' || COALESCE(NULLIF(row_data ->> 'handle', ''), target_id);
    target_title := COALESCE(NULLIF(row_data ->> 'title', ''), 'Collection');
    target_status := CASE
      WHEN TG_OP = 'DELETE' OR row_data ->> 'deleted_at' IS NOT NULL THEN 'archived'
      WHEN row_data ->> 'status' = 'published' THEN 'published'
      ELSE 'draft'
    END;
    target_segments := ARRAY['collections'];
    target_event := 'COLLECTION_CHANGED';
  END IF;

  INSERT INTO public.seo_resources(
    store_id, resource_type, resource_id, route, title, status,
    public_content_updated_at, source_updated_at, updated_at
  ) VALUES (
    target_store_id, target_type, target_id, target_route, target_title,
    target_status, target_public_updated_at, target_source_updated_at, clock_timestamp()
  ) ON CONFLICT (store_id, resource_type, resource_id) DO UPDATE SET
    route = EXCLUDED.route,
    title = EXCLUDED.title,
    status = EXCLUDED.status,
    public_content_updated_at = EXCLUDED.public_content_updated_at,
    source_updated_at = EXCLUDED.source_updated_at,
    updated_at = clock_timestamp();

  INSERT INTO public.seo_metadata(store_id, resource_type, resource_id, public_content_updated_at)
  VALUES (target_store_id, target_type, target_id, target_public_updated_at)
  ON CONFLICT (store_id, resource_type, resource_id) DO NOTHING;

  IF target_type = 'product' THEN
    UPDATE public.seo_resources SET
      public_content_updated_at = target_public_updated_at,
      source_updated_at = target_source_updated_at,
      updated_at = clock_timestamp()
    WHERE store_id = target_store_id
      AND resource_type = 'system_page'
      AND resource_id = 'catalog';
    target_segments := ARRAY['pages', 'products'];
  END IF;

  PERFORM private.mark_sitemap_dirty(target_store_id, target_segments, target_event, target_id);
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS seo_resource_sync ON public.items;
DROP TRIGGER IF EXISTS seo_resource_sync_insert_delete ON public.items;
DROP TRIGGER IF EXISTS seo_resource_sync_public_update ON public.items;
DROP TRIGGER IF EXISTS enqueue_sitemap_refresh ON public.items;
CREATE TRIGGER seo_resource_sync_insert_delete
AFTER INSERT OR DELETE ON public.items
FOR EACH ROW EXECUTE FUNCTION private.sync_seo_resource_from_source();
CREATE TRIGGER seo_resource_sync_public_update
AFTER UPDATE OF
  name, description, image_url, images, price_cents, original_price_cents,
  stock, is_published, handle, category, visible_categories, badge, sale_tag,
  free_delivery, sale_ends_at, sold_count, deleted_at
ON public.items
FOR EACH ROW EXECUTE FUNCTION private.sync_seo_resource_from_source();
DROP TRIGGER IF EXISTS seo_resource_sync ON public.store_pages;
DROP TRIGGER IF EXISTS enqueue_sitemap_refresh ON public.store_pages;
CREATE TRIGGER seo_resource_sync
AFTER INSERT OR UPDATE OR DELETE ON public.store_pages
FOR EACH ROW EXECUTE FUNCTION private.sync_seo_resource_from_source();
DROP TRIGGER IF EXISTS seo_resource_sync ON public.store_collections;
DROP TRIGGER IF EXISTS enqueue_sitemap_refresh ON public.store_collections;
CREATE TRIGGER seo_resource_sync
AFTER INSERT OR UPDATE OR DELETE ON public.store_collections
FOR EACH ROW EXECUTE FUNCTION private.sync_seo_resource_from_source();

CREATE OR REPLACE FUNCTION private.capture_product_public_dependency_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  target_store_id uuid := NULLIF(row_data ->> 'store_id', '')::uuid;
  target_product_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'product_variants' THEN
    target_product_id := NULLIF(row_data ->> 'product_id', '')::uuid;
  ELSE
    SELECT product_id INTO target_product_id
    FROM public.product_variants
    WHERE id = NULLIF(row_data ->> 'variant_id', '')::uuid;
  END IF;
  IF target_store_id IS NULL OR target_product_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  UPDATE public.seo_resources SET
    public_content_updated_at = clock_timestamp(),
    source_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE store_id = target_store_id
    AND resource_type = 'product'
    AND resource_id = target_product_id::text;
  UPDATE public.seo_resources SET
    public_content_updated_at = clock_timestamp(),
    source_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE store_id = target_store_id
    AND resource_type = 'system_page'
    AND resource_id = 'catalog';
  PERFORM private.mark_sitemap_dirty(
    target_store_id,
    ARRAY['pages', 'products'],
    CASE WHEN TG_TABLE_NAME = 'inventory_levels'
      THEN 'PRODUCT_AVAILABILITY_CHANGED'
      ELSE 'PRODUCT_VARIANT_CHANGED'
    END,
    target_product_id::text
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS seo_product_variant_insert_delete ON public.product_variants;
DROP TRIGGER IF EXISTS seo_product_variant_public_update ON public.product_variants;
CREATE TRIGGER seo_product_variant_insert_delete
AFTER INSERT OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION private.capture_product_public_dependency_change();
CREATE TRIGGER seo_product_variant_public_update
AFTER UPDATE OF title, price_cents, compare_at_price_cents, attributes, deleted_at
ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION private.capture_product_public_dependency_change();

DROP TRIGGER IF EXISTS seo_inventory_insert_delete ON public.inventory_levels;
DROP TRIGGER IF EXISTS seo_inventory_public_update ON public.inventory_levels;
CREATE TRIGGER seo_inventory_insert_delete
AFTER INSERT OR DELETE ON public.inventory_levels
FOR EACH ROW EXECUTE FUNCTION private.capture_product_public_dependency_change();
CREATE TRIGGER seo_inventory_public_update
AFTER UPDATE OF available, reserved, policy
ON public.inventory_levels
FOR EACH ROW EXECUTE FUNCTION private.capture_product_public_dependency_change();

CREATE OR REPLACE FUNCTION private.capture_collection_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  target_store_id uuid := NULLIF(row_data ->> 'store_id', '')::uuid;
  target_collection_id uuid := NULLIF(row_data ->> 'collection_id', '')::uuid;
BEGIN
  IF target_store_id IS NULL OR target_collection_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  UPDATE public.seo_resources SET
    public_content_updated_at = clock_timestamp(),
    source_updated_at = clock_timestamp(),
    updated_at = clock_timestamp()
  WHERE store_id = target_store_id
    AND resource_type = 'collection'
    AND resource_id = target_collection_id::text;
  PERFORM private.mark_sitemap_dirty(
    target_store_id,
    ARRAY['collections'],
    'COLLECTION_MEMBERSHIP_CHANGED',
    target_collection_id::text
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS seo_collection_membership_change ON public.collection_products;
CREATE TRIGGER seo_collection_membership_change
AFTER INSERT OR UPDATE OR DELETE ON public.collection_products
FOR EACH ROW EXECUTE FUNCTION private.capture_collection_membership_change();

CREATE OR REPLACE FUNCTION private.touch_seo_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  NEW.public_content_updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.capture_seo_metadata_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE segment text;
BEGIN
  segment := CASE NEW.resource_type
    WHEN 'product' THEN 'products'
    WHEN 'collection' THEN 'collections'
    WHEN 'blog' THEN 'blogs'
    ELSE 'pages'
  END;
  UPDATE public.seo_resources SET
    public_content_updated_at = NEW.public_content_updated_at,
    updated_at = NEW.updated_at
  WHERE store_id = NEW.store_id
    AND resource_type = NEW.resource_type
    AND resource_id = NEW.resource_id;
  PERFORM private.mark_sitemap_dirty(
    NEW.store_id, ARRAY[segment], 'SEO_CHANGED', NEW.resource_id
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS seo_metadata_touch ON public.seo_metadata;
DROP TRIGGER IF EXISTS seo_metadata_capture_change ON public.seo_metadata;

-- Backfill existing public resources without requiring merchant action.
INSERT INTO public.seo_resources(
  store_id, resource_type, resource_id, route, title, status,
  public_content_updated_at, source_updated_at
)
SELECT
  i.store_id,
  'product',
  i.id::text,
  '/products/' || COALESCE(NULLIF(i.handle, ''), i.id::text),
  i.name,
  CASE WHEN i.deleted_at IS NOT NULL THEN 'archived' WHEN i.is_published THEN 'published' ELSE 'draft' END,
  i.created_at,
  i.created_at
FROM public.items i
WHERE i.store_id IS NOT NULL
ON CONFLICT (store_id, resource_type, resource_id) DO UPDATE SET
  route = EXCLUDED.route, title = EXCLUDED.title, status = EXCLUDED.status,
  public_content_updated_at = EXCLUDED.public_content_updated_at,
  source_updated_at = EXCLUDED.source_updated_at;

INSERT INTO public.seo_resources(
  store_id, resource_type, resource_id, route, title, status,
  public_content_updated_at, source_updated_at
)
SELECT id, 'system_page', system.resource_id, system.route, system.title,
  CASE WHEN status = 'published' THEN 'published' ELSE 'draft' END,
  updated_at, updated_at
FROM public.stores
CROSS JOIN (VALUES ('home', '/', 'Home'), ('catalog', '/products', 'Products'))
  AS system(resource_id, route, title)
WHERE deleted_at IS NULL
ON CONFLICT (store_id, resource_type, resource_id) DO UPDATE SET
  title = EXCLUDED.title, status = EXCLUDED.status,
  public_content_updated_at = EXCLUDED.public_content_updated_at,
  source_updated_at = EXCLUDED.source_updated_at;

INSERT INTO public.seo_resources(
  store_id, resource_type, resource_id, route, title, status,
  public_content_updated_at, source_updated_at
)
SELECT
  p.store_id,
  CASE WHEN p.category = 'system' THEN 'system_page' ELSE 'custom_page' END,
  p.id::text,
  CASE p.page_kind WHEN 'about' THEN '/about' WHEN 'contact' THEN '/contact'
    ELSE '/pages/' || p.handle END,
  p.title,
  CASE WHEN p.deleted_at IS NOT NULL THEN 'archived' WHEN p.status = 'published' THEN 'published' ELSE 'draft' END,
  p.updated_at,
  p.updated_at
FROM public.store_pages p
ON CONFLICT (store_id, resource_type, resource_id) DO UPDATE SET
  route = EXCLUDED.route, title = EXCLUDED.title, status = EXCLUDED.status,
  public_content_updated_at = EXCLUDED.public_content_updated_at,
  source_updated_at = EXCLUDED.source_updated_at;

INSERT INTO public.seo_resources(
  store_id, resource_type, resource_id, route, title, status,
  public_content_updated_at, source_updated_at
)
SELECT
  c.store_id, 'collection', c.id::text, '/collections/' || c.handle,
  c.title,
  CASE WHEN c.deleted_at IS NOT NULL THEN 'archived' WHEN c.status = 'published' THEN 'published' ELSE 'draft' END,
  c.updated_at, c.updated_at
FROM public.store_collections c
ON CONFLICT (store_id, resource_type, resource_id) DO UPDATE SET
  route = EXCLUDED.route, title = EXCLUDED.title, status = EXCLUDED.status,
  public_content_updated_at = EXCLUDED.public_content_updated_at,
  source_updated_at = EXCLUDED.source_updated_at;

INSERT INTO public.seo_metadata(store_id, resource_type, resource_id, public_content_updated_at)
SELECT store_id, resource_type, resource_id, public_content_updated_at
FROM public.seo_resources
ON CONFLICT (store_id, resource_type, resource_id) DO NOTHING;

INSERT INTO public.sitemap_store_state(store_id)
SELECT id FROM public.stores
ON CONFLICT (store_id) DO NOTHING;

INSERT INTO public.indexnow_configurations(store_id)
SELECT id FROM public.stores
ON CONFLICT (store_id) DO NOTHING;

CREATE TRIGGER seo_metadata_touch
BEFORE INSERT OR UPDATE ON public.seo_metadata
FOR EACH ROW EXECUTE FUNCTION private.touch_seo_metadata();
CREATE TRIGGER seo_metadata_capture_change
AFTER INSERT OR UPDATE ON public.seo_metadata
FOR EACH ROW EXECUTE FUNCTION private.capture_seo_metadata_change();

CREATE OR REPLACE FUNCTION private.sync_store_seo_system_resources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.name IS DISTINCT FROM NEW.name THEN
      UPDATE public.seo_resources SET
        public_content_updated_at = clock_timestamp(),
        source_updated_at = clock_timestamp(),
        updated_at = clock_timestamp()
      WHERE store_id = NEW.id;
    END IF;
    INSERT INTO public.seo_resources(
      store_id, resource_type, resource_id, route, title, status,
      public_content_updated_at, source_updated_at
    ) VALUES
      (NEW.id, 'system_page', 'home', '/', 'Home',
        CASE WHEN NEW.status = 'published' THEN 'published' ELSE 'draft' END,
        NEW.updated_at, NEW.updated_at),
      (NEW.id, 'system_page', 'catalog', '/products', 'Products',
        CASE WHEN NEW.status = 'published' THEN 'published' ELSE 'draft' END,
        NEW.updated_at, NEW.updated_at)
    ON CONFLICT (store_id, resource_type, resource_id) DO UPDATE SET
      status = EXCLUDED.status,
      public_content_updated_at = EXCLUDED.public_content_updated_at,
      source_updated_at = EXCLUDED.source_updated_at,
      updated_at = clock_timestamp();
    INSERT INTO public.seo_metadata(store_id, resource_type, resource_id, public_content_updated_at)
    VALUES
      (NEW.id, 'system_page', 'home', NEW.updated_at),
      (NEW.id, 'system_page', 'catalog', NEW.updated_at)
    ON CONFLICT (store_id, resource_type, resource_id) DO NOTHING;
    INSERT INTO public.sitemap_store_state(store_id) VALUES (NEW.id)
    ON CONFLICT (store_id) DO NOTHING;
    INSERT INTO public.indexnow_configurations(store_id) VALUES (NEW.id)
    ON CONFLICT (store_id) DO NOTHING;
    IF TG_OP = 'INSERT' THEN
      PERFORM private.mark_sitemap_dirty(
        NEW.id, ARRAY['pages','products','collections'],
        'STORE_CREATED',
        NEW.id::text
      );
    ELSIF OLD.status IS DISTINCT FROM NEW.status
      OR OLD.handle IS DISTINCT FROM NEW.handle
      OR OLD.name IS DISTINCT FROM NEW.name
    THEN
      PERFORM private.mark_sitemap_dirty(
        NEW.id, ARRAY['pages','products','collections'],
        'STORE_PUBLICATION_CHANGED',
        NEW.id::text
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_sync_seo_system_resources ON public.stores;
CREATE TRIGGER store_sync_seo_system_resources
AFTER INSERT OR UPDATE OF status, handle, name, deleted_at ON public.stores
FOR EACH ROW EXECUTE FUNCTION private.sync_store_seo_system_resources();

CREATE OR REPLACE FUNCTION private.capture_storefront_profile_public_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE store_record record;
BEGIN
  FOR store_record IN
    SELECT id FROM public.stores
    WHERE owner_user_id = NEW.id AND deleted_at IS NULL
  LOOP
    UPDATE public.seo_resources SET
      public_content_updated_at = clock_timestamp(),
      source_updated_at = clock_timestamp(),
      updated_at = clock_timestamp()
    WHERE store_id = store_record.id;
    PERFORM private.mark_sitemap_dirty(
      store_record.id,
      ARRAY['pages','products','collections','blogs'],
      'STOREFRONT_PUBLIC_CONTENT_CHANGED',
      NULL
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS seo_profile_public_content_change ON public.profiles;
CREATE TRIGGER seo_profile_public_content_change
AFTER UPDATE OF
  business_name, store_tagline, store_about, store_banner_url, theme_published
ON public.profiles
FOR EACH ROW
WHEN (
  OLD.business_name IS DISTINCT FROM NEW.business_name
  OR OLD.store_tagline IS DISTINCT FROM NEW.store_tagline
  OR OLD.store_about IS DISTINCT FROM NEW.store_about
  OR OLD.store_banner_url IS DISTINCT FROM NEW.store_banner_url
  OR OLD.theme_published IS DISTINCT FROM NEW.theme_published
)
EXECUTE FUNCTION private.capture_storefront_profile_public_change();

CREATE OR REPLACE FUNCTION private.capture_primary_domain_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_store_id uuid;
  old_was_primary boolean := false;
  new_is_primary boolean := false;
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.hostname IS NOT DISTINCT FROM NEW.hostname
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.is_primary IS NOT DISTINCT FROM NEW.is_primary THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    target_store_id := OLD.store_id;
    old_was_primary := OLD.is_primary AND OLD.status = 'active';
  END IF;
  IF TG_OP <> 'DELETE' THEN
    target_store_id := NEW.store_id;
    new_is_primary := NEW.is_primary AND NEW.status = 'active';
  END IF;
  IF target_store_id IS NOT NULL AND (old_was_primary OR new_is_primary) THEN
    PERFORM private.mark_sitemap_dirty(
      target_store_id,
      ARRAY['pages','products','collections','blogs'],
      'PRIMARY_DOMAIN_CHANGED',
      NULL
    );
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DROP TRIGGER IF EXISTS seo_primary_domain_change ON public.store_domains;
CREATE TRIGGER seo_primary_domain_change
AFTER INSERT OR DELETE OR UPDATE OF hostname, status, is_primary ON public.store_domains
FOR EACH ROW EXECUTE FUNCTION private.capture_primary_domain_change();

CREATE OR REPLACE FUNCTION public.get_sitemap_compile_snapshot(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE result jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object(
    'store', jsonb_build_object(
      'id', stores.id,
      'name', stores.name,
      'status', stores.status,
      'handle', stores.handle,
      'primaryHostname', COALESCE(domains.hostname, 'storeblink.com'),
      'canonicalOrigin', CASE
        WHEN domains.hostname IS NOT NULL THEN 'https://' || domains.hostname
        ELSE 'https://storeblink.com/store/' || stores.handle
      END
    ),
    'resources', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'resourceType', resources.resource_type,
        'resourceId', resources.resource_id,
        'route', resources.route,
        'title', resources.title,
        'status', resources.status,
        'private', resources.is_private,
        'publicContentUpdatedAt', GREATEST(
          resources.public_content_updated_at,
          metadata.public_content_updated_at
        ),
        'indexing', metadata.indexing,
        'canonicalMode', metadata.canonical_mode,
        'customCanonicalUrl', metadata.custom_canonical_url,
        'alternates', metadata.alternates,
        'redirecting', EXISTS (
          SELECT 1 FROM public.store_redirects redirects
          WHERE redirects.store_id = resources.store_id
            AND redirects.source_path = resources.route
            AND redirects.deleted_at IS NULL
        )
      ) ORDER BY resources.resource_type, resources.route)
      FROM public.seo_resources resources
      JOIN public.seo_metadata metadata
        ON metadata.store_id = resources.store_id
       AND metadata.resource_type = resources.resource_type
       AND metadata.resource_id = resources.resource_id
      WHERE resources.store_id = stores.id
    ), '[]'::jsonb),
    'activeGenerationId', state.active_generation_id,
    'dirtyVersion', state.dirty_version,
    'indexNow', (SELECT jsonb_build_object(
      'key', config.key_value,
      'keyLocationPath', config.key_location_path,
      'enabled', config.enabled,
      'fullRefresh', state.indexnow_full_refresh,
      'resourceKeys', state.changed_resource_keys
    ) FROM public.indexnow_configurations config WHERE config.store_id = stores.id)
  ) INTO result
  FROM public.stores stores
  LEFT JOIN public.store_domains domains
    ON domains.store_id = stores.id
   AND domains.is_primary
   AND domains.status = 'active'
  LEFT JOIN public.sitemap_store_state state ON state.store_id = stores.id
  WHERE stores.id = p_store_id AND stores.deleted_at IS NULL;
  IF result IS NULL THEN RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002'; END IF;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sitemap_compile_snapshot(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sitemap_compile_snapshot(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.begin_sitemap_generation(
  p_store_id uuid,
  p_hostname text,
  p_storage_prefix text,
  p_source_dirty_version bigint
)
RETURNS public.sitemap_generations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_generation bigint;
  current_dirty_version bigint;
  created public.sitemap_generations;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':sitemap', 0));
  SELECT dirty_version INTO current_dirty_version
  FROM public.sitemap_store_state
  WHERE store_id = p_store_id;
  IF current_dirty_version IS NULL
    OR p_source_dirty_version < 0
    OR p_source_dirty_version > current_dirty_version
  THEN
    RAISE EXCEPTION 'Invalid sitemap snapshot version' USING ERRCODE = '22023';
  END IF;
  SELECT COALESCE(max(generation), 0) + 1 INTO next_generation
  FROM public.sitemap_generations WHERE store_id = p_store_id;
  INSERT INTO public.sitemap_generations(
    store_id, generation, storage_prefix, hostname,
    previous_active_generation_id, source_dirty_version
  ) VALUES (
    p_store_id, next_generation, p_storage_prefix, lower(p_hostname),
    (SELECT active_generation_id FROM public.sitemap_store_state WHERE store_id = p_store_id),
    p_source_dirty_version
  )
  RETURNING * INTO created;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_sitemap_generation(
  p_generation_id uuid,
  p_segments jsonb,
  p_url_count integer,
  p_content_hash text
)
RETURNS public.sitemap_generations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target public.sitemap_generations;
  activated public.sitemap_generations;
  target_store_id uuid;
  current_active_generation bigint;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  SELECT store_id INTO target_store_id
  FROM public.sitemap_generations
  WHERE id = p_generation_id;
  IF target_store_id IS NULL THEN
    RAISE EXCEPTION 'Sitemap generation not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(target_store_id::text || ':sitemap', 0));
  SELECT * INTO target FROM public.sitemap_generations WHERE id = p_generation_id FOR UPDATE;
  IF NOT FOUND OR target.status NOT IN ('building', 'validating', 'ready') THEN
    RAISE EXCEPTION 'Generation cannot be activated' USING ERRCODE = '55000';
  END IF;
  SELECT active.generation INTO current_active_generation
  FROM public.sitemap_store_state state
  LEFT JOIN public.sitemap_generations active ON active.id = state.active_generation_id
  WHERE state.store_id = target.store_id
  FOR UPDATE OF state;
  IF current_active_generation IS NOT NULL AND current_active_generation > target.generation THEN
    RAISE EXCEPTION 'Stale sitemap generation cannot be activated' USING ERRCODE = '55000';
  END IF;
  IF jsonb_typeof(p_segments) <> 'array' OR jsonb_array_length(p_segments) = 0 THEN
    RAISE EXCEPTION 'Validated segments are required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.sitemap_generations SET status = 'rolled_back'
  WHERE store_id = target.store_id AND status = 'active';
  INSERT INTO public.sitemap_segments(
    store_id, generation_id, segment_type, segment_number, object_key,
    url_count, uncompressed_bytes, content_hash, last_modified
  ) SELECT
    target.store_id, target.id,
    segment ->> 'type', (segment ->> 'number')::integer,
    segment ->> 'objectKey', (segment ->> 'urlCount')::integer,
    (segment ->> 'uncompressedBytes')::bigint, segment ->> 'contentHash',
    (segment ->> 'lastModified')::timestamptz
  FROM jsonb_array_elements(p_segments) segment;
  UPDATE public.sitemap_generations SET
    status = 'active', url_count = p_url_count,
    segment_count = jsonb_array_length(p_segments), content_hash = p_content_hash,
    validation_errors = '[]'::jsonb, completed_at = clock_timestamp(),
    activated_at = clock_timestamp()
  WHERE id = target.id RETURNING * INTO activated;
  INSERT INTO public.sitemap_store_state(
    store_id, active_generation_id, dirty, dirty_segments,
    indexnow_full_refresh, changed_resource_keys,
    last_compiled_at, updated_at
  ) VALUES (
    target.store_id, target.id, false, ARRAY[]::text[], false, ARRAY[]::text[],
    clock_timestamp(), clock_timestamp()
  ) ON CONFLICT (store_id) DO UPDATE SET
    active_generation_id = EXCLUDED.active_generation_id,
    dirty = public.sitemap_store_state.dirty_version <> target.source_dirty_version,
    dirty_segments = CASE
      WHEN public.sitemap_store_state.dirty_version = target.source_dirty_version
        THEN ARRAY[]::text[]
      ELSE public.sitemap_store_state.dirty_segments
    END,
    indexnow_full_refresh = CASE
      WHEN public.sitemap_store_state.dirty_version = target.source_dirty_version
        THEN false
      ELSE public.sitemap_store_state.indexnow_full_refresh
    END,
    changed_resource_keys = CASE
      WHEN public.sitemap_store_state.dirty_version = target.source_dirty_version
        THEN ARRAY[]::text[]
      ELSE public.sitemap_store_state.changed_resource_keys
    END,
    last_compiled_at = EXCLUDED.last_compiled_at,
    last_failure_at = NULL, last_failure_code = NULL, last_failure_message = NULL,
    compile_locked_at = NULL, compile_locked_by = NULL,
    updated_at = EXCLUDED.updated_at;
  UPDATE public.store_domains SET
    seo_status = 'sitemap_ready',
    failure_code = NULL,
    failure_message = NULL,
    updated_at = clock_timestamp()
  WHERE store_id = target.store_id
    AND status = 'active'
    AND is_primary
    AND seo_status NOT IN ('sitemap_submitted', 'monitoring');
  INSERT INTO public.seo_sync_jobs(
    store_id, domain_id, job_type, idempotency_key, payload, max_attempts
  )
  SELECT
    domains.store_id, domains.id, 'sitemap-submit',
    'sitemap-submit:' || domains.id || ':generation:' || target.generation,
    jsonb_build_object('generationId', target.id), 8
  FROM public.store_domains domains
  JOIN public.google_integrations integrations
    ON integrations.store_id = domains.store_id AND integrations.status = 'connected'
  JOIN public.search_console_properties properties
    ON properties.domain_id = domains.id AND properties.status = 'active'
  WHERE domains.store_id = target.store_id
    AND domains.status = 'active' AND domains.is_primary
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN activated;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_sitemap_generation(
  p_generation_id uuid,
  p_code text,
  p_message text,
  p_validation_errors jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE target_store_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  UPDATE public.sitemap_generations SET
    status = 'failed', completed_at = clock_timestamp(),
    validation_errors = COALESCE(p_validation_errors, '[]'::jsonb)
  WHERE id = p_generation_id AND status <> 'active'
  RETURNING store_id INTO target_store_id;
  IF target_store_id IS NOT NULL THEN
    UPDATE public.sitemap_store_state SET
      dirty = true, last_failure_at = clock_timestamp(),
      last_failure_code = left(p_code, 120), last_failure_message = left(p_message, 1000),
      compile_locked_at = NULL, compile_locked_by = NULL,
      updated_at = clock_timestamp()
    WHERE store_id = target_store_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_sitemap_generation(
  p_store_id uuid,
  p_generation_id uuid
)
RETURNS public.sitemap_generations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE target public.sitemap_generations; restored public.sitemap_generations;
BEGIN
  IF auth.role() <> 'service_role' AND NOT private.has_store_capability(p_store_id, 'domains.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_store_id::text || ':sitemap', 0));
  SELECT * INTO target FROM public.sitemap_generations
  WHERE id = p_generation_id AND store_id = p_store_id
    AND status IN ('active', 'rolled_back', 'ready') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rollback generation not found' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.sitemap_generations SET
    status = 'failed',
    completed_at = clock_timestamp(),
    validation_errors = '[{"code":"ROLLBACK_CANCELLED","message":"Generation cancelled by rollback."}]'::jsonb
  WHERE store_id = p_store_id
    AND id <> target.id
    AND status IN ('building', 'validating', 'ready');
  UPDATE public.sitemap_generations SET status = 'rolled_back'
  WHERE store_id = p_store_id AND status = 'active' AND id <> target.id;
  UPDATE public.sitemap_generations SET status = 'active', activated_at = clock_timestamp()
  WHERE id = target.id RETURNING * INTO restored;
  UPDATE public.sitemap_store_state SET
    active_generation_id = target.id,
    updated_at = clock_timestamp()
  WHERE store_id = p_store_id;
  RETURN restored;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_seo_metadata(
  p_store_id uuid,
  p_resource_type text,
  p_resource_id text,
  p_metadata jsonb
)
RETURNS public.seo_metadata
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  updated public.seo_metadata;
  tag jsonb;
  alternate jsonb;
  indexing_value text := COALESCE(p_metadata ->> 'indexing', 'index_follow');
  canonical_mode_value text := COALESCE(p_metadata ->> 'canonicalMode', 'automatic');
  canonical_value text := NULLIF(trim(p_metadata ->> 'customCanonicalUrl'), '');
  tags jsonb := COALESCE(p_metadata -> 'customMetaTags', '[]'::jsonb);
  alternate_values jsonb := COALESCE(p_metadata -> 'alternates', '[]'::jsonb);
BEGIN
  IF NOT private.has_store_capability(p_store_id, 'domains.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
  IF p_resource_type NOT IN ('system_page','custom_page','product','collection','blog')
    OR p_resource_id IS NULL OR length(p_resource_id) > 200
    OR jsonb_typeof(p_metadata) <> 'object'
  THEN
    RAISE EXCEPTION 'Invalid SEO resource' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.seo_resources
    WHERE store_id = p_store_id
      AND resource_type = p_resource_type
      AND resource_id = p_resource_id
  ) THEN
    RAISE EXCEPTION 'SEO resource not found' USING ERRCODE = 'P0002';
  END IF;
  IF indexing_value NOT IN ('index_follow','noindex_follow','noindex_nofollow')
    OR canonical_mode_value NOT IN ('automatic','custom')
  THEN
    RAISE EXCEPTION 'Invalid SEO policy' USING ERRCODE = '22023';
  END IF;
  IF canonical_mode_value = 'custom' AND (
    canonical_value IS NULL
    OR canonical_value !~ '^https://[a-zA-Z0-9.-]+(?::[0-9]{1,5})?(/[^[:space:]#]*)?$'
  ) THEN
    RAISE EXCEPTION 'Custom canonical URL must be an absolute HTTPS URL without a fragment'
      USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(tags) <> 'array' OR jsonb_array_length(tags) > 20
    OR jsonb_typeof(alternate_values) <> 'array' OR jsonb_array_length(alternate_values) > 50
  THEN
    RAISE EXCEPTION 'SEO metadata arrays exceed their limits' USING ERRCODE = '22023';
  END IF;
  FOR tag IN SELECT value FROM jsonb_array_elements(tags) LOOP
    IF jsonb_typeof(tag) <> 'object'
      OR tag ->> 'attribute' NOT IN ('name', 'property')
      OR length(COALESCE(tag ->> 'content', '')) NOT BETWEEN 1 AND 500
      OR lower(COALESCE(tag ->> 'key', '')) IN (
        'viewport', 'charset', 'robots', 'description', 'google-site-verification',
        'og:title', 'og:description', 'og:url', 'og:image',
        'twitter:title', 'twitter:description', 'twitter:image', 'twitter:card'
      )
      OR (
        tag ->> 'attribute' = 'name'
        AND lower(COALESCE(tag ->> 'key', '')) NOT IN (
          'author', 'keywords', 'application-name', 'theme-color', 'color-scheme'
        )
      )
      OR (
        tag ->> 'attribute' = 'property'
        AND lower(COALESCE(tag ->> 'key', '')) !~ '^(product|article|profile):[a-z0-9:_-]+$'
      )
    THEN
      RAISE EXCEPTION 'Custom meta tag is not allowed' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOR alternate IN SELECT value FROM jsonb_array_elements(alternate_values) LOOP
    IF jsonb_typeof(alternate) <> 'object'
      OR COALESCE(alternate ->> 'locale', '') !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
      OR COALESCE(alternate ->> 'url', '') !~ '^https://[a-zA-Z0-9.-]+(?::[0-9]{1,5})?(/[^[:space:]#]*)?$'
    THEN
      RAISE EXCEPTION 'Invalid hreflang alternate' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.seo_metadata(
    store_id, resource_type, resource_id, seo_title, meta_description,
    indexing, canonical_mode, custom_canonical_url,
    social_title, social_description, social_image_id,
    custom_meta_tags, alternates
  ) VALUES (
    p_store_id, p_resource_type, p_resource_id,
    NULLIF(left(trim(p_metadata ->> 'seoTitle'), 120), ''),
    NULLIF(left(trim(p_metadata ->> 'metaDescription'), 320), ''),
    indexing_value, canonical_mode_value,
    CASE WHEN canonical_mode_value = 'custom' THEN canonical_value ELSE NULL END,
    NULLIF(left(trim(p_metadata ->> 'socialTitle'), 120), ''),
    NULLIF(left(trim(p_metadata ->> 'socialDescription'), 320), ''),
    NULLIF(left(trim(p_metadata ->> 'socialImageId'), 300), ''),
    tags, alternate_values
  ) ON CONFLICT (store_id, resource_type, resource_id) DO UPDATE SET
    seo_title = EXCLUDED.seo_title,
    meta_description = EXCLUDED.meta_description,
    indexing = EXCLUDED.indexing,
    canonical_mode = EXCLUDED.canonical_mode,
    custom_canonical_url = EXCLUDED.custom_canonical_url,
    social_title = EXCLUDED.social_title,
    social_description = EXCLUDED.social_description,
    social_image_id = EXCLUDED.social_image_id,
    custom_meta_tags = EXCLUDED.custom_meta_tags,
    alternates = EXCLUDED.alternates
  RETURNING * INTO updated;
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_sitemap_regeneration(p_store_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF NOT private.has_store_capability(p_store_id, 'domains.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
  PERFORM private.mark_sitemap_dirty(
    p_store_id, ARRAY['pages','products','collections','blogs'],
    'SEO_REGENERATION_REQUESTED', p_store_id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_sitemap_dirty_for_service(
  p_store_id uuid,
  p_segments text[],
  p_event_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;
  PERFORM private.mark_sitemap_dirty(
    p_store_id, p_segments, p_event_type, p_store_id::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_dirty_sitemap_stores(
  p_worker text,
  p_limit integer DEFAULT 10,
  p_minimum_age_seconds integer DEFAULT 120
)
RETURNS TABLE(store_id uuid, dirty_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH candidates AS (
    SELECT state.store_id
    FROM public.sitemap_store_state state
    JOIN public.stores stores ON stores.id = state.store_id
    WHERE state.dirty
      AND stores.deleted_at IS NULL
      AND stores.status = 'published'
      AND state.last_event_at <= clock_timestamp() - make_interval(secs => GREATEST(0, p_minimum_age_seconds))
      AND (state.compile_locked_at IS NULL OR state.compile_locked_at < clock_timestamp() - interval '15 minutes')
    ORDER BY state.dirty_since
    FOR UPDATE OF state SKIP LOCKED
    LIMIT LEAST(25, GREATEST(1, p_limit))
  )
  UPDATE public.sitemap_store_state state SET
    compile_locked_at = clock_timestamp(),
    compile_locked_by = left(p_worker, 120),
    updated_at = clock_timestamp()
  FROM candidates
  WHERE state.store_id = candidates.store_id
  RETURNING state.store_id, state.dirty_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sitemap_compile_lease(
  p_store_id uuid,
  p_worker text,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501'; END IF;
  UPDATE public.sitemap_store_state SET
    compile_locked_at = NULL,
    compile_locked_by = NULL,
    last_failure_at = CASE WHEN p_error_code IS NULL THEN last_failure_at ELSE clock_timestamp() END,
    last_failure_code = CASE WHEN p_error_code IS NULL THEN last_failure_code ELSE left(p_error_code, 120) END,
    last_failure_message = CASE WHEN p_error_message IS NULL THEN last_failure_message ELSE left(p_error_message, 1000) END,
    updated_at = clock_timestamp()
  WHERE store_id = p_store_id AND compile_locked_by = left(p_worker, 120);
END;
$$;

REVOKE ALL ON FUNCTION public.begin_sitemap_generation(uuid, text, text, bigint),
  public.activate_sitemap_generation(uuid, jsonb, integer, text),
  public.fail_sitemap_generation(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_sitemap_generation(uuid, text, text, bigint),
  public.activate_sitemap_generation(uuid, jsonb, integer, text),
  public.fail_sitemap_generation(uuid, text, text, jsonb)
  TO service_role;
REVOKE ALL ON FUNCTION public.claim_dirty_sitemap_stores(text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_dirty_sitemap_stores(text, integer, integer)
  TO service_role;
REVOKE ALL ON FUNCTION public.release_sitemap_compile_lease(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_sitemap_compile_lease(uuid, text, text, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.rollback_sitemap_generation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_sitemap_generation(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.update_seo_metadata(uuid, text, text, jsonb),
  public.request_sitemap_regeneration(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_seo_metadata(uuid, text, text, jsonb),
  public.request_sitemap_regeneration(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_sitemap_dirty_for_service(uuid, text[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sitemap_dirty_for_service(uuid, text[], text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_seo_dashboard(p_store_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  result jsonb;
  canonical_origin text;
BEGIN
  IF NOT private.has_store_capability(p_store_id, 'domains.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
  SELECT CASE
    WHEN domains.hostname IS NOT NULL THEN 'https://' || domains.hostname
    ELSE 'https://storeblink.com/store/' || stores.handle
  END INTO canonical_origin
  FROM public.stores stores
  LEFT JOIN public.store_domains domains
    ON domains.store_id = stores.id
   AND domains.is_primary
   AND domains.status = 'active'
  WHERE stores.id = p_store_id AND stores.deleted_at IS NULL;
  IF canonical_origin IS NULL THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;
  SELECT jsonb_build_object(
    'resources', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'resourceType', r.resource_type, 'resourceId', r.resource_id,
      'route', r.route, 'title', r.title, 'status', r.status,
      'publicContentUpdatedAt', r.public_content_updated_at,
      'seoTitle', m.seo_title, 'metaDescription', m.meta_description,
      'indexing', m.indexing, 'canonicalMode', m.canonical_mode,
      'customCanonicalUrl', m.custom_canonical_url,
      'socialTitle', m.social_title, 'socialDescription', m.social_description,
      'socialImageId', m.social_image_id,
      'customMetaTags', m.custom_meta_tags, 'alternates', m.alternates,
      'excludedReason', CASE
        WHEN stores.status <> 'published' THEN 'store_draft'
        WHEN r.status = 'draft' THEN 'resource_draft'
        WHEN r.status = 'archived' THEN 'resource_archived'
        WHEN m.indexing <> 'index_follow' THEN 'noindex'
        WHEN r.is_private THEN 'private'
        WHEN EXISTS (SELECT 1 FROM public.store_redirects red WHERE red.store_id = r.store_id AND red.source_path = r.route AND red.deleted_at IS NULL) THEN 'redirect'
        WHEN m.canonical_mode = 'custom' AND NOT (
          m.custom_canonical_url = canonical_origin
          OR m.custom_canonical_url LIKE canonical_origin || '/%'
        ) THEN 'wrong_domain'
        WHEN m.canonical_mode = 'custom' AND (
          CASE WHEN r.route = '/'
            THEN rtrim(m.custom_canonical_url, '/')
            ELSE m.custom_canonical_url
          END
        ) <> canonical_origin || CASE WHEN r.route = '/' THEN '' ELSE r.route END
        THEN 'canonical_mismatch'
        ELSE NULL END
    ) ORDER BY r.resource_type, r.title)
    FROM public.seo_resources r
    JOIN public.seo_metadata m USING (store_id, resource_type, resource_id)
    JOIN public.stores stores ON stores.id = r.store_id
    WHERE r.store_id = p_store_id), '[]'::jsonb),
    'state', COALESCE((SELECT jsonb_build_object(
      'activeGenerationId', s.active_generation_id,
      'dirty', s.dirty, 'dirtyVersion', s.dirty_version,
      'dirtySegments', s.dirty_segments, 'dirtySince', s.dirty_since,
      'lastEventAt', s.last_event_at, 'lastCompiledAt', s.last_compiled_at,
      'lastFailureAt', s.last_failure_at, 'lastFailureCode', s.last_failure_code,
      'lastFailureMessage', s.last_failure_message,
      'compileLockedAt', s.compile_locked_at
    ) FROM public.sitemap_store_state s WHERE s.store_id = p_store_id), '{}'::jsonb),
    'generations', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', g.id, 'generation', g.generation, 'status', g.status,
      'hostname', g.hostname, 'urlCount', g.url_count,
      'segmentCount', g.segment_count, 'startedAt', g.started_at,
      'completedAt', g.completed_at, 'validationErrors', g.validation_errors
    ) ORDER BY g.generation DESC) FROM (
      SELECT * FROM public.sitemap_generations WHERE store_id = p_store_id
      ORDER BY generation DESC LIMIT 10
    ) g), '[]'::jsonb),
    'segments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'generationId', seg.generation_id, 'type', seg.segment_type,
      'number', seg.segment_number, 'urlCount', seg.url_count,
      'lastModified', seg.last_modified
    ) ORDER BY seg.segment_type, seg.segment_number)
    FROM public.sitemap_segments seg
    JOIN public.sitemap_store_state state ON state.active_generation_id = seg.generation_id
    WHERE state.store_id = p_store_id), '[]'::jsonb),
    'redirects', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', red.id, 'sourcePath', red.source_path,
      'destinationPath', red.destination_path, 'statusCode', red.status_code
    ) ORDER BY red.source_path) FROM public.store_redirects red
    WHERE red.store_id = p_store_id AND red.deleted_at IS NULL), '[]'::jsonb),
    'indexNow', COALESCE((SELECT jsonb_build_object(
      'enabled', config.enabled, 'keyLocationPath', config.key_location_path,
      'lastSubmittedAt', config.last_submitted_at,
      'lastFailureCode', config.last_failure_code,
      'lastFailureMessage', config.last_failure_message
    ) FROM public.indexnow_configurations config
    WHERE config.store_id = p_store_id), '{}'::jsonb),
    'healthIssues', COALESCE((
      SELECT jsonb_agg(issue ORDER BY issue ->> 'severity', issue ->> 'route')
      FROM (
        SELECT jsonb_build_object(
          'code', 'missing_description', 'severity', 'warning',
          'resourceType', r.resource_type, 'resourceId', r.resource_id,
          'route', r.route, 'message', 'Add a meta description for this public URL.'
        ) AS issue
        FROM public.seo_resources r
        JOIN public.seo_metadata m USING (store_id, resource_type, resource_id)
        WHERE r.store_id = p_store_id AND r.status = 'published'
          AND m.indexing = 'index_follow'
          AND NULLIF(trim(m.meta_description), '') IS NULL
        UNION ALL
        SELECT jsonb_build_object(
          'code', 'title_too_long', 'severity', 'warning',
          'resourceType', r.resource_type, 'resourceId', r.resource_id,
          'route', r.route, 'message', 'SEO title exceeds 60 characters.'
        )
        FROM public.seo_resources r
        JOIN public.seo_metadata m USING (store_id, resource_type, resource_id)
        WHERE r.store_id = p_store_id
          AND char_length(COALESCE(NULLIF(m.seo_title, ''), r.title)) > 60
        UNION ALL
        SELECT jsonb_build_object(
          'code', 'missing_product_image', 'severity', 'error',
          'resourceType', r.resource_type, 'resourceId', r.resource_id,
          'route', r.route, 'message', 'Published product has no public image.'
        )
        FROM public.seo_resources r
        WHERE r.store_id = p_store_id AND r.resource_type = 'product'
          AND r.status = 'published'
           AND NOT EXISTS (
             SELECT 1 FROM public.items item
             WHERE item.id::text = r.resource_id
               AND item.store_id = r.store_id
               AND (
                 COALESCE(item.image_url, '') ~* '^https://'
                 OR EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(item.images) = 'array' THEN item.images ELSE '[]'::jsonb END
                   ) image
                   WHERE (
                     jsonb_typeof(image) = 'string'
                     AND trim(image #>> '{}') ~* '^https://'
                   ) OR (
                     jsonb_typeof(image) = 'object'
                     AND COALESCE(image ->> 'url', image ->> 'src', '') ~* '^https://'
                   )
                 )
               )
           )
        UNION ALL
        SELECT jsonb_build_object(
          'code', 'broken_redirect', 'severity', 'error',
          'resourceType', 'redirect', 'resourceId', red.id::text,
          'route', red.source_path, 'message', 'Redirect destination does not resolve to a public resource.'
        )
        FROM public.store_redirects red
        WHERE red.store_id = p_store_id AND red.deleted_at IS NULL
          AND (
            red.destination_path !~ '^/'
            OR (
              red.destination_path NOT IN ('/', '/products')
              AND NOT EXISTS (
                SELECT 1 FROM public.seo_resources destination
                WHERE destination.store_id = red.store_id
                  AND destination.route = red.destination_path
                  AND destination.status = 'published'
              )
            )
          )
      ) issues
    ), '[]'::jsonb)
  ) INTO result;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_seo_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seo_dashboard(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_store_redirect(
  p_store_id uuid,
  p_source_path text,
  p_destination_path text,
  p_status_code integer DEFAULT 301
)
RETURNS public.store_redirects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  source_value text := trim(p_source_path);
  destination_value text := trim(p_destination_path);
  updated public.store_redirects;
BEGIN
  IF NOT private.has_store_capability(p_store_id, 'domains.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
  IF source_value !~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*$'
    OR destination_value !~ '^/[A-Za-z0-9._~!$&''()*+,;=:@%/?-]*$'
    OR source_value ~ '^//'
    OR destination_value ~ '^//'
    OR source_value = destination_value
    OR length(source_value) > 2048
    OR length(destination_value) > 2048
    OR p_status_code NOT IN (301, 302, 307, 308)
  THEN
    RAISE EXCEPTION 'Invalid storefront redirect' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    WITH RECURSIVE redirect_chain(path, depth) AS (
      SELECT destination_value, 0
      UNION ALL
      SELECT redirects.destination_path, redirect_chain.depth + 1
      FROM redirect_chain
      JOIN public.store_redirects redirects
        ON redirects.store_id = p_store_id
       AND redirects.source_path = redirect_chain.path
       AND redirects.deleted_at IS NULL
      WHERE redirect_chain.depth < 20
    )
    SELECT 1 FROM redirect_chain
    WHERE path = source_value OR depth = 20
  ) THEN
    RAISE EXCEPTION 'Redirect loop detected' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.store_redirects(
    store_id, source_path, destination_path, status_code, deleted_at
  ) VALUES (
    p_store_id, source_value, destination_value, p_status_code, NULL
  ) ON CONFLICT (store_id, source_path) WHERE deleted_at IS NULL DO UPDATE SET
    destination_path = EXCLUDED.destination_path,
    status_code = EXCLUDED.status_code
  RETURNING * INTO updated;
  PERFORM private.mark_sitemap_dirty(
    p_store_id, ARRAY['pages','products','collections'],
    'REDIRECT_CHANGED', updated.id::text
  );
  RETURN updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_store_redirect(
  p_store_id uuid,
  p_redirect_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE affected integer;
BEGIN
  IF NOT private.has_store_capability(p_store_id, 'domains.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.store_redirects SET deleted_at = clock_timestamp()
  WHERE id = p_redirect_id AND store_id = p_store_id AND deleted_at IS NULL;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RAISE EXCEPTION 'Redirect not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM private.mark_sitemap_dirty(
    p_store_id, ARRAY['pages','products','collections'],
    'REDIRECT_DELETED', p_redirect_id::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_store_redirect(uuid, text, text, integer),
  public.delete_store_redirect(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_store_redirect(uuid, text, text, integer),
  public.delete_store_redirect(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_collection_catalog(
  p_store_id uuid,
  p_collection_handle text,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_query text DEFAULT '',
  p_sort text DEFAULT 'newest'
)
RETURNS TABLE (
  id uuid,
  handle text,
  name text,
  category text,
  description text,
  image_url text,
  images jsonb,
  is_published boolean,
  price_cents integer,
  original_price_cents integer,
  stock integer,
  badge text,
  free_delivery boolean,
  sale_tag text,
  sale_ends_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH target_collection AS (
    SELECT collection.id, collection.title, collection.handle, collection.collection_type
    FROM public.store_collections collection
    JOIN public.stores store ON store.id = collection.store_id
    WHERE collection.store_id = p_store_id
      AND lower(collection.handle) = lower(trim(p_collection_handle))
      AND collection.status = 'published'
      AND collection.deleted_at IS NULL
      AND store.status = 'published'
      AND store.deleted_at IS NULL
    LIMIT 1
  )
  SELECT
    product.id,
    product.handle,
    product.name,
    product.category,
    product.description,
    product.image_url,
    product.images,
    product.is_published,
    product.price_cents,
    product.original_price_cents,
    product.stock,
    product.badge,
    product.free_delivery,
    product.sale_tag,
    product.sale_ends_at,
    count(*) OVER() AS total_count
  FROM target_collection collection
  JOIN public.items product ON product.store_id = p_store_id
  LEFT JOIN public.collection_products membership
    ON membership.store_id = p_store_id
   AND membership.collection_id = collection.id
   AND membership.product_id = product.id
  WHERE product.is_published = true
    AND product.deleted_at IS NULL
    AND (
      (collection.collection_type = 'manual' AND membership.product_id IS NOT NULL)
      OR (
        collection.collection_type = 'smart'
        AND (
          lower(COALESCE(product.category, '')) = lower(collection.title)
          OR trim(both '-' FROM lower(regexp_replace(COALESCE(product.category, ''), '[^a-zA-Z0-9]+', '-', 'g'))) = lower(collection.handle)
        )
      )
    )
    AND (
      trim(COALESCE(p_query, '')) = ''
      OR product.name ILIKE '%' || trim(p_query) || '%'
      OR COALESCE(product.category, '') ILIKE '%' || trim(p_query) || '%'
      OR COALESCE(product.description, '') ILIKE '%' || trim(p_query) || '%'
    )
  ORDER BY
    CASE WHEN p_sort = 'price-asc' THEN product.price_cents END ASC,
    CASE WHEN p_sort = 'price-desc' THEN product.price_cents END DESC,
    CASE WHEN p_sort = 'name' THEN lower(product.name) END ASC,
    CASE WHEN p_sort = 'newest' OR p_sort NOT IN ('price-asc', 'price-desc', 'name')
      THEN product.created_at END DESC,
    membership.sort_order,
    product.id
  LIMIT LEAST(GREATEST(p_limit, 1), 60)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.get_public_collections(p_store_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  handle text,
  collection_type text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT collection.id, collection.title, collection.handle, collection.collection_type
  FROM public.store_collections collection
  JOIN public.stores store ON store.id = collection.store_id
  WHERE collection.store_id = p_store_id
    AND collection.status = 'published'
    AND collection.deleted_at IS NULL
    AND store.status = 'published'
    AND store.deleted_at IS NULL
  ORDER BY collection.created_at, collection.id;
$$;

REVOKE ALL ON FUNCTION public.get_public_collection_catalog(uuid, text, integer, integer, text, text)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_collections(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_collection_catalog(uuid, text, integer, integer, text, text)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_collections(uuid) TO anon, authenticated;

COMMENT ON TABLE public.seo_resources IS 'Store-scoped SEO registry projection. Source catalog/page records remain authoritative for content.';
COMMENT ON TABLE public.sitemap_generations IS 'Immutable sitemap build generations. Only a fully validated generation may become active.';
COMMENT ON FUNCTION private.mark_sitemap_dirty(uuid, text[], text, text) IS 'Marks a store dirty for the debounced Cloudflare Cron compiler sweep.';
