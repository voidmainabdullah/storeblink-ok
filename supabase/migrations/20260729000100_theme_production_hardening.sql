-- StoreBlink theme production guardrails and durable publication recovery.
-- This migration depends on 20260727000200_storefront_domain_architecture.sql.

CREATE OR REPLACE FUNCTION public.assert_storefront_scene_policy(
  p_scene jsonb,
  p_page_label text DEFAULT 'home'
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  node_count bigint;
  dynamic_binding_count bigint;
  extension_node_count bigint;
BEGIN
  IF p_scene IS NULL
    OR jsonb_typeof(p_scene) <> 'object'
    OR jsonb_typeof(p_scene -> 'nodes') <> 'object'
    OR COALESCE(p_scene ->> 'rootNodeId', '') = ''
    OR NOT ((p_scene -> 'nodes') ? (p_scene ->> 'rootNodeId'))
  THEN
    RAISE EXCEPTION 'Page % does not contain a valid Engine Scene root', p_page_label
      USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO node_count
  FROM jsonb_object_keys(p_scene -> 'nodes');

  IF node_count > 5000 THEN
    RAISE EXCEPTION 'Page % contains % nodes; limit is 5000', p_page_label, node_count
      USING ERRCODE = '54000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_scene -> 'nodes') AS node
    WHERE jsonb_typeof(node.value -> 'childIds') <> 'array'
       OR jsonb_array_length(COALESCE(node.value -> 'childIds', '[]'::jsonb)) > 500
  ) THEN
    RAISE EXCEPTION 'Page % contains a node with invalid or excessive children', p_page_label
      USING ERRCODE = '54000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_scene -> 'nodes') AS node
    WHERE jsonb_typeof(node.value #> '{style,effects}') = 'array'
      AND jsonb_array_length(node.value #> '{style,effects}') > 12
  ) THEN
    RAISE EXCEPTION 'Page % contains a node with more than 12 effects', p_page_label
      USING ERRCODE = '54000';
  END IF;

  SELECT count(*) INTO dynamic_binding_count
  FROM jsonb_each(p_scene -> 'nodes') AS node
  WHERE node.value #> '{extensions,dynamicBinding}' IS NOT NULL;

  IF dynamic_binding_count > 1500 THEN
    RAISE EXCEPTION 'Page % contains % dynamic bindings; limit is 1500',
      p_page_label, dynamic_binding_count
      USING ERRCODE = '54000';
  END IF;

  SELECT count(*) INTO extension_node_count
  FROM jsonb_each(p_scene -> 'nodes') AS node
  WHERE node.value #> '{extensions,extensionId}' IS NOT NULL
     OR node.value #> '{extensions,extensionSlot}' IS NOT NULL;

  IF extension_node_count > 100 THEN
    RAISE EXCEPTION 'Page % contains % extension nodes; limit is 100',
      p_page_label, extension_node_count
      USING ERRCODE = '54000';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each(p_scene -> 'nodes') AS node
    WHERE COALESCE(node.value #>> '{extensions,navigationTarget}', '') ~*
      '^(javascript|data|vbscript):'
  ) THEN
    RAISE EXCEPTION 'Page % contains an unsafe navigation protocol', p_page_label
      USING ERRCODE = '22023';
  END IF;

  RETURN node_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_storefront_document_policy(p_document jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  page_record record;
  page_count integer := 0;
  total_nodes bigint := 0;
BEGIN
  IF p_document IS NULL
    OR jsonb_typeof(p_document) <> 'object'
    OR jsonb_typeof(p_document -> 'engine_scene') <> 'object'
  THEN
    RAISE EXCEPTION 'Storefront document requires an Engine Scene'
      USING ERRCODE = '22023';
  END IF;

  IF pg_column_size(p_document) > 5242880 THEN
    RAISE EXCEPTION 'Storefront document exceeds the 5 MiB production limit'
      USING ERRCODE = '54000';
  END IF;

  IF jsonb_typeof(p_document #> '{engine_page_document,pages}') = 'array' THEN
    page_count := jsonb_array_length(p_document #> '{engine_page_document,pages}');
    IF page_count > 100 THEN
      RAISE EXCEPTION 'Storefront contains % pages; limit is 100', page_count
        USING ERRCODE = '54000';
    END IF;
    FOR page_record IN
      SELECT
        COALESCE(page ->> 'id', ordinal::text) AS page_id,
        page -> 'scene' AS scene
      FROM jsonb_array_elements(p_document #> '{engine_page_document,pages}')
        WITH ORDINALITY AS pages(page, ordinal)
    LOOP
      total_nodes := total_nodes
        + public.assert_storefront_scene_policy(page_record.scene, page_record.page_id);
    END LOOP;
  ELSE
    page_count := 1;
    total_nodes := public.assert_storefront_scene_policy(
      p_document -> 'engine_scene',
      'home'
    );
  END IF;

  IF page_count < 1 THEN
    RAISE EXCEPTION 'Storefront requires at least one page'
      USING ERRCODE = '22023';
  END IF;

  IF total_nodes > 20000 THEN
    RAISE EXCEPTION 'Storefront contains % total nodes; limit is 20000', total_nodes
      USING ERRCODE = '54000';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_profile_storefront_document_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.theme_draft IS DISTINCT FROM OLD.theme_draft
    AND NEW.theme_draft IS NOT NULL
  THEN
    PERFORM public.assert_storefront_document_policy(NEW.theme_draft);
  END IF;
  IF NEW.theme_published IS DISTINCT FROM OLD.theme_published
    AND NEW.theme_published IS NOT NULL
  THEN
    PERFORM public.assert_storefront_document_policy(NEW.theme_published);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_storefront_document_policy ON public.profiles;
CREATE TRIGGER profiles_storefront_document_policy
  BEFORE UPDATE OF theme_draft, theme_published ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_storefront_document_policy();

CREATE OR REPLACE FUNCTION public.enforce_publication_document_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_storefront_document_policy(NEW.snapshot);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS storefront_publications_document_policy
  ON public.storefront_publications;
CREATE TRIGGER storefront_publications_document_policy
  BEFORE INSERT OR UPDATE ON public.storefront_publications
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_publication_document_policy();

CREATE OR REPLACE FUNCTION public.get_storefront_publication_history(
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', publication.id,
        'revision', publication.revision,
        'theme_installation_id', publication.theme_installation_id,
        'created_at', publication.created_at,
        'created_by', publication.created_by
      )
      ORDER BY publication.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT sp.*
    FROM public.storefront_publications sp
    WHERE public.can_access_store(sp.store_id)
    ORDER BY sp.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
  ) AS publication;
$$;

CREATE OR REPLACE FUNCTION public.get_storefront_publication(
  p_publication_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', sp.id,
    'revision', sp.revision,
    'created_at', sp.created_at,
    'snapshot', sp.snapshot
  )
  FROM public.storefront_publications sp
  WHERE sp.id = p_publication_id
    AND public.can_access_store(sp.store_id);
$$;

REVOKE ALL ON FUNCTION public.get_storefront_publication_history(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_storefront_publication(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_publication_history(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_publication(uuid) TO authenticated;

COMMENT ON FUNCTION public.assert_storefront_document_policy(jsonb) IS
  'Enforces platform-owned storefront size, node, binding, extension, effect, and protocol limits.';
COMMENT ON FUNCTION public.get_storefront_publication_history(integer) IS
  'Returns owner/member-visible immutable publication metadata for rollback UX.';
COMMENT ON FUNCTION public.get_storefront_publication(uuid) IS
  'Returns one owner/member-visible immutable publication snapshot.';
