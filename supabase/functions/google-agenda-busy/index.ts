// ReachConnect v114 - bezette tijd uit de Google-agenda halen.
//
// Draait elk kwartier via pg_cron (reachconnect-google-agenda-busy ->
// public.google_agenda_busy_kick). Vraagt bij Google alleen op WANNEER de
// accountmanager bezet is in zijn eigen agenda - geen titels, geen deelnemers,
// geen details (recht: calendar.freebusy). Die tijd komt in agenda_blocks met
// bron='google', zodat bellers er geen afspraak overheen kunnen plannen.
//
// De blokkades van de komende 28 dagen worden elke ronde opnieuw gezet, zodat
// een afspraak die in Google verdwijnt hier ook weer vrijkomt.
//
// header: x-google-agenda-key   body: { bron }  of  { user_id } voor één persoon
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { TIJDZONE, accessToken, adminClient, corsHeaders } from "./google.ts";

const DAGEN_VOORUIT = 28;
const MAX_BLOKKADES = 400;
const TITEL = "Bezet (Google Agenda)";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const admin = adminClient();
  const { data: sleutel } = await admin.rpc("google_agenda_key");
  if (!sleutel || (req.headers.get("x-google-agenda-key") || "") !== sleutel) {
    return json({ error: "Geen toegang" }, 401);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* leeg */ }

  let q = admin.from("google_agenda_accounts").select("*").eq("busy_import_enabled", true);
  if (body.user_id) q = q.eq("user_id", String(body.user_id));
  const { data: accounts } = await q;
  if (!accounts || accounts.length === 0) return json({ ok: true, accounts: 0 });

  const nu = new Date();
  const tot = new Date(nu.getTime() + DAGEN_VOORUIT * 24 * 60 * 60 * 1000);
  const uitslag: Record<string, unknown>[] = [];

  for (const account of accounts) {
    try {
      const token = await accessToken(admin, account);
      const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          timeMin: nu.toISOString(),
          timeMax: tot.toISOString(),
          timeZone: TIJDZONE,
          items: [{ id: "primary" }],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);

      const agenda = data?.calendars?.primary || {};
      if (agenda.errors && agenda.errors.length > 0) {
        throw new Error(agenda.errors.map((e: Record<string, string>) => e.reason).join(", "));
      }

      const bezet: { start: string; end: string }[] = (agenda.busy || []).slice(0, MAX_BLOKKADES);

      // Alles wat nu of later valt opnieuw zetten. Blokkades in het verleden
      // laten we met rust, die zijn geschiedenis.
      await admin.from("agenda_blocks")
        .delete()
        .eq("user_id", account.user_id)
        .eq("bron", "google")
        .gte("end_at", nu.toISOString());

      if (bezet.length > 0) {
        const rijen = bezet
          .filter((b) => b.start && b.end && new Date(b.end) > nu)
          .map((b) => ({
            organization_id: account.organization_id,
            user_id: account.user_id,
            start_at: new Date(b.start).toISOString(),
            end_at: new Date(b.end).toISOString(),
            title: TITEL,
            bron: "google",
          }));
        if (rijen.length > 0) {
          const { error } = await admin.from("agenda_blocks").insert(rijen);
          if (error) throw new Error(error.message);
        }
      }

      await admin.from("google_agenda_accounts")
        .update({ last_busy_sync_at: new Date().toISOString(), last_error: null, last_error_at: null })
        .eq("user_id", account.user_id);
      uitslag.push({ user_id: account.user_id, blokkades: bezet.length });
    } catch (e) {
      console.error("google-agenda-busy", account.user_id, String(e));
      await admin.from("google_agenda_accounts")
        .update({ last_error: `Bezette tijd ophalen mislukt: ${String(e)}`, last_error_at: new Date().toISOString() })
        .eq("user_id", account.user_id);
      uitslag.push({ user_id: account.user_id, fout: String(e) });
    }
  }

  return json({ ok: true, accounts: accounts.length, uitslag });
});
