// LEADGEN v83 — mailqueue-runner: verstuurt mails uit de Mailinglijst die de
// beller heeft ingepland (public.mail_queue, status 'open', send_at voorbij).
//
// Wie roept dit aan? pg_cron (elke 5 minuten, via public.mail_queue_kick) met
// de sleutel uit Supabase Vault in header x-mailqueue-key. Er is geen
// ingelogde gebruiker; alles gaat met de service role. De sleutel komt via
// public.mailqueue_cron_key() (alleen service_role mag die functie).
//
// Regels:
// * Alleen op werkdagen tussen 08:00 en 18:00 (Europe/Amsterdam). Daarbuiten
//   doet de runner niets; de mails blijven staan tot het volgende venster.
// * Per beller max MAX_PER_UUR gelukte mails per uur (zelfde rem als
//   mailingservice), en niet twee keer dezelfde mailsoort binnen 24 uur.
//   Bij de uur-rem blijft de rij gewoon 'open' voor de volgende ronde.
// * Versturen gaat naar dezelfde bron als bij handmatig versturen
//   (MAILSERVICE_<SOURCE>_URL / _KEY). LEADGEN mailt zelf nooit.
// * Gelukt: rij op 'verzonden', lead op 'mail_verstuurd' met opvolgdatum
//   (follow_up_days van het project), activiteit op naam van de beller.
// * Mislukt: rij op 'fout' met last_error, lead blijft 'mail_gepland'. De
//   Mailinglijst toont de fout, met "Opnieuw" (zet status weer op 'open').
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MAX_PER_UUR = 40;
const MAX_PER_RONDE = 25;
const TIMEOUT_MS = 15_000;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;
const MAILSOORT_RE = /^[a-z][a-z0-9_]{1,39}$/;
const WERK_START = 8;   // 08:00 NL
const WERK_EIND = 18;   // tot 18:00 NL

function kort(v: unknown, max: number): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : undefined;
}

// Werkdag en werktijd in Nederland (zomer- en wintertijd via Intl).
function binnenWerktijd(nu = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam", weekday: "short", hour: "numeric", hour12: false,
  }).formatToParts(nu);
  const dag = parts.find((p) => p.type === "weekday")?.value || "";
  const uur = Number(parts.find((p) => p.type === "hour")?.value || "0") % 24;
  if (dag === "Sat" || dag === "Sun") return false;
  return uur >= WERK_START && uur < WERK_EIND;
}

type QueueRij = {
  id: string; agent_id: string; lead_id: string; campaign_id: string | null; organization_id: string | null;
  source: string; mail_type: string; email: string; contactpersoon: string | null; beller_naam: string | null;
  send_at: string; attempts: number;
};

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Sleutel controleren (Vault via service role)
  const gegeven = req.headers.get("x-mailqueue-key") || "";
  const { data: sleutel } = await admin.rpc("mailqueue_cron_key");
  if (!sleutel || typeof sleutel !== "string" || sleutel.length < 32 || gegeven !== sleutel) {
    return json({ error: "Geen toegang" }, 401);
  }

  const nu = new Date();
  if (!binnenWerktijd(nu)) return json({ ok: true, skipped: "buiten werktijd", verstuurd: 0 });

  const { data: rijen, error: qErr } = await admin
    .from("mail_queue")
    .select("id, agent_id, lead_id, campaign_id, organization_id, source, mail_type, email, contactpersoon, beller_naam, send_at, attempts")
    .eq("status", "open")
    .not("send_at", "is", null)
    .lte("send_at", nu.toISOString())
    .order("send_at", { ascending: true })
    .limit(MAX_PER_RONDE);
  if (qErr) { console.error("[mailqueue-runner] lezen", qErr); return json({ error: "Lezen mislukt" }, 500); }

  let verstuurd = 0, fout = 0, uitgesteld = 0;
  const perBellerDitUur = new Map<string, number>();

  for (const rij of (rijen || []) as QueueRij[]) {
    // Rij claimen: alleen wie hem nog op 'open' met dezelfde poging ziet, pakt hem.
    // Zo doen twee overlappende rondes nooit dezelfde mail.
    const { data: geclaimd } = await admin.from("mail_queue")
      .update({ attempts: rij.attempts + 1, last_attempt_at: nu.toISOString() })
      .eq("id", rij.id).eq("status", "open").eq("attempts", rij.attempts)
      .select("id").maybeSingle();
    if (!geclaimd) continue;

    const faal = async (melding: string) => {
      fout++;
      await admin.from("mail_queue").update({ status: "fout", last_error: melding.slice(0, 200) }).eq("id", rij.id);
    };

    try {
      const email = (rij.email || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { await faal("Geen geldig e-mailadres"); continue; }

      const { data: lead } = await admin.from("leads")
        .select("id, name, city, website, status, lead_list_id, organization_id, deleted_at")
        .eq("id", rij.lead_id).maybeSingle();
      if (!lead || lead.deleted_at) { await faal("Lead bestaat niet meer"); continue; }
      if (lead.status === "blacklist") { await faal("Lead staat op de blacklist"); continue; }
      if (!lead.lead_list_id) { await faal("Lead hoort niet bij een project"); continue; }

      const { data: list } = await admin.from("lead_lists").select("campaign_id").eq("id", lead.lead_list_id).maybeSingle();
      if (!list?.campaign_id) { await faal("Lead hoort niet bij een project"); continue; }

      const { data: svc } = await admin.from("campaign_mail_services")
        .select("enabled, source, mail_type, mail_types, follow_up_days")
        .eq("campaign_id", list.campaign_id).maybeSingle();
      if (!svc?.enabled) { await faal("Mailingservice staat niet (meer) aan voor dit project"); continue; }

      const toegestaan: string[] = Array.isArray(svc.mail_types) && svc.mail_types.length ? svc.mail_types : [svc.mail_type];
      const mailSoort = (kort(rij.mail_type, 40) || svc.mail_type || "").toLowerCase();
      if (!MAILSOORT_RE.test(mailSoort) || !toegestaan.includes(mailSoort)) { await faal("Deze mailsoort staat niet aan voor dit project"); continue; }

      const bronUrl = Deno.env.get(`MAILSERVICE_${svc.source}_URL`) || "";
      const bronKey = Deno.env.get(`MAILSERVICE_${svc.source}_KEY`) || "";
      if (!bronUrl.startsWith("https://") || bronKey.length < 32) { await faal(`Bron ${svc.source} is nog niet ingesteld (Supabase secrets)`); continue; }

      const { data: beller } = await admin.from("profiles")
        .select("id, full_name, email, phone, is_active, organization_id")
        .eq("id", rij.agent_id).maybeSingle();
      if (!beller || beller.is_active === false) { await faal("Account van de beller is inactief"); continue; }

      // Uur-rem per beller: niet falen, gewoon wachten op de volgende ronde.
      if (!perBellerDitUur.has(rij.agent_id)) {
        const uurGeleden = new Date(Date.now() - 3600_000).toISOString();
        const { count } = await admin.from("mailservice_logs").select("id", { count: "exact", head: true })
          .eq("agent_id", rij.agent_id).eq("ok", true).gte("created_at", uurGeleden);
        perBellerDitUur.set(rij.agent_id, count ?? 0);
      }
      if ((perBellerDitUur.get(rij.agent_id) ?? 0) >= MAX_PER_UUR) {
        uitgesteld++;
        await admin.from("mail_queue").update({ attempts: rij.attempts }).eq("id", rij.id); // poging telt niet
        continue;
      }

      const dagGeleden = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { count: dezeLead } = await admin.from("mailservice_logs").select("id", { count: "exact", head: true })
        .eq("lead_id", lead.id).eq("mail_type", mailSoort).eq("ok", true).gte("created_at", dagGeleden);
      if ((dezeLead ?? 0) > 0) { await faal("Deze lead heeft deze mail de afgelopen 24 uur al gekregen"); continue; }

      const payload = {
        mail: mailSoort,
        email,
        bedrijfsnaam: String(lead.name || "").trim().slice(0, 120) || email,
        ...(kort(rij.contactpersoon, 100) ? { contactpersoon: kort(rij.contactpersoon, 100) } : {}),
        ...(kort(lead.city, 80) ? { stad: kort(lead.city, 80) } : {}),
        ...(kort(lead.website, 200) ? { website: kort(lead.website, 200) } : {}),
        beller: {
          naam: kort(rij.beller_naam, 100) || kort(beller.full_name, 100) || String(beller.email || "").split("@")[0] || "Team",
          ...(kort(beller.phone, 30) ? { telefoon: kort(beller.phone, 30) } : {}),
        },
        lead_id: lead.id,
      };

      let ok = false;
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
          foutmelding = [400, 409, 429].includes(res.status)
            ? String(resBody?.error || "Versturen mislukt").slice(0, 200)
            : `Versturen via ${svc.source} mislukt (${res.status})`;
        }
      } catch (e) {
        foutmelding = e instanceof Error && e.name === "AbortError" ? "De mailserver reageert niet" : "Versturen mislukt";
      }

      const { data: logRow } = await admin.from("mailservice_logs").insert({
        agent_id: rij.agent_id,
        lead_id: lead.id,
        campaign_id: list.campaign_id,
        organization_id: lead.organization_id ?? beller.organization_id ?? null,
        source: svc.source,
        mail_type: mailSoort,
        email,
        ok,
        error: ok ? null : foutmelding,
      }).select("id").maybeSingle();

      if (!ok) { await faal(foutmelding); continue; }

      perBellerDitUur.set(rij.agent_id, (perBellerDitUur.get(rij.agent_id) ?? 0) + 1);
      verstuurd++;
      await admin.from("mail_queue")
        .update({ status: "verzonden", sent_at: new Date().toISOString(), sent_by: rij.agent_id, log_id: logRow?.id ?? null, last_error: null })
        .eq("id", rij.id);

      // Lead afboeken zoals bij handmatig versturen uit de Mailinglijst
      const dagen = Number(svc.follow_up_days) || 5;
      const next = new Date();
      next.setDate(next.getDate() + dagen);
      const updates: Record<string, unknown> = { status: "mail_verstuurd", next_contact_date: next.toISOString(), updated_at: new Date().toISOString() };
      if (email) updates.email = email;
      if (kort(rij.contactpersoon, 100)) updates.contact_person = kort(rij.contactpersoon, 100);
      const { error: updErr } = await admin.from("leads").update(updates).eq("id", lead.id).eq("status", "mail_gepland");
      if (updErr) console.error("[mailqueue-runner] lead bijwerken", updErr);
      await admin.from("activities").insert({
        lead_id: lead.id, user_id: rij.agent_id, action: "status_change",
        notes: `Mailingservice (${svc.source}): ${mailSoort} automatisch verstuurd naar ${email} (ingepland)`,
      });
    } catch (e) {
      console.error("[mailqueue-runner] rij", rij.id, e);
      await faal("Er ging iets mis");
    }
  }

  return json({ ok: true, verstuurd, fout, uitgesteld, bekeken: (rijen || []).length });
});
