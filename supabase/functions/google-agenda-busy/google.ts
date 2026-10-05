// ReachConnect v114 - gedeelde hulpjes voor de Google Agenda-koppeling.
// Twee smalle rechten: een eigen agenda die wij zelf aanmaken (app.created)
// en alleen zien wanneer iemand bezet is (freebusy). Nooit meer dan dat.
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.freebusy",
  "openid",
  "email",
].join(" ");

export const AGENDA_NAAM = "ReachConnect afspraken";
export const TIJDZONE = "Europe/Amsterdam";
export const AFSPRAAK_MINUTEN = 150; // standaard (shoot), gelijk aan APPOINTMENT_DURATION_MINUTES
// v124: duur en naam per soort afspraak (leads.appointment_type). Gelijk aan
// APPOINTMENT_TYPES in src/lib/appointmentConfig.js. Leeg/onbekend = shoot.
export const AFSPRAAK_SOORTEN: Record<string, { label: string; minuten: number }> = {
  shoot: { label: "Shoot", minuten: 150 },
  bezoek: { label: "Bezoek", minuten: 60 },
};
export function afspraakSoort(type: unknown): { label: string; minuten: number } {
  return AFSPRAAK_SOORTEN[String(type || "")] || AFSPRAAK_SOORTEN.shoot;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-google-agenda-key",
};

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export function redirectUri(): string {
  return `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-agenda-oauth`;
}

export async function teVeel(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await adminClient().rpc("rate_limit_hit", { p_key: key, p_max: max, p_window_seconds: windowSec });
    return !error && data === true;
  } catch { return false; }
}

export const clientIp = (req: Request) =>
  (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "onbekend";

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Vers toegangstoken voor deze medewerker. Google geeft een refresh_token dat
// blijft werken; het toegangstoken is een uur geldig en bewaren we erbij.
export async function accessToken(admin: SupabaseClient, account: Record<string, unknown>): Promise<string> {
  const nu = Date.now();
  const verloopt = account.access_token_expires_at ? new Date(String(account.access_token_expires_at)).getTime() : 0;
  if (account.access_token && verloopt > nu + 120000) return String(account.access_token);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: String(account.refresh_token),
      grant_type: "refresh_token",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const melding = body?.error_description || body?.error || `HTTP ${res.status}`;
    await admin.from("google_agenda_accounts")
      .update({ last_error: `Toegang tot Google verlopen of ingetrokken (${melding}). Koppel opnieuw.`, last_error_at: new Date().toISOString() })
      .eq("user_id", account.user_id);
    throw new Error(`token-verversen mislukt: ${melding}`);
  }
  const geldigTot = new Date(nu + (Number(body.expires_in || 3600) * 1000)).toISOString();
  await admin.from("google_agenda_accounts")
    .update({ access_token: body.access_token, access_token_expires_at: geldigTot })
    .eq("user_id", account.user_id);
  return body.access_token as string;
}

export async function googleFetch(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  return res;
}
