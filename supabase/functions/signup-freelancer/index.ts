// LEADGEN v88 — zelfregistratie bellers (publieke aanmeldpagina /aanmelden).
// Geen login nodig. Maakt zelf het auth-account aan (admin.auth.admin.
// createUser, service-role) - NOOIT via de publieke supabase.auth.signUp,
// want dan zou de anon key een account kunnen forceren dat meteen
// is_active=true heeft (de default). Zet daarna zelf is_active=false,
// payment_status='pending', signup_source='self_service' en maakt een
// Mollie-betaling van EUR 50 aan. Pas als mollie-webhook 'paid' bevestigt
// wordt het account actief.
//
// Secrets: MOLLIE_API_KEY, APP_URL (bv. https://leadgendash.netlify.app)
//
// body: { fullName, email, phone, password, werkAkkoord: true }
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

  let newUserId: string | null = null;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const fullName = String(body?.fullName || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const phone = String(body?.phone || "").trim();
    const password = String(body?.password || "");
    const werkAkkoord = !!body?.werkAkkoord;

    if (!fullName || fullName.length < 2) return json({ error: "Vul je volledige naam in." }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Vul een geldig e-mailadres in." }, 400);
    if (!phone || phone.replace(/\D/g, "").length < 8) return json({ error: "Vul een geldig telefoonnummer in." }, 400);
    if (!password || password.length < 6) return json({ error: "Je wachtwoord moet minimaal 6 tekens zijn." }, 400);
    if (!werkAkkoord) return json({ error: "Vink aan dat je als beller aan de slag wilt." }, 400);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: fullName },
    });
    if (createErr || !created?.user) {
      const already = /already.*registered|already exists|already been registered/i.test(createErr?.message || "");
      const msg = already
        ? "Dit e-mailadres is al bekend. Log in, of gebruik ‘wachtwoord vergeten’ op de inlogpagina."
        : (createErr?.message || "Aanmaken van je account is niet gelukt.");
      return json({ error: msg }, 400);
    }
    newUserId = created.user.id;

    const { error: profErr } = await admin.from("profiles").update({
      full_name: fullName,
      phone,
      role: "employee",
      is_active: false,
      payment_status: "pending",
      signup_source: "self_service",
    }).eq("id", newUserId);
    if (profErr) throw new Error("Profiel bijwerken mislukt: " + profErr.message);

    const mollieKey = Deno.env.get("MOLLIE_API_KEY");
    if (!mollieKey) throw new Error("Betalingen zijn nog niet ingesteld (MOLLIE_API_KEY ontbreekt). Neem contact op met de beheerder.");

    const appUrl = Deno.env.get("APP_URL") || "https://leadgendash.netlify.app";
    const mollieRes = await fetch("https://api.mollie.com/v2/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: { currency: "EUR", value: "50.00" },
        description: `LeadGen aanmelding — ${fullName}`,
        redirectUrl: `${appUrl}/aanmelden/bedankt?p=${newUserId}`,
        webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mollie-webhook`,
        metadata: { profile_id: newUserId },
      }),
    });
    const molliePayment = await mollieRes.json();
    if (!mollieRes.ok || !molliePayment?.id) {
      throw new Error("Mollie-betaling aanmaken mislukt: " + (molliePayment?.detail || mollieRes.status));
    }

    const { error: payErr } = await admin.from("signup_payments").insert({
      profile_id: newUserId,
      mollie_payment_id: molliePayment.id,
      amount: 50.00,
      status: "open",
    });
    if (payErr) throw new Error("Betaling registreren mislukt: " + payErr.message);

    const checkoutUrl = molliePayment?._links?.checkout?.href;
    if (!checkoutUrl) throw new Error("Geen betaallink ontvangen van Mollie.");

    return json({ checkoutUrl, profileId: newUserId });
  } catch (err) {
    // Opruimen: geen kaal, kapot account laten hangen als er iets misging
    // ná het aanmaken van het auth-account.
    if (newUserId) await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
