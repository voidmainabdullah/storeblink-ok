import {
  sanitizeSvgMarkup,
  svgDataUrl,
  type SafeSvgModel,
  SvgSecurityError,
} from "@/engine/validation/safeSvg";
import { AssetValidationError } from "./types";

export type SanitizedSvg = SafeSvgModel;

export const sanitizeSvg = (source: string): SanitizedSvg => {
  try {
    return sanitizeSvgMarkup(source);
  } catch (error) {
    if (error instanceof AssetValidationError) throw error;
    throw new AssetValidationError(
      "invalid-svg",
      error instanceof SvgSecurityError
        ? error.message
        : "The SVG could not be validated.",
    );
  }
};

export { svgDataUrl };
