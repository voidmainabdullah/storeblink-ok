-- Repair tenant provisioning for users created before the auth platform migration
-- and expose one atomic onboarding completion boundary.

INSERT INTO public.profiles (
  id,
  full_name,
  business_name,
  store_slug
)
SELECT
  u.id,
  NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
  COALESCE(
    NULLIF(trim(u.raw_user_meta_data ->> 'business_name'), ''),
    NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(split_part(u.email, '@', 1), ''),
    'My store'
  ),
  'store-' || replace(u.id::text, '-', '')
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stores (
  id,
  owner_user_id,
  name,
  handle,
  status,
  brand_profile
)
SELECT
  p.id,
  p.id,
  COALESCE(NULLIF(trim(p.business_name), ''), 'My store'),
  COALESCE(NULLIF(trim(p.store_slug), ''), 'store-' || replace(p.id::text, '-', '')),
  'draft',
  jsonb_strip_nulls(jsonb_build_object('primaryColor', p.store_color))
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1
  FROM public.stores s
  WHERE s.owner_user_id = p.id
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.store_members (store_id, user_id, role, status, capabilities)
SELECT s.id, s.owner_user_id, 'owner', 'active', ARRAY[]::text[]
FROM public.stores s
WHERE NOT EXISTS (
  SELECT 1
  FROM public.store_members sm
  WHERE sm.store_id = s.id
    AND sm.user_id = s.owner_user_id
)
ON CONFLICT (store_id, user_id) DO UPDATE SET
  role = 'owner',
  status = 'active',
  updated_at = now();

CREATE OR REPLACE FUNCTION public.complete_store_onboarding(
  p_business_name text,
  p_requested_handle text,
  p_store_template text,
  p_store_color text,
  p_theme jsonb,
  p_business_type text,
  p_categories jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  business_name_value text := NULLIF(trim(p_business_name), '');
  template_value text := COALESCE(NULLIF(trim(p_store_template), ''), 'minimal');
  color_value text := upper(COALESCE(NULLIF(trim(p_store_color), ''), '#5669FF'));
  business_type_value text := NULLIF(trim(p_business_type), '');
  categories_value jsonb := COALESCE(p_categories, '[]'::jsonb);
  theme_value jsonb := COALESCE(p_theme, '{}'::jsonb);
  base_handle text;
  candidate_handle text;
  suffix integer := 1;
  target_store public.stores%ROWTYPE;
  target_membership public.store_members%ROWTYPE;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF business_name_value IS NULL OR length(business_name_value) < 2 THEN
    RAISE EXCEPTION 'Business name must contain at least two characters' USING ERRCODE = '22023';
  END IF;
  IF length(business_name_value) > 80 THEN
    RAISE EXCEPTION 'Business name exceeds 80 characters' USING ERRCODE = '22023';
  END IF;
  IF length(template_value) > 80 THEN
    RAISE EXCEPTION 'Store template identifier exceeds 80 characters' USING ERRCODE = '22023';
  END IF;
  IF business_type_value IS NOT NULL AND length(business_type_value) > 80 THEN
    RAISE EXCEPTION 'Business type exceeds 80 characters' USING ERRCODE = '22023';
  END IF;
  IF color_value !~ '^#[0-9A-F]{6}([0-9A-F]{2})?$' THEN
    RAISE EXCEPTION 'Store color must be a six or eight digit hex color' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(theme_value) <> 'object' THEN
    RAISE EXCEPTION 'Theme must be a JSON object' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(categories_value) <> 'array' THEN
    RAISE EXCEPTION 'Categories must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(categories_value) > 50 THEN
    RAISE EXCEPTION 'Categories cannot contain more than 50 entries' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(categories_value) AS entry(value)
    WHERE jsonb_typeof(entry.value) <> 'string'
      OR length(trim(entry.value #>> '{}')) = 0
      OR length(trim(entry.value #>> '{}')) > 80
  ) THEN
    RAISE EXCEPTION 'Each category must be a non-empty string of at most 80 characters'
      USING ERRCODE = '22023';
  END IF;

  base_handle := trim(both '-' FROM regexp_replace(
    lower(COALESCE(NULLIF(trim(p_requested_handle), ''), business_name_value)),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
  base_handle := left(COALESCE(NULLIF(base_handle, ''), 'store'), 48);

  -- Serializes merchants competing for the same public handle without taking a table lock.
  PERFORM pg_advisory_xact_lock(hashtextextended(base_handle, 0));
  candidate_handle := base_handle;
  WHILE EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.store_slug = candidate_handle AND p.id <> current_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.handle = candidate_handle AND s.owner_user_id <> current_user_id
  ) LOOP
    suffix := suffix + 1;
    candidate_handle := left(base_handle, 48) || '-' || suffix::text;
    IF suffix > 1000 THEN
      RAISE EXCEPTION 'Could not allocate a unique store handle' USING ERRCODE = '23505';
    END IF;
  END LOOP;

  INSERT INTO public.profiles AS current_profile (
    id,
    full_name,
    business_name,
    store_slug,
    store_template,
    store_color,
    theme,
    business_type,
    categories,
    onboarding_completed
  )
  SELECT
    current_user_id,
    NULLIF(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    business_name_value,
    candidate_handle,
    template_value,
    color_value,
    theme_value,
    business_type_value,
    categories_value,
    true
  FROM auth.users u
  WHERE u.id = current_user_id
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(current_profile.full_name, EXCLUDED.full_name),
    business_name = EXCLUDED.business_name,
    store_slug = EXCLUDED.store_slug,
    store_template = EXCLUDED.store_template,
    store_color = EXCLUDED.store_color,
    theme = EXCLUDED.theme,
    business_type = EXCLUDED.business_type,
    categories = EXCLUDED.categories,
    onboarding_completed = true,
    updated_at = now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Authenticated user record not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.stores AS current_store (
    id,
    owner_user_id,
    name,
    handle,
    status,
    brand_profile
  )
  VALUES (
    current_user_id,
    current_user_id,
    business_name_value,
    candidate_handle,
    'draft',
    jsonb_build_object('primaryColor', color_value)
  )
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    handle = EXCLUDED.handle,
    brand_profile = current_store.brand_profile || EXCLUDED.brand_profile,
    updated_at = now()
  RETURNING * INTO target_store;

  INSERT INTO public.store_members (store_id, user_id, role, status, capabilities)
  VALUES (target_store.id, current_user_id, 'owner', 'active', ARRAY[]::text[])
  ON CONFLICT (store_id, user_id) DO UPDATE SET
    role = 'owner',
    status = 'active',
    updated_at = now()
  RETURNING * INTO target_membership;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', current_user_id,
      'business_name', business_name_value,
      'onboarding_completed', true
    ),
    'store', jsonb_build_object(
      'id', target_store.id,
      'name', target_store.name,
      'handle', target_store.handle
    ),
    'membership', jsonb_build_object(
      'store_id', target_membership.store_id,
      'user_id', target_membership.user_id,
      'role', target_membership.role,
      'status', target_membership.status
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_store_onboarding(text, text, text, text, jsonb, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_store_onboarding(text, text, text, text, jsonb, text, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_store_onboarding(text, text, text, text, jsonb, text, jsonb)
  IS 'Atomically provisions the authenticated merchant tenant and completes onboarding.';
