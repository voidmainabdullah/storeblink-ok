// Retired compatibility endpoint. Raw colors, layout values and generated media
// are not valid Adaptive Commerce plans and must never mutate a storefront.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve((request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    error: {
      code: "LEGACY_THEME_GENERATOR_RETIRED",
      message: "Use the certified adaptive storefront planner and review its proposal before applying changes.",
    },
  }), {
    status: 410,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
});
