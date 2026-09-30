// ReachConnect v114 - Google Agenda koppelen en ontkoppelen.
//
// Drie ingangen in één functie (verify_jwt staat uit, want Google komt op de
// callback terug zonder token; de andere twee controleren zelf de login):
//   POST { actie: "start" }        + Authorization: Bearer <login-token>
//        -> geeft de Google-toestemmings-URL terug
//   GET  ?code=...&state=...       (Google stuurt de gebruiker hierheen terug)
//        -> wisselt de code om, maakt de agenda "ReachConnect afspraken" aan
//           in zijn Google-account en bewaart het refresh_token
//   POST { actie: "ontkoppelen" }  + Authorization: Bearer <login-token>
//        -> haalt die agenda weg, trekt de toegang in bij Google en wist alles
//
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL
// Omleidings-URI die in Google Cloud moet staan:
//   https://<project>.supabase.co/functions/v1/google-agenda-oauth
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  AGENDA_NAAM, GOOGLE_SCOPES, TIJDZONE, accessToken, adminClient, clientIp,
  corsHeaders, googleFetch, redirectUri, sha256Hex, teVeel,
} from "./google.ts";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// e-mailadres uit het id_token halen (alleen om te tonen wie gekoppeld is)
function mailUitIdToken(idToken: string | undefined): string | null {
  try {
    if (!idToken) return null;
    const deel = idToken.split(".")[1];
    const json = JSON.parse(atob(deel.replace(/-/g, "+").replace(/_/g, "/")));
    return json.email || null;
  } catch { return null; }
}

function terugNaarApp(status: string, melding?: string): Response {
  const app = (Deno.env.get("APP_URL") || "https://leadgendash.netlify.app").replace(/\/$/, "");
  const url = new URL(`${app}/agenda`);
  url.searchParams.set("google", status);
  if (melding) url.searchParams.set("melding", melding);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const admin = adminClient();
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const url = new URL(req.url);

  // ---------------------------------------------------------------- callback
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
    if (await teVeel(`google-agenda-cb:${clientIp(req)}`, 30, 600)) {
      return terugNaarApp("fout", "Te veel pogingen, probeer het straks opnieuw");
    }
    if (url.searchParams.get("error")) return terugNaarApp("geannuleerd");
    if (!clientId || !clientSecret) return terugNaarApp("fout", "Google-sleutels ontbreken");

    const state = url.searchParams.get("state") || "";
    const stateHash = await sha256Hex(state);
    const { data: rij } = await admin
      .from("google_agenda_oauth_states")
      .select("user_id, expires_at")
      .eq("state_hash", stateHash)
      .maybeSingle();
    if (!rij) return terugNaarApp("fout", "Koppelverzoek niet herkend, probeer opnieuw");
    await admin.from("google_agenda_oauth_states").delete().eq("state_hash", stateHash);
    if (new Date(rij.expires_at).getTime() < Date.now()) {
      return terugNaarApp("fout", "Koppelverzoek verlopen, probeer opnieuw");
    }

    // 1. code omwisselen voor tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: url.searchParams.get("code") || "",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const tok = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tok.access_token) {
      return terugNaarApp("fout", String(tok?.error_description || tok?.error || "Google gaf geen toegang"));
    }
    if (!tok.refresh_token) {
      return terugNaarApp("fout", "Google gaf geen blijvende toegang. Haal ReachConnect weg bij je Google-accountinstellingen en koppel opnieuw.");
    }

    // 2. eigen agenda aanmaken (of de bestaande hergebruiken)
    const { data: bestaand } = await admin
      .from("google_agenda_accounts").select("calendar_id").eq("user_id", rij.user_id).maybeSingle();

    let calendarId: string | null = bestaand?.calendar_id || null;
    if (!calendarId) {
      const calRes = await googleFetch(tok.access_token, "https://www.googleapis.com/calendar/v3/calendars", {
        method: "POST",
        body: JSON.stringify({
          summary: AGENDA_NAAM,
          description: "Afspraken vanuit ReachConnect. Wijzigingen doe je in ReachConnect, niet hier.",
          timeZone: TIJDZONE,
        }),
      });
      const cal = await calRes.json().catch(() => ({}));
      if (!calRes.ok || !cal.id) {
        return terugNaarApp("fout", String(cal?.error?.message || "Kon de agenda niet aanmaken in Google"));
      }
      calendarId = cal.id as string;
    }

    const { data: prof } = await admin
      .from("profiles").select("organization_id").eq("id", rij.user_id).maybeSingle();

    const { error: opslagFout } = await admin.from("google_agenda_accounts").upsert({
      user_id: rij.user_id,
      organization_id: prof?.organization_id || null,
      google_email: mailUitIdToken(tok.id_token),
      refresh_token: tok.refresh_token,
      access_token: tok.access_token,
      access_token_expires_at: new Date(Date.now() + Number(tok.expires_in || 3600) * 1000).toISOString(),
      calendar_id: calendarId,
      connected_at: new Date().toISOString(),
      last_error: null,
      last_error_at: null,
    }, { onConflict: "user_id" });
    if (opslagFout) return terugNaarApp("fout", "Kon de koppeling niet opslaan");

    return terugNaarApp("gekoppeld");
  }

  // ------------------------------------------------------------ ingelogd deel
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer /i, "");
  if (!jwt) return json({ error: "Niet ingelogd" }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const gebruiker = userData?.user;
  if (userErr || !gebruiker) return json({ error: "Niet ingelogd" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* leeg */ }
  const actie = String(body.actie || "start");

  if (await teVeel(`google-agenda-oauth:${gebruiker.id}`, 20, 600)) {
    return json({ error: "Te veel pogingen. Probeer het over tien minuten opnieuw." }, 429);
  }

  // -------------------------------------------------------------- koppelen
  if (actie === "start") {
    if (!clientId) return json({ error: "De Google-koppeling is nog niet ingesteld (GOOGLE_CLIENT_ID ontbreekt)." }, 400);
    const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const { error } = await admin.from("google_agenda_oauth_states").insert({
      state_hash: await sha256Hex(state),
      user_id: gebruiker.id,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    if (error) return json({ error: "Kon het koppelverzoek niet klaarzetten" }, 500);

    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", redirectUri());
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", GOOGLE_SCOPES);
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("prompt", "consent");
    auth.searchParams.set("include_granted_scopes", "true");
    auth.searchParams.set("state", state);
    return json({ url: auth.toString() });
  }

  // ------------------------------------------------------------ ontkoppelen
  if (actie === "ontkoppelen") {
    const { data: account } = await admin
      .from("google_agenda_accounts").select("*").eq("user_id", gebruiker.id).maybeSingle();
    if (!account) return json({ ok: true, melding: "Er was geen koppeling" });

    // Best effort: onze eigen agenda weghalen en de toegang intrekken.
    try {
      const token = await accessToken(admin, account);
      if (account.calendar_id) {
        await googleFetch(token, `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(account.calendar_id)}`, { method: "DELETE" });
      }
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(account.refresh_token)}`, { method: "POST" });
    } catch (e) {
      console.warn("ontkoppelen: opruimen bij Google mislukt", String(e));
    }

    await admin.from("google_agenda_events").delete().eq("user_id", gebruiker.id);
    await admin.from("agenda_blocks").delete().eq("user_id", gebruiker.id).eq("bron", "google");
    await admin.from("google_agenda_accounts").delete().eq("user_id", gebruiker.id);
    return json({ ok: true });
  }

  return json({ error: "Onbekende actie" }, 400);
});
