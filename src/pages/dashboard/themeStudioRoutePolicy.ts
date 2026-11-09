import type { StoreCapability } from "@/platform/auth/auth.types";

export const THEME_STUDIO_ROUTE_POLICY = Object.freeze({
  capabilities: ["theme.studio"] as readonly StoreCapability[],
  requireStore: true,
  requireAal2: true,
});
