// LEADGEN v88 — Mollie webhook voor zelfregistratie-betalingen.
// Mollie POST't hierheen (form-urlencoded: id=tr_xxx) zodra een betaling
// van status verandert. Geen JWT (verify_jwt uit bij deploy, zoals
// mailstatus/mailqueue-runner) - Mollie kan geen Supabase-token meesturen.
// Haalt de echte status altijd bij Mollie zelf op (nooit vertrouwen op wat
// erin gepost wordt) en activeert het account pas bij status 'paid'.
//
// Secrets: MOLLIE_API_KEY
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

    const res = await fetch(`https://api.mollie.com/v2/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${mollieKey}` },
    });
    const payment = await res.json();
    if (!res.ok || !payment?.id) return new Response("mollie lookup failed", { status: 502 });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: row } = await admin.from("signup_payments").select("*").eq("mollie_payment_id", paymentId).single();
    if (!row) return new Response("unknown payment", { status: 404 });

    const mollieStatus: string = payment.status;
    let newStatus = row.status;
    if (mollieStatus === "paid") newStatus = "paid";
    else if (["failed", "expired", "canceled"].includes(mollieStatus)) newStatus = mollieStatus;

    if (newStatus !== row.status) {
      await admin.from("signup_payments").update({ status: newStatus }).eq("id", row.id);
    }

    if (mollieStatus === "paid" && row.status !== "paid") {
      await admin.from("profiles").update({
        is_active: true,
        payment_status: "paid",
        paid_at: new Date().toISOString(),
      }).eq("id", row.profile_id);
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response("error: " + msg, { status: 500 });
  }
});
