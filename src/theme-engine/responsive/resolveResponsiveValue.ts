import type { ResponsiveBreakpoint } from "@/stores/responsive.store";
import type { ResponsiveValue } from "@/theme-engine/contracts";

export const resolveResponsiveValue = <T>(
  value: ResponsiveValue<T> | T | undefined,
  breakpoint: ResponsiveBreakpoint,
  themeDefault: T,
  universalDefault = themeDefault,
): T => {
  if (value === undefined) return themeDefault ?? universalDefault;
  if (!value || typeof value !== "object" || !("base" in value)) return value as T;
  const responsive = value as ResponsiveValue<T>;
  if (breakpoint === "mobile") {
    return responsive.mobile ?? responsive.tablet ?? responsive.base ?? themeDefault ?? universalDefault;
  }
  if (breakpoint === "tablet") {
    return responsive.tablet ?? responsive.base ?? themeDefault ?? universalDefault;
  }
  return responsive.base ?? themeDefault ?? universalDefault;
};
