-- Tighten public listing on storage.objects
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;
DROP POLICY IF EXISTS "Public read store banners" ON storage.objects;

-- Owners can list their own folder; public still gets file content via signed/public URL access
CREATE POLICY "Owner list product images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'product-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner list store banners"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'store-banners'
  AND auth.uid()::text = (storage.foldername(name))[1]
);