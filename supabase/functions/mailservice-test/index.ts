// ReachConnect v120 — mailservice-test: probeer de webhook van een project uit
// en vertel precies wat eruit komt. Alleen voor admins.
//
// Waarom: bij een fout zag je alleen "Versturen via BRON mislukt (401)". Dat
// zegt niets over WAT er mis is. Deze functie stuurt dezelfde body als de echte
// Mailingservice en geeft terug: de URL, de HTTP-status, het ANTWOORD van de
// bron, hoe lang het duurde, de body die wij stuurden (nooit de token) en een
// uitleg in gewone taal.
//
// body: {
//   campaign_id,            // verplicht
//   email?,                 // waar de testmail heen mag; standaard je eigen adres
//   mail?,                  // mailsoort, standaard de standaardkeuze van het project
//   webhook_url?, token?, body_template?   // om instellingen te proberen die nog
//                                          // NIET zijn opgeslagen
// }
//
// LET OP: dit is een echte aanroep. Lukt hij, dan verstuurt de bron ook echt
// een mail naar het opgegeven adres. Er wordt niets afgeboekt op een lead en er
// komt geen rij in mailservice_logs: dit is puur een test.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TIMEOUT_MS = 15_000;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i;

function kort(v: unknown, max: number): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : undefined;
}

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

// v121: token nooit tonen, alleen lengte en de laatste vier tekens.
function gemaskeerd(token: string): string {
  if (token.length >= 20) return `Bearer ****${token.slice(-4)} (${token.length} tekens)`;
  return `Bearer **** (${token.length} tekens)`;
}

function vulTemplate(tpl: unknown, velden: Record<string, string | undefined>): unknown {
  if (typeof tpl === "string") {
    const alleen = tpl.match(/^\{\{\s*([a-z_]{1,40})\s*\}\}$/);
    if (alleen) return velden[alleen[1]] ?? null;
    return tpl.replace(/\{\{\s*([a-z_]{1,40})\s*\}\}/g, (_m, k) => velden[k] ?? "");
  }
  if (Array.isArray(tpl)) return tpl.map((v) => vulTemplate(v, velden)).filter((v) => v !== null && v !== "");
  if (tpl && typeof tpl === "object") {
    const uit: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(tpl as Record<string, unknown>)) {
      const w = vulTemplate(v, velden);
      if (w === null || w === undefined || w === "") continue;
      if (typeof w === "object" && !Array.isArray(w) && Object.keys(w as Record<string, unknown>).length === 0) continue;
      uit[k] = w;
    }
    return uit;
  }
  return tpl;
}

// Wat betekent deze status, in gewone taal?
function uitlegBij(status: number, bron: string): string {
  if (status === 401 || status === 403) {
    return `De bron weigert de token (${status}). Negen van de tien keer staat er een andere token in de projectinstellingen dan bij ${bron}, of is hij daar opnieuw gegenereerd. Let ook op een spatie of regeleinde die is meegeplakt. Controleer verder of ${bron} de token als "Authorization: Bearer ..." verwacht.`;
  }
  if (status === 404) return "De webhook-URL bestaat niet bij de bron (404). Controleer het pad.";
  if (status === 405) return "De bron accepteert geen POST op dit adres (405). Waarschijnlijk klopt de URL niet.";
  if (status === 400 || status === 422) return "De bron snapt de body niet. Kijk bij het antwoord hieronder welk veld hij mist en pas de body-template aan.";
  if (status === 409) return "De bron kent deze lead al of hij zit al verder in de flow. Dat is geen instellingsfout.";
  if (status === 429) return "Te veel verzoeken naar de bron. Even wachten.";
  if (status >= 500) return "De bron geeft zelf een fout. Dat ligt aan hun kant, niet aan de instellingen.";
  return "";
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
    const { data: caller } = await admin.from("profiles")
      .select("id, full_name, email, phone, role, is_active").eq("id", userData.user.id).single();
    if (!caller || caller.is_active === false) return json({ error: "Je account is inactief" }, 403);
    if (caller.role !== "admin") return json({ error: "Alleen een admin mag de koppeling testen" }, 403);

    // Rem: deze functie roept een adres aan dat de admin zelf opgeeft.
    const { data: teVeel } = await admin.rpc("rate_limit_hit", {
      p_key: `mailtest:${caller.id}`, p_max: 20, p_window_seconds: 3600,
    });
    if (teVeel === true) return json({ error: "Je hebt te vaak getest. Probeer het over een uur opnieuw." }, 429);

    const body = await req.json().catch(() => ({}));
    const campaignId = String(body?.campaign_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(campaignId)) return json({ error: "Geen project opgegeven" }, 400);

    const { data: svc } = await admin.from("campaign_mail_services")
      .select("enabled, source, mail_type, mail_types, webhook_url, body_template")
      .eq("campaign_id", campaignId).maybeSingle();
    if (!svc) return json({ error: "Voor dit project staat nog geen mailingservice ingesteld" }, 404);

    // Instellingen die nog niet zijn opgeslagen mogen meegegeven worden.
    const { data: geheim } = await admin.from("campaign_mail_secrets")
      .select("token").eq("campaign_id", campaignId).maybeSingle();
    const ruweToken = typeof body?.token === "string" && body.token.trim()
      ? String(body.token)
      : (geheim?.token || Deno.env.get(`MAILSERVICE_${svc.source}_KEY`) || "");
    const token = ruweToken.trim();
    const url = (kort(body?.webhook_url, 500) || svc.webhook_url || Deno.env.get(`MAILSERVICE_${svc.source}_URL`) || "").trim();
    const template = body?.body_template ?? svc.body_template;

    const tokenBron = (typeof body?.token === "string" && body.token.trim())
      ? "het formulier (nog niet opgeslagen)"
      : (geheim?.token ? "de projectinstellingen" : "een Supabase secret");
    const tokenNetjes = token === ruweToken;

    if (!url) return json({ error: "Er staat geen webhook-URL ingesteld voor dit project" }, 400);
    if (!veiligeUrl(url)) return json({ error: "De webhook-URL moet https zijn met een gewone domeinnaam" }, 400);
    if (token.length < 8) return json({ error: "Er staat geen token ingesteld voor dit project" }, 400);

    const email = (kort(body?.email, 254) || String(caller.email || "")).toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: "Vul een geldig e-mailadres in voor de test" }, 400);

    const toegestaan: string[] = Array.isArray(svc.mail_types) && svc.mail_types.length ? svc.mail_types : [svc.mail_type];
    const mailSoort = (kort(body?.mail, 40) || svc.mail_type || toegestaan[0] || "").toLowerCase();
    if (!toegestaan.includes(mailSoort)) return json({ error: "Deze mailsoort staat niet aan voor dit project" }, 400);

    const velden: Record<string, string | undefined> = {
      mail: mailSoort,
      lead_id: `test-${crypto.randomUUID()}`,
      email,
      bedrijfsnaam: "ReachConnect testbedrijf",
      contactpersoon: kort(caller.full_name, 100) || "Test Contact",
      stad: "Arnhem",
      website: "https://example.com",
      telefoon: "+31600000000",
      beller_naam: kort(caller.full_name, 100) || "ReachConnect",
      beller_telefoon: kort(caller.phone, 30),
      bron: svc.source,
    };
    const payload = template ? vulTemplate(template, velden) : {
      mail: velden.mail, email: velden.email, bedrijfsnaam: velden.bedrijfsnaam,
      contactpersoon: velden.contactpersoon, stad: velden.stad, website: velden.website,
      beller: { naam: velden.beller_naam }, lead_id: velden.lead_id,
    };

    const start = Date.now();
    let status = 0;
    let antwoord = "";
    let netwerkfout = "";
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
        redirect: "error",
      });
      clearTimeout(timer);
      status = res.status;
      antwoord = (await res.text().catch(() => "")).slice(0, 1000);
    } catch (e) {
      netwerkfout = e instanceof Error && e.name === "AbortError"
        ? `De bron reageerde niet binnen ${TIMEOUT_MS / 1000} seconden.`
        : "Geen verbinding met de bron. Mogelijk klopt het adres niet, stuurt het door naar een ander adres (dat staan wij bewust niet toe), of is het certificaat niet in orde.";
    }

    const gelukt = status >= 200 && status < 300;
    const opmerkingen: string[] = [];
    if (!tokenNetjes) opmerkingen.push("LET OP: de token begint of eindigt met een spatie of regeleinde. Dat is vaak de oorzaak van een 401. Wij sturen hem zonder, maar sla hem ook netjes op.");
    opmerkingen.push(`Token komt uit ${tokenBron}, lengte ${token.length} tekens.`);
    if (!/\/$/.test(url) && url.includes(" ")) opmerkingen.push("De URL bevat een spatie.");

    return json({
      ok: gelukt,
      url,
      verzoek: {
        url,
        methode: "POST",
        headers: {
          "Authorization": gemaskeerd(token),
          "Content-Type": "application/json",
        },
        body: payload,
      },
      mail_soort: mailSoort,
      test_email: email,
      status: status || null,
      duur_ms: Date.now() - start,
      antwoord_van_de_bron: antwoord || null,
      netwerkfout: netwerkfout || null,
      uitleg: netwerkfout || (gelukt
        ? "De bron heeft het verzoek geaccepteerd. Controleer of de testmail aankomt."
        : uitlegBij(status, svc.source)),
      verstuurde_body: payload,
      opmerkingen,
    });
  } catch (err) {
    console.error("[mailservice-test]", err);
    return json({ error: "Er ging iets mis" }, 500);
  }
});
