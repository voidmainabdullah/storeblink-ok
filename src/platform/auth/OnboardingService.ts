import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, Json } from "@/integrations/supabase/types";
import { AuthPlatformError, mapAuthError } from "./auth.errors";
import type { DashboardBootstrap } from "./auth.types";

export type CompleteOnboardingInput = {
  businessName: string;
  requestedHandle: string;
  storeTemplate: string;
  storeColor: string;
  theme: Json;
  businessType: string;
  categories: readonly string[];
};

export type OnboardingCompletion = {
  profileId: string;
  storeId: string;
  storeHandle: string;
};

export const isConfirmedOnboardingBootstrap = (
  completion: OnboardingCompletion,
  userId: string,
  bootstrap: DashboardBootstrap | null,
) => Boolean(
  bootstrap?.profile.onboardingCompleted &&
  completion.profileId === userId &&
  bootstrap.profile.id === userId &&
  bootstrap.store?.id === completion.storeId &&
  bootstrap.membership?.storeId === completion.storeId &&
  bootstrap.membership.userId === userId &&
  bootstrap.membership.status === "active"
);

const completionSchema = z.object({
  profile: z.object({
    id: z.string().uuid(),
    business_name: z.string().min(2),
    onboarding_completed: z.literal(true),
  }),
  store: z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    handle: z.string().min(1),
  }),
  membership: z.object({
    store_id: z.string().uuid(),
    user_id: z.string().uuid(),
    role: z.literal("owner"),
    status: z.literal("active"),
  }),
});

export class OnboardingService {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async complete(input: CompleteOnboardingInput): Promise<OnboardingCompletion> {
    const result = await this.client.rpc("complete_store_onboarding", {
      p_business_name: input.businessName,
      p_requested_handle: input.requestedHandle,
      p_store_template: input.storeTemplate,
      p_store_color: input.storeColor,
      p_theme: input.theme,
      p_business_type: input.businessType,
      p_categories: [...input.categories],
    });
    if (result.error) throw mapAuthError(result.error);

    const parsed = completionSchema.safeParse(result.data);
    if (!parsed.success) {
      throw new AuthPlatformError("AUTH_UNKNOWN", { cause: parsed.error });
    }
    if (
      parsed.data.profile.id !== parsed.data.membership.user_id ||
      parsed.data.store.id !== parsed.data.membership.store_id
    ) {
      throw new AuthPlatformError("STORE_ACCESS_DENIED");
    }

    return {
      profileId: parsed.data.profile.id,
      storeId: parsed.data.store.id,
      storeHandle: parsed.data.store.handle,
    };
  }
}
