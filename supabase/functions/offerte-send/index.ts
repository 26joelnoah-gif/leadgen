// LEADGEN v65 — offerte ter ondertekening versturen (of herinneren / intrekken).
// Ingelogd (AM/admin/manager). Maakt een tekentoken, bevriest de inhoud en
// mailt de klant een link naar /tekenen/<token>. Alleen de sha256-hash van het
// token staat in de DB. Werkt uitsluitend met de kolommen van public.offertes;
// afzender en branding komen uit organizations (fallback: secrets).
//
// Secrets: RESEND_API_KEY, APP_URL (bijv. https://leadgendash.netlify.app),
//          RESEND_FROM (fallback afzender, bijv. "ReachConnect <offertes@reachconnect.nl>")
//
// body: { offerteId, email?, akkoordTekst?, actie?: 'versturen' | 'herinneren' | 'intrekken' }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EINDSTATUSSEN = new Set(["deal", "bruto_deal", "monteur_ingepland", "geen_interesse", "blacklist", "verkeerd_nummer", "wil_annuleren"]);

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function euro(n: number | null | undefined): string {
  return "€ " + Number(n || 0).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function datumNL(d: Date): string {
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
}
function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

async function sendMail(to: string, from: string, replyTo: string | null, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY ontbreekt (Supabase secrets)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo || undefined, subject, html }),
  });
  if (!res.ok) throw new Error("Mail versturen mislukt: " + (await res.text()).slice(0, 300));
}

function mailHtml(opts: {
  orgNaam: string; logoUrl: string | null; nummer: string; zaak: string; contact: string | null;
  eenmalig: number; maand: number; geldigTot: string; url: string; amNaam: string; amTel: string | null; amEmail: string | null; herinnering: boolean;
}) {
  const o = opts;
  const kop = o.herinnering ? `Herinnering: offerte ${esc(o.nummer)} wacht op uw akkoord` : `Uw offerte ${esc(o.nummer)}`;
  return `<!doctype html><html lang="nl"><body style="margin:0;background:#f4f5f8;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#14171f">
<div style="max-width:560px;margin:0 auto;padding:32px 20px">
  ${o.logoUrl ? `<img src="${esc(o.logoUrl)}" alt="${esc(o.orgNaam)}" style="max-height:44px;margin-bottom:20px">` : `<div style="font-weight:700;font-size:18px;margin-bottom:20px">${esc(o.orgNaam)}</div>`}
  <div style="background:#fff;border:1px solid #e1e4ea;border-radius:12px;padding:28px">
    <h1 style="font-size:20px;margin:0 0 12px">${kop}</h1>
    <p style="margin:0 0 16px;line-height:1.5">Beste ${esc(o.contact || o.zaak)},</p>
    <p style="margin:0 0 16px;line-height:1.5">${o.herinnering ? "Onlangs stuurden wij u onze offerte. Die wacht nog op uw akkoord." : "Hierbij ontvangt u onze offerte voor " + esc(o.zaak) + "."} U kunt de offerte bekijken en direct online ondertekenen via de knop hieronder.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
      <tr><td style="padding:6px 0;color:#5b6270">Eenmalig (excl. btw)</td><td style="padding:6px 0;text-align:right;font-weight:600">${euro(o.eenmalig)}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6270">Per maand (excl. btw)</td><td style="padding:6px 0;text-align:right;font-weight:600">${euro(o.maand)}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6270">Geldig tot</td><td style="padding:6px 0;text-align:right">${esc(o.geldigTot)}</td></tr>
    </table>
    <a href="${esc(o.url)}" style="display:block;text-align:center;background:#2f6fe0;color:#fff;text-decoration:none;font-weight:600;padding:14px 20px;border-radius:10px">Offerte bekijken en ondertekenen</a>
    <p style="margin:20px 0 0;font-size:13px;color:#5b6270;line-height:1.5">Vragen? Neem contact op met ${esc(o.amNaam)}${o.amTel ? ` via <a href="tel:${esc(o.amTel)}" style="color:#2f6fe0">${esc(o.amTel)}</a>` : ""}${o.amEmail ? ` of <a href="mailto:${esc(o.amEmail)}" style="color:#2f6fe0">${esc(o.amEmail)}</a>` : ""}.</p>
  </div>
  <p style="font-size:12px;color:#8a90a0;margin:16px 0 0;line-height:1.5">Werkt de knop niet? Kopieer deze link in uw browser:<br>${esc(o.url)}</p>
</div></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Niet ingelogd" }, 401);
    const callerId = userData.user.id;

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: caller } = await admin
      .from("profiles")
      .select("id, full_name, email, phone, role, is_active, organization_id")
      .eq("id", callerId)
      .single();
    if (!caller || caller.is_active === false) return json({ error: "Je account is inactief" }, 403);

    const body = await req.json().catch(() => ({}));
    const offerteId = String(body?.offerteId || "");
    if (!offerteId) return json({ error: "Geen offerte opgegeven" }, 400);
    const actie: string = body?.actie || "versturen";

    const { data: off } = await admin.from("offertes").select("*").eq("id", offerteId).single();
    if (!off) return json({ error: "Offerte niet gevonden" }, 404);
    if ((off.organization_id ?? null) !== (caller.organization_id ?? null)) return json({ error: "Geen toegang tot deze offerte" }, 403);

    // Toestemming: eigenaar, admin, of manager (managers zien de hele org, zie RLS v59).
    const allowed = off.user_id === caller.id || caller.role === "admin" || caller.role === "manager";
    if (!allowed) return json({ error: "Geen toestemming voor deze offerte" }, 403);

    // Organisatie-instellingen met fallback op secrets.
    let org: Record<string, unknown> | null = null;
    if (off.organization_id) {
      const { data } = await admin.from("organizations").select("name, afzender_naam, afzender_email, logo_url, offerte_geldigheid_dagen, offerte_opvolg_dagen").eq("id", off.organization_id).single();
      org = data;
    }
    const fallbackFrom = Deno.env.get("RESEND_FROM") || "LeadGen <onboarding@resend.dev>";
    const fromMatch = fallbackFrom.match(/^(.*?)\s*<(.+)>$/);
    const orgNaam = String(org?.afzender_naam || org?.name || (fromMatch ? fromMatch[1] : "") || "Uw leverancier");
    const afzenderEmail = String(org?.afzender_email || (fromMatch ? fromMatch[2] : fallbackFrom));
    const from = `${orgNaam} <${afzenderEmail}>`;
    const logoUrl = (org?.logo_url as string) || null;
    const geldigheidDagen = Number(org?.offerte_geldigheid_dagen || 14);
    const opvolgDagen = Number(org?.offerte_opvolg_dagen || 3);
    const appUrl = (Deno.env.get("APP_URL") || "https://leadgendash.netlify.app").replace(/\/$/, "");

    // ---------- intrekken ----------
    if (actie === "intrekken") {
      if (off.status === "getekend") return json({ error: "Een getekende offerte kan niet worden ingetrokken" }, 400);
      await admin.from("offertes").update({ status: "geannuleerd", sign_token_hash: null }).eq("id", off.id);
      return json({ ok: true, status: "geannuleerd" });
    }

    // ---------- gemeenschappelijke checks ----------
    const email = String(body?.email || off.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Geen geldig e-mailadres voor de klant" }, 400);
    if (!off.zaak_naam) return json({ error: "De offerte heeft nog geen naam van de zaak" }, 400);
    if (!Array.isArray(off.regels) || off.regels.length === 0) return json({ error: "De offerte heeft nog geen regels" }, 400);

    const amNaam = caller.full_name || off.accountmanager || orgNaam;

    // ---------- herinneren: zelfde token, alleen mail ----------
    if (actie === "herinneren") {
      if (!["verzonden", "geopend"].includes(off.status)) return json({ error: "Alleen een verzonden offerte kan herinnerd worden" }, 400);
      const token = String(body?.token || "");
      // Het token zelf is niet opgeslagen; de tool bewaart hem lokaal. Zonder token: nieuwe link, zelfde offerte.
      let url: string;
      if (token && (await sha256Hex(token)) === off.sign_token_hash) {
        url = `${appUrl}/tekenen/${token}`;
      } else {
        const nieuw = b64url(crypto.getRandomValues(new Uint8Array(32)));
        await admin.from("offertes").update({ sign_token_hash: await sha256Hex(nieuw) }).eq("id", off.id);
        url = `${appUrl}/tekenen/${nieuw}`;
      }
      const geldigTot = datumNL(new Date(off.sign_token_expires_at));
      await sendMail(email, from, caller.email, `Herinnering: offerte ${off.nummer} van ${orgNaam}`, mailHtml({
        orgNaam, logoUrl, nummer: off.nummer, zaak: off.zaak_naam, contact: off.contact_naam,
        eenmalig: off.eenmalig_ex, maand: off.maandbedrag_ex, geldigTot, url, amNaam, amTel: caller.phone, amEmail: caller.email, herinnering: true,
      }));
      await admin.from("offertes").update({ herinnering_op: new Date().toISOString() }).eq("id", off.id);
      return json({ ok: true, url, geldigTot });
    }

    // ---------- versturen (of opnieuw versturen / verlengen) ----------
    if (!["concept", "verzonden", "geopend", "verlopen"].includes(off.status)) {
      return json({ error: `Deze offerte heeft status '${off.status}' en kan niet (opnieuw) verstuurd worden` }, 400);
    }
    const akkoordTekst = String(off.akkoord_tekst || body?.akkoordTekst || "").trim();
    if (!akkoordTekst) return json({ error: "Er is geen akkoordtekst voor deze offerte" }, 400);

    const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const tokenHash = await sha256Hex(token);
    const inhoudHash = await sha256Hex(JSON.stringify({
      regels: off.regels, upsell: off.upsell, korting: off.korting, eenmalig_ex: off.eenmalig_ex, btw: off.btw,
      eenmalig_incl: off.eenmalig_incl, maandbedrag_ex: off.maandbedrag_ex, akkoord_tekst: akkoordTekst, zaak_naam: off.zaak_naam,
    }));
    const now = new Date();
    const expires = new Date(now.getTime() + geldigheidDagen * 86400000);

    const { error: updErr } = await admin.from("offertes").update({
      status: "verzonden",
      akkoord_tekst: akkoordTekst,
      email,
      sign_token_hash: tokenHash,
      sign_token_expires_at: expires.toISOString(),
      verzonden_op: now.toISOString(),
      verzonden_naar: email,
      verzonden_door: caller.id,
      geopend_op: null,
      geopend_aantal: 0,
      herinnering_op: null,
      afgewezen_reden: null,
      inhoud_hash: inhoudHash,
      akkoord: null,
      getekend_op: null,
    }).eq("id", off.id);
    if (updErr) return json({ error: "Opslaan mislukt: " + updErr.message }, 500);

    // Lead meenemen: status offerte_verzonden + opvolgdatum, tenzij de lead al een eindstatus heeft.
    if (off.lead_id) {
      const { data: lead } = await admin.from("leads").select("id, status, lead_list_id").eq("id", off.lead_id).single();
      if (lead && !EINDSTATUSSEN.has(lead.status)) {
        const next = new Date(now.getTime() + opvolgDagen * 86400000);
        await admin.from("leads").update({ status: "offerte_verzonden", next_contact_date: next.toISOString() }).eq("id", lead.id);
        await admin.from("call_logs").insert({
          agent_id: caller.id,
          organization_id: off.organization_id ?? null,
          lead_id: lead.id,
          lead_list_id: lead.lead_list_id,
          disposition: "offerte_verzonden",
          started_at: now.toISOString(),
          disposed_at: now.toISOString(),
          duration_seconds: 0,
          source: "offerte_send",
          notes: `Offerte ${off.nummer} verstuurd naar ${email}`,
        });
      }
    }

    const url = `${appUrl}/tekenen/${token}`;
    const geldigTot = datumNL(expires);
    try {
      await sendMail(email, from, caller.email, `Offerte ${off.nummer} van ${orgNaam} voor ${off.zaak_naam}`, mailHtml({
        orgNaam, logoUrl, nummer: off.nummer, zaak: off.zaak_naam, contact: off.contact_naam,
        eenmalig: off.eenmalig_ex, maand: off.maandbedrag_ex, geldigTot, url, amNaam, amTel: caller.phone, amEmail: caller.email, herinnering: false,
      }));
    } catch (mailErr) {
      // Offerte staat op verzonden en de link werkt; de AM kan de link zelf doorsturen.
      const msg = mailErr instanceof Error ? mailErr.message : String(mailErr);
      return json({ ok: true, url, geldigTot, mailError: msg });
    }
    return json({ ok: true, url, geldigTot });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
