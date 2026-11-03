// ReachConnect v154 — Bron-afspraken: kennismakingsgesprek inplannen bij de
// closer van de mailbron (BeautyInfo, via cal.com).
//
// De beller kiest in het belscherm een tijd. Deze functie praat namens hem met
// de bron, zodat de sleutel nooit in de browser komt:
//   { lead_id, actie: "tijden", from?, to? }  -> GET  <bron>/afspraken?lead_id&from&to
//   { lead_id, actie: "boeken", start }       -> POST <bron>/afspraken
// De URL wordt afgeleid van de webhook-URL van het project
// (.../api/reachconnect/mail -> .../api/reachconnect/afspraken), de sleutel is
// dezelfde als bij de Mailingservice (campaign_mail_secrets, of de oude secret
// MAILSERVICE_<BRON>_KEY).
//
// Na een geslaagde boeking zet public.bron_afspraak_verwerken de lead meteen op
// 'afspraak_gemaakt' (videocall, tijd, meet-link) op naam van deze beller, met
// een call_logs-rij. De statusupdate afspraak_gepland die de bron daarna stuurt
// (mailstatus) werkt dan alleen nog tijd en link bij: geen dubbele telling.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEOUT_MS = 12_000;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function kort(v: unknown, max: number): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : undefined;
}

// Zelfde regel als mailingservice (v119): alleen https met een gewone domeinnaam.
function veiligeUrl(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.protocol !== "https:") return false;
    const h = x.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^[0-9.]+$/.test(h) || h.includes(":")) return false;
    return true;
  } catch {
    return false;
  }
}

/** .../api/reachconnect/mail -> .../api/reachconnect/afspraken */
function afsprakenUrlVan(mailUrl: string): string {
  return mailUrl.replace(/\/mail\/?$/, "/afspraken");
}

// Antwoord van de bron in gewone taal voor de beller.
const UITLEG: Record<number, string> = {
  400: "De bron keurt de aanvraag af (tijd in het verleden of gegevens ontbreken).",
  401: "De bron accepteert onze sleutel niet. Laat de beheerder de Mailingservice-instellingen checken.",
  403: "De bron accepteert onze sleutel niet. Laat de beheerder de Mailingservice-instellingen checken.",
  404: "Deze lead is bij de bron nog niet aangemeld. Stuur eerst de aanmeldmail via Mailingservice.",
  409: "Die tijd is net bezet. Kies een andere tijd.",
  502: "Storing bij de agenda van de bron. Probeer het zo opnieuw.",
  503: "Inplannen kan nu niet. Gebruik de boekingslink.",
};

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
    const user = userData?.user;
    if (userErr || !user) return json({ error: "Niet ingelogd" }, 401);

    const body = await req.json().catch(() => ({}));
    const leadId = String(body?.lead_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(leadId)) return json({ error: "Geen lead opgegeven" }, 400);
    const actie = body?.actie === "boeken" ? "boeken" : "tijden";

    // Toegang tot de lead via RLS van de beller.
    const { data: lead } = await userClient
      .from("leads").select("id, name, lead_list_id, deleted_at").eq("id", leadId).maybeSingle();
    if (!lead || lead.deleted_at) return json({ error: "Lead niet gevonden" }, 404);
    if (!lead.lead_list_id) return json({ error: "Lead hoort bij geen project" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Rem: 60 aanroepen per uur per beller (tijden ophalen + boeken samen).
    try {
      const { data: teVeel } = await admin.rpc("rate_limit_hit", {
        p_key: `bron-afspraken:${user.id}`, p_max: 60, p_window_seconds: 3600,
      });
      if (teVeel === true) return json({ error: "Te vaak geprobeerd. Wacht even en probeer het opnieuw." }, 429);
    } catch { /* faalt open */ }

    const { data: list } = await admin.from("lead_lists").select("campaign_id").eq("id", lead.lead_list_id).maybeSingle();
    if (!list?.campaign_id) return json({ error: "Lead hoort bij geen project" }, 400);
    const { data: svc } = await admin
      .from("campaign_mail_services").select("enabled, source, webhook_url")
      .eq("campaign_id", list.campaign_id).maybeSingle();
    if (!svc?.source || svc.enabled === false) return json({ error: "Geen mailbron in dit project" }, 400);

    const { data: geheim } = await admin
      .from("campaign_mail_secrets").select("token").eq("campaign_id", list.campaign_id).maybeSingle();
    const mailUrl = (svc.webhook_url || Deno.env.get(`MAILSERVICE_${svc.source}_URL`) || "").trim();
    const bronUrl = afsprakenUrlVan(mailUrl);
    const bronKey = (geheim?.token || Deno.env.get(`MAILSERVICE_${svc.source}_KEY`) || "").trim();
    if (!veiligeUrl(bronUrl) || bronUrl === mailUrl || bronKey.length < 8) {
      return json({ error: `Bron ${svc.source} is nog niet ingesteld voor afspraken` }, 503);
    }

    const roep = async (url: string, init: RequestInit) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: "error" });
        const tekst = await res.text();
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(tekst); } catch { /* geen json */ }
        return { status: res.status, data, tekst };
      } finally {
        clearTimeout(timer);
      }
    };
    const fout = (status: number, data: Record<string, unknown>) => {
      const vanBron = kort(data?.error, 200) || kort(data?.message, 200);
      return json({
        error: UITLEG[status] || `De bron gaf een fout (${status}).`,
        bron_status: status,
        ...(vanBron ? { bron_melding: vanBron } : {}),
        ...(typeof data?.boekingslink === "string" ? { boekingslink: data.boekingslink } : {}),
      }, status === 409 ? 409 : 502);
    };

    if (actie === "tijden") {
      const q = new URLSearchParams({ lead_id: leadId });
      const from = kort(body?.from, 10);
      const to = kort(body?.to, 10);
      if (from && DATUM.test(from)) q.set("from", from);
      if (to && DATUM.test(to)) q.set("to", to);
      let r;
      try {
        r = await roep(`${bronUrl}?${q}`, { method: "GET", headers: { Authorization: `Bearer ${bronKey}` } });
      } catch (e) {
        console.error("[bron-afspraken] tijden", e);
        return json({ error: "De bron reageert niet. Probeer het zo opnieuw." }, 502);
      }
      if (r.status < 200 || r.status >= 300) return fout(r.status, r.data);
      const slots = r.data?.slots && typeof r.data.slots === "object" ? r.data.slots : {};
      return json({
        ok: true,
        bron: svc.source,
        timezone: r.data?.timezone || "Europe/Amsterdam",
        boekingslink: typeof r.data?.boekingslink === "string" && r.data.boekingslink.startsWith("https://") ? r.data.boekingslink : null,
        slots,
      });
    }

    // Boeken
    const start = kort(body?.start, 40);
    if (!start || !Number.isFinite(Date.parse(start))) return json({ error: "Kies eerst een tijd" }, 400);
    const { data: prof } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    const naam = kort(prof?.full_name, 120) || user.email || "Beller";

    let r;
    try {
      r = await roep(bronUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${bronKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId, start, beller: { naam } }),
      });
    } catch (e) {
      console.error("[bron-afspraken] boeken", e);
      return json({ error: "De bron reageert niet. Check of de afspraak toch gelukt is voor je opnieuw probeert." }, 502);
    }
    if (r.status < 200 || r.status >= 300 || r.data?.booked === false) return fout(r.status, r.data);

    const startDef = kort(r.data?.start, 40) || start;
    const meet = kort(r.data?.meeting_url, 500);
    const { data: verwerkt, error: verwerkFout } = await admin.rpc("bron_afspraak_verwerken", {
      p_lead: leadId, p_source: svc.source, p_status: "afspraak_gepland", p_op: new Date().toISOString(),
      p_start: new Date(Date.parse(startDef)).toISOString(),
      p_eind: r.data?.end && Number.isFinite(Date.parse(String(r.data.end))) ? new Date(Date.parse(String(r.data.end))).toISOString() : null,
      p_closer: kort(r.data?.closer, 80) || null,
      p_meet: meet && meet.startsWith("https://") ? meet : null,
      p_door: "setter", p_beller: user.id, p_notitie: kort(body?.notitie, 500) || null,
    });
    if (verwerkFout) {
      // De afspraak staat WEL bij de bron. Melden, zodat de beller handmatig afboekt.
      console.error("[bron-afspraken] lead bijwerken mislukt", verwerkFout.message);
      return json({ ok: true, geboekt: true, lead_bijgewerkt: false, start: startDef, closer: r.data?.closer ?? null, meeting_url: meet ?? null });
    }
    return json({
      ok: true, geboekt: true, lead_bijgewerkt: true, verwerkt,
      start: startDef, end: r.data?.end ?? null, closer: r.data?.closer ?? null, meeting_url: meet ?? null,
    });
  } catch (err) {
    console.error("[bron-afspraken]", err);
    return json({ error: "Er ging iets mis" }, 500);
  }
});
