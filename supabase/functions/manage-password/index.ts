// LEADGEN v35 — wachtwoorden aanpassen/resetten voor gebruikers.
// Admin mag iedereen in zijn organisatie(s) resetten; een manager met
// can_manage_team mag alleen bellers resetten die (nu of eerder) op een
// van zijn eigen projecten hebben gestaan. Iedereen mag zichzelf resetten
// (fallback - normaal gebeurt dat direct via supabase.auth.updateUser in
// de app, zonder deze functie).
// Wachtwoorden zelf kunnen NOOIT via SQL/migratie gezet worden (auth.users
// is voor agents afgeschermd) - dit MOET via de Admin-API met de
// service-role key, vandaar deze Edge Function.
// Elke geslaagde wijziging wordt gelogd in password_reset_log (v35).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function randomPassword(len = 12): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Niet ingelogd" }, 401);
    const callerId = userData.user.id;

    const { data: caller } = await userClient
      .from("profiles")
      .select("id, role, is_active, can_manage_team, organization_id")
      .eq("id", callerId)
      .single();
    if (!caller || caller.is_active === false) return json({ error: "Je account is inactief" }, 403);

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.targetUserId || "");
    if (!targetUserId) return json({ error: "Geen gebruiker opgegeven" }, 400);

    const generate = !!body?.generate;
    let newPassword = typeof body?.newPassword === "string" ? body.newPassword.trim() : "";
    if (generate) newPassword = randomPassword(12);
    if (!newPassword || newPassword.length < 6) {
      return json({ error: "Wachtwoord moet minimaal 6 tekens zijn" }, 400);
    }

    // Vanaf hier met de service-role key: dit is de enige toegestane manier
    // om een wachtwoord te zetten (auth.admin.updateUserById), en de enige
    // manier om het doel-profiel te lezen zonder RLS-afhankelijkheden.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: target } = await admin
      .from("profiles")
      .select("id, full_name, email, role, is_active, organization_id")
      .eq("id", targetUserId)
      .single();
    if (!target) return json({ error: "Gebruiker niet gevonden" }, 404);

    let allowed = false;

    if (target.id === caller.id) {
      allowed = true;
    } else if (caller.role === "admin") {
      if (target.organization_id === caller.organization_id) {
        allowed = true;
      } else if (target.organization_id) {
        const { data: owned } = await admin
          .from("organizations")
          .select("id")
          .eq("owner_id", caller.id)
          .eq("id", target.organization_id)
          .limit(1);
        allowed = !!(owned && owned.length);
      }
    } else if (caller.role === "manager" && caller.can_manage_team && target.role === "employee") {
      const { data: managedIds } = await userClient.rpc("my_managed_list_ids");
      const listIds: string[] = Array.isArray(managedIds) ? managedIds : [];
      if (listIds.length) {
        const { data: assignedList } = await admin
          .from("lead_lists")
          .select("id")
          .eq("assigned_to", target.id)
          .in("id", listIds)
          .limit(1);
        if (assignedList && assignedList.length) allowed = true;
        if (!allowed) {
          const { data: logRow } = await admin
            .from("call_logs")
            .select("id")
            .eq("agent_id", target.id)
            .in("lead_list_id", listIds)
            .limit(1);
          if (logRow && logRow.length) allowed = true;
        }
      }
    }

    if (!allowed) {
      return json({ error: "Geen toestemming om het wachtwoord van deze gebruiker te wijzigen." }, 403);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(target.id, { password: newPassword });
    if (updErr) return json({ error: updErr.message }, 500);

    const method = target.id === caller.id ? "self" : (generate ? "generated" : "manual");
    await admin.from("password_reset_log").insert({
      actor_id: caller.id,
      target_id: target.id,
      target_email: target.email,
      method,
    });

    return json({ success: true, email: target.email, password: generate ? newPassword : undefined });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: msg }, 500);
  }
});
