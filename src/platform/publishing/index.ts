import { StorefrontPublishingService } from "./StorefrontPublishingService";
import { PublicationRecoverySystem, publicationRecoverySystem } from "./PublicationRecoverySystem";
import { supabaseStorefrontPublishingGateway } from "./supabaseStorefrontPublishingGateway";
import { themePublicationGuard } from "@/themes/governance";
import type { DependencyGraphAPI } from "@/engine/dependency-graph";

export * from "./StorefrontPublishingService";
export * from "./PublicationRecoverySystem";

export const createStorefrontPublishingService = (options: {
  dependencies?: DependencyGraphAPI;
} = {}) => new StorefrontPublishingService(
  supabaseStorefrontPublishingGateway,
  {
    guard: themePublicationGuard,
    recovery: new PublicationRecoverySystem(),
    dependencies: options.dependencies,
  },
);

export const storefrontPublishingService = new StorefrontPublishingService(
  supabaseStorefrontPublishingGateway,
  {
    guard: themePublicationGuard,
    recovery: publicationRecoverySystem,
  },
);
