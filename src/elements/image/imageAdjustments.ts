import type { CSSProperties } from "react";

export type ImageAdjustments = {
  opacity: number;
  exposure: number;
  brightness: number;
  contrast: number;
  saturation: number;
  vibrance: number;
  temperature: number;
  tint: number;
  blur: number;
  sharpness: number;
};

export type ImageEffects = {
  noise: number;
  texture: number;
  glass: number;
  glow: number;
  glowColor: string;
  blendMode: CSSProperties["mixBlendMode"];
};

export const DEFAULT_IMAGE_ADJUSTMENTS: ImageAdjustments = {
  opacity: 100,
  exposure: 0,
  brightness: 0,
  contrast: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  blur: 0,
  sharpness: 0,
};

export const DEFAULT_IMAGE_EFFECTS: ImageEffects = {
  noise: 0,
  texture: 0,
  glass: 0,
  glow: 0,
  glowColor: "#0178ff",
  blendMode: "normal",
};

const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const readImageAdjustments = (value: unknown): ImageAdjustments => {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    opacity: clamp(finite(source.opacity, 100), 0, 100),
    exposure: clamp(finite(source.exposure, 0), -100, 100),
    brightness: clamp(finite(source.brightness, 0), -100, 100),
    contrast: clamp(finite(source.contrast, 0), -100, 100),
    saturation: clamp(finite(source.saturation, 0), -100, 100),
    vibrance: clamp(finite(source.vibrance, 0), -100, 100),
    temperature: clamp(finite(source.temperature, 0), -100, 100),
    tint: clamp(finite(source.tint, 0), -100, 100),
    blur: clamp(finite(source.blur, 0), 0, 40),
    sharpness: clamp(finite(source.sharpness, 0), 0, 100),
  };
};

export const readImageEffects = (value: unknown): ImageEffects => {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const blendMode =
    typeof source.blendMode === "string"
      ? source.blendMode as CSSProperties["mixBlendMode"]
      : DEFAULT_IMAGE_EFFECTS.blendMode;
  return {
    noise: clamp(finite(source.noise, 0), 0, 100),
    texture: clamp(finite(source.texture, 0), 0, 100),
    glass: clamp(finite(source.glass, 0), 0, 100),
    glow: clamp(finite(source.glow, 0), 0, 100),
    glowColor: typeof source.glowColor === "string" ? source.glowColor : DEFAULT_IMAGE_EFFECTS.glowColor,
    blendMode,
  };
};

export const getImageFilterId = (nodeId: string) =>
  `engine-image-filter-${nodeId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

export const hasImageFilter = (adjustments: ImageAdjustments, effects: ImageEffects) =>
  Object.entries(adjustments).some(([key, value]) =>
    key === "opacity" ? value !== 100 : value !== 0,
  ) ||
  effects.noise > 0 ||
  effects.texture > 0;

export const getImageChannelTransfer = (adjustments: ImageAdjustments) => {
  const exposure = 2 ** (adjustments.exposure / 50);
  const brightness = Math.max(0, 1 + adjustments.brightness / 100);
  const contrast = Math.max(0.01, 1 + adjustments.contrast / 100);
  const temperature = adjustments.temperature / 100;
  const tint = adjustments.tint / 100;
  const baseSlope = exposure * brightness * contrast;
  const contrastIntercept = 0.5 - 0.5 * contrast;
  return {
    r: {
      slope: Math.max(0, baseSlope * (1 + temperature * 0.12 + tint * 0.05)),
      intercept: contrastIntercept + Math.max(0, tint) * 0.015,
    },
    g: {
      slope: Math.max(0, baseSlope * (1 - Math.abs(tint) * 0.08)),
      intercept: contrastIntercept + Math.max(0, -tint) * 0.02,
    },
    b: {
      slope: Math.max(0, baseSlope * (1 - temperature * 0.12 + tint * 0.05)),
      intercept: contrastIntercept + Math.max(0, tint) * 0.015,
    },
  };
};

export const getImageSaturation = (adjustments: ImageAdjustments) =>
  Math.max(0, (1 + adjustments.saturation / 100) * (1 + adjustments.vibrance / 200));

export const buildCanvasImageFilter = (adjustments: ImageAdjustments) => {
  const exposure = 2 ** (adjustments.exposure / 50);
  const brightness = Math.max(0, 1 + adjustments.brightness / 100) * exposure;
  const contrast = Math.max(0, 1 + adjustments.contrast / 100);
  const saturation = getImageSaturation(adjustments);
  return [
    `brightness(${brightness})`,
    `contrast(${contrast})`,
    `saturate(${saturation})`,
    adjustments.blur > 0 ? `blur(${adjustments.blur}px)` : "",
  ].filter(Boolean).join(" ");
};
