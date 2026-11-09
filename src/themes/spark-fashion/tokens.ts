import type { ThemeDesignTokens } from "@/theme-engine/contracts";

export const sparkFashionTokens: ThemeDesignTokens = {
  colors: {
    background: "#FFFFFF",
    surface: "#F5F5F3",
    surfaceInverse: "#09090B",
    text: "#111111",
    textMuted: "#676767",
    textInverse: "#FFFFFF",
    primary: "#FF681D",
    onPrimary: "#111111",
    border: "#E1E1DE",
    borderStrong: "#111111",
  },
  typography: {
    headingFont: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
    bodyFont: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
    editorialFont: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
    scale: {
      display: "clamp(3.25rem, 7vw, 6.75rem)",
      heading: "clamp(2rem, 4vw, 4rem)",
      subheading: "clamp(1.35rem, 2.2vw, 2.25rem)",
      body: "1rem",
      small: "0.75rem",
    },
  },
  spacing: {
    xs: "0.5rem",
    sm: "1rem",
    md: "1.5rem",
    lg: "3.5rem",
    xl: "6rem",
  },
  radii: {
    none: "0",
    small: "6px",
    medium: "14px",
    pill: "999px",
  },
  containers: {
    narrow: "760px",
    standard: "1120px",
    wide: "1440px",
    full: "100%",
  },
  motion: {
    fast: "150ms",
    normal: "280ms",
    slow: "620ms",
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
};
