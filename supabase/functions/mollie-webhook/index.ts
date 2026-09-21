// LEADGEN v89 — Mollie webhook voor zelfregistratie-betalingen (EUR 50/maand,
// opzegbaar). Mollie POST't hierheen (form-urlencoded: id=tr_xxx) bij elke
// statuswijziging van een betaling - zowel de eerste betaling (sequenceType
// 'first', komt uit signup-freelancer) als elke latere maandelijkse
// afschrijving (sequenceType 'recurring', door Mollie zelf gestart vanuit
// de subscription). Geen JWT (verify_jwt uit bij deploy) - Mollie kan geen
// Supabase-token meesturen. Haalt de echte status altijd bij Mollie zelf op
// (nooit vertrouwen op wat erin gepost wordt).
//
// - Eerste betaling 'paid' -> account activeren (is_active/payment_status/
//   paid_at) EN de subscription aanmaken (alleen als er nog geen loopt).
// - Latere betaling 'paid' -> niets bijzonders, account blijft actief.
// - Latere betaling failed/expired/canceled -> account op inactief, zodat
//   niemand toegang houdt zonder dat de maand ook echt betaald is.
//
// Secrets: MOLLIE_API_KEY, APP_URL
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    let paymentId = "";
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      paymentId = String(body?.id || "");
    } else {
      const form = await req.formData().catch(() => null);
      paymentId = String(form?.get("id") || "");
    }
    if (!paymentId) return new Response("missing id", { status: 400 });

    const mollieKey = Deno.env.get("MOLLIE_API_KEY");
    if (!mollieKey) return new Response("mollie key missing", { status: 500 });
    const mollieHeaders = { Authorization: `Bearer ${mollieKey}`, "Content-Type": "application/json" };

    const res = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, { headers: mollieHeaders });
    const payment = await res.json();
    if (!res.ok || !payment?.id) return new Response("mollie lookup failed", { status: 502 });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const mollieStatus: string = payment.status; // open, pending, paid, failed, expired, canceled
    const sequenceType: string = payment.sequenceType || "first"; // 'first' | 'recurring' | 'oneoff'

    let { data: row } = await admin.from("signup_payments").select("*").eq("mollie_payment_id", paymentId).maybeSingle();

    let profileId: string | null = row?.profile_id || null;
    if (!profileId) {
      // Onbekende betaling: dit is een door Mollie zelf gestarte recurring
      // afschrijving vanuit de subscription, die we nog niet gelogd hadden.
      const { data: prof } = await admin.from("profiles").select("id").eq("mollie_customer_id", payment.customerId).maybeSingle();
      if (!prof) return new Response("unknown payment/customer", { status: 404 });
      profileId = prof.id;
      const { data: inserted } = await admin.from("signup_payments").insert({
        profile_id: profileId,
        mollie_payment_id: paymentId,
        amount: Number(payment.amount?.value || 50),
        status: "open",
        sequence_type: sequenceType === "recurring" ? "recurring" : "first",
      }).select("*").single();
      row = inserted;
    }

    const newStatus = mollieStatus === "paid" ? "paid" : (["failed", "expired", "canceled"].includes(mollieStatus) ? mollieStatus : row!.status);
    if (row && newStatus !== row.status) {
      await admin.from("signup_payments").update({ status: newStatus }).eq("id", row.id);
    }

    if (mollieStatus === "paid" && row?.sequence_type !== "recurring" && row?.status !== "paid") {
      // Eerste betaling gelukt: account activeren + de maandelijkse
      // subscription aanmaken (idempotent - alleen als er nog geen loopt).
      await admin.from("profiles").update({
        is_active: true,
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      }).eq("id", profileId);

      const { data: prof } = await admin.from("profiles").select("mollie_customer_id, mollie_subscription_id, full_name").eq("id", profileId).single();
      if (prof && prof.mollie_customer_id && !prof.mollie_subscription_id) {
        const subRes = await fetch(`https://api.mollie.com/v2/customers/${prof.mollie_customer_id}/subscriptions`, {
          method: "POST",
          headers: mollieHeaders,
          body: JSON.stringify({
            amount: { currency: "EUR", value: "50.00" },
            interval: "1 month",
            description: `LeadGen maandelijkse bijdrage — ${prof.full_name || ""}`.trim(),
            webhookUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mollie-webhook`,
          }),
        });
        const subscription = await subRes.json();
        if (subRes.ok && subscription?.id) {
          await admin.from("profiles").update({ mollie_subscription_id: subscription.id }).eq("id", profileId);
        }
        // Lukt de subscription-aanmaak niet, dan blijft het account wel
        // actief (de eerste maand is betaald) maar draait er geen
        // automatische incasso - dat valt op omdat mollie_subscription_id
        // leeg blijft, zichtbaar voor een admin die in de DB kijkt.
      }
    } else if (["failed", "expired", "canceled"].includes(mollieStatus) && sequenceType === "recurring") {
      // Een maandelijkse afschrijving is niet gelukt: toegang eraf tot het
      // weer betaald is. payment_status blijft 'paid' (ooit succesvol
      // gestart), alleen is_active gaat uit.
      await admin.from("profiles").update({ is_active: false }).eq("id", profileId);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response("error: " + msg, { status: 500 });
  }
});
