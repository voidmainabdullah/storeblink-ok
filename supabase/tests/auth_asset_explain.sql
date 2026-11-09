-- Run after auth_asset_rls.test.sql fixtures are adapted to the linked staging
-- project. These plans must use the store/user/status indexes added by
-- 20260801000100_auth_asset_platform.sql.
explain (analyze, buffers, format text)
select 1
from public.store_members
where user_id = '10000000-0000-4000-8000-000000000003'
  and status = 'active'
  and store_id = '10000000-0000-4000-8000-000000000001';

explain (analyze, buffers, format text)
select id, path, mime_type, bytes, width, height, alt_text, created_at
from public.assets
where store_id = '10000000-0000-4000-8000-000000000001'
  and status = 'ready'
  and deleted_at is null
order by created_at desc
limit 48;

explain (analyze, buffers, format text)
select id, name, price_cents, image_url, created_at
from public.items
where store_id = '10000000-0000-4000-8000-000000000001'
  and is_published = true
  and deleted_at is null
order by created_at desc
limit 24;
