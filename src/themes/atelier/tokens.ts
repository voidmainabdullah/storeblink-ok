import type { ThemeDesignTokens } from "@/theme-engine/contracts";

export const atelierTokens: ThemeDesignTokens = {
  colors: {
    background: "#F4F0EA",
    surface: "#FAF8F4",
    surfaceInverse: "#0A0A0A",
    text: "#0A0A0A",
    textMuted: "#68645F",
    textInverse: "#FAF8F4",
    primary: "#8A654B",
    onPrimary: "#FAF8F4",
    border: "#D8D1C8",
    borderStrong: "#7C766F",
  },
  typography: {
    headingFont: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
    bodyFont: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
    editorialFont: "Iowan Old Style, Baskerville, Georgia, Times New Roman, serif",
    scale: {
      display: "clamp(3.25rem, 8vw, 8.5rem)",
      heading: "clamp(2.25rem, 5vw, 5.25rem)",
      subheading: "clamp(1.5rem, 2.5vw, 2.75rem)",
      body: "1rem",
      small: "0.75rem",
    },
  },
  spacing: {
    xs: "0.5rem",
    sm: "1rem",
    md: "1.75rem",
    lg: "4rem",
    xl: "8rem",
  },
  radii: {
    none: "0",
    small: "2px",
    medium: "6px",
    pill: "999px",
  },
  containers: {
    narrow: "760px",
    standard: "1120px",
    wide: "1440px",
    full: "100%",
  },
  motion: {
    fast: "140ms",
    normal: "260ms",
    slow: "700ms",
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
};
