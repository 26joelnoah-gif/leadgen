// LEADGEN v70 — Mailstatus: de BRON meldt terug hoe ver een gemailde lead komt.
//
// MarketingKiezer (of een andere bron) post hier elke stap naartoe zodra die
// gebeurt. LEADGEN slaat het op bij de lead (public.lead_mail_status) en het
// belscherm laat het live zien.
//
//   POST https://<project>.supabase.co/functions/v1/mailstatus
//   Authorization: Bearer <MAILSTATUS_KEY>      (ook goed: x-leadgen-key of x-api-key)
//   {
//     "lead_id": "uuid van de LEADGEN-lead",
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
// De sleutel staat in Supabase secret MAILSTATUS_KEY; bij de bron is dat
// dezelfde waarde (in Netlify: LEADGEN_STATUS_KEY).
// verify_jwt = false: de bron is een server, geen ingelogde gebruiker.
//
// Stappen en volgorde (status_rank). Een melding die te laat of dubbel
// binnenkomt zet de lead nooit terug: elke stap krijgt een eigen datumkolom en
// alleen een HOGERE stap verandert de huidige status.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-leadgen-key, x-api-key",
};

// stap -> rang + kolom waarin de datum van die stap wordt bewaard
const STAPPEN: Record<string, { rang: number; kolom: string }> = {
  gemaild:      { rang: 1, kolom: "gemaild_op" },
  link_geklikt: { rang: 2, kolom: "geklikt_op" },
  offerte_open: { rang: 3, kolom: "offerte_open_op" },
  getekend:     { rang: 4, kolom: "getekend_op" },
  betaald:      { rang: 5, kolom: "betaald_op" },
};
// Zelfde stap, andere naam bij de bron. Zo hoeft niemand te gokken.
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
  return (req.headers.get("x-leadgen-key") || req.headers.get("x-api-key") || auth).trim();
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

    const leadId = String(body?.lead_id || "");
    if (!UUID.test(leadId)) return json({ error: "lead_id ontbreekt of klopt niet" }, 400);

    const ruweStatus = (kort(body?.status, 40) || "").toLowerCase();
    const status = SYNONIEMEN[ruweStatus] || ruweStatus;
    if (!SLUG.test(status)) return json({ error: "status ontbreekt of klopt niet" }, 400);

    const mailSoort = (kort(body?.mail_soort, 40) || "introductie").toLowerCase();
    if (!SLUG.test(mailSoort)) return json({ error: "mail_soort klopt niet" }, 400);

    const source = (kort(body?.source, 40) || "MARKETINGKIEZER").toUpperCase();
    if (!BRON.test(source)) return json({ error: "source klopt niet" }, 400);

    // Datum van de stap; rare of ontbrekende datum wordt gewoon nu.
    const opRaw = kort(body?.status_op, 40);
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
    if (!lead || lead.deleted_at) return json({ error: "Lead niet gevonden" }, 404);

    let campaignId: string | null = null;
    if (lead.lead_list_id) {
      const { data: list } = await admin.from("lead_lists").select("campaign_id").eq("id", lead.lead_list_id).maybeSingle();
      campaignId = list?.campaign_id ?? null;
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

      const { data: nieuweLead, error: leadFout } = await admin
        .from("leads")
        .insert({
          name: bureauNaam,
          phone: telefoonVoorLead,
          email: kort(body?.email, 254)?.toLowerCase() ?? null,
          contact_person: naam,
          notes: `Terugbelverzoek via MarketingKiezer${wensLabel ? " - " + wensLabel : ""}.`,
          status: "new",
          lead_list_id: targetListId,
          organization_id: lead.organization_id ?? null,
          assigned_to: eigenaar,
          lead_source: "terugbelverzoek",
        })
        .select("id").single();
      if (leadFout || !nieuweLead) {
        console.error("[mailstatus] terugbelverzoek-lead aanmaken mislukt", leadFout?.message);
        return json({ error: "Terugbelverzoek opslaan mislukt" }, 500);
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
            lead_id: nieuweLead.id,
            type: "terugbelverzoek",
            title: `${naam} (${bureauNaam}) wil teruggebeld worden`,
            body: [wensLabel, telefoonVoorLead].filter(Boolean).join(" \u00b7 "),
          })));
        }
      } catch (e) {
        console.error("[mailstatus] terugbelverzoek-melding mislukt", e);
      }

      return json({ ok: true, lead_id: lead.id, terugbel_lead_id: nieuweLead.id });
    }

    const { data: bestaand } = await admin
      .from("lead_mail_status")
      .select("id, status, status_rank, status_op, gemaild_op, geklikt_op, offerte_open_op, getekend_op, betaald_op, email, bureau, offerte_url")
      .eq("lead_id", lead.id).eq("source", source).eq("mail_soort", mailSoort)
      .maybeSingle();

    const stap = STAPPEN[status];
    const rang = stap?.rang ?? 0;
    const oudeRang = bestaand?.status_rank ?? -1;
    const vooruit = rang > oudeRang || (rang === oudeRang && statusOp >= (bestaand?.status_op || ""));

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
      status: vooruit ? status : bestaand!.status,
      status_rank: vooruit ? rang : oudeRang,
      status_op: vooruit ? statusOp : bestaand!.status_op,
      updated_at: new Date().toISOString(),
    };
    // Datum van deze stap vastleggen (de eerste keer telt).
    if (stap) rij[stap.kolom] = (bestaand as Record<string, string | null> | null)?.[stap.kolom] || statusOp;
    // Een latere stap betekent dat de stappen ervoor ook gebeurd zijn.
    for (const [naam, s] of Object.entries(STAPPEN)) {
      if (s.rang < rang && naam !== status) {
        const huidig = (bestaand as Record<string, string | null> | null)?.[s.kolom] || null;
        if (huidig) rij[s.kolom] = huidig;
      }
    }

    const { error } = await admin.from("lead_mail_status").upsert(rij, { onConflict: "lead_id,source,mail_soort" });
    if (error) {
      console.error("[mailstatus] opslaan mislukt", error.message);
      return json({ error: "Opslaan mislukt" }, 500);
    }

    // v88: warme lead -> melding (belletje) voor de eigenaar van de lead, of
    // anders de managers van het project. Alleen als de stap echt vooruit
    // ging, dus een dubbele of late melding geeft nooit een tweede belletje.
    // Alleen op de link geklikt (rang 2) is nog GEEN belmoment - dat zet
    // alleen de status op "Link geklikt", zonder melding. Pas als de offerte
    // echt open staat (rang 3) is het warm genoeg voor een belletje.
    if (vooruit && rang >= 3 && rang > oudeRang) {
      try {
        let ontvangers: string[] = [];
        const eigenaar = (lead.assigned_to as string | null) || (lead.locked_by as string | null);
        if (eigenaar) ontvangers = [eigenaar];
        else if (campaignId) {
          const { data: mgrs } = await admin.from("campaign_managers").select("manager_id").eq("campaign_id", campaignId);
          ontvangers = (mgrs || []).map((m: { manager_id: string }) => m.manager_id).filter(Boolean);
        }
        const naam = (rij.bureau as string | null) || lead.name || "Lead";
        const TITELS: Record<number, string> = {
          3: `${naam} bekijkt de offerte`,
          4: `${naam} heeft getekend`,
          5: `${naam} heeft betaald`,
        };
        const BODY: Record<number, string> = {
          3: "Heel warm: de offerte staat open. Even bellen om vragen weg te nemen.",
          4: "Gefeliciteerd. Check of alles klopt en of de klant nog iets nodig heeft.",
          5: "De klant heeft betaald. Mooi resultaat.",
        };
        if (ontvangers.length) {
          await admin.from("notifications").insert(ontvangers.map((pid) => ({
            profile_id: pid,
            actor_id: null,
            lead_id: lead.id,
            type: "lead_warm",
            title: TITELS[rang] || `${naam}: ${status}`,
            body: BODY[rang] || null,
          })));
        }
      } catch (e) {
        console.error("[mailstatus] melding mislukt", e);
      }
    }

    return json({
      ok: true,
      lead_id: lead.id,
      status: rij.status,
      opgeslagen: true,
      ...(stap ? {} : { let_op: `Onbekende status '${status}' - wel bewaard, maar niet in de volgorde gemaild/link_geklikt/offerte_open/getekend/betaald` }),
    });
  } catch (err) {
    console.error("[mailstatus]", err);
    return json({ error: "Er ging iets mis" }, 500);
  }
});
