-- Extend profiles for storefront customization
alter table public.profiles
  add column if not exists store_slug text unique,
  add column if not exists store_tagline text,
  add column if not exists store_about text,
  add column if not exists store_color text default '#5669ff',
  add column if not exists store_banner_url text;

create index if not exists profiles_store_slug_idx on public.profiles(store_slug);

-- Extend items for storefront display
alter table public.items
  add column if not exists image_url text,
  add column if not exists description text,
  add column if not exists is_published boolean not null default false;

-- Public read access to storefront profiles (only if a slug is set)
drop policy if exists "Public can view stores" on public.profiles;
create policy "Public can view stores"
  on public.profiles for select
  using (store_slug is not null);

-- Public read access to published items
drop policy if exists "Public can view published items" on public.items;
create policy "Public can view published items"
  on public.items for select
  using (is_published = true);
