// LEADGEN v64 - geocoderen van leads (adres -> lat/lng) via PDOK Locatieserver (gratis, geen key).
// Aanroep: POST { lead_ids?: uuid[], list_id?: uuid, force?: boolean, limit?: number }
//   - lead_ids: alleen deze leads
//   - list_id: alle leads in die lijst zonder coordinaten (of allemaal met force)
//   - geen van beide: alle leads zonder coordinaten (max limit, default 200)
// Wordt aangeroepen door (1) de app (knop) en (2) de DB-trigger leads_geocode_trg via pg_net
// zodra adresvelden veranderen. Schrijft ALLEEN lat/lng/geocoded_at/geocode_status.
// GEDEPLOYED als Edge Function "geocode-leads" op zboyxwwrbtpjnlgquhzs.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PDOK = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const MAX = 500;

type Lead = {
  id: string;
  address: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
};

const clean = (v: unknown) => String(v ?? "").trim();

// Sommige lijsten hebben het hele adres in 1 veld ("Straat 1, 1234 AB, Plaats").
function parts(l: Lead) {
  let street = clean(l.address), nr = clean(l.house_number), pc = clean(l.postal_code), city = clean(l.city);
  if (!street && /,/.test(pc)) {
    const m = pc.match(/^(.+?)\s+([0-9][^,]*),\s*([0-9]{4}\s?[A-Za-z]{2}),\s*(.+)$/);
    if (m) { street = m[1]; nr = m[2]; pc = m[3]; city = m[4]; }
  }
  if (!nr && street) {
    const m = street.match(/^(.+?)\s+([0-9][\w-]*)$/);
    if (m) { street = m[1]; nr = m[2]; }
  }
  pc = pc.replace(/\s+/g, "").toUpperCase();
  return { street, nr, pc, city };
}

async function pdok(q: string, type: string): Promise<{ lat: number; lng: number; type: string } | null> {
  const url = `${PDOK}?q=${encodeURIComponent(q)}&fq=type:${type}&rows=1&fl=centroide_ll,type`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "LeadGen/1.0" } });
    if (!res.ok) return null;
    const j = await res.json();
    const d = j?.response?.docs?.[0];
    const m = String(d?.centroide_ll || "").match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
    if (!m) return null;
    return { lng: parseFloat(m[1]), lat: parseFloat(m[2]), type: d.type };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function geocode(l: Lead) {
  const p = parts(l);
  const tries: Array<[string, string]> = [];
  if (p.street && p.nr) tries.push([`${p.street} ${p.nr} ${p.pc} ${p.city}`.trim(), "adres"]);
  if (p.pc && p.nr) tries.push([`${p.pc} ${p.nr}`, "adres"]);
  if (p.street && p.city) tries.push([`${p.street} ${p.city}`, "weg"]);
  if (p.pc) tries.push([p.pc, "postcode"]);
  if (p.city) tries.push([p.city, "woonplaats"]);
  for (const [q, type] of tries) {
    const r = await pdok(q, type);
    if (r) return { lat: r.lat, lng: r.lng, status: type === "adres" ? "ok" : `approx:${type}` };
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  let body: { lead_ids?: string[]; list_id?: string; force?: boolean; limit?: number } = {};
  try { body = await req.json(); } catch { /* leeg */ }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const limit = Math.min(Math.max(Number(body.limit) || 200, 1), MAX);

  let q = admin.from("leads").select("id,address,house_number,postal_code,city").is("deleted_at", null);
  if (body.lead_ids?.length) q = q.in("id", body.lead_ids.slice(0, MAX));
  else if (body.list_id) q = q.eq("lead_list_id", body.list_id);
  if (!body.force) q = q.is("lat", null);
  const { data: leads, error } = await q.limit(limit);
  if (error) return json({ error: error.message }, 500);

  let ok = 0, approx = 0, failed = 0;
  // 4 tegelijk, PDOK kan dat prima aan
  const queue = [...(leads as Lead[])];
  async function worker() {
    while (queue.length) {
      const l = queue.shift()!;
      const r = await geocode(l);
      const now = new Date().toISOString();
      if (r) {
        await admin.from("leads").update({ lat: r.lat, lng: r.lng, geocoded_at: now, geocode_status: r.status }).eq("id", l.id);
        if (r.status === "ok") ok++; else approx++;
      } else {
        await admin.from("leads").update({ geocoded_at: now, geocode_status: "notfound" }).eq("id", l.id);
        failed++;
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  return json({ total: leads?.length ?? 0, ok, approx, failed });
});
