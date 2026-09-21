// LEADGEN v89 — Mollie-subscription opzeggen. Wordt aangeroepen vanuit
// Admin.jsx handleToggleActive zodra een admin een zelfregistratie-account
// (signup_source='self_service') inactief zet, zodat er nooit doorbetaald
// wordt aan iemand die geen toegang meer heeft. Vereist inloggen als admin
// (zelfde patroon als manage-password): controleert de caller zelf met de
// service-role key, niet met RLS.
//
// Secrets: MOLLIE_API_KEY
//
// body: { profileId }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: caller } = await admin.from("profiles").select("role, is_active").eq("id", userData.user.id).single();
    if (!caller || caller.is_active === false || caller.role !== "admin") {
      return json({ error: "Alleen een admin mag een abonnement opzeggen" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const profileId = String(body?.profileId || "");
    if (!profileId) return json({ error: "Geen gebruiker opgegeven" }, 400);

    const { data: target } = await admin.from("profiles").select("mollie_customer_id, mollie_subscription_id").eq("id", profileId).single();
    if (!target) return json({ error: "Gebruiker niet gevonden" }, 404);
    if (!target.mollie_subscription_id || !target.mollie_customer_id) {
      return json({ success: true, skipped: true }); // geen actief abonnement, niets op te zeggen
    }

    const mollieKey = Deno.env.get("MOLLIE_API_KEY");
    if (!mollieKey) return json({ error: "MOLLIE_API_KEY ontbreekt" }, 500);

    const res = await fetch(
      `https://api.mollie.com/v2/customers/${target.mollie_customer_id}/subscriptions/${target.mollie_subscription_id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${mollieKey}` } },
    );
    if (!res.ok && res.status !== 404) {
      const detail = await res.json().catch(() => ({}));
      return json({ error: "Opzeggen bij Mollie mislukt: " + (detail?.detail || res.status) }, 500);
    }

    await admin.from("profiles").update({ mollie_subscription_id: null }).eq("id", profileId);
    return json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
