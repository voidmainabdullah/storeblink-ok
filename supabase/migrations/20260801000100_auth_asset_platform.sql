-- StoreBlink merchant authentication, capability authorization and durable assets.
-- Depends on 20260727000200_storefront_domain_architecture.sql.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER TABLE public.store_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.store_members DROP CONSTRAINT IF EXISTS store_members_role_check;
ALTER TABLE public.store_members DROP CONSTRAINT IF EXISTS store_members_status_check;

UPDATE public.store_members
SET role = CASE role
  WHEN 'store-manager' THEN 'admin'
  WHEN 'content-editor' THEN 'designer'
  WHEN 'product-manager' THEN 'catalog_manager'
  WHEN 'analyst' THEN 'viewer'
  ELSE role
END;

ALTER TABLE public.store_members
  ADD CONSTRAINT store_members_role_check
    CHECK (role IN ('owner', 'admin', 'designer', 'catalog_manager', 'support', 'viewer')),
  ADD CONSTRAINT store_members_status_check
    CHECK (status IN ('invited', 'active', 'suspended', 'revoked'));

CREATE UNIQUE INDEX IF NOT EXISTS store_members_store_user_uidx
  ON public.store_members(store_id, user_id);
CREATE INDEX IF NOT EXISTS store_members_user_status_store_idx
  ON public.store_members(user_id, status, store_id);
CREATE INDEX IF NOT EXISTS store_members_store_status_user_idx
  ON public.store_members(store_id, status, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS store_members_one_owner_idx
  ON public.store_members(store_id)
  WHERE role = 'owner' AND status = 'active';

DROP TRIGGER IF EXISTS store_members_set_updated_at ON public.store_members;
CREATE TRIGGER store_members_set_updated_at
BEFORE UPDATE ON public.store_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.enforce_store_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  store_owner_id uuid;
  target_store_id uuid;
  target_user_id uuid;
  target_role text;
  target_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_store_id := OLD.store_id;
    target_user_id := OLD.user_id;
    target_role := OLD.role;
    target_status := OLD.status;
  ELSE
    target_store_id := NEW.store_id;
    target_user_id := NEW.user_id;
    target_role := NEW.role;
    target_status := NEW.status;
  END IF;
  SELECT owner_user_id INTO store_owner_id
  FROM public.stores
  WHERE id = target_store_id;

  IF TG_OP = 'DELETE' AND OLD.user_id = store_owner_id THEN
    RAISE EXCEPTION 'Store owner membership cannot be deleted' USING ERRCODE = '42501';
  END IF;
  IF target_role = 'owner'
    AND (target_user_id <> store_owner_id OR target_status <> 'active')
  THEN
    RAISE EXCEPTION 'Owner role must match the active store owner' USING ERRCODE = '42501';
  END IF;
  IF target_user_id = store_owner_id
    AND (target_role <> 'owner' OR target_status <> 'active')
  THEN
    RAISE EXCEPTION 'Store owner membership must remain active owner' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS store_members_enforce_owner ON public.store_members;
CREATE TRIGGER store_members_enforce_owner
BEFORE INSERT OR UPDATE OR DELETE ON public.store_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_store_owner_membership();

CREATE OR REPLACE FUNCTION private.allowed_store_capabilities()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT ARRAY[
    'theme.read', 'theme.edit', 'theme.publish',
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
SET search_path = pg_catalog
AS $$
  SELECT CASE p_role
    WHEN 'owner' THEN private.allowed_store_capabilities()
    WHEN 'admin' THEN ARRAY[
      'theme.read', 'theme.edit', 'theme.publish',
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

CREATE OR REPLACE FUNCTION private.is_active_store_member(
  p_store_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.store_members sm
    WHERE sm.store_id = p_store_id
      AND sm.user_id = p_user_id
      AND sm.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.effective_store_capabilities(
  p_store_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT COALESCE(array_agg(DISTINCT capability ORDER BY capability), ARRAY[]::text[])
  FROM (
    SELECT unnest(private.role_capabilities(sm.role) || COALESCE(sm.capabilities, ARRAY[]::text[])) AS capability
    FROM public.store_members sm
    WHERE sm.store_id = p_store_id
      AND sm.user_id = p_user_id
      AND sm.status = 'active'
  ) granted
  WHERE capability = ANY(private.allowed_store_capabilities());
$$;

CREATE OR REPLACE FUNCTION private.has_store_capability(
  p_store_id uuid,
  p_capability text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
  SELECT p_capability = ANY(private.effective_store_capabilities(p_store_id, p_user_id));
$$;

CREATE OR REPLACE FUNCTION private.has_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, auth
AS $$
  SELECT COALESCE((auth.jwt() ->> 'aal') = 'aal2', false);
$$;

CREATE OR REPLACE FUNCTION private.can_manage_membership_change(
  p_store_id uuid,
  p_target_user_id uuid,
  p_role text,
  p_capabilities text[],
  p_actor_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.has_aal2()
    AND private.has_store_capability(p_store_id, 'store.members', p_actor_user_id)
    AND (
      EXISTS (
        SELECT 1 FROM public.stores s
        WHERE s.id = p_store_id AND s.owner_user_id = p_actor_user_id
      )
      OR (
        p_role <> 'owner'
        AND (
          SELECT COALESCE(array_agg(DISTINCT capability), ARRAY[]::text[])
          FROM unnest(
            private.role_capabilities(p_role)
            || COALESCE(p_capabilities, ARRAY[]::text[])
          ) capability
          WHERE capability = ANY(private.allowed_store_capabilities())
        ) <@ private.effective_store_capabilities(p_store_id, p_actor_user_id)
      )
    );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.allowed_store_capabilities() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.role_capabilities(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_active_store_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.effective_store_capabilities(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_store_capability(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_aal2() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_membership_change(uuid, uuid, text, text[], uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_access_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
  SELECT private.is_active_store_member(p_store_id, auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.has_store_capability(p_store_id uuid, p_capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, private
AS $$
  SELECT private.has_store_capability(p_store_id, p_capability, auth.uid());
$$;

REVOKE ALL ON FUNCTION public.can_access_store(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_store_capability(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_store(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_store_capability(uuid, text) TO authenticated, service_role;

-- Future sign-ups receive a tenant and active owner membership immediately.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  business_name_value text := COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'business_name'), ''), 'My store');
  store_handle_value text;
BEGIN
  store_handle_value := trim(both '-' FROM regexp_replace(lower(business_name_value), '[^a-z0-9]+', '-', 'g'))
    || '-' || substr(NEW.id::text, 1, 8);

  INSERT INTO public.profiles (id, full_name, business_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name', business_name_value)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.stores (id, owner_user_id, name, handle, status)
  VALUES (NEW.id, NEW.id, business_name_value, store_handle_value, 'draft')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.store_members (store_id, user_id, role, status, capabilities)
  VALUES (NEW.id, NEW.id, 'owner', 'active', ARRAY[]::text[])
  ON CONFLICT (store_id, user_id) DO UPDATE SET
    role = 'owner',
    status = 'active',
    updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_bootstrap(p_store_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  profile_row public.profiles%ROWTYPE;
  store_row public.stores%ROWTYPE;
  membership_row public.store_members%ROWTYPE;
  capabilities text[] := ARRAY[]::text[];
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO profile_row FROM public.profiles WHERE id = current_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.*
  INTO store_row
  FROM public.store_members sm
  JOIN public.stores s ON s.id = sm.store_id
  WHERE sm.user_id = current_user_id
    AND sm.status = 'active'
    AND s.deleted_at IS NULL
    AND (p_store_id IS NULL OR s.id = p_store_id)
  ORDER BY (sm.role = 'owner') DESC, s.updated_at DESC, s.id
  LIMIT 1;

  IF store_row.id IS NOT NULL THEN
    SELECT * INTO membership_row
    FROM public.store_members
    WHERE store_id = store_row.id
      AND user_id = current_user_id
      AND status = 'active';
  END IF;

  IF p_store_id IS NOT NULL AND store_row.id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.store_members
      WHERE store_id = p_store_id AND user_id = current_user_id AND status <> 'active'
    ) THEN
      RAISE EXCEPTION 'Store membership revoked' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;

  IF store_row.id IS NOT NULL THEN
    capabilities := private.effective_store_capabilities(store_row.id, current_user_id);
  END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', profile_row.id,
      'full_name', profile_row.full_name,
      'business_name', profile_row.business_name,
      'onboarding_completed', profile_row.onboarding_completed
    ),
    'store', CASE WHEN store_row.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', store_row.id,
      'name', store_row.name,
      'handle', store_row.handle,
      'status', store_row.status,
      'currency', store_row.currency,
      'locale', store_row.locale,
      'timezone', store_row.timezone
    ) END,
    'membership', CASE WHEN membership_row.store_id IS NULL THEN NULL ELSE jsonb_build_object(
      'store_id', membership_row.store_id,
      'user_id', membership_row.user_id,
      'role', membership_row.role,
      'status', membership_row.status
    ) END,
    'capabilities', to_jsonb(capabilities)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_bootstrap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_bootstrap(uuid) TO authenticated, service_role;

-- Replace broad membership policies with capability-aware policies.
DROP POLICY IF EXISTS "Store members read stores" ON public.stores;
DROP POLICY IF EXISTS "Store members update stores" ON public.stores;
DROP POLICY IF EXISTS "Store owners archive stores" ON public.stores;
CREATE POLICY "Active members read stores" ON public.stores FOR SELECT TO authenticated
  USING (private.is_active_store_member(id, auth.uid()));
CREATE POLICY "Store settings editors update stores" ON public.stores FOR UPDATE TO authenticated
  USING (private.has_store_capability(id, 'store.settings', auth.uid()))
  WITH CHECK (private.has_store_capability(id, 'store.settings', auth.uid()));
CREATE POLICY "AAL2 owners delete stores" ON public.stores FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() AND private.has_aal2());

CREATE OR REPLACE FUNCTION public.enforce_sensitive_store_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    IF auth.role() <> 'service_role'
      AND (auth.uid() <> OLD.owner_user_id OR NOT private.has_aal2())
    THEN
      RAISE EXCEPTION 'AAL2 owner verification required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.store_members sm
      WHERE sm.store_id = OLD.id
        AND sm.user_id = NEW.owner_user_id
        AND sm.status = 'active'
    ) THEN
      RAISE EXCEPTION 'New owner must be an active store member' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
    AND (NEW.status IN ('suspended', 'archived') OR OLD.status IN ('suspended', 'archived'))
    AND auth.role() <> 'service_role'
    AND (auth.uid() <> OLD.owner_user_id OR NOT private.has_aal2())
  THEN
    RAISE EXCEPTION 'AAL2 owner verification required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_store_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.owner_user_id IS NOT DISTINCT FROM OLD.owner_user_id THEN RETURN NEW; END IF;
  UPDATE public.store_members
  SET role = 'admin', updated_at = now()
  WHERE store_id = NEW.id AND user_id = OLD.owner_user_id;
  UPDATE public.store_members
  SET role = 'owner', status = 'active', updated_at = now()
  WHERE store_id = NEW.id AND user_id = NEW.owner_user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_enforce_sensitive_update ON public.stores;
CREATE TRIGGER stores_enforce_sensitive_update
BEFORE UPDATE ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.enforce_sensitive_store_update();
DROP TRIGGER IF EXISTS stores_sync_owner_membership ON public.stores;
CREATE TRIGGER stores_sync_owner_membership
AFTER UPDATE OF owner_user_id ON public.stores
FOR EACH ROW EXECUTE FUNCTION public.sync_store_owner_membership();

CREATE OR REPLACE FUNCTION public.transfer_store_ownership(p_store_id uuid, p_new_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_aal2() THEN
    RAISE EXCEPTION 'AAL2 owner verification required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.stores
  SET owner_user_id = p_new_owner_id, updated_at = now()
  WHERE id = p_store_id AND owner_user_id = auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.transfer_store_ownership(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_store_ownership(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Store members view memberships" ON public.store_members;
DROP POLICY IF EXISTS "Store owners manage memberships" ON public.store_members;
CREATE POLICY "Members read own or manageable memberships" ON public.store_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_store_capability(store_id, 'store.members', auth.uid()));
CREATE POLICY "AAL2 member managers insert memberships" ON public.store_members FOR INSERT TO authenticated
  WITH CHECK (private.can_manage_membership_change(store_id, user_id, role, capabilities, auth.uid()));
CREATE POLICY "AAL2 member managers update memberships" ON public.store_members FOR UPDATE TO authenticated
  USING (private.has_aal2() AND private.has_store_capability(store_id, 'store.members', auth.uid()))
  WITH CHECK (private.can_manage_membership_change(store_id, user_id, role, capabilities, auth.uid()));
CREATE POLICY "AAL2 member managers delete memberships" ON public.store_members FOR DELETE TO authenticated
  USING (private.has_aal2() AND private.has_store_capability(store_id, 'store.members', auth.uid()));

DO $$
DECLARE
  table_name text;
  old_policy text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'store_pages', 'store_redirects', 'store_menus', 'store_menu_items',
    'theme_installations', 'theme_template_documents', 'recovered_theme_content'
  ] LOOP
    old_policy := CASE table_name
      WHEN 'store_pages' THEN 'Store members manage pages'
      WHEN 'store_redirects' THEN 'Store members manage redirects'
      WHEN 'store_menus' THEN 'Store members manage menus'
      WHEN 'store_menu_items' THEN 'Store members manage menu items'
      WHEN 'theme_installations' THEN 'Store members manage theme installations'
      WHEN 'theme_template_documents' THEN 'Store members manage theme documents'
      ELSE 'Store members manage recovered content'
    END;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', old_policy, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_store_capability(store_id, ''theme.read'', auth.uid()))', 'Capability read ' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_store_capability(store_id, ''theme.edit'', auth.uid()))', 'Capability insert ' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.has_store_capability(store_id, ''theme.edit'', auth.uid())) WITH CHECK (private.has_store_capability(store_id, ''theme.edit'', auth.uid()))', 'Capability update ' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.has_store_capability(store_id, ''theme.edit'', auth.uid()))', 'Capability delete ' || table_name, table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Store members read publications" ON public.storefront_publications;
DROP POLICY IF EXISTS "Store members read publish jobs" ON public.storefront_publish_jobs;
CREATE POLICY "Theme readers read publications" ON public.storefront_publications FOR SELECT TO authenticated
  USING (private.has_store_capability(store_id, 'theme.read', auth.uid()));
CREATE POLICY "Theme readers read publish jobs" ON public.storefront_publish_jobs FOR SELECT TO authenticated
  USING (private.has_store_capability(store_id, 'theme.read', auth.uid()));

-- Extend catalog and order ownership to active store memberships.
DROP POLICY IF EXISTS "Store members manage variants" ON public.product_variants;
DROP POLICY IF EXISTS "Store members manage inventory" ON public.inventory_levels;
DROP POLICY IF EXISTS "Store members manage collections" ON public.store_collections;
DROP POLICY IF EXISTS "Store members manage collection products" ON public.collection_products;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'product_variants', 'inventory_levels', 'store_collections', 'collection_products'
  ] LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (private.has_store_capability(store_id, ''catalog.read'', auth.uid()))', 'Capability read ' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (private.has_store_capability(store_id, ''catalog.edit'', auth.uid()))', 'Capability insert ' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (private.has_store_capability(store_id, ''catalog.edit'', auth.uid())) WITH CHECK (private.has_store_capability(store_id, ''catalog.edit'', auth.uid()))', 'Capability update ' || table_name, table_name);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (private.has_store_capability(store_id, ''catalog.edit'', auth.uid()))', 'Capability delete ' || table_name, table_name);
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS "Owner select items" ON public.items;
DROP POLICY IF EXISTS "Owner insert items" ON public.items;
DROP POLICY IF EXISTS "Owner update items" ON public.items;
DROP POLICY IF EXISTS "Owner delete items" ON public.items;
DROP POLICY IF EXISTS "Public can view published items" ON public.items;
CREATE POLICY "Store members read catalog" ON public.items FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'catalog.read', auth.uid()));
CREATE POLICY "Catalog editors insert products" ON public.items FOR INSERT TO authenticated
  WITH CHECK (store_id IS NOT NULL AND private.has_store_capability(store_id, 'catalog.edit', auth.uid()));
CREATE POLICY "Catalog editors update products" ON public.items FOR UPDATE TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'catalog.edit', auth.uid()))
  WITH CHECK (store_id IS NOT NULL AND private.has_store_capability(store_id, 'catalog.edit', auth.uid()));
CREATE POLICY "Catalog editors delete products" ON public.items FOR DELETE TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'catalog.edit', auth.uid()));

CREATE OR REPLACE FUNCTION public.assign_item_store_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_store public.stores%ROWTYPE;
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT * INTO target_store
    FROM public.stores
    WHERE owner_user_id = NEW.user_id AND deleted_at IS NULL
    ORDER BY created_at
    LIMIT 1;
  ELSE
    SELECT * INTO target_store
    FROM public.stores
    WHERE id = NEW.store_id AND deleted_at IS NULL;
  END IF;
  IF target_store.id IS NULL THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;
  NEW.store_id := target_store.id;
  NEW.user_id := target_store.owner_user_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS items_assign_store_id ON public.items;
DROP TRIGGER IF EXISTS items_assign_store_scope ON public.items;
CREATE TRIGGER items_assign_store_scope
BEFORE INSERT OR UPDATE OF store_id ON public.items
FOR EACH ROW EXECUTE FUNCTION public.assign_item_store_scope();

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT;
UPDATE public.orders SET store_id = store_user_id WHERE store_id IS NULL;
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON public.orders(store_id, created_at DESC);
CREATE OR REPLACE FUNCTION public.assign_order_store_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_store public.stores%ROWTYPE;
BEGIN
  SELECT * INTO target_store
  FROM public.stores
  WHERE (NEW.store_id IS NOT NULL AND id = NEW.store_id)
     OR (NEW.store_id IS NULL AND owner_user_id = NEW.store_user_id)
  ORDER BY (id = NEW.store_id) DESC
  LIMIT 1;
  IF target_store.id IS NULL OR target_store.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;
  NEW.store_id := target_store.id;
  NEW.store_user_id := target_store.owner_user_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS orders_assign_store_scope ON public.orders;
CREATE TRIGGER orders_assign_store_scope
BEFORE INSERT OR UPDATE OF store_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.assign_order_store_scope();
DROP POLICY IF EXISTS "Owner select orders" ON public.orders;
DROP POLICY IF EXISTS "Owner update orders" ON public.orders;
DROP POLICY IF EXISTS "Owner delete orders" ON public.orders;
CREATE POLICY "Store members read orders" ON public.orders FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.read', auth.uid()));
CREATE POLICY "Order managers update orders" ON public.orders FOR UPDATE TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.manage', auth.uid()))
  WITH CHECK (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.manage', auth.uid()));
CREATE POLICY "Order managers delete orders" ON public.orders FOR DELETE TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.manage', auth.uid()));

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT;
UPDATE public.order_items oi SET store_id = o.store_id FROM public.orders o WHERE oi.order_id = o.id AND oi.store_id IS NULL;
CREATE INDEX IF NOT EXISTS order_items_store_order_idx ON public.order_items(store_id, order_id);
CREATE OR REPLACE FUNCTION public.assign_order_item_store_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  SELECT o.store_id INTO NEW.store_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;
  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS order_items_assign_store_scope ON public.order_items;
CREATE TRIGGER order_items_assign_store_scope
BEFORE INSERT OR UPDATE OF order_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.assign_order_item_store_scope();
DROP POLICY IF EXISTS "Owner select order items" ON public.order_items;
CREATE POLICY "Store members read order items" ON public.order_items FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.read', auth.uid()));

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT;
UPDATE public.customers SET store_id = user_id WHERE store_id IS NULL;
CREATE INDEX IF NOT EXISTS customers_store_created_idx ON public.customers(store_id, created_at DESC);
DROP POLICY IF EXISTS "Owner select customers" ON public.customers;
DROP POLICY IF EXISTS "Owner insert customers" ON public.customers;
DROP POLICY IF EXISTS "Owner update customers" ON public.customers;
DROP POLICY IF EXISTS "Owner delete customers" ON public.customers;
CREATE POLICY "Store members read customers" ON public.customers FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.read', auth.uid()));
CREATE POLICY "Order managers insert customers" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.manage', auth.uid()));
CREATE POLICY "Order managers update customers" ON public.customers FOR UPDATE TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.manage', auth.uid()))
  WITH CHECK (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.manage', auth.uid()));
CREATE POLICY "Order managers delete customers" ON public.customers FOR DELETE TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'orders.manage', auth.uid()));

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT;
UPDATE public.payments SET store_id = user_id WHERE store_id IS NULL;
CREATE INDEX IF NOT EXISTS payments_store_created_idx ON public.payments(store_id, created_at DESC);
DROP POLICY IF EXISTS "Owner select payments" ON public.payments;
DROP POLICY IF EXISTS "Owner insert payments" ON public.payments;
DROP POLICY IF EXISTS "Owner update payments" ON public.payments;
DROP POLICY IF EXISTS "Owner delete payments" ON public.payments;
CREATE POLICY "Billing managers read payments" ON public.payments FOR SELECT TO authenticated
  USING (store_id IS NOT NULL AND private.has_store_capability(store_id, 'billing.manage', auth.uid()));
CREATE POLICY "Billing managers insert payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (store_id IS NOT NULL AND private.has_aal2() AND private.has_store_capability(store_id, 'billing.manage', auth.uid()));
CREATE POLICY "Billing managers update payments" ON public.payments FOR UPDATE TO authenticated
  USING (store_id IS NOT NULL AND private.has_aal2() AND private.has_store_capability(store_id, 'billing.manage', auth.uid()))
  WITH CHECK (store_id IS NOT NULL AND private.has_aal2() AND private.has_store_capability(store_id, 'billing.manage', auth.uid()));
CREATE POLICY "Billing managers delete payments" ON public.payments FOR DELETE TO authenticated
  USING (store_id IS NOT NULL AND private.has_aal2() AND private.has_store_capability(store_id, 'billing.manage', auth.uid()));

-- Upgrade the existing media metadata table rather than creating a competing asset table.
DO $$
BEGIN
  IF to_regclass('public.assets') IS NULL AND to_regclass('public.media_assets') IS NOT NULL THEN
    ALTER TABLE public.media_assets RENAME TO assets;
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'storage_path'
  ) THEN
    ALTER TABLE public.assets RENAME COLUMN storage_path TO path;
  END IF;
END;
$$;

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS bucket text NOT NULL DEFAULT 'storefront-assets',
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS bytes bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aspect_ratio numeric,
  ADD COLUMN IF NOT EXISTS focal_x numeric,
  ADD COLUMN IF NOT EXISTS focal_y numeric,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ready';

UPDATE public.assets a
SET
  owner_id = COALESCE(a.owner_id, s.owner_user_id),
  content_hash = COALESCE(a.content_hash, 'legacy-' || md5(a.path)),
  aspect_ratio = COALESCE(a.aspect_ratio, CASE WHEN a.width > 0 AND a.height > 0 THEN a.width::numeric / a.height END),
  focal_x = COALESCE(a.focal_x, CASE
    WHEN COALESCE(a.focal_point ->> 'x', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN GREATEST(0, LEAST(1, (a.focal_point ->> 'x')::numeric))
    ELSE 0.5
  END),
  focal_y = COALESCE(a.focal_y, CASE
    WHEN COALESCE(a.focal_point ->> 'y', '') ~ '^-?[0-9]+([.][0-9]+)?$'
      THEN GREATEST(0, LEAST(1, (a.focal_point ->> 'y')::numeric))
    ELSE 0.5
  END)
FROM public.stores s
WHERE s.id = a.store_id;

ALTER TABLE public.assets ALTER COLUMN owner_id SET NOT NULL;
ALTER TABLE public.assets ALTER COLUMN content_hash SET NOT NULL;
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_bucket_check;
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_kind_check;
ALTER TABLE public.assets DROP CONSTRAINT IF EXISTS assets_status_check;
ALTER TABLE public.assets ADD CONSTRAINT assets_bucket_check
  CHECK (bucket IN ('storefront-assets', 'merchant-originals', 'merchant-private', 'temp-uploads'));
ALTER TABLE public.assets ADD CONSTRAINT assets_kind_check
  CHECK (kind IN ('image', 'svg', 'video', 'document'));
ALTER TABLE public.assets ADD CONSTRAINT assets_status_check
  CHECK (status IN ('pending', 'uploading', 'ready', 'failed', 'deleted'));
ALTER TABLE public.assets ADD CONSTRAINT assets_bytes_check CHECK (bytes >= 0);
ALTER TABLE public.assets ADD CONSTRAINT assets_dimensions_check
  CHECK ((width IS NULL OR width > 0) AND (height IS NULL OR height > 0));
ALTER TABLE public.assets ADD CONSTRAINT assets_focal_check
  CHECK ((focal_x IS NULL OR focal_x BETWEEN 0 AND 1) AND (focal_y IS NULL OR focal_y BETWEEN 0 AND 1));

DROP INDEX IF EXISTS public.media_assets_store_path_live_idx;
CREATE UNIQUE INDEX IF NOT EXISTS assets_bucket_path_live_idx ON public.assets(bucket, path) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_store_status_created_idx ON public.assets(store_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_owner_created_idx ON public.assets(owner_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_store_hash_idx ON public.assets(store_id, content_hash) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS assets_resumable_lookup_idx
  ON public.assets(store_id, owner_id, bucket, content_hash, status)
  WHERE deleted_at IS NULL AND status IN ('pending', 'uploading');

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store members manage media" ON public.assets;
CREATE POLICY "Store members read assets" ON public.assets FOR SELECT TO authenticated
  USING (private.is_active_store_member(store_id, auth.uid()));
CREATE POLICY "Asset managers insert assets" ON public.assets FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND private.has_store_capability(store_id, 'assets.manage', auth.uid()));
CREATE POLICY "Asset managers update assets" ON public.assets FOR UPDATE TO authenticated
  USING (private.has_store_capability(store_id, 'assets.manage', auth.uid()))
  WITH CHECK (private.has_store_capability(store_id, 'assets.manage', auth.uid()));
CREATE POLICY "Asset managers delete assets" ON public.assets FOR DELETE TO authenticated
  USING (private.has_store_capability(store_id, 'assets.manage', auth.uid()));

DROP VIEW IF EXISTS public.media_assets;
CREATE VIEW public.media_assets WITH (security_invoker = true) AS
SELECT id, store_id, path AS storage_path, mime_type, alt_text, width, height,
  jsonb_strip_nulls(jsonb_build_object('x', focal_x, 'y', focal_y)) AS focal_point,
  variants, usage_count, created_at, updated_at, deleted_at
FROM public.assets;
REVOKE ALL ON public.media_assets FROM PUBLIC, anon;
GRANT SELECT ON public.media_assets TO authenticated;

INSERT INTO storage.buckets(id, name, public)
VALUES
  ('storefront-assets', 'storefront-assets', true),
  ('merchant-originals', 'merchant-originals', false),
  ('merchant-private', 'merchant-private', false),
  ('temp-uploads', 'temp-uploads', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

CREATE OR REPLACE FUNCTION private.storage_store_id(p_name text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, storage
AS $$
DECLARE
  folders text[] := storage.foldername(p_name);
BEGIN
  IF array_length(folders, 1) < 2 OR folders[1] <> 'stores'
    OR folders[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    RETURN NULL;
  END IF;
  RETURN folders[2]::uuid;
END;
$$;
REVOKE ALL ON FUNCTION private.storage_store_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.storage_store_id(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_upload_prepared_asset(
  p_bucket text,
  p_name text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.assets a
    WHERE a.bucket = p_bucket
      AND a.path = p_name
      AND a.owner_id = p_user_id
      AND a.status IN ('pending', 'uploading')
      AND a.deleted_at IS NULL
      AND private.has_store_capability(a.store_id, 'assets.manage', p_user_id)
  );
$$;
REVOKE ALL ON FUNCTION private.can_upload_prepared_asset(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_upload_prepared_asset(text, text, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Store asset members select objects" ON storage.objects;
DROP POLICY IF EXISTS "Store asset managers upload objects" ON storage.objects;
DROP POLICY IF EXISTS "Store asset managers delete objects" ON storage.objects;
CREATE POLICY "Store asset members select objects" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id IN ('storefront-assets', 'merchant-originals', 'merchant-private', 'temp-uploads')
    AND private.is_active_store_member(private.storage_store_id(name), auth.uid())
  );
CREATE POLICY "Store asset managers upload objects" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('storefront-assets', 'merchant-originals', 'merchant-private', 'temp-uploads')
    AND private.can_upload_prepared_asset(bucket_id, name, auth.uid())
  );
CREATE POLICY "Store asset managers delete objects" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id IN ('storefront-assets', 'merchant-originals', 'merchant-private', 'temp-uploads')
    AND private.has_store_capability(private.storage_store_id(name), 'assets.manage', auth.uid())
  );

CREATE OR REPLACE FUNCTION public.prepare_asset_upload(
  p_store_id uuid,
  p_filename text,
  p_kind text,
  p_mime_type text,
  p_bytes bigint,
  p_content_hash text,
  p_visibility text DEFAULT 'public',
  p_alt_text text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  asset_id uuid := gen_random_uuid();
  target_bucket text;
  safe_filename text;
  object_path text;
  resumable_asset public.assets%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_store_capability(p_store_id, 'assets.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Asset permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_bytes <= 0 OR p_bytes > 52428800 THEN
    RAISE EXCEPTION 'Asset size is invalid' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('image', 'svg', 'video', 'document') THEN
    RAISE EXCEPTION 'Asset kind is invalid' USING ERRCODE = '22023';
  END IF;
  IF (p_kind = 'image' AND lower(p_mime_type) NOT IN ('image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif'))
    OR (p_kind = 'svg' AND lower(p_mime_type) <> 'image/svg+xml')
  THEN
    RAISE EXCEPTION 'Asset MIME type is invalid' USING ERRCODE = '22023';
  END IF;
  IF lower(p_content_hash) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Asset content hash is invalid' USING ERRCODE = '22023';
  END IF;
  target_bucket := CASE p_visibility
    WHEN 'public' THEN 'storefront-assets'
    WHEN 'original' THEN 'merchant-originals'
    WHEN 'private' THEN 'merchant-private'
    WHEN 'temporary' THEN 'temp-uploads'
    ELSE NULL
  END;
  IF target_bucket IS NULL THEN
    RAISE EXCEPTION 'Asset visibility is invalid' USING ERRCODE = '22023';
  END IF;

  -- Serialize preparation for the same tenant/content. Reusing the pending
  -- metadata row keeps the TUS fingerprint and immutable object path aligned
  -- across browser retries and reloads.
  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text), hashtext(lower(p_content_hash)));
  SELECT * INTO resumable_asset
  FROM public.assets
  WHERE store_id = p_store_id
    AND owner_id = auth.uid()
    AND bucket = target_bucket
    AND content_hash = lower(p_content_hash)
    AND status IN ('pending', 'uploading')
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF resumable_asset.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', resumable_asset.id,
      'store_id', resumable_asset.store_id,
      'bucket', resumable_asset.bucket,
      'path', resumable_asset.path,
      'status', CASE WHEN EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = resumable_asset.bucket AND o.name = resumable_asset.path
      ) THEN 'uploaded' ELSE 'pending' END
    );
  END IF;

  safe_filename := trim(both '-' FROM regexp_replace(lower(COALESCE(p_filename, 'asset')), '[^a-z0-9._-]+', '-', 'g'));
  IF safe_filename = '' THEN safe_filename := 'asset'; END IF;
  object_path := 'stores/' || p_store_id || '/assets/' || asset_id || '/'
    || lower(p_content_hash) || '-' || left(safe_filename, 160);

  INSERT INTO public.assets(
    id, store_id, owner_id, bucket, path, kind, mime_type, bytes,
    alt_text, content_hash, status
  ) VALUES (
    asset_id, p_store_id, auth.uid(), target_bucket, object_path, p_kind,
    lower(p_mime_type), p_bytes, NULLIF(trim(p_alt_text), ''), lower(p_content_hash), 'pending'
  );

  RETURN jsonb_build_object(
    'id', asset_id,
    'store_id', p_store_id,
    'bucket', target_bucket,
    'path', object_path,
    'status', 'pending'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_asset_upload(
  p_asset_id uuid,
  p_width integer DEFAULT NULL,
  p_height integer DEFAULT NULL,
  p_aspect_ratio numeric DEFAULT NULL,
  p_focal_x numeric DEFAULT NULL,
  p_focal_y numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private, storage
AS $$
DECLARE
  asset_row public.assets%ROWTYPE;
BEGIN
  SELECT * INTO asset_row FROM public.assets WHERE id = p_asset_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT private.has_store_capability(asset_row.store_id, 'assets.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Asset permission denied' USING ERRCODE = '42501';
  END IF;
  IF asset_row.status NOT IN ('pending', 'uploading', 'failed') THEN
    RAISE EXCEPTION 'Asset cannot be finalized from status %', asset_row.status USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
    WHERE o.bucket_id = asset_row.bucket AND o.name = asset_row.path
  ) THEN
    RAISE EXCEPTION 'Uploaded object was not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.assets SET
    width = p_width,
    height = p_height,
    aspect_ratio = COALESCE(p_aspect_ratio, CASE WHEN p_width > 0 AND p_height > 0 THEN p_width::numeric / p_height END),
    focal_x = p_focal_x,
    focal_y = p_focal_y,
    focal_point = jsonb_strip_nulls(jsonb_build_object('x', p_focal_x, 'y', p_focal_y)),
    status = 'ready',
    updated_at = now()
  WHERE id = p_asset_id
  RETURNING * INTO asset_row;

  RETURN to_jsonb(asset_row);
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_asset_upload(p_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  target_store_id uuid;
BEGIN
  SELECT store_id INTO target_store_id FROM public.assets WHERE id = p_asset_id;
  IF target_store_id IS NULL OR NOT private.has_store_capability(target_store_id, 'assets.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Asset permission denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.assets SET status = 'failed', updated_at = now() WHERE id = p_asset_id AND status <> 'ready';
END;
$$;

CREATE OR REPLACE FUNCTION public.retire_asset(p_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  target_store_id uuid;
BEGIN
  SELECT store_id INTO target_store_id
  FROM public.assets
  WHERE id = p_asset_id AND deleted_at IS NULL;
  IF target_store_id IS NULL OR NOT private.has_store_capability(target_store_id, 'assets.manage', auth.uid()) THEN
    RAISE EXCEPTION 'Asset permission denied' USING ERRCODE = '42501';
  END IF;
  UPDATE public.assets
  SET status = 'deleted', deleted_at = now(), updated_at = now()
  WHERE id = p_asset_id;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_asset_upload(uuid, text, text, text, bigint, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_asset_upload(uuid, integer, integer, numeric, numeric, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fail_asset_upload(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.retire_asset(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.prepare_asset_upload(uuid, text, text, text, bigint, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_asset_upload(uuid, integer, integer, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fail_asset_upload(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.retire_asset(uuid) TO authenticated;

-- Feature-specific editor load. This is separate from the intentionally small
-- auth bootstrap and exposes draft content only to members with theme.read.
CREATE OR REPLACE FUNCTION public.get_editor_store_document(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'business_name', p.business_name,
    'store_tagline', p.store_tagline,
    'store_about', p.store_about,
    'store_color', p.store_color,
    'store_banner_url', p.store_banner_url,
    'store_slug', s.handle,
    'theme', p.theme,
    'theme_draft', p.theme_draft,
    'theme_published', p.theme_published,
    'theme_revision', p.theme_revision,
    'categories', COALESCE(p.categories, '[]'::jsonb)
  )
  FROM public.stores s
  JOIN public.profiles p ON p.id = s.owner_user_id
  WHERE s.id = p_store_id
    AND s.deleted_at IS NULL
    AND private.has_store_capability(s.id, 'theme.read', auth.uid())
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_editor_store_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_editor_store_document(uuid) TO authenticated;

-- Store-scoped publishing supports collaborators while preserving the old
-- owner-only three-argument signatures as compatibility wrappers.
CREATE OR REPLACE FUNCTION public.save_storefront_draft(
  p_store_id uuid,
  p_document jsonb,
  p_expected_revision bigint,
  p_store_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  current_revision bigint;
  next_revision bigint;
  target_owner_id uuid;
  persisted_at timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_store_capability(p_store_id, 'theme.edit', auth.uid()) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
  IF p_document IS NULL OR jsonb_typeof(p_document) <> 'object' THEN
    RAISE EXCEPTION 'Storefront document must be a JSON object' USING ERRCODE = '22023';
  END IF;

  SELECT p.theme_revision, s.owner_user_id
  INTO current_revision, target_owner_id
  FROM public.stores s
  JOIN public.profiles p ON p.id = s.owner_user_id
  WHERE s.id = p_store_id AND s.deleted_at IS NULL
  FOR UPDATE OF p, s;

  IF current_revision IS NULL OR target_owner_id IS NULL THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Storefront revision conflict: expected %, current %',
      p_expected_revision, current_revision USING ERRCODE = '40001';
  END IF;

  next_revision := current_revision + 1;
  UPDATE public.profiles
  SET theme_draft = p_document,
      theme_revision = next_revision,
      store_color = COALESCE(p_store_color, store_color),
      updated_at = persisted_at
  WHERE id = target_owner_id;

  RETURN jsonb_build_object('revision', next_revision, 'persisted_at', persisted_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_storefront(
  p_store_id uuid,
  p_document jsonb,
  p_expected_revision bigint,
  p_store_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  current_revision bigint;
  next_revision bigint;
  target_owner_id uuid;
  active_installation_id uuid;
  persisted_at timestamptz := clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_store_capability(p_store_id, 'theme.publish', auth.uid()) THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;
  IF p_document IS NULL
    OR jsonb_typeof(p_document) <> 'object'
    OR NOT (p_document ? 'engine_scene')
  THEN
    RAISE EXCEPTION 'Published storefront requires a valid Engine Scene document'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.theme_revision, s.owner_user_id
  INTO current_revision, target_owner_id
  FROM public.stores s
  JOIN public.profiles p ON p.id = s.owner_user_id
  WHERE s.id = p_store_id AND s.deleted_at IS NULL
  FOR UPDATE OF p, s;

  IF current_revision IS NULL OR target_owner_id IS NULL THEN
    RAISE EXCEPTION 'Store not found' USING ERRCODE = 'P0002';
  END IF;
  IF current_revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Storefront revision conflict: expected %, current %',
      p_expected_revision, current_revision USING ERRCODE = '40001';
  END IF;

  next_revision := current_revision + 1;
  SELECT ti.id INTO active_installation_id
  FROM public.theme_installations ti
  WHERE ti.store_id = p_store_id
    AND ti.status IN ('active', 'draft')
    AND ti.deleted_at IS NULL
  ORDER BY CASE WHEN ti.status = 'active' THEN 0 ELSE 1 END, ti.updated_at DESC
  LIMIT 1;

  INSERT INTO public.storefront_publications(
    store_id, theme_installation_id, revision, snapshot, created_by, created_at
  ) VALUES (
    p_store_id, active_installation_id, next_revision, p_document, auth.uid(), persisted_at
  );

  UPDATE public.profiles
  SET theme = p_document,
      theme_draft = p_document,
      theme_published = p_document,
      theme_revision = next_revision,
      published_at = persisted_at,
      store_color = COALESCE(p_store_color, store_color),
      updated_at = persisted_at
  WHERE id = target_owner_id;

  UPDATE public.stores SET status = 'published', updated_at = persisted_at
  WHERE id = p_store_id;

  IF active_installation_id IS NOT NULL THEN
    UPDATE public.theme_installations
    SET status = 'archived', updated_at = persisted_at
    WHERE store_id = p_store_id
      AND id <> active_installation_id
      AND status = 'active'
      AND deleted_at IS NULL;
    UPDATE public.theme_installations
    SET status = 'active', published_at = persisted_at, updated_at = persisted_at
    WHERE id = active_installation_id;
  END IF;

  RETURN jsonb_build_object('revision', next_revision, 'persisted_at', persisted_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_storefront_draft(
  p_document jsonb,
  p_expected_revision bigint,
  p_store_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT public.save_storefront_draft(auth.uid(), p_document, p_expected_revision, p_store_color);
$$;

CREATE OR REPLACE FUNCTION public.publish_storefront(
  p_document jsonb,
  p_expected_revision bigint,
  p_store_color text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT public.publish_storefront(auth.uid(), p_document, p_expected_revision, p_store_color);
$$;

REVOKE ALL ON FUNCTION public.save_storefront_draft(uuid, jsonb, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.publish_storefront(uuid, jsonb, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_storefront_draft(uuid, jsonb, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_storefront(uuid, jsonb, bigint, text) TO authenticated;

-- AI-generated drafts use the same optimistic revision and capability boundary
-- as manual editor saves while updating only the selected store's projection.
CREATE OR REPLACE FUNCTION public.save_generated_storefront_draft(
  p_store_id uuid,
  p_document jsonb,
  p_expected_revision bigint,
  p_business_name text,
  p_store_tagline text DEFAULT NULL,
  p_store_about text DEFAULT NULL,
  p_store_color text DEFAULT NULL,
  p_store_banner_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  target_owner_id uuid;
  write_result jsonb;
BEGIN
  IF p_document IS NULL
    OR jsonb_typeof(p_document) <> 'object'
    OR NOT (p_document ? 'engine_scene')
  THEN
    RAISE EXCEPTION 'Generated storefront requires an Engine Scene document'
      USING ERRCODE = '22023';
  END IF;
  IF length(trim(COALESCE(p_business_name, ''))) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Business name is invalid' USING ERRCODE = '22023';
  END IF;

  SELECT owner_user_id INTO target_owner_id
  FROM public.stores
  WHERE id = p_store_id AND deleted_at IS NULL;
  IF target_owner_id IS NULL
    OR NOT private.has_store_capability(p_store_id, 'theme.edit', auth.uid())
  THEN
    RAISE EXCEPTION 'Store access denied' USING ERRCODE = '42501';
  END IF;

  write_result := public.save_storefront_draft(
    p_store_id,
    p_document,
    p_expected_revision,
    p_store_color
  );

  UPDATE public.profiles
  SET business_name = trim(p_business_name),
      store_tagline = p_store_tagline,
      store_about = p_store_about,
      store_banner_url = p_store_banner_url,
      updated_at = clock_timestamp()
  WHERE id = target_owner_id;

  RETURN write_result;
END;
$$;
REVOKE ALL ON FUNCTION public.save_generated_storefront_draft(uuid, jsonb, bigint, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_generated_storefront_draft(uuid, jsonb, bigint, text, text, text, text, text) TO authenticated;

COMMENT ON TABLE public.assets IS 'Store-scoped metadata for immutable binaries stored in Supabase Storage; Scene Graph documents persist asset IDs and non-binary presentation metadata only.';
COMMENT ON FUNCTION public.get_dashboard_bootstrap(uuid) IS 'Lightweight authenticated dashboard bootstrap: profile, current store, membership and effective capabilities only.';
