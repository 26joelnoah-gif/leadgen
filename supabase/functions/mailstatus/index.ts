// ReachConnect v70 — Mailstatus: de BRON meldt terug hoe ver een gemailde lead komt.
//
// MarketingKiezer (of een andere bron) post hier elke stap naartoe zodra die
// gebeurt. ReachConnect slaat het op bij de lead (public.lead_mail_status) en het
// belscherm laat het live zien.
//
//   POST https://<project>.supabase.co/functions/v1/mailstatus
//   Authorization: Bearer <MAILSTATUS_KEY>      (ook goed: x-reachconnect-key,
//                                               of de oude namen x-leadgen-key / x-api-key)
//   {
//     "lead_id": "uuid van de ReachConnect-lead",
//     "email": "info@bureau.nl",
//     "bureau": "Bureau BV",
//     "mail_soort": "introductie",
//     "status": "offerte_open",
//     "status_op": "2026-09-14T18:00:00.000Z",
//     "offerte_url": "https://..."
//   }
//   Optioneel: "source" (standaard MARKETINGKIEZER).
//
//   Knop "Bel mij terug" (status "terugbellen") werkt anders: dat is geen
//   funnelstap. Verplicht dan: "naam" (wie het formulier invulde). Optioneel:
//   "telefoon" en "wens" (snel/ochtend/middag). Maakt een nieuwe lead aan in
//   de lijst "Bel mij terug" van hetzelfde project + een melding voor de
//   eigenaar/managers.
//
//   v98: status "afgemeld" = afmelden voor alle kanalen (afmeldlijst, niet meer
//   bellen, binnen 48 uur gewist). Status "later_mailen" = alleen mails pauzeren
//   (optioneel "later_op", standaard 90 dagen).
//
// De sleutel staat in Supabase secret MAILSTATUS_KEY; bij de bron is dat
// dezelfde waarde (in Netlify: LEADGEN_STATUS_KEY).
// verify_jwt = false: de bron is een server, geen ingelogde gebruiker.
//
// Stappen en volgorde (status_rank). Een melding die te laat of dubbel
// binnenkomt zet de lead nooit terug: elke stap krijgt een eigen datumkolom en
// alleen een HOGERE stap verandert de huidige status.
//
// v122 (2026-10-02): het NIEUWE formaat van BeautyInfo (webhook-spec van 02-10):
//   POST .../mailstatus?source=BEAUTYINFO
//   { lead_id, status, event_id, occurred_at, stage, details }
// - Herkenning: zit er een event_id in, dan is het dit formaat.
// - source mag ook als ?source= in de URL (BeautyInfo stuurt hem niet in de body).
// - occurred_at telt als status_op; event_id wordt bewaard in lead_mail_events
//   (uniek per bron) zodat een herhaalpoging nooit twee keer verwerkt wordt.
// - Alle 19 statussen uit de spec zitten in EVENTS: funnelstap (rang),
//   fase (voortgangsbalk), of de klant NU op de pagina is, en of er een
//   terugbelactie nodig is (bounced, mail_mislukt, checkout_verlaten, ...).
// - Antwoord is in dit formaat ALTIJD 2xx, ook bij een onbekende lead of een
//   onbekende status, anders blijft de bron 8 keer herhalen. Alleen een
//   verkeerde sleutel geeft 401.
// - "geopend" betekent in dit formaat "mail geopend" (rang 1, onbetrouwbaar),
//   NIET "offerte open" zoals in het oude MK-formaat. Synoniemen gelden daarom
//   alleen voor het oude formaat.
// - "afgemeld" in dit formaat is de echo van ONZE /stop-aanroep (beller zette
//   geen interesse). Dat is geen opt-out, dus GEEN blokkeer_lead; we leggen het
//   alleen vast. In het oude formaat blijft afgemeld = echte afmelding (v98).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-reachconnect-key, x-leadgen-key, x-api-key",
};

// stap -> rang + kolom waarin de datum van die stap wordt bewaard
const STAPPEN: Record<string, { rang: number; kolom: string }> = {
  gemaild:      { rang: 1, kolom: "gemaild_op" },
  link_geklikt: { rang: 2, kolom: "geklikt_op" },
  offerte_open: { rang: 3, kolom: "offerte_open_op" },
  getekend:     { rang: 4, kolom: "getekend_op" },
  betaald:      { rang: 5, kolom: "betaald_op" },
};

// v122: alle gebeurtenissen die een bron kan melden (nieuwe formaat), en wat
// ReachConnect ermee doet.
//   stap   = welke funnelstap uit STAPPEN deze gebeurtenis bewijst (of null:
//            geen stap vooruit, alleen vastleggen)
//   fase   = mail | bezoek | betaling | klant | einde (voortgangsbalk)
//   actie  = true: terugbellen aan te raden (komt in lead_mail_status.actie_nodig)
//   live   = 'aan' | 'uit': klant is nu wel/niet op de aanmeldpagina
//   bel    = true: dit is een belmoment -> melding voor de beller (1x per stap)
type EventInfo = { stap: string | null; fase: string; actie?: boolean; live?: "aan" | "uit"; bel?: boolean };
const EVENTS: Record<string, EventInfo> = {
  // Mail
  gemaild:               { stap: "gemaild", fase: "mail" },
  herinnering_verstuurd: { stap: "gemaild", fase: "mail" },
  bezorgd:               { stap: "gemaild", fase: "mail" },
  geopend:               { stap: "gemaild", fase: "mail" },           // tracking-pixel, indicatief
  mail_mislukt:          { stap: null, fase: "mail", actie: true },
  bounced:               { stap: null, fase: "mail", actie: true },
  spam_melding:          { stap: null, fase: "mail", actie: true },
  // Bezoek aan de pagina
  link_geklikt:          { stap: "link_geklikt", fase: "bezoek" },
  pagina_bekeken:        { stap: "link_geklikt", fase: "bezoek" },
  pagina_actief:         { stap: "link_geklikt", fase: "bezoek", live: "aan", bel: true },
  pagina_verlaten:       { stap: "link_geklikt", fase: "bezoek", live: "uit" },
  // Betaling. checkout_gestart = "bij het betalen" = zelfde warmte als
  // offerte_open bij MarketingKiezer (rang 3), dus het bord behandelt hem gelijk.
  checkout_gestart:      { stap: "offerte_open", fase: "betaling", bel: true },
  checkout_verlaten:     { stap: null, fase: "betaling", actie: true },
  betaling_mislukt:      { stap: null, fase: "betaling", actie: true },
  betaald:               { stap: "betaald", fase: "betaling" },
  // Klant / abonnement
  welkomstmail_verstuurd:{ stap: "betaald", fase: "klant" },
  abonnement_verlengd:   { stap: "betaald", fase: "klant" },
  abonnement_opgezegd:   { stap: null, fase: "klant", actie: true },
  // Einde (echo van onze /stop, zie boven)
  afgemeld:              { stap: null, fase: "einde" },
  // Oude MK-stappen, zodat beide formaten dezelfde tabel gebruiken
  offerte_open:          { stap: "offerte_open", fase: "betaling", bel: true },
  getekend:              { stap: "getekend", fase: "betaling" },
};
const FASES = ["mail", "bezoek", "betaling", "klant", "einde"];

// Zelfde stap, andere naam bij de bron. Zo hoeft niemand te gokken.
// Alleen voor het OUDE formaat (zonder event_id), zie v122 hierboven.
const SYNONIEMEN: Record<string, string> = {
  verstuurd: "gemaild",
  mail_verstuurd: "gemaild",
  geklikt: "link_geklikt",
  link_geklikt_op: "link_geklikt",
  geopend: "offerte_open",
  offerte_geopend: "offerte_open",
  offerte_open: "offerte_open",
  ondertekend: "getekend",
};

const SLUG = /^[a-z][a-z0-9_]{1,39}$/;
const BRON = /^[A-Z][A-Z0-9_]{1,39}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function kort(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
}

// Vergelijking die niet sneller stopt bij de eerste verkeerde letter.
function zelfdeSleutel(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sleutelUitRequest(req: Request): string {
  const auth = req.headers.get("Authorization") || "";
  if (/^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  // v118: x-reachconnect-key is de naam van nu. x-leadgen-key blijft erin omdat
  // MarketingKiezer daarmee stuurt; die kan pas weg samen met de MK-repo.
  return (req.headers.get("x-reachconnect-key") || req.headers.get("x-leadgen-key") || req.headers.get("x-api-key") || auth).trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);

  try {
    const verwacht = Deno.env.get("MAILSTATUS_KEY") || "";
    if (verwacht.length < 32) return json({ error: "MAILSTATUS_KEY is niet ingesteld" }, 503);
    if (!zelfdeSleutel(sleutelUitRequest(req), verwacht)) return json({ error: "Geen toegang" }, 401);

    const body = await req.json().catch(() => ({}));

    // v122: nieuw formaat = er zit een event_id in. Dan antwoorden we bij
    // alles behalve een verkeerde sleutel met 200, anders blijft de bron herhalen.
    const eventId = kort(body?.event_id, 80);
    const nieuwFormaat = !!eventId;
    const ok200 = (extra: Record<string, unknown>) => json({ received: true, ...extra }, 200);

    const sourceRuw = kort(body?.source, 40) || new URL(req.url).searchParams.get("source") || "MARKETINGKIEZER";
    const source = sourceRuw.trim().toUpperCase();
    if (!BRON.test(source)) {
      return nieuwFormaat ? ok200({ genegeerd: "source klopt niet" }) : json({ error: "source klopt niet" }, 400);
    }

    const ruweStatus = (kort(body?.status, 40) || "").toLowerCase();
    // Synoniemen alleen in het oude formaat: "geopend" is daar "offerte open",
    // bij BeautyInfo is het "mail geopend".
    const status = nieuwFormaat ? ruweStatus : (SYNONIEMEN[ruweStatus] || ruweStatus);
    if (!SLUG.test(status)) {
      return nieuwFormaat ? ok200({ genegeerd: "status ontbreekt" }) : json({ error: "status ontbreekt of klopt niet" }, 400);
    }

    // Testbericht uit het beheerpaneel van de bron: niets opslaan, wel 200.
    if (status === "test") return ok200({ test: true, source });

    const leadId = String(body?.lead_id || "");
    if (!UUID.test(leadId)) {
      return nieuwFormaat ? ok200({ genegeerd: "lead_id is geen ReachConnect-lead" }) : json({ error: "lead_id ontbreekt of klopt niet" }, 400);
    }

    const details = body?.details && typeof body.details === "object" && !Array.isArray(body.details) ? body.details : null;

    // Mailsoort: oud formaat stuurt mail_soort, nieuw formaat soms details.mail_type.
    // Ontbreekt hij, dan pakken we verderop de bestaande rij van deze lead + bron.
    const mailSoortRuw = (kort(body?.mail_soort, 40) || kort(details?.mail_type, 40) || "").toLowerCase();
    if (mailSoortRuw && !SLUG.test(mailSoortRuw)) {
      return nieuwFormaat ? ok200({ genegeerd: "mail_type klopt niet" }) : json({ error: "mail_soort klopt niet" }, 400);
    }

    const stageRuw = (kort(body?.stage, 40) || "").toLowerCase();

    // Datum van de stap (oud: status_op, nieuw: occurred_at); rare of
    // ontbrekende datum wordt gewoon nu.
    const opRaw = kort(body?.occurred_at, 40) || kort(body?.status_op, 40);
    const opMs = opRaw ? Date.parse(opRaw) : NaN;
    const nu = Date.now();
    const statusOp = new Date(
      Number.isFinite(opMs) && opMs > nu - 365 * 24 * 3600_000 && opMs < nu + 10 * 60_000 ? opMs : nu,
    ).toISOString();

    const offerteUrlRuw = kort(body?.offerte_url, 500);
    const offerteUrl = offerteUrlRuw && offerteUrlRuw.startsWith("https://") ? offerteUrlRuw : null;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lead } = await admin
      .from("leads").select("id, name, phone, email, organization_id, lead_list_id, deleted_at, assigned_to, locked_by")
      .eq("id", leadId).maybeSingle();
    if (!lead || lead.deleted_at) {
      return nieuwFormaat ? ok200({ genegeerd: "lead onbekend of verwijderd" }) : json({ error: "Lead niet gevonden" }, 404);
    }

    let campaignId: string | null = null;
    if (lead.lead_list_id) {
      const { data: list } = await admin.from("lead_lists").select("campaign_id").eq("id", lead.lead_list_id).maybeSingle();
      campaignId = list?.campaign_id ?? null;
    }

    // Mailsoort definitief: meegestuurd, anders de bestaande rij van deze lead
    // bij deze bron (nieuwste), anders de eerste soort die de bron kent.
    let mailSoort = mailSoortRuw;
    if (!mailSoort) {
      const { data: rijen } = await admin
        .from("lead_mail_status").select("mail_soort")
        .eq("lead_id", lead.id).eq("source", source)
        .order("updated_at", { ascending: false }).limit(1);
      mailSoort = rijen?.[0]?.mail_soort || (source === "BEAUTYINFO" ? "aanmelding" : "introductie");
    }

    // v122: elke gebeurtenis ruw vastleggen. Hetzelfde event_id van dezelfde
    // bron nog een keer (herhaalpoging) = klaar, 200 terug, niets opnieuw doen.
    let ev: EventInfo | undefined = EVENTS[status];
    if (nieuwFormaat) {
      // Afmelding in het nieuwe formaat = echo van onze /stop; geen opt-out.
      // Terugbellen/later_mailen hebben hun eigen afhandeling en slaan dit over.
      if (status !== "terugbellen" && status !== "later_mailen") {
        const { error: evFout } = await admin.from("lead_mail_events").insert({
          lead_id: lead.id, source, mail_soort: mailSoort, event_id: eventId,
          status, stage: SLUG.test(stageRuw) ? stageRuw : null, occurred_at: statusOp,
          details, organization_id: lead.organization_id ?? null, campaign_id: campaignId,
        });
        if (evFout) {
          if (evFout.code === "23505") return ok200({ dubbel: true, event_id: eventId });
          console.error("[mailstatus] event opslaan mislukt", evFout.message);
          // Niet stoppen: de samenvatting hieronder kan nog wel.
        }
      }
    } else if (status === "afgemeld" || status === "uitgeschreven" || status === "unsubscribe") {
      ev = undefined; // oud formaat: echte afmelding, afhandeling hieronder (v98)
    }

    // v89: knop "Bel mij terug" (MarketingKiezer, 21 sep 2026) - GEEN stap in
    // de mailfunnel hieronder (rang/vooruit): een bureau dat al verder stond
    // (bv. offerte open) mag ook om een belletje vragen, en dat werd tot nu
    // toe stilletjes genegeerd omdat een lagere "rang" nooit won. Zo iemand
    // moet een beller ECHT zien, dus dit maakt er een aparte, nieuwe lead van
    // in de lijst "Bel mij terug" binnen hetzelfde project (i.p.v. hem te
    // verstoppen in lead_mail_status) en stuurt meteen een melding.
    if (status === "terugbellen") {
      const naam = kort(body?.naam, 120);
      if (!naam) return json({ error: "naam ontbreekt" }, 400);

      const telefoonRuw = kort(body?.telefoon, 40);
      const telefoon = telefoonRuw && /^[0-9+()\s-]{6,40}$/.test(telefoonRuw) ? telefoonRuw : null;
      const wensRuw = (kort(body?.wens, 20) || "").toLowerCase();
      const WENS_LABELS: Record<string, string> = {
        snel: "Zo snel mogelijk", ochtend: "Liefst in de ochtend", middag: "Liefst in de middag",
      };
      const wensLabel = WENS_LABELS[wensRuw] || null;

      const bureauNaam = kort(body?.bureau, 160) ?? kort(lead.name, 160) ?? "Onbekend bureau";
      const telefoonVoorLead = telefoon || (lead.phone as string | null) || null;
      if (!telefoonVoorLead) return json({ error: "Geen telefoonnummer bekend" }, 400);

      // Lijst "Bel mij terug" binnen hetzelfde project; bestaat hij nog niet
      // (eerste terugbelverzoek van dit project), dan maken we hem aan. Geen
      // project bekend (zeldzaam) -> terug in dezelfde lijst als het origineel,
      // dan verdwijnt het verzoek in elk geval niet.
      let targetListId: string | null = null;
      if (campaignId) {
        const { data: bestaandeLijst } = await admin
          .from("lead_lists").select("id")
          .eq("campaign_id", campaignId).eq("name", "Bel mij terug").is("deleted_at", null)
          .maybeSingle();
        if (bestaandeLijst) {
          targetListId = bestaandeLijst.id as string;
        } else {
          const { data: nieuweLijst, error: lijstFout } = await admin
            .from("lead_lists")
            .insert({ name: "Bel mij terug", campaign_id: campaignId })
            .select("id").single();
          if (lijstFout) console.error("[mailstatus] lijst 'Bel mij terug' aanmaken mislukt", lijstFout.message);
          targetListId = nieuweLijst?.id ?? null;
        }
      }
      if (!targetListId) targetListId = lead.lead_list_id as string | null;

      const eigenaar = (lead.assigned_to as string | null) || (lead.locked_by as string | null);
      const toestemmingTekst = `Knop "Bel mij terug" in mail van ${source}, ingevuld door ${naam} op ${statusOp.slice(0, 16).replace("T", " ")} (UTC)${telefoon ? ", nummer " + telefoon : ""}.`;

      // v92: niet dubbel aanmaken. Klikt hetzelfde bureau (zelfde
      // telefoonnummer, binnen dezelfde "Bel mij terug"-lijst) nog een keer,
      // dan werken we de bestaande lead bij i.p.v. een nieuwe te maken.
      const { data: bestaandeTerugbel } = await admin
        .from("leads")
        .select("id, notes")
        .eq("lead_list_id", targetListId)
        .eq("phone", telefoonVoorLead)
        .is("deleted_at", null)
        .maybeSingle();

      let terugbelLeadId: string;
      let isNieuw = true;
      if (bestaandeTerugbel) {
        isNieuw = false;
        terugbelLeadId = bestaandeTerugbel.id as string;
        const nieuweNotitie = `Nogmaals "Bel mij terug" via ${source}${wensLabel ? " - " + wensLabel : ""} (${statusOp.slice(0, 10)}).`;
        const { error: updateFout } = await admin
          .from("leads")
          .update({
            notes: [bestaandeTerugbel.notes, nieuweNotitie].filter(Boolean).join("\n"),
            contact_person: naam,
            status: "new",
            updated_at: new Date().toISOString(),
            // v98: zelf om een belletje gevraagd = toestemming (art. 11.7 Tw)
            opt_in_at: statusOp,
            opt_in_source: "web",
            opt_in_bewijs: toestemmingTekst,
          })
          .eq("id", terugbelLeadId);
        if (updateFout) {
          console.error("[mailstatus] terugbelverzoek-lead bijwerken mislukt", updateFout.message);
          return json({ error: "Terugbelverzoek opslaan mislukt" }, 500);
        }
      } else {
        const { data: nieuweLead, error: leadFout } = await admin
          .from("leads")
          .insert({
            name: bureauNaam,
            phone: telefoonVoorLead,
            email: kort(body?.email, 254)?.toLowerCase() ?? null,
            contact_person: naam,
            notes: `Terugbelverzoek via ${source}${wensLabel ? " - " + wensLabel : ""}.`,
            status: "new",
            lead_list_id: targetListId,
            organization_id: lead.organization_id ?? null,
            assigned_to: eigenaar,
            lead_source: "terugbelverzoek",
            // v98: zelf om een belletje gevraagd = toestemming (art. 11.7 Tw)
            opt_in_at: statusOp,
            opt_in_source: "web",
            opt_in_bewijs: toestemmingTekst,
          })
          .select("id").single();
        if (leadFout || !nieuweLead) {
          console.error("[mailstatus] terugbelverzoek-lead aanmaken mislukt", leadFout?.message);
          return json({ error: "Terugbelverzoek opslaan mislukt" }, 500);
        }
        terugbelLeadId = nieuweLead.id as string;
      }

      try {
        let ontvangers: string[] = [];
        if (eigenaar) ontvangers = [eigenaar];
        else if (campaignId) {
          const { data: mgrs } = await admin.from("campaign_managers").select("manager_id").eq("campaign_id", campaignId);
          ontvangers = (mgrs || []).map((m: { manager_id: string }) => m.manager_id).filter(Boolean);
        }
        if (ontvangers.length) {
          await admin.from("notifications").insert(ontvangers.map((pid) => ({
            profile_id: pid,
            actor_id: null,
            lead_id: terugbelLeadId,
            type: "terugbelverzoek",
            title: `${naam} (${bureauNaam}) wil ${isNieuw ? "" : "opnieuw "}teruggebeld worden`,
            body: [wensLabel, telefoonVoorLead].filter(Boolean).join(" \u00b7 "),
          })));
        }
      } catch (e) {
        console.error("[mailstatus] terugbelverzoek-melding mislukt", e);
      }

      return json({ ok: true, lead_id: lead.id, terugbel_lead_id: terugbelLeadId, nieuw: isNieuw });
    }

    // v98: afmelden via /mailvoorkeur of List-Unsubscribe. Een afmelding geldt
    // voor ALLE kanalen: de lead gaat op de afmeldlijst (e-mail, telefoon en
    // domein), bellers krijgen hem niet meer, geplande mails vervallen en
    // binnen 48 uur wordt hij gewist (pg_cron afgemelde_leads_wissen).
    // v122: in het nieuwe formaat is "afgemeld" de echo van onze eigen /stop en
    // valt hij hieronder gewoon in de samenvatting (fase 'einde').
    if (!nieuwFormaat && (status === "afgemeld" || status === "uitgeschreven" || status === "unsubscribe")) {
      const { error: blokFout } = await admin.rpc("blokkeer_lead", {
        p_lead_id: lead.id, p_bron: "mail", p_reden: `Afgemeld via ${source} (${statusOp.slice(0, 10)})`,
      });
      if (blokFout) {
        console.error("[mailstatus] afmelden mislukt", blokFout.message);
        return json({ error: "Afmelden mislukt" }, 500);
      }
      try {
        const eigenaar = (lead.assigned_to as string | null) || (lead.locked_by as string | null);
        let ontvangers: string[] = eigenaar ? [eigenaar] : [];
        if (!ontvangers.length && campaignId) {
          const { data: mgrs } = await admin.from("campaign_managers").select("manager_id").eq("campaign_id", campaignId);
          ontvangers = (mgrs || []).map((m: { manager_id: string }) => m.manager_id).filter(Boolean);
        }
        if (ontvangers.length) {
          await admin.from("notifications").insert(ontvangers.map((pid) => ({
            profile_id: pid, actor_id: null, lead_id: lead.id, type: "lead_afgemeld",
            title: `${kort(lead.name, 120) || "Een lead"} heeft zich afgemeld`,
            body: "Niet meer bellen of mailen. Wordt binnen 48 uur automatisch verwijderd.",
          })));
        }
      } catch (e) {
        console.error("[mailstatus] afmeldmelding mislukt", e);
      }
      return json({ ok: true, lead_id: lead.id, afgemeld: true });
    }

    // v98: "mail me later" - alleen de mailflow pauzeert, bellen mag nog.
    // Optioneel "later_op" (datum), anders 90 dagen.
    if (status === "later_mailen") {
      const laterRaw = kort(body?.later_op, 40);
      const laterMs = laterRaw ? Date.parse(laterRaw) : NaN;
      const maxMs = nu + 365 * 24 * 3600_000;
      const tot = new Date(Number.isFinite(laterMs) && laterMs > nu && laterMs < maxMs ? laterMs : nu + 90 * 24 * 3600_000).toISOString();
      const { error: pauzeFout } = await admin.from("leads").update({ mail_pauze_tot: tot }).eq("id", lead.id);
      if (pauzeFout) {
        console.error("[mailstatus] mailpauze opslaan mislukt", pauzeFout.message);
        return json({ error: "Opslaan mislukt" }, 500);
      }
      await admin.from("mail_queue").delete().eq("lead_id", lead.id).neq("status", "verzonden");
      return json({ ok: true, lead_id: lead.id, mail_pauze_tot: tot });
    }

    const { data: bestaand } = await admin
      .from("lead_mail_status")
      .select("id, status, status_rank, status_op, gemaild_op, geklikt_op, offerte_open_op, getekend_op, betaald_op, email, bureau, offerte_url, laatste_event, laatste_event_op, fase, pagina_actief_op, pagina_verlaten_op, actie_nodig, actie_nodig_op")
      .eq("lead_id", lead.id).eq("source", source).eq("mail_soort", mailSoort)
      .maybeSingle();
    const oud = (bestaand ?? null) as Record<string, string | number | null> | null;

    // v122: welke funnelstap bewijst deze gebeurtenis? Nieuw formaat: via EVENTS
    // (checkout_gestart -> offerte_open). Oud formaat: de status is zelf de stap.
    const stapNaam = ev ? ev.stap : (STAPPEN[status] ? status : null);
    const stap = stapNaam ? STAPPEN[stapNaam] : undefined;
    const rang = stap?.rang ?? 0;
    const oudeRang = bestaand?.status_rank ?? -1;
    // Een gebeurtenis zonder stap (bounced, pagina_verlaten, ...) zet de funnel
    // nooit terug: alleen een echte stap mag de status veranderen.
    const vooruit = stap
      ? rang > oudeRang || (rang === oudeRang && statusOp >= (bestaand?.status_op || ""))
      : !bestaand; // eerste rij ooit zonder stap: dan is dit nu even de status (rang 0)

    const rij: Record<string, unknown> = {
      lead_id: lead.id,
      source,
      mail_soort: mailSoort,
      organization_id: lead.organization_id ?? null,
      campaign_id: campaignId,
      email: kort(body?.email, 254)?.toLowerCase() ?? bestaand?.email ?? null,
      bureau: kort(body?.bureau, 160) ?? bestaand?.bureau ?? kort(lead.name, 160),
      offerte_url: offerteUrl ?? bestaand?.offerte_url ?? null,
      // Alleen vooruit: een late melding van een eerdere stap laat de status staan.
      status: vooruit ? (stapNaam || status) : bestaand!.status,
      status_rank: vooruit ? rang : oudeRang,
      status_op: vooruit ? statusOp : bestaand!.status_op,
      updated_at: new Date().toISOString(),
    };
    // Datum van deze stap vastleggen: de VROEGSTE telt (v122: pagina_actief kan
    // eerder binnenkomen dan de link_geklikt die ervoor zat; dan wint de oudste
    // occurred_at, niet de eerste die wij ontvingen).
    if (stap) {
      const huidig = (oud?.[stap.kolom] as string | null) || null;
      rij[stap.kolom] = huidig && huidig < statusOp ? huidig : statusOp;
    }
    // Een latere stap betekent dat de stappen ervoor ook gebeurd zijn.
    for (const [naam, s] of Object.entries(STAPPEN)) {
      if (s.rang < rang && naam !== stapNaam) {
        const huidig = (oud?.[s.kolom] as string | null) || null;
        if (huidig) rij[s.kolom] = huidig;
      }
    }

    // v122: de nieuwste gebeurtenis (op occurred_at, niet op ontvangst) + fase.
    const oudLaatsteOp = (oud?.laatste_event_op as string | null) || "";
    const isNieuwste = statusOp >= oudLaatsteOp;
    if (isNieuwste) {
      rij.laatste_event = status;
      rij.laatste_event_op = statusOp;
      const faseVanBron = FASES.includes(stageRuw) ? stageRuw : null;
      rij.fase = faseVanBron || ev?.fase || (oud?.fase as string | null) || null;
    } else {
      rij.laatste_event = oud?.laatste_event ?? null;
      rij.laatste_event_op = oud?.laatste_event_op ?? null;
      rij.fase = oud?.fase ?? null;
    }

    // Live op de pagina: actief_op en verlaten_op los bijhouden (hoogste wint),
    // zodat de volgorde van binnenkomst niet uitmaakt.
    const maxOp = (a: unknown, b: string) => (typeof a === "string" && a > b ? a : b);
    rij.pagina_actief_op = ev?.live === "aan" ? maxOp(oud?.pagina_actief_op, statusOp) : (oud?.pagina_actief_op ?? null);
    rij.pagina_verlaten_op = ev?.live === "uit" ? maxOp(oud?.pagina_verlaten_op, statusOp) : (oud?.pagina_verlaten_op ?? null);
    const wasLive = !!oud?.pagina_actief_op && (oud.pagina_actief_op as string) > ((oud.pagina_verlaten_op as string | null) || "");
    const isLive = !!rij.pagina_actief_op && (rij.pagina_actief_op as string) > ((rij.pagina_verlaten_op as string | null) || "");

    // Terugbelactie: zet bij bounced/mail_mislukt/checkout_verlaten/... ; een
    // LATERE gewone gebeurtenis (klant klikt toch, betaalt toch) wist hem weer.
    const oudActieOp = (oud?.actie_nodig_op as string | null) || "";
    rij.actie_nodig = oud?.actie_nodig ?? null;
    rij.actie_nodig_op = oud?.actie_nodig_op ?? null;
    let nieuweActie = false;
    if (ev?.actie && statusOp >= oudActieOp) {
      nieuweActie = oud?.actie_nodig !== status;
      rij.actie_nodig = status;
      rij.actie_nodig_op = statusOp;
    } else if (ev && !ev.actie && ev.live !== "uit" && oud?.actie_nodig && statusOp > oudActieOp) {
      rij.actie_nodig = null;
      rij.actie_nodig_op = null;
    }

    const { error } = await admin.from("lead_mail_status").upsert(rij, { onConflict: "lead_id,source,mail_soort" });
    if (error) {
      console.error("[mailstatus] opslaan mislukt", error.message);
      return json({ error: "Opslaan mislukt" }, 500);
    }

    // Wie krijgt een melding: de eigenaar van de lead, anders de managers.
    const ontvangersVoorLead = async (): Promise<string[]> => {
      const eigenaar = (lead.assigned_to as string | null) || (lead.locked_by as string | null);
      if (eigenaar) return [eigenaar];
      if (!campaignId) return [];
      const { data: mgrs } = await admin.from("campaign_managers").select("manager_id").eq("campaign_id", campaignId);
      return (mgrs || []).map((m: { manager_id: string }) => m.manager_id).filter(Boolean);
    };
    const meld = async (type: string, title: string, bodyTekst: string | null) => {
      try {
        const ontvangers = await ontvangersVoorLead();
        if (!ontvangers.length) return;
        await admin.from("notifications").insert(ontvangers.map((pid) => ({
          profile_id: pid, actor_id: null, lead_id: lead.id, type, title, body: bodyTekst,
        })));
      } catch (e) {
        console.error(`[mailstatus] melding ${type} mislukt`, e);
      }
    };
    const naam = (rij.bureau as string | null) || lead.name || "Lead";

    // v92: een status die nergens bekend is -> melding, zodat een nieuwe
    // stapnaam van de bron nooit onopgemerkt blijft. v122: maar maximaal 1x
    // per lead + status (anders spamt een herhaalde onbekende status de beller).
    if (!stap && !ev) {
      let alGemeld = false;
      if (nieuwFormaat) {
        const { count } = await admin.from("lead_mail_events")
          .select("id", { count: "exact", head: true })
          .eq("lead_id", lead.id).eq("source", source).eq("status", status);
        alGemeld = (count ?? 0) > 1; // onze eigen rij telt al mee
      }
      if (!alGemeld) {
        await meld("mailstatus_onbekend", `Onbekende mailstatus "${status}" van ${source}`,
          vooruit
            ? "Bewaard bij de lead, maar niet in de gewone volgorde. Check of dit een nieuwe stap is."
            : "Bewaard bij de lead; de funnelstap is niet veranderd. Check of dit een nieuwe stap is die moet worden toegevoegd.");
      }
    }

    // v88/v122: belmomenten -> melding (belletje). Alleen als er echt iets
    // nieuws gebeurde, dus een dubbele of late melding geeft nooit een tweede
    // belletje. Link geklikt (rang 2) is nog geen belmoment.
    if (vooruit && stap && rang >= 3 && rang > oudeRang) {
      const TITELS: Record<string, string> = {
        checkout_gestart: `${naam} is bij het betalen`,
        offerte_open: `${naam} bekijkt de offerte`,
        getekend: `${naam} heeft getekend`,
        betaald: `${naam} heeft betaald`,
        welkomstmail_verstuurd: `${naam} is klant geworden`,
        abonnement_verlengd: `${naam} heeft het abonnement verlengd`,
      };
      const BODY: Record<string, string> = {
        checkout_gestart: "Heel warm: de klant staat op de betaalpagina. Nu bellen om de laatste twijfel weg te nemen.",
        offerte_open: "Heel warm: de offerte staat open. Even bellen om vragen weg te nemen.",
        getekend: "Gefeliciteerd. Check of alles klopt en of de klant nog iets nodig heeft.",
        betaald: "De klant heeft betaald. Mooi resultaat.",
      };
      await meld("lead_warm", TITELS[status] || TITELS[stapNaam!] || `${naam}: ${status}`, BODY[status] || BODY[stapNaam!] || null);
    }

    // v122: klant is NU op de aanmeldpagina. Alleen bij de overgang naar live,
    // en niet vaker dan 1x per 20 minuten per lead (tegen tabblad-geklik).
    if (ev?.live === "aan" && isLive && !wasLive) {
      const vorigeActief = (oud?.pagina_actief_op as string | null) || "";
      const recent = vorigeActief && Date.parse(statusOp) - Date.parse(vorigeActief) < 20 * 60_000;
      if (!recent) {
        await meld("lead_warm", `${naam} is nu op de aanmeldpagina`,
          "Beste moment om te bellen: de klant kijkt op dit moment naar de aanmeldpagina.");
      }
    }

    // v122: terugbelactie (mail kwam niet aan, betaling mislukt, enz.).
    if (nieuweActie) {
      const ACTIES: Record<string, [string, string]> = {
        bounced: [`Mail aan ${naam} kwam niet aan`, "Het e-mailadres klopt niet of de mailbox is vol. Bel om een goed adres te vragen."],
        mail_mislukt: [`Mail aan ${naam} is niet verstuurd`, "De bron kon de mail niet versturen. Probeer het opnieuw of bel de klant."],
        spam_melding: [`${naam} markeerde de mail als spam`, "Niet opnieuw mailen. Eventueel kort bellen."],
        checkout_verlaten: [`${naam} is niet gaan betalen`, "De betaalsessie is verlopen zonder betaling. Goed moment om terug te bellen."],
        betaling_mislukt: [`Betaling van ${naam} is mislukt`, "De betaalpoging werd geweigerd. Bel om te helpen met een andere betaalmanier."],
        abonnement_opgezegd: [`${naam} heeft het abonnement beeindigd`, "Opgezegd of niet betaald. Eventueel bellen voor behoud."],
      };
      const [titel, tekst] = ACTIES[status] || [`${naam}: ${status}`, "Terugbellen aan te raden."];
      await meld("mail_actie", titel, tekst);
    }

    return json({
      ...(nieuwFormaat ? { received: true } : {}),
      ok: true,
      lead_id: lead.id,
      status: rij.status,
      laatste_event: rij.laatste_event,
      opgeslagen: true,
      ...(stap || ev ? {} : { let_op: `Onbekende status '${status}' - wel bewaard, maar niet in de volgorde gemaild/link_geklikt/offerte_open/getekend/betaald` }),
    });
  } catch (err) {
    console.error("[mailstatus]", err);
    return json({ error: "Er ging iets mis" }, 500);
  }
});
