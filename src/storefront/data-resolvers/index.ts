import { StorefrontDataResolver } from "./StorefrontDataResolver";
import { supabaseStorefrontGateway } from "./supabaseStorefrontGateway";

export * from "./StorefrontDataResolver";
export * from "./types";

export const storefrontDataResolver = new StorefrontDataResolver(supabaseStorefrontGateway);
