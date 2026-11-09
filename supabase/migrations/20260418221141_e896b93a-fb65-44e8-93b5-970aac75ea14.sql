-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  business_name text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Users view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Items
create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  price_cents integer not null default 0,
  category text,
  stock integer default 0,
  created_at timestamptz not null default now()
);
alter table public.items enable row level security;
create policy "Owner select items" on public.items for select using (auth.uid() = user_id);
create policy "Owner insert items" on public.items for insert with check (auth.uid() = user_id);
create policy "Owner update items" on public.items for update using (auth.uid() = user_id);
create policy "Owner delete items" on public.items for delete using (auth.uid() = user_id);

-- Customers
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);
alter table public.customers enable row level security;
create policy "Owner select customers" on public.customers for select using (auth.uid() = user_id);
create policy "Owner insert customers" on public.customers for insert with check (auth.uid() = user_id);
create policy "Owner update customers" on public.customers for update using (auth.uid() = user_id);
create policy "Owner delete customers" on public.customers for delete using (auth.uid() = user_id);

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents integer not null,
  status text not null default 'completed',
  method text default 'card',
  customer_name text,
  note text,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create policy "Owner select payments" on public.payments for select using (auth.uid() = user_id);
create policy "Owner insert payments" on public.payments for insert with check (auth.uid() = user_id);
create policy "Owner update payments" on public.payments for update using (auth.uid() = user_id);
create policy "Owner delete payments" on public.payments for delete using (auth.uid() = user_id);

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, business_name)
  values (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'business_name')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Updated_at trigger
create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger update_profiles_updated_at before update on public.profiles
  for each row execute function public.update_updated_at_column();