import type { ThemeDesignTokens } from "@/theme-engine/contracts";

export const noirChronoTokens: ThemeDesignTokens = {
  colors: {
    background: "#F7F7F5",
    surface: "#FFFFFF",
    surfaceInverse: "#101010",
    text: "#111111",
    textMuted: "#6B6867",
    textInverse: "#F8F7F5",
    primary: "#F5AAA5",
    onPrimary: "#111111",
    border: "#D9D7D4",
    borderStrong: "#77736F",
  },
  typography: {
    headingFont: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
    bodyFont: "Inter, Arial, ui-sans-serif, system-ui, sans-serif",
    editorialFont: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
    scale: {
      display: "clamp(3rem, 7vw, 7rem)",
      heading: "clamp(2rem, 4.5vw, 4.75rem)",
      subheading: "clamp(1.35rem, 2.5vw, 2.5rem)",
      body: "1rem",
      small: "0.75rem",
    },
  },
  spacing: {
    xs: "0.5rem",
    sm: "1rem",
    md: "1.5rem",
    lg: "3.5rem",
    xl: "7rem",
  },
  radii: {
    none: "0",
    small: "8px",
    medium: "24px",
    pill: "999px",
  },
  containers: {
    narrow: "760px",
    standard: "1180px",
    wide: "1440px",
    full: "100%",
  },
  motion: {
    fast: "140ms",
    normal: "260ms",
    slow: "650ms",
    easing: "cubic-bezier(0.22, 1, 0.36, 1)",
  },
};
