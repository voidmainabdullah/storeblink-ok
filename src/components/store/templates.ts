import type { ComponentType, ReactNode } from "react";

export type StoreTemplate = string;

export type StoreTemplateRendererProps = {
  store: any;
  slug: string;
  accent: string;
  banners: string[];
  items: any[];
  filteredItems: any[];
  featuredItems: any[];
  categories: string[];
  activeCategory: string;
  setActiveCategory: (value: string) => void;
  cartCount: number;
  onCart: () => void;
  onWish: () => void;
  onAddToCart: (id: string) => void;
  renderProductCard: (item: any, scope?: string) => ReactNode;
  theme: any;
  text: Record<string, any>;
};

export type TemplateMeta = {
  id: StoreTemplate;
  name: string;
  tagline: string;
  preview: string;
  component?: ComponentType<StoreTemplateRendererProps>;
  discovered?: boolean;
};

type TemplateModule = {
  default?: ComponentType<StoreTemplateRendererProps>;
  TemplatePage?: ComponentType<StoreTemplateRendererProps>;
  metadata?: Partial<TemplateMeta>;
  templateMetadata?: Partial<TemplateMeta>;
};

const humanize = (id: string) =>
  id
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

const idFromPath = (path: string) => {
  const file = path.split("/").pop()?.replace(/\.tsx$/, "") ?? "template";
  return file
    .replace(/Template$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
};

const BUILT_IN_TEMPLATES: TemplateMeta[] = [
  {
    id: "minimal",
    name: "Minimal",
    tagline: "Clean grid, lots of white space. Apple-like.",
    preview: "minimal",
  },
  {
    id: "bold",
    name: "Bold",
    tagline: "Big type, full-bleed accents. Dribbble vibes.",
    preview: "bold",
  },
  {
    id: "editorial",
    name: "Editorial",
    tagline: "Magazine layout with serif headlines.",
    preview: "editorial",
  },
  {
    id: "marketplace",
    name: "Marketplace",
    tagline: "Daraz/Alibaba style - dense grid, deals and badges.",
    preview: "marketplace",
  },
  {
    id: "lookbook",
    name: "Lookbook",
    tagline: "Full-bleed imagery, fashion-store vibes.",
    preview: "lookbook",
  },
];

const discoveredModules = import.meta.glob("./templates/*Template.tsx", { eager: true }) as Record<string, TemplateModule>;

const discoveredTemplates: TemplateMeta[] = Object.entries(discoveredModules)
  .map(([path, mod]) => {
    const metadata = mod.templateMetadata ?? mod.metadata ?? {};
    const id = String(metadata.id ?? idFromPath(path));
    const component = mod.default ?? mod.TemplatePage;
    return {
      id,
      name: metadata.name ?? humanize(id),
      tagline: metadata.tagline ?? "Template loaded automatically from /templates.",
      preview: metadata.preview ?? id,
      component,
      discovered: true,
    };
  })
  .filter((template) => template.id !== "minimal" || template.component);

const byId = new Map<string, TemplateMeta>();
for (const template of [...BUILT_IN_TEMPLATES, ...discoveredTemplates]) {
  byId.set(template.id, { ...(byId.get(template.id) ?? {}), ...template });
}

const TEMPLATE_ALIASES: Record<string, string> = {
  trend: byId.has("trend") ? "trend" : "thread",
};

export const resolveTemplateId = (template?: string | null): StoreTemplate => {
  const normalized = (template || "minimal").toLowerCase();
  const aliased = TEMPLATE_ALIASES[normalized] ?? normalized;
  return byId.has(aliased) ? aliased : normalized;
};

export const TEMPLATES: TemplateMeta[] = Array.from(byId.values()).filter((template) => template.id !== "thread");

export const TEMPLATE_REGISTRY: Record<string, TemplateMeta> = Object.fromEntries(byId);

export const getTemplateMeta = (template?: string | null) =>
  byId.get(resolveTemplateId(template)) ?? byId.get("minimal")!;

export const getTemplateRenderer = (template?: string | null) =>
  getTemplateMeta(template).component;

export const isExternalTemplate = (template?: string | null) => {
  const id = resolveTemplateId(template);
  return !!byId.get(id)?.component;
};
