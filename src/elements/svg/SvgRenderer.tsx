import { memo, useMemo } from "react";
import { resolveSafeSvgModel, sanitizeSvgDataUrl } from "@/engine/validation";
import type { SceneNode } from "@/types";
import { getNodeDomId, getNodeFrameStyle } from "@/rendering/renderer/style";
import {
  ThemeIcon,
  ThemeMenuMorphIcon,
  themeChromeNodeSlot,
  themeIconConfigForNode,
  useThemeMobileMenuRuntime,
} from "@/theme-engine/chrome";

export type SvgRendererProps = {
  node: SceneNode;
};

export const SvgRenderer = memo(({ node }: SvgRendererProps) => {
  const src = typeof node.props.src === "string" ? node.props.src : undefined;
  const safeSvg = useMemo(() => {
    try {
      const model = resolveSafeSvgModel(node.props);
      if (model) return model;
      return src?.startsWith("data:image/svg+xml")
        ? sanitizeSvgDataUrl(src)
        : null;
    } catch {
      return null;
    }
  }, [node.props, src]);
  const hasSvgPayload = Boolean(
    node.props.svg ||
    node.props.markup ||
    src,
  );
  const chromeSlot = themeChromeNodeSlot(node);
  const iconConfig = themeIconConfigForNode(node);
  const mobileMenuRuntime = useThemeMobileMenuRuntime();
  const frameStyle = {
    ...getNodeFrameStyle(node),
    overflow: iconConfig || chromeSlot === "mobile-menu-trigger" ? "visible" : "hidden",
  };
  const interactive = Boolean(node.extensions?.navigationTarget || node.extensions?.action);
  const ariaLabel = String(node.props.ariaLabel ?? node.name);
  const chromeContent =
    chromeSlot === "mobile-menu-trigger"
      ? (
          <ThemeMenuMorphIcon
            config={{
              kind: String(node.props.menuIconKind ?? "three-line") as
                | "minimal-two-line"
                | "three-line"
                | "grid"
                | "custom",
              size: Number(node.props.menuIconSize ?? 22),
              strokeWidth: Number(node.props.menuIconStrokeWidth ?? 2),
              color: String(node.props.menuIconColor ?? node.props.color ?? "currentColor"),
            }}
            customSource={
              typeof node.props.menuIconCustomSource === "string"
                ? node.props.menuIconCustomSource
                : null
            }
          />
        )
      : iconConfig
        ? <ThemeIcon config={iconConfig} />
        : null;

  if (chromeContent) {
    const sharedProps = {
      id: getNodeDomId(node),
      "data-node-id": node.id,
      "data-node-type": node.type,
      "data-theme-chrome-slot": chromeSlot ?? undefined,
      "aria-label": ariaLabel,
      style: {
        ...frameStyle,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding:
          chromeSlot === "mobile-menu-trigger"
            ? Number(node.props.menuIconPadding ?? 0)
            : 0,
        boxSizing: "border-box" as const,
        border:
          chromeSlot === "mobile-menu-trigger"
            ? `${Number(node.props.menuIconBorderWidth ?? 0)}px solid ${String(node.props.menuIconBorderColor ?? "transparent")}`
            : 0,
        borderRadius:
          chromeSlot === "mobile-menu-trigger"
            ? Number(node.props.menuIconRadius ?? 0)
            : 0,
        background:
          chromeSlot === "mobile-menu-trigger"
            ? String(node.props.menuIconBackground ?? "transparent")
            : "transparent",
        color: String(node.props.menuIconColor ?? node.props.color ?? "currentColor"),
        cursor: interactive ? "pointer" : "default",
      },
      "aria-controls":
        chromeSlot === "mobile-menu-trigger" && typeof node.props.ariaControls === "string"
          ? mobileMenuRuntime?.panelId ?? node.props.ariaControls
          : undefined,
      "aria-expanded":
        chromeSlot === "mobile-menu-trigger" && mobileMenuRuntime
          ? mobileMenuRuntime.open
          : undefined,
    };
    return interactive
      ? <button type="button" {...sharedProps}>{chromeContent}</button>
      : <div {...sharedProps}>{chromeContent}</div>;
  }

  if (safeSvg) {
    if (interactive) {
      return (
        <button
          id={getNodeDomId(node)}
          type="button"
          data-node-id={node.id}
          data-node-type={node.type}
          data-theme-chrome-slot={chromeSlot ?? undefined}
          aria-label={ariaLabel}
          style={{ ...frameStyle, padding: 0, border: 0, background: "transparent", color: String(node.props.color ?? "currentColor"), cursor: "pointer" }}
          dangerouslySetInnerHTML={{ __html: safeSvg.markup }}
        />
      );
    }
    return (
      <div
        id={getNodeDomId(node)}
        data-node-id={node.id}
        data-node-type={node.type}
        data-theme-chrome-slot={chromeSlot ?? undefined}
        style={{ ...frameStyle, color: String(node.props.color ?? "currentColor") }}
        dangerouslySetInnerHTML={{ __html: safeSvg.markup }}
      />
    );
  }

  return (
    <div
      id={getNodeDomId(node)}
      data-node-id={node.id}
      data-node-type={node.type}
      data-theme-chrome-slot={chromeSlot ?? undefined}
      data-invalid-svg={hasSvgPayload ? "true" : undefined}
      role={hasSvgPayload ? "img" : undefined}
      aria-label={hasSvgPayload ? `${ariaLabel} is unavailable` : undefined}
      style={frameStyle}
    />
  );
});

SvgRenderer.displayName = "SvgRenderer";
