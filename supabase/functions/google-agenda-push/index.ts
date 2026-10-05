// ReachConnect v114 - een afspraak naar de Google-agenda van de accountmanager.
//
// Wordt aangeroepen door de database (trigger tr_leads_google_agenda ->
// public.google_agenda_push) zodra er iets aan een afspraak verandert:
// inplannen, verzetten, andere accountmanager, afboeken of verwijderen.
// De functie kijkt zelf naar de huidige stand van de lead en zet het event
// goed: aanmaken, bijwerken of weghalen.
//
// Schrijft NOOIT in public.leads (dat zou lock-, eigenaar- en compliance-
// triggers raken); de koppeling lead <-> event staat in google_agenda_events.
//
// body: { lead_id }   header: x-google-agenda-key
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { TIJDZONE, accessToken, adminClient, afspraakSoort, corsHeaders, googleFetch } from "./google.ts";

// v124: label en duur komen per afspraak uit afspraakSoort(lead.appointment_type)
const EINDSTATUS_MET_AFSPRAAK = new Set(["afspraak_gemaakt", "deal"]);

const UITKOMSTEN: Record<string, string> = {
  wil_nadenken: "Wil nadenken",
  deal: "Deal",
  betaald: "Betaald",
};

function adres(lead: Record<string, any>): string {
  const straat = [lead.address, lead.house_number].filter(Boolean).join(" ").trim();
  const plaats = [lead.postal_code, lead.city].filter(Boolean).join(" ").trim();
  return [straat, plaats].filter(Boolean).join(", ");
}

function omschrijving(lead: Record<string, any>, appUrl: string): string {
  const regels: string[] = [];
  if (lead.contact_person) regels.push(`Contactpersoon: ${lead.contact_person}`);
  if (lead.phone) regels.push(`Telefoon: ${lead.phone}`);
  if (lead.email) regels.push(`E-mail: ${lead.email}`);
  if (lead.appointment_outcome) regels.push(`Uitkomst: ${UITKOMSTEN[lead.appointment_outcome] || lead.appointment_outcome}`);
  if (lead.notes) regels.push("", String(lead.notes).slice(0, 1000));
  regels.push("", `Openen in ReachConnect: ${appUrl}/agenda`);
  regels.push("Deze afspraak wordt beheerd in ReachConnect. Wijzig hem daar, niet hier.");
  return regels.join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const admin = adminClient();

  // alleen de database mag deze functie aanroepen
  const { data: sleutel } = await admin.rpc("google_agenda_key");
  const meegestuurd = req.headers.get("x-google-agenda-key") || "";
  if (!sleutel || meegestuurd !== sleutel) return json({ error: "Geen toegang" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* leeg */ }
  const leadId = String(body.lead_id || "");
  if (!leadId) return json({ error: "lead_id ontbreekt" }, 400);

  const appUrl = (Deno.env.get("APP_URL") || "https://leadgendash.netlify.app").replace(/\/$/, "");

  const { data: lead } = await admin
    .from("leads")
    .select("id, name, contact_person, phone, email, notes, status, appointment_at, appointment_type, assigned_to, deleted_at, address, house_number, postal_code, city, appointment_outcome")
    .eq("id", leadId)
    .maybeSingle();

  const { data: koppeling } = await admin
    .from("google_agenda_events").select("*").eq("lead_id", leadId).maybeSingle();

  // Moet er een afspraak in Google staan, en bij wie?
  const wil = !!(lead && !lead.deleted_at && lead.appointment_at && lead.assigned_to
    && EINDSTATUS_MET_AFSPRAAK.has(String(lead.status)));
  const doelUser = wil ? String(lead!.assigned_to) : null;

  // 1. Staat hij nu bij de verkeerde persoon of hoort hij er niet meer te staan?
  if (koppeling && (!wil || koppeling.user_id !== doelUser)) {
    try {
      const { data: oudAccount } = await admin
        .from("google_agenda_accounts").select("*").eq("user_id", koppeling.user_id).maybeSingle();
      if (oudAccount) {
        const token = await accessToken(admin, oudAccount);
        await googleFetch(token,
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(koppeling.calendar_id)}/events/${encodeURIComponent(koppeling.event_id)}`,
          { method: "DELETE" });
      }
    } catch (e) {
      console.warn("oud event weghalen mislukt", String(e));
    }
    await admin.from("google_agenda_events").delete().eq("lead_id", leadId);
  }

  if (!wil || !doelUser) return json({ ok: true, actie: "weggehaald" });

  // 2. Heeft deze accountmanager een gekoppelde agenda die aan staat?
  const { data: account } = await admin
    .from("google_agenda_accounts").select("*").eq("user_id", doelUser).maybeSingle();
  if (!account || !account.push_enabled || !account.calendar_id) {
    return json({ ok: true, actie: "geen koppeling voor deze accountmanager" });
  }

  const soort = afspraakSoort(lead!.appointment_type);
  const start = new Date(String(lead!.appointment_at));
  const eind = new Date(start.getTime() + soort.minuten * 60 * 1000);
  const event = {
    summary: `${soort.label}: ${lead!.name || "Afspraak"}`,
    description: omschrijving(lead!, appUrl),
    location: adres(lead!) || undefined,
    start: { dateTime: start.toISOString(), timeZone: TIJDZONE },
    end: { dateTime: eind.toISOString(), timeZone: TIJDZONE },
    extendedProperties: { private: { reachconnect_lead: leadId } },
  };

  try {
    const token = await accessToken(admin, account);
    const basis = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(account.calendar_id)}/events`;

    const bestaandeId = koppeling && koppeling.user_id === doelUser ? koppeling.event_id : null;
    let res = bestaandeId
      ? await googleFetch(token, `${basis}/${encodeURIComponent(bestaandeId)}`, { method: "PATCH", body: JSON.stringify(event) })
      : await googleFetch(token, basis, { method: "POST", body: JSON.stringify(event) });

    // Handmatig weggegooid in Google? Dan maken we hem gewoon opnieuw aan.
    if (bestaandeId && (res.status === 404 || res.status === 410)) {
      await admin.from("google_agenda_events").delete().eq("lead_id", leadId);
      res = await googleFetch(token, basis, { method: "POST", body: JSON.stringify(event) });
    }

    const uitkomst = await res.json().catch(() => ({}));
    if (!res.ok || !uitkomst.id) {
      const melding = uitkomst?.error?.message || `HTTP ${res.status}`;
      await admin.from("google_agenda_accounts")
        .update({ last_error: `Afspraak kon niet in Google gezet worden: ${melding}`, last_error_at: new Date().toISOString() })
        .eq("user_id", doelUser);
      return json({ ok: false, error: melding }, 200);
    }

    await admin.from("google_agenda_events").upsert({
      lead_id: leadId,
      user_id: doelUser,
      calendar_id: account.calendar_id,
      event_id: uitkomst.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: "lead_id" });

    await admin.from("google_agenda_accounts")
      .update({ last_push_at: new Date().toISOString(), last_error: null, last_error_at: null })
      .eq("user_id", doelUser);

    return json({ ok: true, actie: bestaandeId ? "bijgewerkt" : "aangemaakt" });
  } catch (e) {
    console.error("google-agenda-push", String(e));
    return json({ ok: false, error: String(e) }, 200);
  }
});
