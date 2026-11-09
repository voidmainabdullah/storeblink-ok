// One-prompt AI editor: takes a natural-language instruction + current store
// snapshot and returns a partial patch that can change theme, copy, element
// styles, section visibility and colors in a single call.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { instruction, theme, store, elements } = await req.json();
    if (!instruction) return json({ error: "instruction is required" }, 400);
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const ctx =
`User instruction:
${instruction}

Current theme (accent/bg/surface/text/font/radius/density):
${JSON.stringify({
  accent: theme?.accent, bg: theme?.bg, surface: theme?.surface, text: theme?.text,
  font: theme?.font, radius: theme?.radius, density: theme?.density,
})}

Current section visibility: ${JSON.stringify(theme?.sections ?? {})}
Current text overrides: ${JSON.stringify(theme?.text_overrides ?? {})}
Current per-element styles: ${JSON.stringify(theme?.element_styles ?? {})}
Store: ${JSON.stringify({
  business_name: store?.business_name, tagline: store?.store_tagline,
  about: store?.store_about, template: store?.store_template,
})}
Known editable element ids on the page: ${JSON.stringify(elements ?? [])}`;

    const tools = [{
      type: "function",
      function: {
        name: "apply_store_patch",
        description:
          "Return ONLY the fields to change. Omit anything that shouldn't change. Use element_styles keyed by the known element ids to restyle specific pieces. Keep strong contrast.",
        parameters: {
          type: "object",
          properties: {
            accent: { type: "string" },
            bg: { type: "string" },
            surface: { type: "string" },
            text: { type: "string" },
            font: { type: "string", enum: ["system", "inter", "poppins", "playfair", "georgia", "mono"] },
            radius: { type: "number" },
            density: { type: "string", enum: ["compact", "cozy", "roomy"] },
            sections: {
              type: "object",
              description: "Partial map of section keys -> boolean to show/hide.",
              additionalProperties: { type: "boolean" },
            },
            text_overrides: {
              type: "object",
              description: "Partial map of copy field keys -> new string.",
              additionalProperties: { type: "string" },
            },
            element_styles: {
              type: "object",
              description:
                "Map of element id (from the provided list) -> style patch {bg,color,borderColor,borderWidth,radius,padding,shadow,width,height,align,fontSize,fontWeight,hidden}.",
              additionalProperties: {
                type: "object",
                properties: {
                  bg: { type: "string" },
                  color: { type: "string" },
                  borderColor: { type: "string" },
                  borderWidth: { type: "number" },
                  radius: { type: "number" },
                  padding: { type: "number" },
                  shadow: { type: "string", enum: ["none", "sm", "md", "lg", "xl"] },
                  width: { type: "string" },
                  height: { type: "string" },
                  align: { type: "string", enum: ["left", "center", "right"] },
                  fontSize: { type: "number" },
                  fontWeight: { type: "number" },
                  hidden: { type: "boolean" },
                },
                additionalProperties: false,
              },
            },
            rationale: { type: "string" },
          },
          additionalProperties: false,
        },
      },
    }];

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are a senior UI/brand designer editing a live storefront. Given ONE natural instruction, decide which parts of the store to change (theme, copy, sections, specific elements) and return only the diff via the tool. Prefer accessible contrast. When restyling a specific piece, use the exact element id from the provided list.",
          },
          { role: "user", content: ctx },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "apply_store_patch" } },
      }),
    });
    if (resp.status === 429) return json({ error: "Rate limited. Try again in a moment." }, 429);
    if (resp.status === 402) return json({ error: "AI credits exhausted." }, 402);
    if (!resp.ok) {
      const t = await resp.text();
      console.error("gateway error", resp.status, t);
      return json({ error: "AI gateway error" }, 500);
    }
    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!call) return json({ error: "No tool call" }, 500);
    const patch = JSON.parse(call.function.arguments);
    // strip empty strings
    for (const k of Object.keys(patch)) {
      const v = (patch as any)[k];
      if (v === "" || v === null || v === undefined) delete (patch as any)[k];
    }
    return json({ patch });
  } catch (e) {
    console.error("store-ai-edit error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
