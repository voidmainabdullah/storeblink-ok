-- Register the first package built on the universal theme contract.
-- Theme installations and template documents remain separate records; this
-- migration does not modify or auto-publish any merchant store.

INSERT INTO public.themes(id, name, description)
VALUES (
  'atelier',
  'Atelier',
  'Editorial furniture theme with architectural imagery and live product references.'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  archived_at = NULL;

INSERT INTO public.theme_versions(
  theme_id,
  version,
  schema_version,
  minimum_platform_version,
  manifest
)
VALUES (
  'atelier',
  '1.0.0',
  1,
  '1.0.0',
  '{
    "id":"atelier",
    "name":"Atelier",
    "version":"1.0.0",
    "schemaVersion":1,
    "category":["Furniture","Interior Design","Lifestyle"],
    "designStyle":["Editorial","Minimal","Architectural","Premium"],
    "family":"editorial",
    "capabilities":{
      "stickyHeader":true,
      "transparentHeader":false,
      "megaMenu":false,
      "predictiveSearch":true,
      "cartDrawer":true,
      "productHotspots":true,
      "productQuickView":true,
      "quickAdd":true,
      "collectionFilters":true,
      "collectionSorting":true,
      "customerAccountDrawer":true,
      "appBlocks":true,
      "editorialTypography":true
    },
    "templates":[
      "home-default",
      "product-default",
      "collection-default",
      "page-default"
    ],
    "canonicalSections":[
      "announcement-marquee",
      "site-header",
      "editorial-intro",
      "immersive-product-hero",
      "brand-story",
      "craftsmanship-features",
      "featured-product-collection",
      "customer-stories",
      "site-footer"
    ]
  }'::jsonb
)
ON CONFLICT (theme_id, version) DO UPDATE SET
  schema_version = EXCLUDED.schema_version,
  minimum_platform_version = EXCLUDED.minimum_platform_version,
  manifest = EXCLUDED.manifest;
