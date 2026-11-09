// Lovable AI Gateway: generate a "Magic Style" theme or rewrite copy for a store.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "google/gemini-2.5-flash";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mode, store } = await req.json();
    if (!mode || !store) {
      return json({ error: "mode and store are required" }, 400);
    }
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const ctx = `Store name: ${store.business_name ?? "(unnamed)"}
Tagline: ${store.store_tagline ?? "(none)"}
About: ${store.store_about ?? "(none)"}
Category hints: ${(store.categories ?? []).slice(0, 8).join(", ") || "general retail"}
Sample products: ${(store.products ?? []).slice(0, 6).map((p: any) => p.name).join("; ") || "(none yet)"}`;

    const tools =
      mode === "style"
        ? [{
            type: "function",
            function: {
              name: "apply_style",
              description: "Return a complete visual theme tuned for this store.",
              parameters: {
                type: "object",
                properties: {
                  accent: { type: "string", description: "Primary brand hex color, e.g. #5669ff" },
                  bg: { type: "string", description: "Page background hex" },
                  surface: { type: "string", description: "Card/surface hex" },
                  text: { type: "string", description: "Body text hex" },
                  font: { type: "string", enum: ["system", "inter", "poppins", "playfair", "georgia", "mono"] },
                  radius: { type: "number", description: "Corner radius px (0-24)" },
                  density: { type: "string", enum: ["compact", "cozy", "roomy"] },
                  rationale: { type: "string", description: "One short sentence explaining the choice" },
                },
                required: ["accent", "bg", "surface", "text", "font", "radius", "density", "rationale"],
                additionalProperties: false,
              },
            },
          }]
        : [{
            type: "function",
            function: {
              name: "rewrite_copy",
              description: "Rewrite all storefront copy in a punchy, on-brand voice.",
              parameters: {
                type: "object",
                properties: {
                  heroBadge: { type: "string" },
                  heroCta: { type: "string" },
                  flashTitle: { type: "string" },
                  flashSubtitle: { type: "string" },
                  allProductsTitle: { type: "string" },
                  aboutTitle: { type: "string" },
                  newsletterTitle: { type: "string" },
                  newsletterCopy: { type: "string" },
                  newsletterCta: { type: "string" },
                  searchCta: { type: "string" },
                  footerNote: { type: "string" },
                  trust1Title: { type: "string" }, trust1Sub: { type: "string" },
                  trust2Title: { type: "string" }, trust2Sub: { type: "string" },
                  trust3Title: { type: "string" }, trust3Sub: { type: "string" },
                  trust4Title: { type: "string" }, trust4Sub: { type: "string" },
                },
                required: [
                  "heroBadge","heroCta","flashTitle","flashSubtitle","allProductsTitle",
                  "aboutTitle","newsletterTitle","newsletterCopy","newsletterCta","searchCta","footerNote",
                  "trust1Title","trust1Sub","trust2Title","trust2Sub","trust3Title","trust3Sub","trust4Title","trust4Sub",
                ],
                additionalProperties: false,
              },
            },
          }];

    const systemMsg =
      mode === "style"
        ? "You are a senior brand designer. Pick a cohesive palette + font + radius + density that fits this shop. Use vivid but tasteful colors with strong contrast (text vs bg AA-compliant). Return ONLY via the tool."
        : "You are a top e-commerce copywriter. Rewrite every label to be concrete, friendly, and on-brand. Keep buttons under 3 words and titles under 5 words. Return ONLY via the tool.";

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: ctx },
        ],
        tools,
        tool_choice: { type: "function", function: { name: mode === "style" ? "apply_style" : "rewrite_copy" } },
      }),
    });

    if (resp.status === 429) return json({ error: "Rate limited. Try again in a moment." }, 429);
    if (resp.status === 402) return json({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error:", resp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "No tool call returned" }, 500);
    const args = JSON.parse(call.function.arguments);
    return json({ mode, result: args });
  } catch (e) {
    console.error("enhance-store error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
