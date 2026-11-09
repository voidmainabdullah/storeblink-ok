ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_draft jsonb,
  ADD COLUMN IF NOT EXISTS theme_published jsonb,
  ADD COLUMN IF NOT EXISTS theme_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

UPDATE public.profiles
SET
  theme_draft = COALESCE(theme_draft, theme),
  theme_published = COALESCE(theme_published, theme),
  theme_revision = CASE WHEN theme_revision = 0 THEN 1 ELSE theme_revision END
WHERE theme IS NOT NULL;

COMMENT ON COLUMN public.profiles.theme_draft IS
  'Autosaved editable Engine Scene document. Never served directly to the public storefront.';
COMMENT ON COLUMN public.profiles.theme_published IS
  'Validated Engine Scene snapshot served by the public storefront.';
