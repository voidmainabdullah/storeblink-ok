-- Future-proof storefront domain foundation.
-- Existing profiles/items remain available as compatibility projections while
-- all new domain records are store-scoped and all public reads use narrow RPCs.

CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL,
  handle text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'suspended', 'archived')),
  locale text NOT NULL DEFAULT 'en',
  currency text NOT NULL DEFAULT 'USD',
  timezone text NOT NULL DEFAULT 'UTC',
  brand_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

INSERT INTO public.stores (
  id,
  owner_user_id,
  name,
  handle,
  status,
  brand_profile,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.id,
  COALESCE(NULLIF(trim(p.business_name), ''), 'My store'),
  COALESCE(NULLIF(trim(p.store_slug), ''), 'store-' || substr(p.id::text, 1, 8)),
  CASE WHEN p.theme_published IS NOT NULL THEN 'published' ELSE 'draft' END,
  jsonb_strip_nulls(jsonb_build_object(
    'primaryColor', p.store_color,
    'bannerUrl', p.store_banner_url
  )),
  p.created_at,
  p.updated_at
FROM public.profiles p
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = CASE
    WHEN public.stores.status = 'suspended' THEN public.stores.status
    ELSE EXCLUDED.status
  END,
  brand_profile = public.stores.brand_profile || EXCLUDED.brand_profile,
  updated_at = GREATEST(public.stores.updated_at, EXCLUDED.updated_at);

CREATE TABLE IF NOT EXISTS public.store_members (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'content-editor'
    CHECK (role IN ('owner', 'admin', 'store-manager', 'content-editor', 'product-manager', 'support', 'analyst')),
  capabilities text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, user_id)
);

INSERT INTO public.store_members (store_id, user_id, role, capabilities)
SELECT
  s.id,
  s.owner_user_id,
  'owner',
  ARRAY[
    'theme.edit', 'theme.publish', 'product.create', 'product.publish',
    'page.edit', 'navigation.edit', 'order.view', 'customer.export',
    'settings.billing'
  ]::text[]
FROM public.stores s
ON CONFLICT (store_id, user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_access_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_members sm
    WHERE sm.store_id = p_store_id
      AND sm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.has_store_capability(
  p_store_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.store_members sm
    WHERE sm.store_id = p_store_id
      AND sm.user_id = auth.uid()
      AND (sm.role = 'owner' OR p_capability = ANY(sm.capabilities))
  );
$$;

CREATE TABLE IF NOT EXISTS public.store_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  handle text NOT NULL,
  category text NOT NULL DEFAULT 'content'
    CHECK (category IN ('system', 'content', 'policy', 'landing')),
  page_kind text NOT NULL DEFAULT 'standard'
    CHECK (page_kind IN (
      'standard', 'about', 'contact', 'faq', 'landing', 'shipping-policy',
      'refund-policy', 'privacy-policy', 'terms'
    )),
  content jsonb NOT NULL DEFAULT '{"version":1,"blocks":[]}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'hidden')),
  seo jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS store_pages_store_handle_live_idx
  ON public.store_pages(store_id, handle)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS store_pages_store_status_updated_idx
  ON public.store_pages(store_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

INSERT INTO public.store_pages (store_id, title, handle, category, page_kind, content, status)
SELECT
  s.id,
  seed.title,
  seed.handle,
  'content',
  seed.page_kind,
  CASE
    WHEN seed.page_kind = 'about'
      THEN jsonb_build_object(
        'version', 1,
        'blocks', jsonb_build_array(jsonb_build_object(
          'type', 'paragraph',
          'text', COALESCE(NULLIF(trim(p.store_about), ''), 'Tell customers about your store.')
        ))
      )
    ELSE '{"version":1,"blocks":[]}'::jsonb
  END,
  'published'
FROM public.stores s
JOIN public.profiles p ON p.id = s.owner_user_id
CROSS JOIN (
  VALUES
    ('About Us', 'about', 'about'),
    ('Contact', 'contact', 'contact'),
    ('FAQ', 'faq', 'faq')
) AS seed(title, handle, page_kind)
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.store_redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  source_path text NOT NULL,
  destination_path text NOT NULL,
  status_code integer NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302, 307, 308)),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (source_path <> destination_path)
);

CREATE UNIQUE INDEX IF NOT EXISTS store_redirects_source_live_idx
  ON public.store_redirects(store_id, source_path)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.record_page_handle_redirect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.handle IS DISTINCT FROM NEW.handle AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.store_redirects(store_id, source_path, destination_path)
    VALUES (NEW.store_id, '/pages/' || OLD.handle, '/pages/' || NEW.handle)
    ON CONFLICT (store_id, source_path) WHERE deleted_at IS NULL
    DO UPDATE SET destination_path = EXCLUDED.destination_path;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS store_pages_record_handle_redirect ON public.store_pages;
CREATE TRIGGER store_pages_record_handle_redirect
AFTER UPDATE OF handle ON public.store_pages
FOR EACH ROW EXECUTE FUNCTION public.record_page_handle_redirect();

CREATE TABLE IF NOT EXISTS public.store_menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS store_menus_store_key_live_idx
  ON public.store_menus(store_id, key)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.store_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  menu_id uuid NOT NULL REFERENCES public.store_menus(id) ON DELETE CASCADE,
  label text NOT NULL,
  target_type text NOT NULL
    CHECK (target_type IN (
      'home', 'catalog', 'page', 'product', 'collection', 'blog',
      'search', 'account', 'external', 'email', 'phone'
    )),
  target_id uuid,
  target_value text,
  parent_id uuid REFERENCES public.store_menu_items(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  open_in_new_tab boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  visibility jsonb NOT NULL DEFAULT '{"desktop":true,"tablet":true,"mobile":true}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (
    (target_type IN ('page', 'product', 'collection') AND target_id IS NOT NULL)
    OR (target_type IN ('external', 'email', 'phone', 'blog') AND target_value IS NOT NULL)
    OR target_type IN ('home', 'catalog', 'search', 'account')
  )
);

CREATE INDEX IF NOT EXISTS store_menu_items_store_menu_order_idx
  ON public.store_menu_items(store_id, menu_id, parent_id, sort_order)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS store_menu_items_store_target_idx
  ON public.store_menu_items(store_id, target_type, target_id)
  WHERE deleted_at IS NULL;

INSERT INTO public.store_menus (store_id, key, name)
SELECT s.id, seed.key, seed.name
FROM public.stores s
CROSS JOIN (VALUES ('main', 'Main menu'), ('footer', 'Footer menu')) AS seed(key, name)
ON CONFLICT DO NOTHING;

INSERT INTO public.store_menu_items (
  store_id,
  menu_id,
  label,
  target_type,
  target_id,
  sort_order
)
SELECT
  menu.store_id,
  menu.id,
  seed.label,
  seed.target_type,
  page.id,
  seed.sort_order
FROM public.store_menus menu
CROSS JOIN (
  VALUES
    ('Home', 'home', NULL::text, 0),
    ('Catalog', 'catalog', NULL::text, 1),
    ('About Us', 'page', 'about', 2),
    ('Contact', 'page', 'contact', 3)
) AS seed(label, target_type, page_handle, sort_order)
LEFT JOIN public.store_pages page
  ON page.store_id = menu.store_id
  AND page.handle = seed.page_handle
  AND page.deleted_at IS NULL
WHERE menu.key = 'main'
  AND menu.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.store_menu_items existing
    WHERE existing.menu_id = menu.id
      AND existing.sort_order = seed.sort_order
      AND existing.deleted_at IS NULL
  );

CREATE TABLE IF NOT EXISTS public.themes (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.theme_versions (
  theme_id text NOT NULL REFERENCES public.themes(id) ON DELETE CASCADE,
  version text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  minimum_platform_version text NOT NULL DEFAULT '1.0.0',
  manifest jsonb NOT NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (theme_id, version)
);

INSERT INTO public.themes(id, name, description)
VALUES ('basic', 'Basic', 'Responsive starter commerce theme.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.themes(id, name, description)
VALUES ('threadtemplate', 'Threadtemplate', 'Minimal furniture storefront theme.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.theme_versions(theme_id, version, schema_version, manifest)
VALUES (
  'basic',
  '1.0.0',
  1,
  '{
    "id":"basic",
    "name":"Basic",
    "capabilities":{
      "megaMenu":false,
      "productQuickView":false,
      "productCompare":false,
      "stickyAddToCart":false,
      "productFilters":true,
      "colorSwatches":false,
      "customerDrawer":false,
      "predictiveSearch":false,
      "announcementSlider":false
    },
    "templates":["home-default","product-default","catalog-default","page-default"]
  }'::jsonb
)
ON CONFLICT (theme_id, version) DO NOTHING;

INSERT INTO public.theme_versions(theme_id, version, schema_version, manifest)
VALUES (
  'threadtemplate',
  '1.0.0',
  1,
  '{
    "id":"threadtemplate",
    "name":"Threadtemplate",
    "capabilities":{
      "megaMenu":false,
      "productQuickView":true,
      "productCompare":false,
      "stickyAddToCart":false,
      "productFilters":true,
      "colorSwatches":false,
      "customerDrawer":false,
      "predictiveSearch":false,
      "announcementSlider":false
    },
    "templates":["home-default","product-default","catalog-default","page-default"]
  }'::jsonb
)
ON CONFLICT (theme_id, version) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.theme_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  theme_id text NOT NULL REFERENCES public.themes(id) ON DELETE RESTRICT,
  installed_version text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  global_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  feature_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_assignments jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS theme_installations_one_active_idx
  ON public.theme_installations(store_id)
  WHERE status = 'active' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS theme_installations_store_status_idx
  ON public.theme_installations(store_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

INSERT INTO public.theme_installations (
  store_id,
  theme_id,
  installed_version,
  schema_version,
  status,
  global_settings,
  published_at
)
SELECT
  s.id,
  CASE
    WHEN COALESCE(p.theme_draft, p.theme)
      -> 'engine_scene' -> 'nodes' -> 'thread-root' -> 'extensions' ->> 'template'
      = 'threadtemplate'
    THEN 'threadtemplate'
    ELSE 'basic'
  END,
  '1.0.0',
  1,
  CASE WHEN s.status = 'published' THEN 'active' ELSE 'draft' END,
  s.brand_profile,
  p.published_at
FROM public.stores s
JOIN public.profiles p ON p.id = s.owner_user_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.theme_installations ti
  WHERE ti.store_id = s.id AND ti.deleted_at IS NULL
);

CREATE TABLE IF NOT EXISTS public.theme_template_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  theme_installation_id uuid NOT NULL REFERENCES public.theme_installations(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  page_type text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  document jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(theme_installation_id, template_key)
);

CREATE INDEX IF NOT EXISTS theme_documents_store_updated_idx
  ON public.theme_template_documents(store_id, updated_at DESC);

INSERT INTO public.theme_template_documents (
  store_id,
  theme_installation_id,
  template_key,
  page_type,
  schema_version,
  document,
  revision
)
SELECT
  ti.store_id,
  ti.id,
  'home-default',
  'home',
  ti.schema_version,
  COALESCE(p.theme_draft, p.theme, '{}'::jsonb),
  p.theme_revision
FROM public.theme_installations ti
JOIN public.stores s ON s.id = ti.store_id
JOIN public.profiles p ON p.id = s.owner_user_id
ON CONFLICT (theme_installation_id, template_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_profile_store_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  installation_id uuid;
BEGIN
  INSERT INTO public.stores (
    id,
    owner_user_id,
    name,
    handle,
    status,
    brand_profile,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.id,
    COALESCE(NULLIF(trim(NEW.business_name), ''), 'My store'),
    COALESCE(NULLIF(trim(NEW.store_slug), ''), 'store-' || substr(NEW.id::text, 1, 8)),
    CASE WHEN NEW.theme_published IS NOT NULL THEN 'published' ELSE 'draft' END,
    jsonb_strip_nulls(jsonb_build_object(
      'primaryColor', NEW.store_color,
      'bannerUrl', NEW.store_banner_url
    )),
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    handle = EXCLUDED.handle,
    status = CASE
      WHEN public.stores.status = 'suspended' THEN public.stores.status
      ELSE EXCLUDED.status
    END,
    brand_profile = public.stores.brand_profile || EXCLUDED.brand_profile,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.store_members(store_id, user_id, role, capabilities)
  VALUES (
    NEW.id,
    NEW.id,
    'owner',
    ARRAY[
      'theme.edit', 'theme.publish', 'product.create', 'product.publish',
      'page.edit', 'navigation.edit', 'order.view', 'customer.export',
      'settings.billing'
    ]::text[]
  )
  ON CONFLICT (store_id, user_id) DO NOTHING;

  SELECT ti.id
  INTO installation_id
  FROM public.theme_installations ti
  WHERE ti.store_id = NEW.id
    AND ti.deleted_at IS NULL
  ORDER BY CASE WHEN ti.status = 'active' THEN 0 ELSE 1 END, ti.updated_at DESC
  LIMIT 1;

  IF installation_id IS NULL THEN
    INSERT INTO public.theme_installations (
      store_id,
      theme_id,
      installed_version,
      schema_version,
      status,
      global_settings
    )
    VALUES (
      NEW.id,
      'basic',
      '1.0.0',
      1,
      CASE WHEN NEW.theme_published IS NOT NULL THEN 'active' ELSE 'draft' END,
      jsonb_strip_nulls(jsonb_build_object('primaryColor', NEW.store_color))
    )
    RETURNING id INTO installation_id;
  END IF;

  IF COALESCE(NEW.theme_draft, NEW.theme) IS NOT NULL THEN
    INSERT INTO public.theme_template_documents (
      store_id,
      theme_installation_id,
      template_key,
      page_type,
      schema_version,
      document,
      revision,
      updated_at
    )
    VALUES (
      NEW.id,
      installation_id,
      'home-default',
      'home',
      1,
      COALESCE(NEW.theme_draft, NEW.theme),
      NEW.theme_revision,
      NEW.updated_at
    )
    ON CONFLICT (theme_installation_id, template_key)
    DO UPDATE SET
      document = EXCLUDED.document,
      revision = EXCLUDED.revision,
      updated_at = EXCLUDED.updated_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_sync_store_projection ON public.profiles;
CREATE TRIGGER profiles_sync_store_projection
AFTER INSERT OR UPDATE OF
  business_name,
  store_slug,
  store_color,
  store_banner_url,
  theme,
  theme_draft,
  theme_published,
  theme_revision,
  published_at
ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_store_projection();

CREATE TABLE IF NOT EXISTS public.recovered_theme_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  theme_installation_id uuid REFERENCES public.theme_installations(id) ON DELETE SET NULL,
  source_theme_id text NOT NULL,
  source_theme_version text NOT NULL,
  original_node_type text NOT NULL,
  original_data jsonb NOT NULL,
  reason text NOT NULL
    CHECK (reason IN ('unsupported-section', 'removed-feature', 'invalid-setting', 'theme-switch')),
  recovered_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS recovered_theme_content_store_unresolved_idx
  ON public.recovered_theme_content(store_id, recovered_at DESC)
  WHERE resolved_at IS NULL;

CREATE TABLE IF NOT EXISTS public.storefront_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  theme_installation_id uuid REFERENCES public.theme_installations(id) ON DELETE SET NULL,
  revision bigint NOT NULL,
  snapshot jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(store_id, revision)
);

CREATE INDEX IF NOT EXISTS storefront_publications_store_created_idx
  ON public.storefront_publications(store_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.storefront_publish_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_revision bigint NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'validating', 'building', 'publishing', 'completed', 'failed')),
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS storefront_publish_jobs_store_status_idx
  ON public.storefront_publish_jobs(store_id, status, created_at DESC);

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS handle text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.items
SET
  store_id = COALESCE(store_id, user_id),
  handle = COALESCE(
    NULLIF(trim(handle), ''),
    trim(both '-' FROM regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
      || '-' || substr(id::text, 1, 8)
  )
WHERE store_id IS NULL OR handle IS NULL OR trim(handle) = '';

CREATE UNIQUE INDEX IF NOT EXISTS items_store_handle_live_idx
  ON public.items(store_id, handle)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS items_store_catalog_idx
  ON public.items(store_id, is_published, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS items_store_category_catalog_idx
  ON public.items(store_id, category, is_published, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.assign_item_store_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT s.id INTO NEW.store_id
    FROM public.stores s
    WHERE s.owner_user_id = NEW.user_id
      AND s.deleted_at IS NULL
    LIMIT 1;
  END IF;
  IF NEW.handle IS NULL OR trim(NEW.handle) = '' THEN
    NEW.handle :=
      trim(both '-' FROM regexp_replace(lower(NEW.name), '[^a-z0-9]+', '-', 'g'))
      || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_assign_store_id ON public.items;
CREATE TRIGGER items_assign_store_id
BEFORE INSERT OR UPDATE OF user_id, name ON public.items
FOR EACH ROW EXECUTE FUNCTION public.assign_item_store_id();

CREATE OR REPLACE FUNCTION public.record_product_handle_redirect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.handle IS DISTINCT FROM NEW.handle
    AND NEW.deleted_at IS NULL
    AND NEW.store_id IS NOT NULL
  THEN
    INSERT INTO public.store_redirects(store_id, source_path, destination_path)
    VALUES (NEW.store_id, '/products/' || OLD.handle, '/products/' || NEW.handle)
    ON CONFLICT (store_id, source_path) WHERE deleted_at IS NULL
    DO UPDATE SET destination_path = EXCLUDED.destination_path;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS items_record_handle_redirect ON public.items;
CREATE TRIGGER items_record_handle_redirect
AFTER UPDATE OF handle ON public.items
FOR EACH ROW EXECUTE FUNCTION public.record_product_handle_redirect();

CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Default',
  sku text,
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  compare_at_price_cents integer CHECK (compare_at_price_cents IS NULL OR compare_at_price_cents >= 0),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS product_variants_store_product_idx
  ON public.product_variants(store_id, product_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_variants_store_sku_live_idx
  ON public.product_variants(store_id, sku)
  WHERE sku IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_levels (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  available integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= available),
  policy text NOT NULL DEFAULT 'deny-when-out-of-stock'
    CHECK (policy IN ('deny-when-out-of-stock', 'allow-backorder')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, variant_id)
);

CREATE OR REPLACE FUNCTION public.reserve_inventory(
  p_store_id uuid,
  p_variant_id uuid,
  p_quantity integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed integer;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;
  IF NOT public.can_access_store(p_store_id)
    AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
  THEN
    RAISE EXCEPTION 'Not authorized for this store' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_levels
  SET reserved = reserved + p_quantity, updated_at = now()
  WHERE store_id = p_store_id
    AND variant_id = p_variant_id
    AND (
      policy = 'allow-backorder'
      OR available - reserved >= p_quantity
    );
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END;
$$;

CREATE TABLE IF NOT EXISTS public.store_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title text NOT NULL,
  handle text NOT NULL,
  collection_type text NOT NULL DEFAULT 'manual'
    CHECK (collection_type IN ('manual', 'smart')),
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS store_collections_store_handle_live_idx
  ON public.store_collections(store_id, handle)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.collection_products (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  collection_id uuid NOT NULL REFERENCES public.store_collections(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS collection_products_store_collection_order_idx
  ON public.collection_products(store_id, collection_id, sort_order);

CREATE TABLE IF NOT EXISTS public.media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  alt_text text,
  width integer,
  height integer,
  focal_point jsonb,
  variants jsonb NOT NULL DEFAULT '{}'::jsonb,
  usage_count integer NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS media_assets_store_path_live_idx
  ON public.media_assets(store_id, storage_path)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS media_assets_store_created_idx
  ON public.media_assets(store_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.theme_template_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovered_theme_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storefront_publish_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members read stores"
  ON public.stores FOR SELECT TO authenticated
  USING (public.can_access_store(id));
CREATE POLICY "Store owners create stores"
  ON public.stores FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Store members update stores"
  ON public.stores FOR UPDATE TO authenticated
  USING (public.can_access_store(id))
  WITH CHECK (public.can_access_store(id));
CREATE POLICY "Store owners archive stores"
  ON public.stores FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid());
CREATE POLICY "Store members view memberships"
  ON public.store_members FOR SELECT TO authenticated
  USING (public.can_access_store(store_id));
CREATE POLICY "Store owners manage memberships"
  ON public.store_members FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_id AND s.owner_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = store_id AND s.owner_user_id = auth.uid()
  ));
CREATE POLICY "Themes are publicly readable"
  ON public.themes FOR SELECT TO anon, authenticated
  USING (archived_at IS NULL);
CREATE POLICY "Theme versions are publicly readable"
  ON public.theme_versions FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "Store members manage pages"
  ON public.store_pages FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage redirects"
  ON public.store_redirects FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage menus"
  ON public.store_menus FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage menu items"
  ON public.store_menu_items FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage theme installations"
  ON public.theme_installations FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage theme documents"
  ON public.theme_template_documents FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage recovered content"
  ON public.recovered_theme_content FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members read publications"
  ON public.storefront_publications FOR SELECT TO authenticated
  USING (public.can_access_store(store_id));
CREATE POLICY "Store members read publish jobs"
  ON public.storefront_publish_jobs FOR SELECT TO authenticated
  USING (public.can_access_store(store_id));
CREATE POLICY "Store members manage variants"
  ON public.product_variants FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage inventory"
  ON public.inventory_levels FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage collections"
  ON public.store_collections FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage collection products"
  ON public.collection_products FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));
CREATE POLICY "Store members manage media"
  ON public.media_assets FOR ALL TO authenticated
  USING (public.can_access_store(store_id))
  WITH CHECK (public.can_access_store(store_id));

CREATE OR REPLACE FUNCTION public.get_public_storefront(p_handle text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'business_name', p.business_name,
    'store_slug', p.store_slug,
    'store_tagline', p.store_tagline,
    'store_about', p.store_about,
    'store_color', p.store_color,
    'store_banner_url', p.store_banner_url,
    'store_template', p.store_template,
    'theme_published', p.theme_published,
    'theme_revision', p.theme_revision,
    'published_at', p.published_at
  )
  FROM public.stores s
  JOIN public.profiles p ON p.id = s.owner_user_id
  WHERE (
      s.handle = lower(trim(p_handle))
      OR p.store_slug = lower(trim(p_handle))
    )
    AND s.status = 'published'
    AND s.deleted_at IS NULL
    AND p.theme_published IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_published_store_owner(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.stores s
    WHERE s.owner_user_id = p_owner_user_id
      AND s.status = 'published'
      AND s.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_public_store_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.stores s ON s.owner_user_id = o.store_user_id
    WHERE o.id = p_order_id
      AND s.status = 'published'
      AND s.deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.get_public_catalog(
  p_store_id uuid,
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
SET search_path = public
AS $$
  SELECT
    i.id,
    i.handle,
    i.name,
    i.category,
    i.description,
    i.image_url,
    i.images,
    i.is_published,
    i.price_cents,
    i.original_price_cents,
    i.stock,
    i.badge,
    i.free_delivery,
    i.sale_tag,
    i.sale_ends_at,
    count(*) OVER() AS total_count
  FROM public.items i
  JOIN public.stores s ON s.id = i.store_id
  WHERE i.store_id = p_store_id
    AND i.is_published = true
    AND i.deleted_at IS NULL
    AND s.status = 'published'
    AND s.deleted_at IS NULL
    AND (
      trim(COALESCE(p_query, '')) = ''
      OR i.name ILIKE '%' || trim(p_query) || '%'
      OR COALESCE(i.category, '') ILIKE '%' || trim(p_query) || '%'
      OR COALESCE(i.description, '') ILIKE '%' || trim(p_query) || '%'
    )
  ORDER BY
    CASE WHEN p_sort = 'price-asc' THEN i.price_cents END ASC,
    CASE WHEN p_sort = 'price-desc' THEN i.price_cents END DESC,
    CASE WHEN p_sort = 'name' THEN lower(i.name) END ASC,
    CASE WHEN p_sort = 'newest' OR p_sort NOT IN ('price-asc', 'price-desc', 'name')
      THEN i.created_at END DESC,
    i.id
  LIMIT LEAST(GREATEST(p_limit, 1), 60)
  OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.get_public_product(
  p_store_id uuid,
  p_identifier text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(i) - 'user_id' - 'store_id' - 'deleted_at'
  FROM public.items i
  JOIN public.stores s ON s.id = i.store_id
  WHERE i.store_id = p_store_id
    AND i.is_published = true
    AND i.deleted_at IS NULL
    AND s.status = 'published'
    AND (
      i.handle = p_identifier
      OR (
        p_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        AND i.id = p_identifier::uuid
      )
    )
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.save_storefront_draft(
  p_document jsonb,
  p_expected_revision bigint,
  p_store_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_revision bigint;
  next_revision bigint;
  persisted_at timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_document IS NULL OR jsonb_typeof(p_document) <> 'object' THEN
    RAISE EXCEPTION 'Storefront document must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT p.theme_revision
  INTO current_revision
  FROM public.profiles p
  WHERE p.id = auth.uid()
  FOR UPDATE;

  IF current_revision IS NULL THEN
    RAISE EXCEPTION 'Store profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Storefront revision conflict: expected %, current %',
      p_expected_revision, current_revision
      USING ERRCODE = '40001';
  END IF;

  next_revision := current_revision + 1;
  UPDATE public.profiles
  SET
    theme_draft = p_document,
    theme_revision = next_revision,
    store_color = COALESCE(p_store_color, store_color),
    updated_at = persisted_at
  WHERE id = auth.uid();

  RETURN jsonb_build_object(
    'revision', next_revision,
    'persisted_at', persisted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_storefront(
  p_document jsonb,
  p_expected_revision bigint,
  p_store_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_revision bigint;
  next_revision bigint;
  target_store_id uuid;
  active_installation_id uuid;
  persisted_at timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_document IS NULL
    OR jsonb_typeof(p_document) <> 'object'
    OR NOT (p_document ? 'engine_scene')
  THEN
    RAISE EXCEPTION 'Published storefront requires a valid Engine Scene document'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.theme_revision, s.id
  INTO current_revision, target_store_id
  FROM public.profiles p
  JOIN public.stores s ON s.owner_user_id = p.id
  WHERE p.id = auth.uid()
  FOR UPDATE OF p, s;

  IF current_revision IS NULL OR target_store_id IS NULL THEN
    RAISE EXCEPTION 'Store profile not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Storefront revision conflict: expected %, current %',
      p_expected_revision, current_revision
      USING ERRCODE = '40001';
  END IF;

  next_revision := current_revision + 1;
  SELECT ti.id
  INTO active_installation_id
  FROM public.theme_installations ti
  WHERE ti.store_id = target_store_id
    AND ti.status IN ('active', 'draft')
    AND ti.deleted_at IS NULL
  ORDER BY CASE WHEN ti.status = 'active' THEN 0 ELSE 1 END, ti.updated_at DESC
  LIMIT 1;

  INSERT INTO public.storefront_publications (
    store_id,
    theme_installation_id,
    revision,
    snapshot,
    created_by,
    created_at
  )
  VALUES (
    target_store_id,
    active_installation_id,
    next_revision,
    p_document,
    auth.uid(),
    persisted_at
  );

  UPDATE public.profiles
  SET
    theme = p_document,
    theme_draft = p_document,
    theme_published = p_document,
    theme_revision = next_revision,
    published_at = persisted_at,
    store_color = COALESCE(p_store_color, store_color),
    updated_at = persisted_at
  WHERE id = auth.uid();

  UPDATE public.stores
  SET status = 'published', updated_at = persisted_at
  WHERE id = target_store_id;

  IF active_installation_id IS NOT NULL THEN
    UPDATE public.theme_installations
    SET status = 'archived', updated_at = persisted_at
    WHERE store_id = target_store_id
      AND id <> active_installation_id
      AND status = 'active'
      AND deleted_at IS NULL;

    UPDATE public.theme_installations
    SET status = 'active', published_at = persisted_at, updated_at = persisted_at
    WHERE id = active_installation_id;
  END IF;

  RETURN jsonb_build_object(
    'revision', next_revision,
    'persisted_at', persisted_at
  );
END;
$$;

DROP POLICY IF EXISTS "Public can view stores" ON public.profiles;
DROP POLICY IF EXISTS "Public can place orders" ON public.orders;
CREATE POLICY "Public can place orders"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_published_store_owner(store_user_id));
DROP POLICY IF EXISTS "Public can add order items" ON public.order_items;
CREATE POLICY "Public can add order items"
  ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (public.is_public_store_order(order_id));
REVOKE SELECT ON public.profiles FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_storefront(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_catalog(uuid, integer, integer, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_product(uuid, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.save_storefront_draft(jsonb, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_storefront(jsonb, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_storefront_draft(jsonb, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_storefront(jsonb, bigint, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reserve_inventory(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_inventory(uuid, uuid, integer) TO authenticated, service_role;

COMMENT ON TABLE public.store_pages IS
  'Portable merchant page content. Theme-specific Scene Graph presentation remains in theme template documents.';
COMMENT ON TABLE public.store_menu_items IS
  'Entity-referenced navigation. Internal destinations use target_id, never permanent URLs.';
COMMENT ON TABLE public.storefront_publications IS
  'Immutable validated storefront snapshots. Rows are append-only and are never edited in place.';
COMMENT ON FUNCTION public.save_storefront_draft(jsonb, bigint, text) IS
  'Optimistic-concurrency draft save. Rejects stale browser tabs with SQLSTATE 40001.';
COMMENT ON FUNCTION public.publish_storefront(jsonb, bigint, text) IS
  'Atomically records an immutable publication and activates the same validated snapshot.';
