import { publicSupabaseRpc } from "@/platform/supabase/publicRest";
import type { RuntimeArtifactGateway } from "./types";

export const supabaseRuntimeArtifactGateway: RuntimeArtifactGateway = {
  async resolve(handle) {
    const response = await publicSupabaseRpc<unknown>(
      "get_public_adaptive_storefront_artifact",
      { p_handle: handle },
    );
    return response.data;
  },
};

