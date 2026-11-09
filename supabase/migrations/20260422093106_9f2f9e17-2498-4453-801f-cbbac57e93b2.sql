ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS banners jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS special_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS visible_categories text[] NOT NULL DEFAULT '{}';