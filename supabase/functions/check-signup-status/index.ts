// LEADGEN v88 — status opvragen voor de bedankt-pagina na een Mollie-
// betaling (/aanmelden/bedankt?p=<profileId>). Publiek (geen login: de
// aanmelder heeft nog geen sessie), maar geeft alleen twee booleans/status
// terug, geen naam/e-mail/telefoon - profileId (een UUID) is niet te raden
// en levert sowieso geen gevoelige data op.
//
// query of body: { p: profileId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// v100: rate limit via public.rate_limit_hit (true = te veel). Faalt open:
// als de DB-check zelf faalt, laten we het verzoek door.
async function teVeel(key: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await svc.rpc("rate_limit_hit", { p_key: key, p_max: max, p_window_seconds: windowSec });
    return !error && data === true;
  } catch { return false; }
}
const clientIp = (req: Request) =>
  (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "onbekend";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    if (await teVeel(`signup-status:${clientIp(req)}`, 120, 600)) return json({ error: "te_veel_verzoeken" }, 429);
    const url = new URL(req.url);
    let profileId = url.searchParams.get("p") || "";
    if (!profileId) {
      const body = await req.json().catch(() => ({}));
      profileId = String(body?.p || "");
    }
    if (!profileId) return json({ error: "geen profiel opgegeven" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: prof } = await admin.from("profiles").select("is_active, payment_status").eq("id", profileId).single();
    if (!prof) return json({ error: "niet gevonden" }, 404);

    const { data: pay } = await admin
      .from("signup_payments")
      .select("status")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return json({
      activated: prof.is_active === true,
      paymentStatus: pay?.status || prof.payment_status || "open",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
