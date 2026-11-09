import type { CustomBlock } from "@/lib/storeTheme";
import { INSPECTOR_PROFILES } from "@/editor/constants/editorConstants";
import type { ElementKind, InspectorFeature } from "@/editor/types/editor";

export const supportsInspectorFeature = (kind: ElementKind, feature: InspectorFeature) =>
  INSPECTOR_PROFILES[kind].features.includes(feature);

export const classifyElement = ({
  id,
  tag,
  block,
  kind,
  childCount,
  display,
}: {
  id: string;
  tag?: string;
  block?: CustomBlock;
  kind?: ElementKind;
  childCount?: number;
  display?: string;
}): ElementKind => {
  if (block) return block.kind;
  if (kind) return kind;

  const normalizedTag = tag?.toLowerCase();
  if (/^(button|a)$/.test(normalizedTag ?? "")) return "button";
  if (normalizedTag === "svg") return "icon";
  if (/^(img|picture|canvas)$/.test(normalizedTag ?? "")) return "image";
  if (/^(video|iframe)$/.test(normalizedTag ?? "")) return "video";
  if (/^(h[1-6]|p|span|strong|em|small|label|li|blockquote)$/.test(normalizedTag ?? "")) return "text";
  if (normalizedTag === "hr") return "divider";
  if (/^(main|section|article|header|footer|form|ul|ol)$/.test(normalizedTag ?? "")) return "frame";
  if ((childCount ?? 0) > 1 || /^(flex|grid|inline-flex|inline-grid)$/.test(display ?? "")) return "frame";

  if (/(button|btn|cta|link|nav|search)/i.test(id)) return "button";
  if (/(icon|glyph|symbol)/i.test(id)) return "icon";
  if (/(title|heading|text|copy|label|paragraph|subtitle|description|badge|note)/i.test(id)) return "text";
  if (/(image|img|banner|logo|photo|media|overlay)/i.test(id)) return "image";
  if (/(group|collection|list)/i.test(id)) return "group";
  if (/(frame|container|wrapper|section|grid|column|card)/i.test(id)) return "frame";

  return "generic";
};
