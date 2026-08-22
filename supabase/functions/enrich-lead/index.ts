// LEADGEN v32 — AI-verrijking via Perplexity Sonar
// GEDEPLOYED als Edge Function "enrich-lead" (versie 2) op zboyxwwrbtpjnlgquhzs.
// Vult ALLEEN lege velden van bestaande leads (contactpersoon, functie,
// e-mail, website, branche) en zet de bronnen in de notities.
// Toegang: admin, of manager met can_manage_leads. Alle database-acties
// lopen via de JWT van de gebruiker, dus RLS bepaalt welke leads mogen.
// Vereist secret: PERPLEXITY_API_KEY (Supabase -> Project Settings -> Edge Functions -> Secrets)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_LEADS = 10;

function cleanWebsite(raw: string): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || "").trim());
const empty = (v: unknown) => !String(v ?? "").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
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
    const uid = userData.user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, can_manage_leads, is_active, organization_id")
      .eq("id", uid)
      .single();
    const allowed = profile && profile.is_active !== false &&
      (profile.role === "admin" || (profile.role === "manager" && profile.can_manage_leads));
    if (!allowed) return json({ error: "Geen toestemming: alleen admins of managers met het recht 'Leads beheren' kunnen verrijken." }, 403);

    const body = await req.json().catch(() => ({}));
    const leadIds: string[] = Array.isArray(body?.leadIds) ? body.leadIds.slice(0, MAX_LEADS) : [];
    if (!leadIds.length) return json({ error: "Geen leadIds meegegeven" }, 400);

    const { data: leads, error: leadsErr } = await supabase
      .from("leads")
      .select("id, name, phone, website, email, contact_person, function, city, postal_code, notes, extra_info1, organization_id")
      .in("id", leadIds)
      .is("deleted_at", null);
    if (leadsErr) return json({ error: leadsErr.message }, 500);

    const results: Array<Record<string, unknown>> = [];

    for (const lead of leads ?? []) {
      const targets = ["contact_person", "function", "email", "website"] as const;
      const missing = targets.filter((f) => empty((lead as Record<string, unknown>)[f]));
      // Alles al gevuld (incl. branche in extra_info1)? Dan niets opzoeken.
      if (!missing.length && !empty(lead.extra_info1)) {
        results.push({ leadId: lead.id, name: lead.name, status: "no_data", detail: "alles al ingevuld" });
        continue;
      }

      try {
        const vraag = [
          `Bedrijf: ${lead.name}`,
          lead.city ? `Plaats: ${lead.city}` : null,
          lead.website ? `Website: ${lead.website}` : null,
          lead.phone ? `Telefoon: ${lead.phone}` : null,
        ].filter(Boolean).join("\n");

        const pplx = await fetch("https://api.perplexity.ai/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: "sonar",
            messages: [
              {
                role: "system",
                content:
                  "Je bent een B2B-leadonderzoeker voor de Nederlandse markt. Zoek openbare informatie over het opgegeven bedrijf. Geef UITSLUITEND feiten die je daadwerkelijk in bronnen vindt; weet je iets niet zeker, gebruik dan null. Verzin nooit namen, e-mailadressen of websites.",
              },
              {
                role: "user",
                content:
                  `${vraag}\n\nGeef JSON met: contact_person (naam van eigenaar/DGA/beslisser of null), function (functietitel of null), email (algemeen of persoonlijk zakelijk e-mailadres of null), website (domein of null), branche (korte NL-omschrijving of null), samenvatting (max 1 zin over het bedrijf of null).`,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                schema: {
                  type: "object",
                  properties: {
                    contact_person: { type: ["string", "null"] },
                    function: { type: ["string", "null"] },
                    email: { type: ["string", "null"] },
                    website: { type: ["string", "null"] },
                    branche: { type: ["string", "null"] },
                    samenvatting: { type: ["string", "null"] },
                  },
                  required: ["contact_person", "function", "email", "website", "branche", "samenvatting"],
                },
              },
            },
          }),
        });

        if (!pplx.ok) {
          const t = await pplx.text();
          throw new Error(`Perplexity ${pplx.status}: ${t.slice(0, 200)}`);
        }
        const pj = await pplx.json();
        const content = pj?.choices?.[0]?.message?.content ?? "{}";
        const citations: string[] = Array.isArray(pj?.citations) ? pj.citations : (pj?.search_results?.map((s: { url?: string }) => s.url).filter(Boolean) ?? []);
        let found: Record<string, string | null> = {};
        try { found = JSON.parse(content); } catch { /* geen json */ }

        // Alleen LEGE velden vullen - bestaande data blijft altijd staan
        const updates: Record<string, unknown> = {};
        if (found.contact_person && empty(lead.contact_person)) updates.contact_person = String(found.contact_person).slice(0, 120);
        if (found.function && empty(lead.function)) updates.function = String(found.function).slice(0, 120);
        if (found.email && empty(lead.email) && isEmail(found.email)) updates.email = String(found.email).trim().toLowerCase();
        if (found.website && empty(lead.website)) {
          const w = cleanWebsite(found.website);
          if (w.includes(".")) updates.website = w;
        }
        if (found.branche && empty(lead.extra_info1)) updates.extra_info1 = `Branche: ${String(found.branche).slice(0, 120)}`;

        if (Object.keys(updates).length > 0) {
          const bronnen = citations.slice(0, 2).join(", ");
          const datum = new Date().toLocaleDateString("nl-NL");
          const noteLine = `AI-verrijkt (Perplexity, ${datum})${found.samenvatting ? `: ${String(found.samenvatting).slice(0, 160)}` : ""}${bronnen ? ` | bron: ${bronnen}` : ""}`;
          updates.notes = empty(lead.notes) ? noteLine : `${lead.notes}\n${noteLine}`;

          const { data: upd, error: updErr } = await supabase
            .from("leads")
            .update(updates)
            .eq("id", lead.id)
            .select("id");
          if (updErr || !upd?.length) throw new Error(updErr?.message || "update geweigerd (geen rechten)");

          const added = { ...updates };
          delete added.notes;
          await supabase.from("enrichment_logs").insert({
            lead_id: lead.id,
            organization_id: lead.organization_id ?? profile.organization_id ?? null,
            requested_by: uid,
            source: "perplexity",
            status: "ok",
            fields_added: added,
            detail: citations.slice(0, 3).join(", ") || null,
          });
          results.push({ leadId: lead.id, name: lead.name, status: "ok", added });
        } else {
          await supabase.from("enrichment_logs").insert({
            lead_id: lead.id,
            organization_id: lead.organization_id ?? profile.organization_id ?? null,
            requested_by: uid,
            source: "perplexity",
            status: "no_data",
            fields_added: {},
            detail: "niets gevonden of alles stond er al",
          });
          results.push({ leadId: lead.id, name: lead.name, status: "no_data" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await supabase.from("enrichment_logs").insert({
          lead_id: lead.id,
          organization_id: lead.organization_id ?? profile.organization_id ?? null,
          requested_by: uid,
          source: "perplexity",
          status: "error",
          fields_added: {},
          detail: msg.slice(0, 300),
        }).then(() => {});
        results.push({ leadId: lead.id, name: lead.name, status: "error", detail: msg });
      }
    }

    return json({ results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
