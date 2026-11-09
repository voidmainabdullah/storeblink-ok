import type { ReactNode } from "react";
import { AuthGuard } from "@/platform/auth/AuthGuard";
import ThemeStudio from "./ThemeStudio";
import { THEME_STUDIO_ROUTE_POLICY } from "./themeStudioRoutePolicy";

export const ThemeStudioAccessBoundary = ({ children }: { children: ReactNode }) => (
  <AuthGuard {...THEME_STUDIO_ROUTE_POLICY}>{children}</AuthGuard>
);

const ThemeStudioRoute = () => (
  <ThemeStudioAccessBoundary>
    <ThemeStudio />
  </ThemeStudioAccessBoundary>
);

export default ThemeStudioRoute;
