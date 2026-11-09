import {
  memo,
  Suspense,
  lazy,
  useMemo,
  type CSSProperties,
} from "react";
import { sanitizeSvgDataUrl, svgDataUrl } from "@/engine/validation";
import { resolveThemeIcon } from "./iconRegistry";
import type { ThemeIconConfig } from "./types";
import type { ThemeMenuIconStyle } from "./types";

const lazyIconCache = new Map<string, ReturnType<typeof lazy>>();

const lazyIcon = (library: ThemeIconConfig["library"], name: string) => {
  const key = `${library}:${name}`;
  const cached = lazyIconCache.get(key);
  if (cached) return cached;
  const component = lazy(async () => {
    const Icon = await resolveThemeIcon(library, name);
    return {
      default: Icon ?? (() => null),
    };
  });
  lazyIconCache.set(key, component);
  return component;
};

export type ThemeIconProps = {
  config: ThemeIconConfig;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

export const ThemeIcon = memo(({
  config,
  title,
  className,
  style,
}: ThemeIconProps) => {
  const Icon = useMemo(
    () => lazyIcon(config.library, config.name),
    [config.library, config.name],
  );
  return (
    <Suspense
      fallback={
        <span
          aria-hidden="true"
          className={className}
          style={{
            display: "inline-block",
            width: config.size,
            height: config.size,
            ...style,
          }}
        />
      }
    >
      <Icon
        aria-hidden={title ? undefined : true}
        aria-label={title}
        className={className}
        color={config.color}
        size={config.size}
        style={{
          width: config.size,
          height: config.size,
          flex: "0 0 auto",
          ...style,
        }}
      />
    </Suspense>
  );
});

ThemeIcon.displayName = "ThemeIcon";

export type ThemeMenuMorphIconProps = {
  config?: Pick<ThemeMenuIconStyle, "kind" | "size" | "strokeWidth" | "color">;
  customSource?: string | null;
};

export const ThemeMenuMorphIcon = memo(({
  config = {
    kind: "three-line",
    size: 22,
    strokeWidth: 2,
    color: "currentColor",
  },
  customSource,
}: ThemeMenuMorphIconProps) => {
  const safeCustomSource = useMemo(() => {
    if (!customSource || customSource.length > 12 * 1024 * 1024) return null;
    if (customSource.startsWith("data:image/svg+xml")) {
      try {
        return svgDataUrl(sanitizeSvgDataUrl(customSource).markup);
      } catch {
        return null;
      }
    }
    return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(
      customSource,
    )
      ? customSource
      : null;
  }, [customSource]);
  const size = Math.max(16, Math.min(64, config.size));
  const strokeWidth = Math.max(1, Math.min(6, config.strokeWidth));
  const lineWidth = size;
  const lineStyle = {
    width: lineWidth,
    height: strokeWidth,
    borderRadius: strokeWidth,
    background: "currentColor",
  };
  return (
    <span
      data-theme-menu-morph
      data-theme-menu-icon-kind={config.kind}
      aria-hidden="true"
      style={{
        position: "relative",
        display: "inline-grid",
        placeItems: "center",
        width: size,
        height: size,
        color: config.color,
        flex: "0 0 auto",
      }}
    >
      {config.kind === "custom" && safeCustomSource ? (
        <img
          src={safeCustomSource}
          alt=""
          draggable={false}
          style={{ display: "block", width: size, height: size, objectFit: "contain" }}
        />
      ) : config.kind === "grid" ? (
        <span
          data-menu-grid
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: Math.max(2, Math.round(size * 0.16)),
            width: Math.round(size * 0.72),
            height: Math.round(size * 0.72),
          }}
        >
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              style={{ borderRadius: 999, background: "currentColor" }}
            />
          ))}
        </span>
      ) : (
        <>
          <span data-menu-line="top" style={lineStyle} />
          {config.kind === "three-line" ? (
            <span data-menu-line="middle" style={lineStyle} />
          ) : null}
          <span data-menu-line="bottom" style={lineStyle} />
        </>
      )}
    </span>
  );
});

ThemeMenuMorphIcon.displayName = "ThemeMenuMorphIcon";
