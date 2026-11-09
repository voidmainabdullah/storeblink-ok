// Compatibility export for existing callers. New platform code imports the
// canonical lazy singleton from `@/platform/supabase/client`.
export {
  getSupabaseBrowserClient,
  hasCreatedSupabaseBrowserClient,
  supabase,
  supabaseBrowserConfig,
} from "@/platform/supabase/client";
