import { RuntimeArtifactResolver } from "./RuntimeArtifactResolver";
import { supabaseRuntimeArtifactGateway } from "./supabaseRuntimeArtifactGateway";
import type { RuntimeArtifact } from "@/adaptive-commerce/contracts";

export * from "./RuntimeArtifactResolver";
export * from "./types";
export * from "./rendering";

export const runtimeArtifactResolver = new RuntimeArtifactResolver<RuntimeArtifact>(
  supabaseRuntimeArtifactGateway,
);
