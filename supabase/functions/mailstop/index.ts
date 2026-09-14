// LEADGEN v73 — Mailstop: "stuur deze lead geen herinnering meer".
//
// Boekt een beller een gemailde lead af als geen interesse, verkeerd nummer,
// blacklist of juist als klant, dan meldt het belscherm (of het bord) dat hier.
// Wij geven het door aan de bron van het project. Zonder deze melding stuurt
// MarketingKiezer vijf dagen na de infomail alsnog een opvolgmail naar een
// bureau dat aan de telefoon nee heeft gezegd.
//
// URL en sleutel komen uit dezelfde secrets als de Mailingservice:
//   MAILSERVICE_<SOURCE>_URL   bijv. https://marketingkiezer.nl/api/leadgen/mail
//   MAILSERVICE_<SOURCE>_KEY
// De stop-route van de bron is hetzelfde pad met /stop in plaats van /mail.
//
// body: { lead_id, reden? }
// Antwoordt altijd 200 zodra de lead bestaat: een afboeking mag nooit
// stuklopen omdat de bron even niet reageert.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEOUT_MS = 8_000;

function kort(v: unknown, max: number): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : undefined;
}

/** .../api/leadgen/mail -> .../api/leadgen/stop */
function stopUrlVan(mailUrl: string): string {
  return mailUrl.replace(/\/mail\/?$/, "/stop");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Niet ingelogd" }, 401);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Niet ingelogd" }, 401);

    const body = await req.json().catch(() => ({}));
    const leadId = String(body?.lead_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(leadId)) return json({ error: "Geen lead opgegeven" }, 400);

    // Toegang tot de lead via RLS, net als bij de Mailingservice.
    const { data: lead } = await userClient
      .from("leads")
      .select("id, email, lead_list_id, deleted_at")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.deleted_at) return json({ error: "Lead niet gevonden" }, 404);
    if (!lead.lead_list_id) return json({ ok: true, gestopt: 0, reden: "lead hoort bij geen project" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Alleen zin als deze lead ooit gemaild is; anders is er niets te stoppen.
    const { data: mailRij } = await admin
      .from("lead_mail_status")
      .select("lead_id, email")
      .eq("lead_id", leadId)
      .maybeSingle();
    if (!mailRij) return json({ ok: true, gestopt: 0, reden: "nooit gemaild" });

    const { data: list } = await admin.from("lead_lists").select("campaign_id").eq("id", lead.lead_list_id).maybeSingle();
    if (!list?.campaign_id) return json({ ok: true, gestopt: 0, reden: "lead hoort bij geen project" });

    const { data: svc } = await admin
      .from("campaign_mail_services")
      .select("enabled, source")
      .eq("campaign_id", list.campaign_id)
      .maybeSingle();
    if (!svc?.source) return json({ ok: true, gestopt: 0, reden: "geen mailingservice" });

    const bronUrl = Deno.env.get(`MAILSERVICE_${svc.source}_URL`) || "";
    const bronKey = Deno.env.get(`MAILSERVICE_${svc.source}_KEY`) || "";
    if (!bronUrl.startsWith("https://") || bronKey.length < 32) {
      return json({ ok: false, error: `Bron ${svc.source} is nog niet ingesteld (Supabase secrets)` }, 503);
    }

    const payload = {
      lead_id: leadId,
      ...(mailRij.email || lead.email ? { email: String(mailRij.email || lead.email).toLowerCase() } : {}),
      reden: kort(body?.reden, 200) || "afgeboekt in LEADGEN",
    };

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(stopUrlVan(bronUrl), {
        method: "POST",
        headers: { Authorization: `Bearer ${bronKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
        redirect: "error",
      });
      clearTimeout(timer);
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`[mailstop] bron ${svc.source} gaf ${res.status}`);
        return json({ ok: false, error: `Stoppen bij ${svc.source} mislukt (${res.status})` }, 502);
      }
      return json({ ok: true, gestopt: resBody?.gestopt ?? 0 });
    } catch (e) {
      console.error("[mailstop] doorgeven mislukt", e);
      return json({ ok: false, error: "De bron reageert niet" }, 502);
    }
  } catch (err) {
    console.error("[mailstop]", err);
    return json({ error: "Er ging iets mis" }, 500);
  }
});
