// ReachConnect v65 — publieke ondertekenpagina-API (geen login, verify_jwt = false).
// GET  ?t=<token>            -> bevroren offerte (of state getekend/verlopen/afgewezen)
// POST { t, actie, ... }     -> 'tekenen' (naam, functie?, png?) of 'afwijzen' (reden?)
// Werkt uitsluitend met de kolommen van public.offertes; geeft NOOIT interne
// velden terug (user_id, lead_id, notitie, roi). Alleen de sha256-hash van het
// token staat in de DB; het token komt alleen uit de mail. Na tekenen blijft de
// link werken als read-only bevestiging (GET geeft state getekend).
//
// v112: merk/branding uit offertes.branding_org_id.
// v113: ondertekenen mag zonder handtekeningafbeelding wanneer
//       offertes.handtekening_vereist false is (akkoordknop + bevestiging).
//       De merkkleuren en bedrijfsgegevens gaan mee naar de pagina.
// v114: bewijs van ondertekening. De klant geeft twee keer expliciet akkoord
//       (met de offerte, en met elektronisch ondertekenen) en we leggen een
//       kenmerk, tijdstip, ip, browser en de hash van de offerte vast. Dat is
//       een gewone elektronische handtekening in de zin van eIDAS.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const DEAL_STATUSSEN = new Set(["deal", "bruto_deal", "monteur_ingepland", "geaccepteerd", "actief"]);

// Simpele rate-limit per ip (in-memory, per instance).
const hits = new Map<string, { n: number; t: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.t > 10 * 60 * 1000) { hits.set(ip, { n: 1, t: now }); return false; }
  h.n++;
  return h.n > 40;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function euro(n: number | null | undefined): string {
  return "€ " + Number(n || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function tijdNL(d: Date): string {
  return d.toLocaleString("nl-NL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });
}
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
function kenmerk(): string {
  const b = crypto.getRandomValues(new Uint8Array(5));
  const hex = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `ONDT-${new Date().getFullYear()}-${hex}`;
}
async function sendMail(to: string, from: string, replyTo: string | null, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo || undefined, subject, html }),
  }).catch(() => {});
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "onbekend";
  if (rateLimited(ip)) return json({ error: "te_veel_verzoeken" }, 429);

  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let token = "";
    let body: Record<string, unknown> = {};
    if (req.method === "GET") {
      token = new URL(req.url).searchParams.get("t") || "";
    } else {
      body = await req.json().catch(() => ({}));
      token = String(body?.t || "");
    }
    if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return json({ error: "onbekend" }, 404);

    const tokenHash = await sha256Hex(token);
    const { data: off } = await admin.from("offertes").select("*").eq("sign_token_hash", tokenHash).maybeSingle();
    if (!off) return json({ error: "onbekend" }, 404);

    // Merk + AM voor branding en contact. v112: branding_org_id eerst (het merk
    // van het project), organization_id alleen nog als terugval voor oude rijen.
    let org: Record<string, unknown> | null = null;
    const merkId = off.branding_org_id || off.organization_id;
    if (merkId) {
      const { data } = await admin.from("organizations").select("name, afzender_naam, afzender_email, logo_url, accent_kleur, accent_tekst_kleur, kvk, btw_nummer, adres, telefoon, website, iban, offerte_voorwaarden").eq("id", merkId).single();
      org = data;
    }
    const fallbackFrom = Deno.env.get("RESEND_FROM") || "ReachConnect <onboarding@resend.dev>";
    const fromMatch = fallbackFrom.match(/^(.*?)\s*<(.+)>$/);
    const orgNaam = String(org?.afzender_naam || org?.name || (fromMatch ? fromMatch[1] : "") || "Uw leverancier");
    const afzenderEmail = String(org?.afzender_email || (fromMatch ? fromMatch[2] : fallbackFrom));
    const from = `${orgNaam} <${afzenderEmail}>`;
    const accent = String(org?.accent_kleur || "#15803D");
    const accentInkt = String(org?.accent_tekst_kleur || "#FFFFFF");
    const { data: am } = await admin.from("profiles").select("full_name, email, phone").eq("id", off.verzonden_door || off.user_id).maybeSingle();
    const amInfo = { naam: am?.full_name || off.accountmanager || orgNaam, telefoon: am?.phone || null, email: am?.email || null };
    const orgInfo = {
      naam: orgNaam,
      logo_url: (org?.logo_url as string) || null,
      accent_kleur: accent,
      accent_tekst_kleur: accentInkt,
      email: afzenderEmail,
      telefoon: (org?.telefoon as string) || null,
      adres: (org?.adres as string) || null,
      website: (org?.website as string) || null,
      kvk: (org?.kvk as string) || null,
      btw_nummer: (org?.btw_nummer as string) || null,
      iban: (org?.iban as string) || null,
      voorwaarden: Array.isArray(org?.offerte_voorwaarden) ? org?.offerte_voorwaarden : [],
    };

    // Eindstates
    if (off.status === "getekend") {
      return json({
        state: "getekend", nummer: off.nummer, getekend_op: off.getekend_op,
        door: off.akkoord?.door || null, functie: off.akkoord?.functie || null,
        zaak_naam: off.zaak_naam, org: orgInfo, am: amInfo,
        offerte: {
          nummer: off.nummer, zaak_naam: off.zaak_naam, contact_naam: off.contact_naam, adres: off.adres,
          pakket: off.pakket, regels: off.regels, upsell: off.upsell, korting: off.korting,
          eenmalig_ex: off.eenmalig_ex, btw: off.btw, eenmalig_incl: off.eenmalig_incl, maandbedrag_ex: off.maandbedrag_ex,
          speclijst: off.speclijst, akkoord_tekst: off.akkoord_tekst, geldig_tot: off.sign_token_expires_at,
          notitie_klant: off.notitie || null, handtekening_vereist: off.handtekening_vereist !== false,
        },
        bewijs: {
          kenmerk: off.ondertekening_id || null,
          op: off.getekend_op,
          email: off.akkoord?.verzonden_naar || off.verzonden_naar || null,
          ip: off.akkoord?.ip || null,
          browser: off.akkoord?.ua || null,
          document_hash: off.inhoud_hash || null,
          methode: off.akkoord?.methode || null,
        },
      });
    }
    if (off.status === "afgewezen" || off.status === "geannuleerd") {
      return json({ state: off.status, nummer: off.nummer, org: orgInfo, am: amInfo }, 410);
    }
    const verlopen = off.sign_token_expires_at && new Date(off.sign_token_expires_at).getTime() < Date.now();
    if (verlopen || off.status === "verlopen") {
      if (off.status !== "verlopen") await admin.from("offertes").update({ status: "verlopen" }).eq("id", off.id);
      return json({ state: "verlopen", nummer: off.nummer, org: orgInfo, am: amInfo }, 410);
    }
    if (!["verzonden", "geopend"].includes(off.status)) return json({ error: "onbekend" }, 404);

    // ---------- GET: offerte tonen ----------
    if (req.method === "GET") {
      const patch: Record<string, unknown> = { geopend_aantal: (off.geopend_aantal || 0) + 1 };
      if (!off.geopend_op) { patch.geopend_op = new Date().toISOString(); patch.status = "geopend"; }
      await admin.from("offertes").update(patch).eq("id", off.id);
      return json({
        state: "open",
        offerte: {
          nummer: off.nummer, zaak_naam: off.zaak_naam, contact_naam: off.contact_naam, adres: off.adres,
          pakket: off.pakket, regels: off.regels, upsell: off.upsell, korting: off.korting,
          eenmalig_ex: off.eenmalig_ex, btw: off.btw, eenmalig_incl: off.eenmalig_incl, maandbedrag_ex: off.maandbedrag_ex,
          speclijst: off.speclijst, akkoord_tekst: off.akkoord_tekst, geldig_tot: off.sign_token_expires_at,
          notitie_klant: off.notitie || null, handtekening_vereist: off.handtekening_vereist !== false,
        },
        org: orgInfo, am: amInfo,
      });
    }

    // ---------- POST ----------
    const actie = String(body?.actie || "");
    const ua = req.headers.get("user-agent") || "";

    if (actie === "afwijzen") {
      const reden = String(body?.reden || "").trim().slice(0, 500) || null;
      await admin.from("offertes").update({ status: "afgewezen", afgewezen_reden: reden }).eq("id", off.id);
      if (amInfo.email) {
        await sendMail(amInfo.email, from, null, `Offerte ${off.nummer} afgewezen door ${off.zaak_naam}`,
          `<p>${esc(off.zaak_naam)} heeft offerte <b>${esc(off.nummer)}</b> afgewezen.</p>${reden ? `<p>Reden: ${esc(reden)}</p>` : ""}<p>De lead is niet gewijzigd; bel na om af te boeken.</p>`);
      }
      return json({ ok: true, state: "afgewezen" });
    }

    if (actie !== "tekenen") return json({ error: "onbekende_actie" }, 400);

    const naam = String(body?.naam || "").trim();
    const functie = String(body?.functie || "").trim().slice(0, 120) || null;
    const png = String(body?.png || "");
    const pngNodig = off.handtekening_vereist !== false;
    if (naam.length < 2) return json({ error: "naam_ontbreekt" }, 400);
    if (pngNodig) {
      if (!png.startsWith("data:image/png;base64,") || png.length > 400_000) return json({ error: "handtekening_ongeldig" }, 400);
    } else if (png && (!png.startsWith("data:image/png;base64,") || png.length > 400_000)) {
      return json({ error: "handtekening_ongeldig" }, 400);
    }
    // De twee vinkjes: akkoord met de offerte, en akkoord met elektronisch
    // ondertekenen. Bij de akkoordknop zijn allebei verplicht; dat is precies
    // wat een gewone elektronische handtekening onderbouwt.
    if (body?.akkoord !== true) return json({ error: "akkoord_ontbreekt" }, 400);
    if (!pngNodig && body?.elektronisch !== true) return json({ error: "elektronisch_ontbreekt" }, 400);

    const now = new Date();
    const ondertekeningId = off.ondertekening_id || kenmerk();
    const akkoord = {
      door: naam, functie, op: now.toISOString(), png: png || null, ua, ip,
      tekst: off.akkoord_tekst, inhoud_hash: off.inhoud_hash, verzonden_naar: off.verzonden_naar,
      methode: pngNodig ? "op_afstand" : "op_afstand_knop",
      ondertekening_id: ondertekeningId,
      akkoord_offerte: true,
      akkoord_elektronisch: pngNodig ? true : body?.elektronisch === true,
      tijdstip_nl: tijdNL(now),
    };
    const { error: updErr } = await admin.from("offertes").update({
      status: "getekend", akkoord, getekend_op: now.toISOString(), ondertekening_id: ondertekeningId,
    }).eq("id", off.id);
    if (updErr) return json({ error: "opslaan_mislukt" }, 500);

    // Lead: automatisch naar deal / bruto_deal (regel v47: backoffice-campagne -> bruto_deal).
    if (off.lead_id) {
      const { data: lead } = await admin.from("leads").select("id, status, lead_list_id, lead_lists(campaign_id, campaigns(type))").eq("id", off.lead_id).maybeSingle();
      if (lead && !DEAL_STATUSSEN.has(lead.status)) {
        // deno-lint-ignore no-explicit-any
        const ctype = (lead as any)?.lead_lists?.campaigns?.type;
        // v68: accountmanagement-pipeline -> geaccepteerd (actief volgt pas na betaling).
        const nieuw = ctype === "backoffice" ? "bruto_deal" : ctype === "accountmanagement" ? "geaccepteerd" : "deal";
        await admin.from("leads").update({ status: nieuw, next_contact_date: null, sale_date: now.toISOString() }).eq("id", lead.id);
        await admin.from("call_logs").insert({
          agent_id: off.user_id,
          organization_id: off.organization_id ?? null,
          lead_id: lead.id,
          lead_list_id: lead.lead_list_id,
          disposition: nieuw,
          started_at: now.toISOString(),
          disposed_at: now.toISOString(),
          duration_seconds: 0,
          source: "offerte_remote",
          notes: `Offerte ${off.nummer} ondertekend op afstand door ${naam} (${ondertekeningId})`,
        });
      }
    }

    // Bevestigingen
    const wanneer = tijdNL(now);
    const appUrl = (Deno.env.get("APP_URL") || "https://leadgendash.netlify.app").replace(/\/$/, "");
    if (off.verzonden_naar) {
      await sendMail(off.verzonden_naar, from, amInfo.email, `Bevestiging: offerte ${off.nummer} is ondertekend`,
        `<div style="font-family:Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0B0B0C">
         <h1 style="font-size:20px">Bedankt, uw akkoord is ontvangen</h1>
         <p>Offerte <b>${esc(off.nummer)}</b> voor ${esc(off.zaak_naam)} is op ${esc(wanneer)} elektronisch ondertekend door ${esc(naam)}${functie ? ` (${esc(functie)})` : ""}.</p>
         <table style="border-collapse:collapse;font-size:14px"><tr><td style="padding:4px 12px 4px 0;color:#6B6B75">Eenmalig (excl. btw)</td><td><b>${euro(off.eenmalig_ex)}</b></td></tr><tr><td style="padding:4px 12px 4px 0;color:#6B6B75">Per maand (excl. btw)</td><td><b>${euro(off.maandbedrag_ex)}</b></td></tr></table>
         <p style="font-size:13px;color:#6B6B75">Bewaar deze mail als bewijs. Via de link uit de eerdere mail kunt u de ondertekende offerte en het ondertekenbewijs altijd terugzien en downloaden. ${esc(amInfo.naam)} neemt contact met u op over de vervolgstappen.</p>
         </div>`);
    }
    if (amInfo.email) {
      await sendMail(amInfo.email, from, null, `${off.zaak_naam} heeft offerte ${off.nummer} ondertekend`,
        `<p><b>${esc(off.zaak_naam)}</b> heeft offerte ${esc(off.nummer)} op ${esc(wanneer)} ondertekend (${esc(naam)}${functie ? `, ${esc(functie)}` : ""}).</p><p>Eenmalig ${euro(off.eenmalig_ex)} · per maand ${euro(off.maandbedrag_ex)}.</p><p><a href="${esc(appUrl)}/offertes" style="background:${esc(accent)};color:${esc(accentInkt)};padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Bekijk in ReachConnect</a></p>`);
    }

    return json({ ok: true, state: "getekend", getekend_op: now.toISOString(), ondertekening_id: ondertekeningId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
