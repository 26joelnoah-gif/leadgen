// ReachConnect v73 — Mailstop: "stuur deze lead geen herinnering meer".
//
// Boekt een beller een gemailde lead af als geen interesse, verkeerd nummer,
// blacklist of juist als klant, dan meldt het belscherm (of het bord) dat hier.
// Wij geven het door aan de bron van het project. Zonder deze melding stuurt
// MarketingKiezer vijf dagen na de infomail alsnog een opvolgmail naar een
// bureau dat aan de telefoon nee heeft gezegd.
//
// v119: stop-URL en token staan bij het project zelf (campaign_mail_services
// .stop_url en campaign_mail_secrets.token). Geen eigen stop-URL ingevuld? Dan
// leiden we hem af van de webhook-URL (.../mail -> .../stop). Niets ingevuld =
// terugval op de oude secrets MAILSERVICE_<SOURCE>_URL / _KEY.
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

// v156: ID van de bron (BeautyInfo "bi-...") uit leads.bron_lead_id.
const BRON_ID_RE = /^[A-Za-z0-9._:-]{1,100}$/;
// Afboekingen waarbij een lopend gesprek bij de bron eerst geannuleerd wordt.
const NEE_REDENEN = ["geen_interesse", "afgewezen", "verkeerd_nummer", "blacklist", "cold", "wil_annuleren"];

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
      .select("id, email, lead_list_id, deleted_at, bron_lead_id")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.deleted_at) return json({ error: "Lead niet gevonden" }, 404);
    if (!lead.lead_list_id) return json({ ok: true, gestopt: 0, reden: "lead hoort bij geen project" });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Alleen zin als deze lead ooit gemaild is; anders is er niets te stoppen.
    // v156: een lead kan meerdere rijen hebben (aanmelding + opvolging). Met
    // maybeSingle() gaf dat een fout en dus "nooit gemaild"; nu de nieuwste.
    const { data: mailRijen } = await admin
      .from("lead_mail_status")
      .select("lead_id, email, source, afspraak_status, afspraak_start")
      .eq("lead_id", leadId)
      .order("updated_at", { ascending: false })
      .limit(5);
    const mailRij = mailRijen?.[0];
    if (!mailRij) return json({ ok: true, gestopt: 0, reden: "nooit gemaild" });

    const { data: list } = await admin.from("lead_lists").select("campaign_id").eq("id", lead.lead_list_id).maybeSingle();
    if (!list?.campaign_id) return json({ ok: true, gestopt: 0, reden: "lead hoort bij geen project" });

    const { data: svc } = await admin
      .from("campaign_mail_services")
      .select("enabled, source, webhook_url, stop_url")
      .eq("campaign_id", list.campaign_id)
      .maybeSingle();
    if (!svc?.source) return json({ ok: true, gestopt: 0, reden: "geen mailingservice" });

    // v119: stop-URL en token staan bij het project (campaign_mail_services +
    // campaign_mail_secrets). Geen eigen stop-URL? Dan leiden we hem af van de
    // mail-URL (.../mail -> .../stop), net als voorheen. Niets ingevuld =
    // terugval op de oude Supabase secrets.
    const { data: geheim } = await admin
      .from("campaign_mail_secrets").select("token").eq("campaign_id", list.campaign_id).maybeSingle();
    const mailUrl = (svc.webhook_url || Deno.env.get(`MAILSERVICE_${svc.source}_URL`) || "").trim();
    const bronUrl = (svc.stop_url || stopUrlVan(mailUrl)).trim();
    const bronKey = (geheim?.token || Deno.env.get(`MAILSERVICE_${svc.source}_KEY`) || "").trim();
    if (!bronUrl.startsWith("https://") || bronKey.length < 8) {
      return json({ ok: false, error: `Bron ${svc.source} is nog niet ingesteld (stop-URL of token ontbreekt)` }, 503);
    }

    const bronId = BRON_ID_RE.test(String(lead.bron_lead_id || "").trim()) ? String(lead.bron_lead_id).trim() : leadId;
    const reden = kort(body?.reden, 200) || "afgeboekt in ReachConnect";

    // v156: /stop annuleert een gesprek bij de bron NIET. Loopt er nog een
    // kennismakingsgesprek en zei de klant nee, dan eerst DELETE /afspraken.
    // Bij "klant geworden" laten we het gesprek staan.
    const lopend = (mailRijen || []).find((r) =>
      r.source === svc.source && (r.afspraak_status === "gepland" || r.afspraak_status === "verzet") &&
      r.afspraak_start && Date.parse(r.afspraak_start) > Date.now());
    let afspraakGeannuleerd = false;
    if (lopend && NEE_REDENEN.includes(String(body?.reden || "")) && /\/mail\/?$/.test(mailUrl)) {
      const afsprakenUrl = mailUrl.replace(/\/mail\/?$/, "/afspraken");
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(afsprakenUrl, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${bronKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ lead_id: bronId, reden }),
          signal: ctrl.signal,
          redirect: "error",
        });
        clearTimeout(timer);
        await res.text().catch(() => "");
        afspraakGeannuleerd = res.ok;
        if (!res.ok && res.status !== 404) console.error(`[mailstop] afspraak annuleren gaf ${res.status}`);
        if (res.ok) {
          await admin.rpc("bron_afspraak_verwerken", {
            p_lead: leadId, p_source: svc.source, p_status: "afspraak_geannuleerd", p_op: new Date().toISOString(),
            p_start: lopend.afspraak_start, p_eind: null, p_closer: null, p_meet: null,
            p_door: "setter", p_beller: userData.user.id, p_notitie: `afgeboekt als ${reden}`,
          });
        }
      } catch (e) {
        console.error("[mailstop] afspraak annuleren mislukt", e);
      }
    }

    const payload = {
      lead_id: bronId,
      ...(mailRij.email || lead.email ? { email: String(mailRij.email || lead.email).toLowerCase() } : {}),
      reden,
    };

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(bronUrl, {
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
      return json({ ok: true, gestopt: resBody?.gestopt ?? 0, afspraak_geannuleerd: afspraakGeannuleerd });
    } catch (e) {
      console.error("[mailstop] doorgeven mislukt", e);
      return json({ ok: false, error: "De bron reageert niet" }, 502);
    }
  } catch (err) {
    console.error("[mailstop]", err);
    return json({ error: "Er ging iets mis" }, 500);
  }
});
