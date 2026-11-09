begin;

create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, recovery_token, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner-a@example.test', '', now(), '{}', '{"business_name":"Store A"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'owner-b@example.test', '', now(), '{}', '{"business_name":"Store B"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{}', '{"business_name":"Admin"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'viewer@example.test', '', now(), '{}', '{"business_name":"Viewer"}', now(), now(), '', '', '', '');

insert into public.store_members(store_id, user_id, role, status, capabilities)
values
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'admin', 'active', '{}'),
  ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'viewer', 'active', '{}');

select ok(
  private.has_store_capability('10000000-0000-4000-8000-000000000001', 'billing.manage', '10000000-0000-4000-8000-000000000001'),
  'owner receives billing capability'
);
select ok(
  private.has_store_capability('10000000-0000-4000-8000-000000000001', 'theme.publish', '10000000-0000-4000-8000-000000000003'),
  'admin receives theme publish capability'
);
select ok(
  not private.has_store_capability('10000000-0000-4000-8000-000000000001', 'catalog.edit', '10000000-0000-4000-8000-000000000004'),
  'viewer has no catalog write capability'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;

select is(
  (select count(*)::integer from public.stores where id = '10000000-0000-4000-8000-000000000002'),
  0,
  'cross-store read is denied by RLS'
);
select throws_ok(
  $$insert into public.items(store_id, user_id, name, price_cents) values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'Denied', 100)$$,
  '42501',
  null,
  'viewer catalog write is denied'
);
select is(
  (select count(*)::integer from public.assets where store_id = '10000000-0000-4000-8000-000000000002'),
  0,
  'cross-store asset metadata read is denied'
);
select ok(
  not private.can_upload_prepared_asset('storefront-assets', 'stores/10000000-0000-4000-8000-000000000001/assets/missing/file.webp', auth.uid()),
  'unprepared storage path cannot be uploaded'
);
select throws_ok(
  $$select public.save_generated_storefront_draft('10000000-0000-4000-8000-000000000001', '{"engine_scene":{}}'::jsonb, 0, 'Denied store')$$,
  '42501',
  null,
  'viewer cannot save an AI-generated storefront draft'
);

reset role;
update public.store_members
set status = 'revoked'
where store_id = '10000000-0000-4000-8000-000000000001'
  and user_id = '10000000-0000-4000-8000-000000000004';
select ok(
  not private.is_active_store_member('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004'),
  'revoked membership loses access immediately'
);

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
set local role authenticated;
select throws_ok(
  $$insert into public.payments(store_id, user_id, amount_cents) values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 100)$$,
  '42501',
  null,
  'billing mutation is denied at aal1'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
set local role authenticated;
select lives_ok(
  $$insert into public.payments(store_id, user_id, amount_cents) values ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 100)$$,
  'billing mutation is allowed for an aal2 owner'
);
reset role;

select is(
  (select public::boolean from storage.buckets where id = 'storefront-assets'),
  true,
  'storefront bucket has anonymous CDN reads'
);
select is(
  (select public::boolean from storage.buckets where id = 'merchant-originals'),
  false,
  'originals bucket remains private'
);
select is(
  (select public::boolean from storage.buckets where id = 'merchant-private'),
  false,
  'merchant private bucket remains private'
);
select is(
  (select public::boolean from storage.buckets where id = 'temp-uploads'),
  false,
  'temporary upload bucket remains private'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Store asset managers upload objects'
      and roles = array['authenticated']::name[]
  ),
  'anonymous users have no storage upload policy'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.assets'::regclass),
  'asset metadata has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'storage objects have RLS enabled'
);

select * from finish();
rollback;
