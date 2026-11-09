import {
  AlignLeft,
  Heading1,
  ImageIcon as ImgIcon,
  Minus,
  MousePointerClick,
  MoveVertical,
  Star,
  Type,
  Video,
} from "lucide-react";
import type { ComponentType } from "react";
import type { SectionKey, StoreTheme } from "@/lib/storeTheme";
import type { ElementKind, InspectorProfile } from "@/editor/types/editor";

export const COLORS = ["#5669ff", "#7C3AED", "#10B981", "#0EA5E9", "#F59E0B", "#EF4444", "#1F2937", "#EC4899"];

export const BG_PRESETS = ["#F5F5F7", "#FFFFFF", "#0F172A", "#FAFAF9", "#F0FDF4", "#FFF7ED"];

export const TEXT_FIELDS: { key: keyof StoreTheme["text_overrides"]; label: string }[] = [
  { key: "heroBadge", label: "Hero badge" },
  { key: "heroCta", label: "Hero button" },
  { key: "flashTitle", label: "Flash deals title" },
  { key: "flashSubtitle", label: "Flash deals subtitle" },
  { key: "allProductsTitle", label: "All products heading" },
  { key: "aboutTitle", label: "About section heading" },
  { key: "newsletterTitle", label: "Newsletter heading" },
  { key: "newsletterCopy", label: "Newsletter copy" },
  { key: "newsletterCta", label: "Newsletter button" },
  { key: "searchCta", label: "Search button" },
  { key: "footerNote", label: "Footer note" },
  { key: "trust1Title", label: "Trust 1 title" },
  { key: "trust1Sub", label: "Trust 1 subtitle" },
  { key: "trust2Title", label: "Trust 2 title" },
  { key: "trust2Sub", label: "Trust 2 subtitle" },
  { key: "trust3Title", label: "Trust 3 title" },
  { key: "trust3Sub", label: "Trust 3 subtitle" },
  { key: "trust4Title", label: "Trust 4 title" },
  { key: "trust4Sub", label: "Trust 4 subtitle" },
];

export const INSPECTOR_PROFILES: Record<ElementKind, InspectorProfile> = {
  heading: { label: "Typography", features: ["blockProps", "text", "typography", "appearance", "spacing", "border", "layout", "responsive", "size", "layer", "motion", "notes", "ai"] },
  text: { label: "Typography", features: ["blockProps", "text", "typography", "appearance", "spacing", "border", "layout", "responsive", "size", "layer", "motion", "notes", "ai"] },
  image: { label: "Image", features: ["blockProps", "media", "appearance", "spacing", "border", "layout", "responsive", "size", "layer", "motion", "notes", "ai"] },
  button: { label: "Button", features: ["blockProps", "text", "typography", "appearance", "spacing", "border", "layout", "responsive", "size", "layer", "motion", "link", "hover", "notes", "ai"] },
  spacer: { label: "Spacer", features: ["blockProps", "spacing", "layout", "responsive", "size", "notes"] },
  divider: { label: "Divider", features: ["blockProps", "spacing", "border", "layout", "responsive", "size", "notes"] },
  video: { label: "Video", features: ["blockProps", "media", "appearance", "spacing", "border", "layout", "responsive", "size", "layer", "motion", "notes"] },
  icon: { label: "Icon", features: ["blockProps", "appearance", "spacing", "border", "layout", "responsive", "size", "layer", "motion", "notes"] },
  frame: { label: "Frame", features: ["appearance", "spacing", "border", "layout", "responsive", "size", "layer", "motion", "notes", "ai"] },
  group: { label: "Group", features: ["spacing", "layout", "responsive", "size", "layer", "motion", "notes"] },
  generic: { label: "Element", features: ["appearance", "spacing", "border", "layout", "responsive", "size", "layer", "motion", "notes", "ai"] },
};

export type BlockItem = {
  kind: import("@/lib/storeTheme").CustomBlockKind | "hero-text" | "overlay-image";
  label: string;
  desc: string;
  icon: ComponentType<any>;
};

export const INSERT_ITEMS: BlockItem[] = [
  { kind: "hero-text", label: "Hero text", desc: "Free-position text on hero", icon: Type },
  { kind: "overlay-image", label: "Overlay image", desc: "Floating image over a section", icon: ImgIcon },
  { kind: "heading", label: "Heading", desc: "H2 title inside a section", icon: Heading1 },
  { kind: "text", label: "Paragraph", desc: "Body copy block", icon: AlignLeft },
  { kind: "image", label: "Image", desc: "Inline image block", icon: ImgIcon },
  { kind: "button", label: "Button", desc: "Call-to-action button", icon: MousePointerClick },
  { kind: "video", label: "Video", desc: "YouTube / Vimeo / MP4", icon: Video },
  { kind: "icon", label: "Icon", desc: "Emoji or symbol", icon: Star },
  { kind: "spacer", label: "Spacer", desc: "Vertical breathing room", icon: MoveVertical },
  { kind: "divider", label: "Divider", desc: "Horizontal rule", icon: Minus },
];

export const INSERT_SECTIONS: SectionKey[] = ["hero", "about", "flashDeals", "specialSections", "allProducts", "newsletter", "footer"];
