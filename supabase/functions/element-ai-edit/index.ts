// AI-powered per-element style edit for the visual editor.
// Given an element label + user instruction, returns a partial ElementStyle patch.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { label, elementId, instruction, currentStyle, theme } = await req.json();
    if (!instruction) return json({ error: "instruction is required" }, 400);
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const ctx =
`Element: ${label || elementId || "(unknown)"}
Element id: ${elementId ?? "(none)"}
Current element style JSON: ${JSON.stringify(currentStyle ?? {})}
Store theme (accent/bg/surface/text): ${JSON.stringify({
      accent: theme?.accent, bg: theme?.bg, surface: theme?.surface, text: theme?.text,
    })}
User instruction: ${instruction}`;

    const tools = [{
      type: "function",
      function: {
        name: "apply_element_style",
        description: "Return only the style fields to update for this single element.",
        parameters: {
          type: "object",
          properties: {
            bg: { type: "string", description: "Background hex, or empty to skip" },
            color: { type: "string", description: "Text color hex, or empty to skip" },
            borderColor: { type: "string" },
            borderWidth: { type: "number" },
            radius: { type: "number", description: "px, 0-64" },
            padding: { type: "number", description: "px, 0-64" },
            shadow: { type: "string", enum: ["none","sm","md","lg","xl"] },
            width: { type: "string", description: "CSS width e.g. 100%, 320px" },
            height: { type: "string", description: "CSS height" },
            align: { type: "string", enum: ["left","center","right"] },
            fontSize: { type: "number", description: "px, 8-72" },
            fontWeight: { type: "number", description: "300-900 in 100 steps" },
            hidden: { type: "boolean" },
            rationale: { type: "string", description: "One short sentence." },
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
          { role: "system", content: "You are a senior UI designer editing one element. Return ONLY the fields that need to change, via the tool. Preserve strong contrast. Use tasteful modern values." },
          { role: "user", content: ctx },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "apply_element_style" } },
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
    const args = JSON.parse(call.function.arguments);
    const { rationale, ...patch } = args;
    // strip empty strings so we don't overwrite with blanks
    for (const k of Object.keys(patch)) {
      if (patch[k] === "" || patch[k] === null || patch[k] === undefined) delete patch[k];
    }
    return json({ patch, rationale });
  } catch (e) {
    console.error("element-ai-edit error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
