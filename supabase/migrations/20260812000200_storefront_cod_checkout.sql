-- Server-authoritative cash-on-delivery checkout for public storefronts.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number text,
  ADD COLUMN IF NOT EXISTS shipping_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash_on_delivery',
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS checkout_idempotency_key uuid;

UPDATE public.orders
SET order_number = 'SB-' || upper(substr(replace(id::text, '-', ''), 1, 10))
WHERE order_number IS NULL OR trim(order_number) = '';

ALTER TABLE public.orders
  ALTER COLUMN order_number SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_number_idx
  ON public.orders(order_number);
CREATE UNIQUE INDEX IF NOT EXISTS orders_store_checkout_idempotency_idx
  ON public.orders(store_id, checkout_idempotency_key)
  WHERE checkout_idempotency_key IS NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check,
  ADD CONSTRAINT orders_payment_method_check
    CHECK (payment_method IN ('cash_on_delivery')),
  DROP CONSTRAINT IF EXISTS orders_payment_status_check,
  ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded'));

DROP POLICY IF EXISTS "Public can place orders" ON public.orders;
DROP POLICY IF EXISTS "Public can add order items" ON public.order_items;

CREATE OR REPLACE FUNCTION public.place_storefront_cod_order(
  p_store_id uuid,
  p_customer jsonb,
  p_lines jsonb,
  p_note text DEFAULT NULL,
  p_idempotency_key uuid DEFAULT gen_random_uuid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_store public.stores%ROWTYPE;
  v_product public.items%ROWTYPE;
  v_line jsonb;
  v_validated_lines jsonb := '[]'::jsonb;
  v_seen_product_ids uuid[] := ARRAY[]::uuid[];
  v_product_id uuid;
  v_quantity integer;
  v_total bigint := 0;
  v_order_id uuid := gen_random_uuid();
  v_order_number text := 'SB-' || upper(substr(replace(v_order_id::text, '-', ''), 1, 10));
  v_existing public.orders%ROWTYPE;
  v_name text := trim(COALESCE(p_customer ->> 'name', ''));
  v_phone text := trim(COALESCE(p_customer ->> 'phone', ''));
  v_email text := nullif(trim(COALESCE(p_customer ->> 'email', '')), '');
  v_address_1 text := trim(COALESCE(p_customer ->> 'address1', ''));
  v_address_2 text := nullif(trim(COALESCE(p_customer ->> 'address2', '')), '');
  v_city text := trim(COALESCE(p_customer ->> 'city', ''));
  v_region text := nullif(trim(COALESCE(p_customer ->> 'region', '')), '');
  v_postal_code text := nullif(trim(COALESCE(p_customer ->> 'postalCode', '')), '');
  v_country text := trim(COALESCE(p_customer ->> 'country', ''));
BEGIN
  IF p_store_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Checkout identity is invalid' USING ERRCODE = '22023';
  END IF;

  -- Serialize retries for one store/key so concurrent submissions return the
  -- same order instead of racing the unique index.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_store_id::text),
    hashtext(p_idempotency_key::text)
  );

  SELECT * INTO v_existing
  FROM public.orders
  WHERE store_id = p_store_id
    AND checkout_idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'order_id', v_existing.id,
      'order_number', v_existing.order_number,
      'total_cents', v_existing.total_cents,
      'status', v_existing.status,
      'payment_method', v_existing.payment_method
    );
  END IF;

  SELECT * INTO v_store
  FROM public.stores
  WHERE id = p_store_id
    AND status = 'published'
    AND deleted_at IS NULL;
  IF v_store.id IS NULL THEN
    RAISE EXCEPTION 'Store is not accepting orders' USING ERRCODE = 'P0002';
  END IF;

  IF jsonb_typeof(p_customer) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Customer details are invalid' USING ERRCODE = '22023';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'Customer name is invalid' USING ERRCODE = '22023';
  END IF;
  IF length(regexp_replace(v_phone, '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15
    OR length(v_phone) > 24
  THEN
    RAISE EXCEPTION 'Customer phone is invalid' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND (
    length(v_email) > 254
    OR v_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ) THEN
    RAISE EXCEPTION 'Customer email is invalid' USING ERRCODE = '22023';
  END IF;
  IF length(v_address_1) < 5 OR length(v_address_1) > 160
    OR length(v_city) < 2 OR length(v_city) > 80
    OR length(v_country) < 2 OR length(v_country) > 80
    OR length(COALESCE(v_address_2, '')) > 160
    OR length(COALESCE(v_region, '')) > 80
    OR length(COALESCE(v_postal_code, '')) > 24
  THEN
    RAISE EXCEPTION 'Delivery address is invalid' USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_note, '')) > 1000 THEN
    RAISE EXCEPTION 'Order note is too long' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_lines) < 1
    OR jsonb_array_length(p_lines) > 50
  THEN
    RAISE EXCEPTION 'Cart is invalid' USING ERRCODE = '22023';
  END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    BEGIN
      v_product_id := (v_line ->> 'productId')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Cart contains an unavailable product' USING ERRCODE = '22023';
    END;
    IF COALESCE(v_line ->> 'quantity', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'A cart quantity is invalid' USING ERRCODE = '22023';
    END IF;
    v_quantity := (v_line ->> 'quantity')::integer;
    IF v_quantity < 1 OR v_quantity > 99 THEN
      RAISE EXCEPTION 'A cart quantity is invalid' USING ERRCODE = '22023';
    END IF;
    IF v_product_id = ANY(v_seen_product_ids) THEN
      RAISE EXCEPTION 'Cart contains duplicate products' USING ERRCODE = '22023';
    END IF;
    v_seen_product_ids := array_append(v_seen_product_ids, v_product_id);

    SELECT * INTO v_product
    FROM public.items
    WHERE id = v_product_id
      AND store_id = p_store_id
      AND is_published = true
      AND deleted_at IS NULL
    FOR UPDATE;
    IF v_product.id IS NULL THEN
      RAISE EXCEPTION 'Cart contains an unavailable product' USING ERRCODE = 'P0002';
    END IF;
    IF v_product.stock IS NOT NULL AND v_product.stock < v_quantity THEN
      RAISE EXCEPTION 'A product does not have enough stock' USING ERRCODE = '22023';
    END IF;

    v_total := v_total + (v_product.price_cents::bigint * v_quantity::bigint);
    IF v_total < 0 OR v_total > 2147483647 THEN
      RAISE EXCEPTION 'Cart total is invalid' USING ERRCODE = '22023';
    END IF;

    IF v_product.stock IS NOT NULL THEN
      UPDATE public.items
      SET stock = stock - v_quantity
      WHERE id = v_product.id;
    END IF;
    v_validated_lines := v_validated_lines || jsonb_build_array(jsonb_build_object(
      'productId', v_product.id,
      'name', v_product.name,
      'unitPriceCents', v_product.price_cents,
      'quantity', v_quantity
    ));
  END LOOP;

  INSERT INTO public.orders (
    id,
    order_number,
    store_id,
    store_user_id,
    customer_name,
    customer_email,
    customer_phone,
    shipping_address,
    total_cents,
    status,
    payment_method,
    payment_status,
    checkout_idempotency_key,
    note
  ) VALUES (
    v_order_id,
    v_order_number,
    v_store.id,
    v_store.owner_user_id,
    v_name,
    v_email,
    v_phone,
    jsonb_strip_nulls(jsonb_build_object(
      'address1', v_address_1,
      'address2', v_address_2,
      'city', v_city,
      'region', v_region,
      'postalCode', v_postal_code,
      'country', v_country
    )),
    v_total::integer,
    'pending',
    'cash_on_delivery',
    'pending',
    p_idempotency_key,
    nullif(trim(COALESCE(p_note, '')), '')
  );

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_validated_lines)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      store_id,
      item_id,
      item_name,
      unit_price_cents,
      quantity
    ) VALUES (
      v_order_id,
      v_store.id,
      (v_line ->> 'productId')::uuid,
      v_line ->> 'name',
      (v_line ->> 'unitPriceCents')::integer,
      (v_line ->> 'quantity')::integer
    );
  END LOOP;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total_cents', v_total::integer,
    'status', 'pending',
    'payment_method', 'cash_on_delivery'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_storefront_cod_order(uuid, jsonb, jsonb, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_storefront_cod_order(uuid, jsonb, jsonb, text, uuid) TO anon, authenticated;
