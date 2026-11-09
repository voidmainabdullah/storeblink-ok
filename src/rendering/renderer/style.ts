import type { CSSProperties } from "react";
import type { CornerRadiusPerCorner, Effect, Fill, SceneNode, Stroke } from "@/types";
import { matrixToCss, transformDataToMatrix } from "@/rendering/coordinate";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const colorWithOpacity = (color: string, opacity = 1) =>
  opacity >= 0.999
    ? color
    : `color-mix(in srgb, ${color} ${Math.round(clamp(opacity, 0, 1) * 100)}%, transparent)`;

const fillToBackgroundLayer = (fill: Fill): string | null => {
  if (fill.type === "solid") {
    const color = colorWithOpacity(fill.color, fill.opacity);
    return `linear-gradient(${color}, ${color})`;
  }
  if (fill.type === "gradient") return fill.value;
  if (fill.type === "image" && fill.src) return `url("${fill.src}")`;
  return null;
};

const resolveBackground = (
  fills: Fill[],
): Pick<
  CSSProperties,
  "background" | "backgroundImage" | "backgroundRepeat" | "backgroundSize"
> => {
  const visibleFills = fills.filter((fill) => fill.visible !== false);
  if (!visibleFills.length) return {};
  const fill = visibleFills[0];
  if (visibleFills.length === 1) {
    if (fill.type === "solid") {
      return { background: colorWithOpacity(fill.color, fill.opacity) };
    }
    if (fill.type === "gradient") return { background: fill.value };
    if (fill.type === "image" && fill.src) {
      return {
        backgroundImage: `url("${fill.src}")`,
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      };
    }
    return {};
  }

  const layers = visibleFills
    .map(fillToBackgroundLayer)
    .filter((layer): layer is string => Boolean(layer));
  if (!layers.length) return {};
  return {
    backgroundImage: layers.join(", "),
    backgroundRepeat: visibleFills.map(() => "no-repeat").join(", "),
    backgroundSize: visibleFills
      .map((candidate) => candidate.type === "image" ? "cover" : "auto")
      .join(", "),
  };
};

const resolveBorder = (
  strokes: Stroke[],
): Pick<CSSProperties, "border" | "outline" | "outlineOffset"> => {
  const stroke = strokes.find((candidate) => candidate.visible !== false);
  if (!stroke || stroke.width <= 0) return {};
  const color = colorWithOpacity(stroke.color, stroke.opacity);
  const style = stroke.style ?? "solid";
  const value = `${stroke.width}px ${style} ${color}`;
  if (stroke.position === "outside") {
    return { outline: value, outlineOffset: 0 };
  }
  if (stroke.position === "center") {
    const halfWidth = stroke.width / 2;
    const halfValue = `${halfWidth}px ${style} ${color}`;
    return { border: halfValue, outline: halfValue, outlineOffset: 0 };
  }
  return { border: value };
};

const resolveEffect = (effect: Effect): string | null => {
  if (effect.type === "blur") {
    const radius = Number(effect.value.radius ?? effect.value.blur ?? 0);
    return radius > 0 ? `blur(${radius}px)` : null;
  }
  if (effect.type === "shadow") {
    const x = Number(effect.value.x ?? 0);
    const y = Number(effect.value.y ?? 2);
    const blur = Number(effect.value.blur ?? 8);
    const spread = Number(effect.value.spread ?? 0);
    const color = String(effect.value.color ?? "rgba(15, 23, 42, 0.18)");
    const inset = effect.value.kind === "inner-shadow" ? "inset " : "";
    return `${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`;
  }
  return typeof effect.value.css === "string" ? effect.value.css : null;
};

const resolveEffects = (
  effects: Effect[],
): Pick<CSSProperties, "boxShadow" | "filter" | "backdropFilter" | "mixBlendMode"> => {
  const shadows = effects.filter((effect) => effect.type === "shadow").map(resolveEffect).filter(Boolean);
  const filters = effects
    .filter((effect) => effect.type === "blur" && effect.value.kind !== "background-blur")
    .map(resolveEffect)
    .filter(Boolean);
  const backgroundBlur = effects.find(
    (effect) => effect.type === "blur" && effect.value.kind === "background-blur",
  );
  const backgroundBlurRadius = Number(backgroundBlur?.value.radius ?? backgroundBlur?.value.blur ?? 0);
  const blendMode = effects.find((effect) => effect.type === "custom" && effect.value.kind === "blend-mode");
  return {
    ...(shadows.length ? { boxShadow: shadows.join(", ") } : {}),
    ...(filters.length ? { filter: filters.join(" ") } : {}),
    ...(backgroundBlurRadius > 0 ? { backdropFilter: `blur(${backgroundBlurRadius}px)` } : {}),
    ...(typeof blendMode?.value.mode === "string"
      ? { mixBlendMode: blendMode.value.mode as CSSProperties["mixBlendMode"] }
      : {}),
  };
};

const resolveCornerRadius = (
  cornerRadius?: number | CornerRadiusPerCorner,
): Pick<CSSProperties, "borderRadius"> => {
  if (cornerRadius === undefined) return {};
  if (typeof cornerRadius === "number") return { borderRadius: cornerRadius };
  return {
    borderRadius: `${cornerRadius.topLeft}px ${cornerRadius.topRight}px ${cornerRadius.bottomRight}px ${cornerRadius.bottomLeft}px`,
  };
};

export const getNodeTransformStyle = (node: SceneNode): CSSProperties => ({
  position: "absolute",
  left: 0,
  top: 0,
  width: node.transform.width,
  height: node.transform.height,
  transform: matrixToCss(transformDataToMatrix(node.transform)),
  transformOrigin: `${node.transform.transformOrigin[0] * 100}% ${node.transform.transformOrigin[1] * 100}%`,
  zIndex: node.transform.zIndex,
});

export const getNodeVisualStyle = (node: SceneNode): CSSProperties => ({
  ...resolveBackground(node.style.fills),
  ...resolveBorder(node.style.strokes),
  ...resolveEffects(node.style.effects),
  ...resolveCornerRadius(node.style.cornerRadius),
  opacity: node.style.opacity,
  boxSizing: "border-box",
});

export const getNodeFrameStyle = (node: SceneNode): CSSProperties => ({
  ...getNodeTransformStyle(node),
  ...getNodeVisualStyle(node),
});

export const getNodeDomId = (node: SceneNode): string | undefined => {
  const anchor = node.extensions?.anchor;
  if (typeof anchor === "string" && anchor.trim()) return anchor.trim();
  const sectionInstanceId = node.extensions?.sectionInstanceId;
  if (
    node.type !== "section" ||
    typeof sectionInstanceId !== "string" ||
    !sectionInstanceId.trim()
  ) {
    return undefined;
  }
  return `section-${sectionInstanceId.trim().replace(/[^a-zA-Z0-9_-]/g, "-")}`;
};
