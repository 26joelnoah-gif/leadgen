// LEADGEN v33 — "Herken met AI": ruwe geplakte tekst (Perplexity-proza,
// e-mails, losse notities) structureren tot nette lead-rijen voor de
// import-/verrijk-wizard. Verzint niets: alleen wat er letterlijk staat.
// GEDEPLOYED als Edge Function "parse-paste" op zboyxwwrbtpjnlgquhzs.
// Toegang: admin of manager met can_manage_leads (zelfde als enrich-lead).
// Vereist secret: PERPLEXITY_API_KEY.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_CHARS = 20000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("PERPLEXITY_API_KEY");
    if (!apiKey) {
      return json({ error: "PERPLEXITY_API_KEY ontbreekt. Voeg deze toe in Supabase: Project Settings -> Edge Functions -> Secrets." }, 500);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Niet ingelogd" }, 401);

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, can_manage_leads, is_active")
      .eq("id", userData.user.id)
      .single();
    const allowed = profile && profile.is_active !== false &&
      (profile.role === "admin" || (profile.role === "manager" && profile.can_manage_leads));
    if (!allowed) return json({ error: "Geen toestemming" }, 403);

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text || "").slice(0, MAX_CHARS);
    if (text.trim().length < 10) return json({ error: "Geen tekst om te herkennen" }, 400);

    const pplx = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "Je structureert ruwe Nederlandse leadgegevens. Haal UITSLUITEND informatie uit de aangeleverde tekst zelf - zoek NIETS op en verzin NIETS. Elke rij is een bedrijf. Velden die niet letterlijk in de tekst staan laat je null. Bronverwijzingen, markdown-links en teksten als 'geen naam gevonden' neem je niet over. Bij meerdere contactpersonen per bedrijf: de eerste (of belangrijkste beslisser) in contact_person/function, de rest voluit in notes.",
          },
          {
            role: "user",
            content: `Structureer deze tekst tot lead-rijen:\n\n${text}`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            schema: {
              type: "object",
              properties: {
                rows: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: ["string", "null"] },
                      contact_person: { type: ["string", "null"] },
                      function: { type: ["string", "null"] },
                      email: { type: ["string", "null"] },
                      phone: { type: ["string", "null"] },
                      website: { type: ["string", "null"] },
                      city: { type: ["string", "null"] },
                      notes: { type: ["string", "null"] },
                    },
                    required: ["name", "contact_person", "function", "email", "phone", "website", "city", "notes"],
                  },
                },
              },
              required: ["rows"],
            },
          },
        },
      }),
    });

    if (!pplx.ok) {
      const t = await pplx.text();
      return json({ error: `Perplexity ${pplx.status}: ${t.slice(0, 200)}` }, 502);
    }
    const pj = await pplx.json();
    let rows: Array<Record<string, string | null>> = [];
    try {
      const parsed = JSON.parse(pj?.choices?.[0]?.message?.content ?? "{}");
      if (Array.isArray(parsed?.rows)) rows = parsed.rows;
    } catch { /* geen json */ }

    rows = rows.filter((r) => String(r?.name ?? "").trim() !== "");

    return json({ rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
