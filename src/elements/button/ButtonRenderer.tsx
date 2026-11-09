import { memo, type CSSProperties } from "react";
import type { SceneNode } from "@/types";
import {
  getInteractionTargetStyle,
} from "@/rendering/renderer/interactionTarget";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer/style";
import {
  ThemeIcon,
  ThemeMenuMorphIcon,
  themeChromeNodeSlot,
  themeIconConfigForNode,
  useThemeMobileMenuRuntime,
} from "@/theme-engine/chrome";

export type ButtonRendererProps = {
  node: SceneNode;
};

export const ButtonRenderer = memo(({ node }: ButtonRendererProps) => {
  const label = String(node.props.label ?? node.props.text ?? node.name);
  const background =
    typeof node.props.background === "string"
      ? node.props.background
      : node.style.fills.length
        ? undefined
        : "#111827";
  const chromeSlot = themeChromeNodeSlot(node);
  const iconConfig = themeIconConfigForNode(node);
  const iconOnly = node.props.iconOnly === true;
  const menuTrigger = chromeSlot === "mobile-menu-trigger";
  const mobileMenuRuntime = useThemeMobileMenuRuntime();
  const textColor = String(node.props.color ?? "#ffffff");
  const textFillOpacity = Math.max(0, Math.min(100, Number(node.props.textFillOpacity ?? 100)));
  const backgroundOpacity = Math.max(0, Math.min(1, Number(node.props.backgroundOpacity ?? 1)));
  const visibleBackground =
    node.props.backgroundVisible === false
      ? "transparent"
      : background && backgroundOpacity < 1
        ? `color-mix(in srgb, ${background} ${Math.round(backgroundOpacity * 100)}%, transparent)`
        : background;
  const interactionTargetStyle = getInteractionTargetStyle(node);

  return (
    <button
      id={getNodeDomId(node)}
      type="button"
      data-node-id={node.id}
      data-node-type={node.type}
      data-theme-chrome-slot={chromeSlot ?? undefined}
      aria-label={String(node.props.ariaLabel ?? label)}
      aria-controls={
        menuTrigger
          ? mobileMenuRuntime?.panelId ??
            (typeof node.props.ariaControls === "string" ? node.props.ariaControls : undefined)
          : undefined
      }
      aria-expanded={menuTrigger && mobileMenuRuntime ? mobileMenuRuntime.open : undefined}
      style={{
        ...getNodeFrameStyle(node),
        color:
          textFillOpacity >= 100
            ? textColor
            : `color-mix(in srgb, ${textColor} ${textFillOpacity}%, transparent)`,
        ...(menuTrigger
          ? { background: String(node.props.menuIconBackground ?? "transparent") }
          : visibleBackground
            ? { background: visibleBackground }
            : {}),
        border: menuTrigger
          ? `${Number(node.props.menuIconBorderWidth ?? 0)}px solid ${String(node.props.menuIconBorderColor ?? "transparent")}`
          : String(node.props.border ?? "0"),
        ...(menuTrigger
          ? {
              borderRadius: Number(node.props.menuIconRadius ?? 0),
              padding: Number(node.props.menuIconPadding ?? 0),
            }
          : {}),
        fontFamily: String(node.props.fontFamily ?? "Inter, system-ui, sans-serif"),
        fontSize: Number(node.props.fontSize ?? 14),
        fontWeight: node.props.fontWeight as CSSProperties["fontWeight"] ?? 600,
        fontStyle: node.props.fontStyle === "italic" ? "italic" : "normal",
        lineHeight: node.props.lineHeight === "normal" ? "normal" : Number(node.props.lineHeight ?? 1.2),
        letterSpacing: Number(node.props.letterSpacing ?? 0),
        textAlign: String(node.props.textAlign ?? "center") as CSSProperties["textAlign"],
        textTransform: String(node.props.textTransform ?? "none") as CSSProperties["textTransform"],
        textDecoration: String(node.props.textDecoration ?? "none"),
        fontFeatureSettings: String(node.props.fontFeatureSettings ?? "normal"),
        direction: String(node.props.direction ?? "ltr") as CSSProperties["direction"],
        writingMode: String(node.props.writingMode ?? "horizontal-tb") as CSSProperties["writingMode"],
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: iconConfig && !iconOnly ? Math.max(6, Math.round(iconConfig.size * 0.35)) : 0,
        cursor: "default",
        overflow: interactionTargetStyle ? "visible" : undefined,
      }}
    >
      {interactionTargetStyle ? <span aria-hidden="true" style={interactionTargetStyle} /> : null}
      {menuTrigger ? (
        <ThemeMenuMorphIcon
          config={{
            kind: String(node.props.menuIconKind ?? "three-line") as
              | "minimal-two-line"
              | "three-line"
              | "grid"
              | "custom",
            size: Number(node.props.menuIconSize ?? 22),
            strokeWidth: Number(node.props.menuIconStrokeWidth ?? 2),
            color: String(node.props.menuIconColor ?? textColor),
          }}
          customSource={
            typeof node.props.menuIconCustomSource === "string"
              ? node.props.menuIconCustomSource
              : null
          }
        />
      ) : iconConfig ? <ThemeIcon config={iconConfig} /> : null}
      {!iconOnly && !menuTrigger ? <span>{label}</span> : null}
    </button>
  );
});

ButtonRenderer.displayName = "ButtonRenderer";
