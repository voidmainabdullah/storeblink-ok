import type {
  FluidClampValue,
  ResponsiveCompileContext,
  ResponsiveLength,
} from "./types";

export class ResponsivePrimitiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResponsivePrimitiveError";
  }
}

const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new ResponsivePrimitiveError(`${label} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
};

const numberText = (value: number): string => {
  const normalized = Math.round(value * 10_000) / 10_000;
  return Number.isInteger(normalized) ? String(normalized) : String(normalized);
};

export const validateFluidClamp = (value: FluidClampValue): FluidClampValue => {
  if (
    value.kind !== "fluid-clamp" ||
    (value.unit !== undefined && value.unit !== "px") ||
    (value.preferred.basis !== "container-inline" && value.preferred.basis !== "viewport-inline")
  ) {
    throw new ResponsivePrimitiveError("Fluid clamp kind, unit, or basis is invalid.");
  }
  const min = finite(value.min, "Fluid minimum");
  const max = finite(value.max, "Fluid maximum");
  const base = finite(value.preferred.base, "Fluid preferred base");
  const scale = finite(value.preferred.scale, "Fluid preferred scale");
  if (max < min) throw new ResponsivePrimitiveError("Fluid maximum must be at least its minimum.");
  return { ...value, min, max, preferred: { ...value.preferred, base, scale }, unit: "px" };
};

export const fluidClampCss = (input: FluidClampValue): string => {
  const value = validateFluidClamp(input);
  const basisUnit = value.preferred.basis === "container-inline" ? "cqi" : "vi";
  return `clamp(${numberText(value.min)}px, calc(${numberText(value.preferred.base)}px + ${numberText(value.preferred.scale)}${basisUnit}), ${numberText(value.max)}px)`;
};

export const resolveResponsiveLength = (
  input: ResponsiveLength,
  context: ResponsiveCompileContext,
): number => {
  if (typeof input === "number") return finite(input, "Responsive length");
  const value = validateFluidClamp(input);
  const basis = value.preferred.basis === "container-inline"
    ? context.containerInlineSize
    : context.viewportInlineSize;
  finite(basis, "Responsive basis");
  const preferred = value.preferred.base + value.preferred.scale * basis / 100;
  return Math.min(value.max, Math.max(value.min, preferred));
};

export const responsiveLengthCss = (input: ResponsiveLength): string | null =>
  typeof input === "number" ? null : fluidClampCss(input);
