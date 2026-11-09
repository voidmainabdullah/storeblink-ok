-- 1) profiles: store template
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_template text NOT NULL DEFAULT 'minimal';

-- 2) Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('store-banners', 'store-banners', true)
ON CONFLICT (id) DO NOTHING;

-- 3) Storage policies (public read, owner write inside own folder = auth.uid())
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Owner upload product images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner update product images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner delete product images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Public read store banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-banners');

CREATE POLICY "Owner upload store banners"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'store-banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner update store banners"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'store-banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner delete store banners"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'store-banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 4) Orders table
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_user_id uuid NOT NULL,
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  total_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select orders"
ON public.orders FOR SELECT
USING (auth.uid() = store_user_id);

CREATE POLICY "Owner update orders"
ON public.orders FOR UPDATE
USING (auth.uid() = store_user_id);

CREATE POLICY "Owner delete orders"
ON public.orders FOR DELETE
USING (auth.uid() = store_user_id);

-- Public can place an order on any seller (the seller has a public store)
CREATE POLICY "Public can place orders"
ON public.orders FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = store_user_id AND p.store_slug IS NOT NULL
  )
);

-- 5) Order items
CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  item_id uuid,
  item_name text NOT NULL,
  unit_price_cents integer NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner select order items"
ON public.order_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id AND o.store_user_id = auth.uid()
  )
);

CREATE POLICY "Public can add order items"
ON public.order_items FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.profiles p ON p.id = o.store_user_id
    WHERE o.id = order_id AND p.store_slug IS NOT NULL
  )
);

CREATE INDEX idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX idx_orders_store_user ON public.orders(store_user_id);