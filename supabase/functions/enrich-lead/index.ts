// LEADGEN v33 — verrijking, goedkoopste-eerst:
//   Stap 1 (GRATIS): website-scan - de eigen site van de lead (home + /contact)
//     wordt gelezen en e-mailadressen/LinkedIn worden eruit gehaald.
//   Stap 2 (centen, alleen indien nodig én PERPLEXITY_API_KEY gezet): Perplexity
//     zoekt contactpersoon/functie/branche op voor wat nog ontbreekt.
// Vult ALLEEN lege velden; bronnen komen in de notities; alles wordt gelogd
// in enrichment_logs. Toegang: admin of manager met can_manage_leads.
// GEDEPLOYED als Edge Function "enrich-lead" (versie 3) op zboyxwwrbtpjnlgquhzs.
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

// ---------- GRATIS: website-scan ----------
async function fetchPage(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadGenBot/1.0)" },
    });
    if (!res.ok) return "";
    const type = res.headers.get("content-type") || "";
    if (!type.includes("text/html")) return "";
    return (await res.text()).slice(0, 400000);
  } catch {
    return "";
  } finally {
    clearTimeout(t);
  }
}

const EMAIL_NOISE = /\.(png|jpg|jpeg|gif|webp|svg|css|js)$|example\.|sentry|wixpress|@2x|@3x|schema\.org/i;

async function scanWebsite(domain: string): Promise<{ emails: string[]; linkedin: string | null }> {
  const emails = new Set<string>();
  let linkedin: string | null = null;
  for (const path of ["", "/contact", "/contact/"]) {
    if (emails.size > 0 && linkedin) break;
    for (const prefix of [`https://${domain}`, `https://www.${domain}`]) {
      const html = await fetchPage(`${prefix}${path}`);
      if (!html) continue;
      for (const m of html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []) {
        const e = m.toLowerCase();
        if (!EMAIL_NOISE.test(e) && e.length < 60) emails.add(e);
      }
      if (!linkedin) {
        const lm = html.match(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/company\/[a-zA-Z0-9-_.%]+/);
        if (lm) linkedin = lm[0];
      }
      if (html) break; // prefix werkte, andere prefix niet meer proberen
    }
  }
  // Voorkeur voor adressen op het eigen domein, daarna de rest
  const own = [...emails].filter((e) => e.endsWith(`@${domain}`) || e.includes(domain.split(".")[0]));
  const rest = [...emails].filter((e) => !own.includes(e));
  return { emails: [...own, ...rest].slice(0, 4), linkedin };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const apiKey = Deno.env.get("PERPLEXITY_API_KEY") || null;

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

    const log = (lead: { id: string; organization_id: string | null }, source: string, status: string, fields_added: Record<string, unknown>, detail: string | null) =>
      supabase.from("enrichment_logs").insert({
        lead_id: lead.id,
        organization_id: lead.organization_id ?? profile.organization_id ?? null,
        requested_by: uid,
        source,
        status,
        fields_added,
        detail,
      });

    for (const lead of leads ?? []) {
      try {
        const updates: Record<string, unknown> = {};
        const noteLines: string[] = [];
        const sources: string[] = [];
        const datum = new Date().toLocaleDateString("nl-NL");

        // ---------- STAP 1: GRATIS website-scan ----------
        const domain = cleanWebsite(lead.website || "");
        if (domain && domain.includes(".")) {
          const scan = await scanWebsite(domain);
          if (scan.emails.length && empty(lead.email)) updates.email = scan.emails[0];
          const extraMail = scan.emails.filter((e) => e !== updates.email).slice(0, 3);
          if (extraMail.length || scan.linkedin) {
            const parts = [];
            if (extraMail.length) parts.push(`e-mail: ${extraMail.join(", ")}`);
            if (scan.linkedin) parts.push(`linkedin: ${scan.linkedin}`);
            noteLines.push(`Website-scan (${datum}): ${parts.join(" | ")}`);
          }
          if (scan.emails.length || scan.linkedin) sources.push("website");
        }

        // ---------- STAP 2: Perplexity, alleen voor wat nog ontbreekt ----------
        const stillMissing = ["contact_person", "function"].filter((f) => empty((lead as Record<string, unknown>)[f]))
          .concat(empty(lead.email) && !updates.email ? ["email"] : [])
          .concat(empty(lead.extra_info1) ? ["branche"] : []);

        if (apiKey && stillMissing.length > 0) {
          const vraag = [
            `Bedrijf: ${lead.name}`,
            lead.city ? `Plaats: ${lead.city}` : null,
            domain ? `Website: ${domain}` : null,
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
                    `${vraag}\n\nGeef JSON met: contact_person (naam van eigenaar/DGA/beslisser of null), function (functietitel of null), email (zakelijk e-mailadres of null), website (domein of null), branche (korte NL-omschrijving of null), samenvatting (max 1 zin of null).`,
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

          if (found.contact_person && empty(lead.contact_person)) updates.contact_person = String(found.contact_person).slice(0, 120);
          if (found.function && empty(lead.function)) updates.function = String(found.function).slice(0, 120);
          if (found.email && empty(lead.email) && !updates.email && isEmail(found.email)) updates.email = String(found.email).trim().toLowerCase();
          if (found.website && empty(lead.website)) {
            const w = cleanWebsite(found.website);
            if (w.includes(".")) updates.website = w;
          }
          if (found.branche && empty(lead.extra_info1)) updates.extra_info1 = `Branche: ${String(found.branche).slice(0, 120)}`;
          if (Object.keys(updates).length > 0 || found.samenvatting) {
            const bronnen = citations.slice(0, 2).join(", ");
            noteLines.push(`AI-verrijkt (Perplexity, ${datum})${found.samenvatting ? `: ${String(found.samenvatting).slice(0, 160)}` : ""}${bronnen ? ` | bron: ${bronnen}` : ""}`);
            sources.push("perplexity");
          }
        }

        // ---------- Wegschrijven ----------
        if (Object.keys(updates).length > 0 || noteLines.length > 0) {
          const freshNotes = String(lead.notes || "");
          const toAppend = noteLines.filter((l) => !freshNotes.includes(l));
          if (toAppend.length) {
            updates.notes = freshNotes.trim() ? `${freshNotes}\n${toAppend.join("\n")}` : toAppend.join("\n");
          }
          if (Object.keys(updates).length === 0) {
            await log(lead, sources.join("+") || "website", "no_data", {}, "niets nieuws");
            results.push({ leadId: lead.id, name: lead.name, status: "no_data" });
            continue;
          }
          const { data: upd, error: updErr } = await supabase
            .from("leads")
            .update(updates)
            .eq("id", lead.id)
            .select("id");
          if (updErr || !upd?.length) throw new Error(updErr?.message || "update geweigerd (geen rechten)");

          const added = { ...updates };
          delete added.notes;
          await log(lead, sources.join("+") || "website", "ok", added, noteLines.join(" || ").slice(0, 300) || null);
          results.push({ leadId: lead.id, name: lead.name, status: "ok", added, sources });
        } else {
          const reden = !apiKey && !domain
            ? "geen website om te scannen en geen AI-sleutel ingesteld"
            : "niets gevonden of alles stond er al";
          await log(lead, apiKey ? "website+perplexity" : "website", "no_data", {}, reden);
          results.push({ leadId: lead.id, name: lead.name, status: "no_data", detail: reden });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await log(lead, "perplexity", "error", {}, msg.slice(0, 300)).then(() => {});
        results.push({ leadId: lead.id, name: lead.name, status: "error", detail: msg });
      }
    }

    return json({ results, aiEnabled: !!apiKey });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
