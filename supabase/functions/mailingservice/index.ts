// LEADGEN v69 — Mailingservice: laat de BRON van een project een mail sturen
// naar een lead. De beller klikt bij de afboekingen op "Mailingservice"; na
// succes boekt het belscherm de lead af op 'mail_verstuurd' (via
// useLeads.handleLeadDisposition, dispositie-logica blijft daar).
//
// Bron per project: public.campaign_mail_services.source (bijv. MARKETINGKIEZER).
// URL en sleutel van een bron staan ALLEEN in Supabase secrets:
//   MAILSERVICE_<SOURCE>_URL   bijv. https://marketingkiezer.nl/api/leadgen/mail
//   MAILSERVICE_<SOURCE>_KEY   zelfde waarde als LEADGEN_API_KEY bij de bron
// De inhoud van de mail bepaalt de bron zelf; LEADGEN kent de tekst niet.
//
// Contract naar de bron (POST, Authorization: Bearer <KEY>):
//   { mail, email, bedrijfsnaam, contactpersoon?, stad?, website?,
//     beller: { naam, telefoon? }, lead_id }
//
// body van het belscherm: { lead_id, email, contactpersoon?, mail?, beller_naam?, queue_id? }
// v83: rijen met status 'fout' (automatisch versturen mislukte) mogen ook
// handmatig alsnog. Het automatisch versturen zelf zit in mailqueue-runner.
// v78: queue_id = een bewaarde mail uit public.mail_queue (Mailinglijst). Dan
// komen adres, mailsoort, contactpersoon en naam uit die rij, en mag alleen wie
// hem bewaarde (of admin / manager van het project) hem versturen. Na succes
// gaat de rij op 'verzonden'.
// v70: 'mail' is de mailsoort die de beller koos (infomail/aanmeldmail). Die
// moet in campaign_mail_services.mail_types van het project staan; zonder
// keuze pakken we campaign_mail_services.mail_type als standaard.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_PER_UUR = 40;          // per beller, gelukte mails
const TIMEOUT_MS = 15_000;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const MAILSOORT_RE = /^[a-z][a-z0-9_]{1,39}$/;

function kort(v: unknown, max: number): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : undefined;
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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: caller } = await admin
      .from("profiles")
      .select("id, full_name, email, phone, is_active, organization_id, role")
      .eq("id", userData.user.id)
      .single();
    if (!caller || caller.is_active === false) return json({ error: "Je account is inactief" }, 403);

    const body = await req.json().catch(() => ({}));

    // v78: bewaarde mail uit de Mailinglijst? Dan gelden de gegevens van die rij.
    let queue: { id: string; lead_id: string; agent_id: string; campaign_id: string | null; email: string; mail_type: string; contactpersoon: string | null; beller_naam: string | null } | null = null;
    const queueId = String(body?.queue_id || "");
    if (queueId) {
      if (!/^[0-9a-f-]{36}$/i.test(queueId)) return json({ error: "Ongeldige mail uit de mailinglijst" }, 400);
      const { data: q } = await admin
        .from("mail_queue")
        .select("id, lead_id, agent_id, campaign_id, email, mail_type, contactpersoon, beller_naam, status")
        .eq("id", queueId)
        .maybeSingle();
      if (!q) return json({ error: "Deze mail staat niet (meer) in de mailinglijst" }, 404);
      // v83: een rij die automatisch mislukte ('fout') mag handmatig alsnog.
      if (q.status === "verzonden") return json({ error: "Deze mail is al verstuurd" }, 409);
      if (q.status !== "open" && q.status !== "fout") return json({ error: "Deze mail kan niet verstuurd worden" }, 409);
      if (q.agent_id !== caller.id) {
        const isAdmin = caller.role === "admin";
        let isManager = false;
        if (!isAdmin && q.campaign_id) {
          const { count } = await admin.from("campaign_managers").select("campaign_id", { count: "exact", head: true })
            .eq("campaign_id", q.campaign_id).eq("manager_id", caller.id);
          isManager = (count ?? 0) > 0;
        }
        if (!isAdmin && !isManager) return json({ error: "Alleen wie deze mail bewaarde mag hem versturen" }, 403);
      }
      queue = q;
    }

    const leadId = String(queue?.lead_id || body?.lead_id || "");
    const email = (kort(queue?.email ?? body?.email, 254) || "").toLowerCase();
    const contactpersoon = kort(queue ? queue.contactpersoon : body?.contactpersoon, 100);
    // v74: de beller mag de naam onder de mail zelf invullen (standaard zijn
    // eigen naam). Alleen voor de ondertekening en de attributie bij de bron;
    // wie er echt inlogde blijft caller.id in mailservice_logs.
    const bellerNaam = kort(queue ? queue.beller_naam : body?.beller_naam, 100);
    if (!/^[0-9a-f-]{36}$/i.test(leadId)) return json({ error: "Geen lead opgegeven" }, 400);
    if (!EMAIL_RE.test(email)) return json({ error: "Vul een geldig e-mailadres in" }, 400);

    // Toegang tot de lead = de beller kan hem zien via RLS (zelfde regels als het belscherm).
    const { data: lead } = await userClient
      .from("leads")
      .select("id, name, city, website, status, lead_list_id, organization_id, deleted_at")
      .eq("id", leadId)
      .maybeSingle();
    if (!lead || lead.deleted_at) return json({ error: "Lead niet gevonden" }, 404);
    if (lead.status === "blacklist") return json({ error: "Deze lead staat op de blacklist" }, 409);
    if (!lead.lead_list_id) return json({ error: "Lead hoort niet bij een project" }, 400);

    const { data: list } = await admin.from("lead_lists").select("campaign_id").eq("id", lead.lead_list_id).maybeSingle();
    if (!list?.campaign_id) return json({ error: "Lead hoort niet bij een project" }, 400);

    const { data: svc } = await admin
      .from("campaign_mail_services")
      .select("enabled, source, mail_type, mail_types, follow_up_days")
      .eq("campaign_id", list.campaign_id)
      .maybeSingle();
    if (!svc?.enabled) return json({ error: "Mailingservice staat niet aan voor dit project" }, 403);

    // v70: welke mail wil de beller sturen? Alleen wat dit project mag.
    const toegestaan: string[] = Array.isArray(svc.mail_types) && svc.mail_types.length
      ? svc.mail_types
      : [svc.mail_type];
    const gevraagd = (kort(queue ? queue.mail_type : body?.mail, 40) || "").toLowerCase();
    const mailSoort = gevraagd || svc.mail_type;
    if (!MAILSOORT_RE.test(mailSoort) || !toegestaan.includes(mailSoort)) {
      return json({ error: "Deze mailsoort staat niet aan voor dit project" }, 400);
    }

    const bronUrl = Deno.env.get(`MAILSERVICE_${svc.source}_URL`) || "";
    const bronKey = Deno.env.get(`MAILSERVICE_${svc.source}_KEY`) || "";
    if (!bronUrl.startsWith("https://") || bronKey.length < 32) {
      return json({ error: `Bron ${svc.source} is nog niet ingesteld (Supabase secrets)` }, 503);
    }

    // Rem: max gelukte mails per beller per uur, en niet twee keer per dag
    // DEZELFDE mail naar dezelfde lead (v70: per mailsoort, zodat een beller na
    // de infomail nog wel dezelfde dag de aanmeldmail kan sturen).
    const uurGeleden = new Date(Date.now() - 3600_000).toISOString();
    const { count: perUur } = await admin
      .from("mailservice_logs").select("id", { count: "exact", head: true })
      .eq("agent_id", caller.id).eq("ok", true).gte("created_at", uurGeleden);
    if ((perUur ?? 0) >= MAX_PER_UUR) return json({ error: "Je hebt het maximum aantal mails per uur bereikt" }, 429);

    const dagGeleden = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: dezeLead } = await admin
      .from("mailservice_logs").select("id", { count: "exact", head: true })
      .eq("lead_id", lead.id).eq("mail_type", mailSoort).eq("ok", true).gte("created_at", dagGeleden);
    if ((dezeLead ?? 0) > 0) return json({ error: "Deze lead heeft deze mail de afgelopen 24 uur al gekregen" }, 409);

    const payload = {
      mail: mailSoort,
      email,
      bedrijfsnaam: String(lead.name || "").trim().slice(0, 120) || email,
      ...(contactpersoon ? { contactpersoon } : {}),
      ...(kort(lead.city, 80) ? { stad: kort(lead.city, 80) } : {}),
      ...(kort(lead.website, 200) ? { website: kort(lead.website, 200) } : {}),
      beller: {
        naam: bellerNaam || kort(caller.full_name, 100) || String(caller.email || "").split("@")[0] || "Team",
        ...(kort(caller.phone, 30) ? { telefoon: kort(caller.phone, 30) } : {}),
      },
      lead_id: lead.id,
    };

    let ok = false;
    let status = 502;
    let foutmelding = "";
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
      ok = res.ok && resBody?.success === true;
      if (!ok) {
        // Alleen gebruikersvriendelijke meldingen van de bron doorgeven; 401/5xx = configuratie.
        status = [400, 409, 429].includes(res.status) ? res.status : 502;
        foutmelding = status === 502
          ? `Versturen via ${svc.source} mislukt (${res.status})`
          : String(resBody?.error || "Versturen mislukt").slice(0, 200);
      }
    } catch (e) {
      foutmelding = e instanceof Error && e.name === "AbortError" ? "De mailserver reageert niet" : "Versturen mislukt";
    }

    const { data: logRow } = await admin.from("mailservice_logs").insert({
      agent_id: caller.id,
      lead_id: lead.id,
      campaign_id: list.campaign_id,
      organization_id: lead.organization_id ?? caller.organization_id ?? null,
      source: svc.source,
      mail_type: mailSoort,
      email,
      ok,
      error: ok ? null : foutmelding,
    }).select("id").maybeSingle();

    if (!ok) return json({ error: foutmelding }, status);

    // v78: bewaarde mail is nu weg -> rij afvinken (service role, de app mag dit niet zelf)
    if (queue) {
      await admin.from("mail_queue")
        .update({ status: "verzonden", sent_at: new Date().toISOString(), sent_by: caller.id, log_id: logRow?.id ?? null, last_error: null })
        .eq("id", queue.id);
    }
    return json({ ok: true, email, source: svc.source, mail_type: mailSoort, follow_up_days: svc.follow_up_days });
  } catch (err) {
    console.error("[mailingservice]", err);
    return json({ error: "Er ging iets mis" }, 500);
  }
});
