import { z } from "zod";
import { cloneSceneTree } from "@/engine/scene-graph";
import type { ThemeDesignTokens } from "@/theme-engine/contracts";
import type { SceneNode, SceneTree } from "@/types";
import {
  THEME_FONT_CATALOG,
  themeFontById,
  themeFontIdForFamily,
  themeFontPairingById,
} from "./fontCatalog";
import type {
  ThemeBrandingSettings,
  ThemeFontPairing,
  ThemeTypographyRole,
} from "./types";

const fontIds = new Set(THEME_FONT_CATALOG.map((font) => font.id));

const settingsSchema = z.object({
  version: z.literal(1),
  enabled: z.boolean(),
  pairingId: z.string().min(1),
  headingFontId: z.string().refine((value) => fontIds.has(value), "Unknown heading font."),
  bodyFontId: z.string().refine((value) => fontIds.has(value), "Unknown body font."),
  accentFontId: z.string().refine((value) => fontIds.has(value), "Unknown accent font."),
  uiFontId: z.string().refine((value) => fontIds.has(value), "Unknown UI font."),
});

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const defaultSettings = (pairing: ThemeFontPairing = themeFontPairingById("modern")): ThemeBrandingSettings => ({
  version: 1,
  enabled: false,
  pairingId: pairing.id,
  headingFontId: pairing.headingFontId,
  bodyFontId: pairing.bodyFontId,
  accentFontId: pairing.accentFontId,
  uiFontId: pairing.uiFontId,
});

const inferRole = (node: SceneNode): ThemeTypographyRole => {
  const explicit = String(node.props.typographyRole ?? node.extensions?.typographyRole ?? "").toLowerCase();
  if (explicit === "heading" || explicit === "body" || explicit === "accent" || explicit === "ui") {
    return explicit;
  }
  if (node.type === "button") return "ui";
  const semanticTag = String(node.props.semanticTag ?? "").toLowerCase();
  if (/^h[1-6]$/.test(semanticTag)) return "heading";
  const identity = `${node.name} ${String(node.props.blockType ?? "")} ${String(node.extensions?.blockType ?? "")}`.toLowerCase();
  if (/(quote|testimonial|editorial|signature|accent)/.test(identity)) return "accent";
  if (/(nav|menu|button|badge|eyebrow|kicker|label|price|cart|account|search)/.test(identity)) return "ui";
  if (/(heading|headline|title|hero|brand|logo)/.test(identity)) return "heading";
  return Number(node.props.fontSize ?? 0) >= 28 ? "heading" : "body";
};

const roleFontId = (settings: ThemeBrandingSettings, role: ThemeTypographyRole): string => {
  if (role === "heading") return settings.headingFontId;
  if (role === "accent") return settings.accentFontId;
  if (role === "ui") return settings.uiFontId;
  return settings.bodyFontId;
};

export class ThemeBrandingSystem {
  getAppliedSettings(scene: SceneTree): ThemeBrandingSettings | null {
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    const parsed = settingsSchema.safeParse(root?.extensions?.themeBranding);
    return parsed.success ? structuredClone(parsed.data) as ThemeBrandingSettings : null;
  }

  getSettings(scene: SceneTree): ThemeBrandingSettings {
    const applied = this.getAppliedSettings(scene);
    if (applied) return applied;
    const root = scene.rootNodeId ? scene.nodes[scene.rootNodeId] : undefined;
    const tokens = recordValue(root?.extensions?.designTokens);
    const typography = recordValue(tokens?.typography);
    return {
      ...defaultSettings(),
      headingFontId: themeFontIdForFamily(typography?.headingFont, "inter"),
      bodyFontId: themeFontIdForFamily(typography?.bodyFont, "inter"),
      accentFontId: themeFontIdForFamily(typography?.editorialFont, "georgia"),
      uiFontId: themeFontIdForFamily(typography?.bodyFont, "inter"),
      pairingId: "custom",
    };
  }

  applyPairing(settings: ThemeBrandingSettings, pairingId: string): ThemeBrandingSettings {
    const pairing = themeFontPairingById(pairingId);
    return {
      ...settings,
      enabled: true,
      pairingId: pairing.id,
      headingFontId: pairing.headingFontId,
      bodyFontId: pairing.bodyFontId,
      accentFontId: pairing.accentFontId,
      uiFontId: pairing.uiFontId,
    };
  }

  applySettings(source: SceneTree, value: ThemeBrandingSettings): SceneTree {
    const parsed = settingsSchema.safeParse(value);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message ?? "Theme branding settings are invalid.");
    }
    if (!source.rootNodeId || !source.nodes[source.rootNodeId]) {
      throw new Error("Theme branding requires a Scene Graph root node.");
    }
    const scene = cloneSceneTree(source);
    const root = scene.nodes[scene.rootNodeId];
    const currentTokens = recordValue(root.extensions?.designTokens) ?? {};
    const currentTypography = recordValue(currentTokens.typography) ?? {};
    const settings = parsed.data;
    root.extensions = {
      ...(root.extensions ?? {}),
      themeBranding: structuredClone(settings),
      designTokens: {
        ...currentTokens,
        typography: {
          ...currentTypography,
          headingFont: themeFontById(settings.headingFontId).stack,
          bodyFont: themeFontById(settings.bodyFontId).stack,
          editorialFont: themeFontById(settings.accentFontId).stack,
          uiFont: themeFontById(settings.uiFontId).stack,
        },
      },
    };
    return scene;
  }

  resolveNode(node: SceneNode, settings: ThemeBrandingSettings | null): SceneNode {
    if (!settings?.enabled || (node.type !== "text" && node.type !== "button")) return node;
    if (String(node.props.fontBinding ?? "brand") === "local") return node;
    const role = inferRole(node);
    const fontFamily = themeFontById(roleFontId(settings, role)).stack;
    if (node.props.fontFamily === fontFamily && node.props.typographyRole === role) return node;
    return {
      ...node,
      props: {
        ...node.props,
        fontFamily,
        fontBinding: "brand",
        typographyRole: role,
      },
    };
  }

  resolveTokens(tokens: ThemeDesignTokens, settings: ThemeBrandingSettings | null): ThemeDesignTokens {
    if (!settings?.enabled) return tokens;
    return {
      ...tokens,
      typography: {
        ...tokens.typography,
        headingFont: themeFontById(settings.headingFontId).stack,
        bodyFont: themeFontById(settings.bodyFontId).stack,
        editorialFont: themeFontById(settings.accentFontId).stack,
      },
    };
  }
}

export const themeBrandingSystem = new ThemeBrandingSystem();
