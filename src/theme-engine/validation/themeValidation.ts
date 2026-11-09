import { z } from "zod";
import {
  CANONICAL_SECTION_TYPES,
  type StorefrontSection,
  type ThemeManifest,
} from "@/theme-engine/contracts";

const capabilitiesSchema = z.object({
  stickyHeader: z.boolean(),
  transparentHeader: z.boolean(),
  megaMenu: z.boolean(),
  predictiveSearch: z.boolean(),
  cartDrawer: z.boolean(),
  productHotspots: z.boolean(),
  productQuickView: z.boolean(),
  quickAdd: z.boolean(),
  collectionFilters: z.boolean(),
  collectionSorting: z.boolean(),
  customerAccountDrawer: z.boolean(),
  appBlocks: z.boolean(),
  editorialTypography: z.boolean(),
  productCompare: z.boolean(),
  stickyAddToCart: z.boolean(),
  productFilters: z.boolean(),
  colorSwatches: z.boolean(),
  customerDrawer: z.boolean(),
  announcementSlider: z.boolean(),
});

const templateSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  pageType: z.string().min(1),
  allowedSectionTypes: z.array(z.string().min(1)),
  requiredSectionTypes: z.array(z.string().min(1)).optional(),
  removable: z.boolean(),
  maximumSections: z.number().int().positive().optional(),
});

const manifestSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  description: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  schemaVersion: z.number().int().positive(),
  minimumPlatformVersion: z.string().min(1),
  capabilities: capabilitiesSchema,
  templates: z.array(templateSchema).min(1),
  features: z.array(z.string()),
}).passthrough();

const canonicalSectionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(CANONICAL_SECTION_TYPES),
  schemaVersion: z.number().int().positive(),
  settings: z.record(z.unknown()),
  blockOrder: z.array(z.string()),
  blocks: z.record(z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    settings: z.record(z.unknown()),
  })),
  visibility: z.object({
    desktop: z.boolean(),
    tablet: z.boolean(),
    mobile: z.boolean(),
  }),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
}).passthrough();

export const validateThemeManifest = (manifest: ThemeManifest): ThemeManifest =>
  manifestSchema.parse(manifest) as ThemeManifest;

export const validateStorefrontSection = (
  section: StorefrontSection,
): StorefrontSection => canonicalSectionSchema.parse(section) as StorefrontSection;

export const safeValidateStorefrontSection = (section: unknown) => canonicalSectionSchema.safeParse(section);
