-- Add sale countdown to items
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS sale_ends_at timestamptz;

-- Add a flexible theme JSON to profiles for the visual editor
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb;