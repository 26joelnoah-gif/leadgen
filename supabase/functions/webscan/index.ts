// ReachConnect v151 — Webscan: basis-beveiligingsscan van een website, van buitenaf.
// Port van webscan/webscan.py naar een Edge Function, zodat de tool in de app
// (public/tools/webscan.html) gewoon in de browser werkt.
//
// Alleen lezen: GET/HEAD op de site en DNS (TXT, A, AAAA) via DNS-over-HTTPS.
// Geen aanvallen, geen schrijfacties op het doel.
//
// Toegang: ingelogd + tool 'webscan' via my_tool_keys() (project of persoonlijk), of admin.
// Veiligheid: alleen echte domeinnamen (geen IP's), en elk doel (ook na een redirect)
// moet naar een publiek IP-adres wijzen. Zo kan niemand via de scanner interne
// adressen bevragen.
//
// body: { domeinen: string[] }  (max 5)  -> { resultaten: [{ host, oordeel, telling, rijen }] }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const TIMEOUT = 10000;
const UA = "team-webscan/2";
const JAAR = 31536000;
const MAX_DOMEINEN = 5;
type U = "OK" | "LET OP" | "FOUT" | "INFO" | "";
type Rij = { u: U; titel: string; bewijs: string; advies: string };

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

const ADVIES: Record<string, string> = {
  "Bereikbaarheid": "Controleer of de site online is en of DNS en hosting goed staan.",
  "SSL-certificaat": "Vernieuw het certificaat of zet automatisch verlengen aan (bijv. Let's Encrypt).",
  "HTTPS-redirect": "Stuur al het http-verkeer met een 301-redirect door naar https.",
  "HSTS (een jaar)": "Zet de header Strict-Transport-Security: max-age=31536000; includeSubDomains.",
  "Content-Security-Policy": "Voeg een Content-Security-Policy toe. Begin in report-only modus zodat er niets stukgaat.",
  "Clickjacking-bescherming": "Zet X-Frame-Options: SAMEORIGIN, of in de CSP: frame-ancestors 'self'.",
  "X-Content-Type-Options": "Zet de header X-Content-Type-Options: nosniff.",
  "Referrer-Policy": "Zet de header Referrer-Policy: strict-origin-when-cross-origin.",
  "PHP-versie": "Update PHP naar een versie met beveiligingsupdates (8.3 of nieuwer) en verberg X-Powered-By.",
  "Webserver": "Verberg het versienummer van de webserver (bijv. ServerTokens Prod bij Apache, server_tokens off bij Nginx).",
  "SPF": "Zet een SPF-record met alle diensten die namens je mailen, en eindig met -all.",
  "DMARC": "Zet een DMARC-record. Begin met p=none plus rapportage, ga daarna naar p=quarantine of p=reject.",
  "/.git/HEAD": "Blokkeer de map /.git op de server of haal hem van de server af. Hier staat je broncode in.",
  "/.env": "Haal /.env direct offline en vervang alle wachtwoorden en sleutels die erin stonden.",
  "/phpinfo.php": "Verwijder phpinfo.php. Dit bestand laat de hele serverconfiguratie zien.",
  "/xmlrpc.php": "Zet XML-RPC uit (plugin of serverregel), tenzij je het echt nodig hebt. Het wordt veel gebruikt voor inlogaanvallen.",
  "/readme.html": "Verwijder readme.html. Het verraadt dat het WordPress is en soms de versie.",
};

function rij(u: U, titel: string, bewijs: string): Rij {
  return { u, titel, bewijs, advies: u === "FOUT" || u === "LET OP" ? (ADVIES[titel] || "") : "" };
}
const kop = (titel: string): Rij => ({ u: "", titel, bewijs: "", advies: "" });

function normaliseer(doel: string): string | null {
  let d = (doel || "").trim().toLowerCase();
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  d = d.split(/[/?#]/)[0];
  d = d.split("@").pop()!.split(":")[0].replace(/^\.+|\.+$/g, "");
  try { d = new URL("http://" + d).hostname; } catch { return null; }
  return HOST_RE.test(d) ? d : null;
}

// -- DNS via DNS-over-HTTPS --

async function doh(naam: string, type: string): Promise<{ type: number; data: string }[] | null> {
  const q = encodeURIComponent(naam);
  for (const url of [`https://cloudflare-dns.com/dns-query?name=${q}&type=${type}`, `https://dns.google/resolve?name=${q}&type=${type}`]) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/dns-json", "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
      const data = await r.json();
      if (data.Status !== 0 && data.Status !== 3) continue;
      return data.Answer || [];
    } catch { /* volgende */ }
  }
  return null;
}

function txtSchoon(s: string): string {
  const delen = [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  return delen.length ? delen.join("") : s.trim();
}
async function dnsTxt(naam: string): Promise<string[] | null> {
  const a = await doh(naam, "TXT");
  return a === null ? null : a.filter((x) => x.type === 16).map((x) => txtSchoon(x.data || ""));
}

function privaatV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => isNaN(n))) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
}
function privaatV6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::" || s === "::1") return true;
  if (s.startsWith("::ffff:")) return privaatV4(s.slice(7));
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(s);
}

// Wijst deze host alleen naar publieke adressen? Uitkomst wordt per scan bewaard.
const publiekCache = new Map<string, Promise<boolean>>();
function isPubliek(host: string): Promise<boolean> {
  if (!HOST_RE.test(host)) return Promise.resolve(false);
  if (!publiekCache.has(host)) {
    publiekCache.set(host, (async () => {
      const [a, aaaa] = await Promise.all([doh(host, "A"), doh(host, "AAAA")]);
      const v4 = (a || []).filter((x) => x.type === 1).map((x) => x.data);
      const v6 = (aaaa || []).filter((x) => x.type === 28).map((x) => x.data);
      if (!v4.length && !v6.length) return false;
      return !v4.some(privaatV4) && !v6.some(privaatV6);
    })());
  }
  return publiekCache.get(host)!;
}

// -- HTTP --

type Antwoord = { status: number | null; h: Record<string, string>; body: string; fout: string; finaleUrl: string };

async function leesBegin(r: Response, max = 20000): Promise<string> {
  if (!r.body) return "";
  const reader = r.body.getReader();
  const delen: Uint8Array[] = [];
  let n = 0;
  try {
    while (n < max) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      delen.push(value); n += value.length;
    }
  } catch { /* half gelezen is ook goed */ }
  try { await reader.cancel(); } catch { /* */ }
  const buf = new Uint8Array(Math.min(n, max));
  let o = 0;
  for (const d of delen) { const rest = buf.length - o; if (rest <= 0) break; buf.set(d.subarray(0, rest), o); o += Math.min(d.length, rest); }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

function headersLaag(h: Headers): Record<string, string> {
  const uit: Record<string, string> = {};
  h.forEach((v, k) => { uit[k.toLowerCase()] = v; });
  const sc = (h as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
  if (sc && sc.length) uit["set-cookie"] = sc.join(", ");
  return uit;
}

async function haal(url: string, method = "GET", volg = true): Promise<Antwoord> {
  let huidig = url;
  for (let hop = 0; hop < 6; hop++) {
    let u: URL;
    try { u = new URL(huidig); } catch { return { status: null, h: {}, body: "", fout: "ongeldige url", finaleUrl: huidig }; }
    if (!["http:", "https:"].includes(u.protocol) || (u.port && !["80", "443"].includes(u.port))) {
      return { status: null, h: {}, body: "", fout: "doel niet toegestaan", finaleUrl: huidig };
    }
    if (!(await isPubliek(u.hostname))) return { status: null, h: {}, body: "", fout: "geen publiek adres", finaleUrl: huidig };
    let r: Response;
    try {
      r = await fetch(huidig, { method, redirect: "manual", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(TIMEOUT) });
    } catch (e) {
      return { status: null, h: {}, body: "", fout: String((e as Error)?.message || e), finaleUrl: huidig };
    }
    const h = headersLaag(r.headers);
    if (volg && r.status >= 300 && r.status < 400 && h.location) {
      try { await r.body?.cancel(); } catch { /* */ }
      huidig = new URL(h.location, huidig).toString();
      continue;
    }
    const body = method === "HEAD" ? "" : await leesBegin(r);
    return { status: r.status, h, body, fout: "", finaleUrl: huidig };
  }
  return { status: null, h: {}, body: "", fout: "te veel redirects", finaleUrl: huidig };
}

// SSL: de runtime kan het certificaat zelf niet uitlezen. Een ongeldig of verlopen
// certificaat zie je aan de foutmelding van fetch. De vervaldatum halen we uit de
// openbare certificaat-log (crt.sh); lukt dat niet, dan alleen "geldig".
async function sslDagen(host: string): Promise<number | null> {
  try {
    const r = await fetch(`https://crt.sh/?q=${encodeURIComponent(host)}&output=json&exclude=expired`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const lijst = await r.json() as { name_value: string; not_after: string; not_before: string }[];
    const nu = Date.now();
    let best: number | null = null;
    for (const c of lijst) {
      const namen = (c.name_value || "").toLowerCase().split("\n");
      const past = namen.some((n) => n === host || (n.startsWith("*.") && host.endsWith(n.slice(1)) && host.split(".").length === n.split(".").length));
      if (!past) continue;
      const voor = Date.parse(c.not_before + "Z"), na = Date.parse(c.not_after + "Z");
      if (isNaN(na) || voor > nu) continue;
      if (best === null || na > best) best = na;
    }
    return best === null ? null : Math.floor((best - nu) / 86400000);
  } catch { return null; }
}

// -- losse oordelen (zelfde als webscan.py) --

function beoordeelHsts(v: string): [U, string] {
  const m = /max-age=(\d+)/.exec(v || "");
  if (m && Number(m[1]) >= JAAR) return ["OK", v];
  if (m) return ["LET OP", `max-age te kort: ${v}`];
  return ["FOUT", "ontbreekt"];
}
function beoordeelSsl(dagen: number | null, fout: string): [U, string] {
  if (fout) return ["FOUT", `certificaat ${fout}`];
  if (dagen === null) return ["OK", "geldig (vervaldatum niet op te halen)"];
  if (dagen < 0) return ["FOUT", "certificaat is verlopen"];
  if (dagen < 14) return ["LET OP", `verloopt over ${dagen} dagen`];
  return ["OK", `geldig, nog ${dagen} dagen`];
}
function beoordeelSpf(txts: string[] | null): [U, string] {
  if (txts === null) return ["INFO", "DNS niet op te vragen"];
  const spf = txts.filter((t) => t.toLowerCase().startsWith("v=spf1"));
  if (!spf.length) return ["FOUT", "geen SPF-record"];
  if (spf.length > 1) return ["FOUT", `${spf.length} SPF-records, dat is ongeldig (er mag er maar een zijn)`];
  const rec = spf[0].trim().toLowerCase();
  if (rec.endsWith("-all")) return ["OK", spf[0]];
  if (rec.endsWith("~all")) return ["LET OP", `softfail (~all), dwingt niet hard af: ${spf[0]}`];
  if (rec.endsWith("?all") || rec.endsWith("+all")) return ["FOUT", `neutraal/pass-all, biedt geen bescherming: ${spf[0]}`];
  return ["LET OP", `geen expliciete -all/~all: ${spf[0]}`];
}
function beoordeelDmarc(txts: string[] | null): [U, string] {
  if (txts === null) return ["INFO", "DNS niet op te vragen"];
  const rec = txts.filter((t) => t.toLowerCase().startsWith("v=dmarc1"));
  if (!rec.length) return ["FOUT", "geen DMARC-record (spoofing wordt niet tegengehouden)"];
  const m = /(?:^|[;\s])p=(\w+)/.exec(rec[0].toLowerCase());
  const pol = m ? m[1] : "?";
  if (pol === "quarantine" || pol === "reject") return ["OK", rec[0]];
  if (pol === "none") return ["LET OP", `p=none: alleen monitoring, geen afdwinging: ${rec[0]}`];
  return ["LET OP", rec[0]];
}
function beoordeelPhp(xpb: string): [U, string] | null {
  const m = /php\/(\d+)\.(\d+)/.exec((xpb || "").toLowerCase());
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  if (a < 8 || (a === 8 && b < 2)) return ["FOUT", `PHP ${a}.${b} krijgt geen beveiligingsupdates meer`];
  return ["LET OP", `PHP ${a}.${b}, versienummer is zichtbaar in de headers`];
}
function beoordeelServer(s: string): [U, string] {
  if (/\/\d/.test(s || "")) return ["LET OP", `versienummer zichtbaar: ${s}`];
  return ["INFO", s || "onbekend"];
}

const PADEN: Record<string, [U, (t: string) => boolean]> = {
  "/.git/HEAD": ["FOUT", (t) => t.startsWith("ref:") || /^[0-9a-f]{40}\s*$/.test(t)],
  "/.env": ["FOUT", (t) => !t.slice(0, 300).includes("<") && /^[a-z_][a-z0-9_]*\s*=/m.test(t)],
  "/phpinfo.php": ["FOUT", (t) => t.includes("phpinfo()") || (t.includes("php version") && t.includes("php license"))],
  "/xmlrpc.php": ["LET OP", (t) => t.includes("xml-rpc server accepts post requests only")],
  "/readme.html": ["LET OP", (t) => t.includes("semantic personal publishing platform")],
};
function beoordeelPad(pad: string, code: number | null, body: string): [U, string] {
  if (code === null) return ["INFO", "geen antwoord"];
  const [ernst, herken] = PADEN[pad];
  const t = body.slice(0, 20000).trim().toLowerCase();
  if (herken(t)) return [ernst, `PUBLIEK bereikbaar (HTTP ${code})`];
  if (code === 200) return ["OK", "geeft een pagina terug, maar niet het echte bestand"];
  return ["OK", `afgeschermd (HTTP ${code})`];
}

function telling(rijen: Rij[]) {
  const n = { fout: 0, letop: 0, ok: 0, info: 0 };
  for (const r of rijen) {
    if (r.u === "FOUT") n.fout++; else if (r.u === "LET OP") n.letop++; else if (r.u === "OK") n.ok++; else if (r.u === "INFO") n.info++;
  }
  return { n, oordeel: n.fout ? "ROOD" : n.letop ? "ORANJE" : "GROEN" };
}

function sslFout(melding: string): string {
  const m = melding.toLowerCase();
  if (!/certif|tls|ssl|handshake/.test(m)) return "";
  if (m.includes("expired")) return "ongeldig: verlopen";
  if (m.includes("notvalidforname") || m.includes("not valid for name") || m.includes("hostname")) return "ongeldig: past niet bij deze domeinnaam";
  if (m.includes("unknownissuer") || m.includes("self")) return "ongeldig: niet uitgegeven door een erkende partij";
  return "ongeldig of TLS-fout";
}

// -- de scan --

async function scan(host: string) {
  const mail = host.replace(/^www\./, "");
  const r: Rij[] = [kop("Website")];
  const mailDns = Promise.all([dnsTxt(mail), dnsTxt("_dmarc." + mail)]);

  let web = host;
  let a = await haal(`https://${web}/`);
  if (a.status === null && !host.startsWith("www.")) {
    const b = await haal(`https://www.${host}/`);
    if (b.status !== null) { web = "www." + host; a = b; }
  }
  const base = "https://" + web;

  if (a.status === null) {
    const sf = sslFout(a.fout);
    const extra = a.fout === "geen publiek adres" ? " (domein wijst niet naar een publiek adres)" : sf ? ` (certificaat ${sf})` : "";
    r.push(rij("FOUT", "Bereikbaarheid", `${base} geeft geen antwoord${extra}`));
  } else {
    const h = a.h, low = a.body.toLowerCase();
    // Parallel: ssl-dagen, http-redirect, zachte-404-test, wp-login, index.php, paden.
    const rnd = crypto.randomUUID().slice(0, 12);
    const [dagen, http, zacht, wp, idx] = await Promise.all([
      sslDagen(web),
      haal(`http://${web}/`, "HEAD", false),
      haal(`${base}/webscan-${rnd}`, "GET", false),
      haal(`${base}/wp-login.php`),
      haal(`${base}/index.php`, "HEAD"),
    ]);
    r.push(rij("OK", "Bereikbaarheid", `${base} antwoordt (HTTP ${a.status})`));
    if (web !== host) r.push(rij("INFO", "Gescand via", web));
    const [su, sb] = beoordeelSsl(dagen, "");
    r.push(rij(su, "SSL-certificaat", sb));

    const loc = http.h.location || "";
    if (http.status !== null && http.status >= 300 && http.status < 400 && loc.startsWith("https")) {
      r.push(rij("OK", "HTTPS-redirect", `http stuurt door naar https (HTTP ${http.status})`));
    } else if (http.status === null) {
      r.push(rij("INFO", "HTTPS-redirect", "http niet te bereiken"));
    } else {
      r.push(rij("LET OP", "HTTPS-redirect", `http stuurt niet door naar https (HTTP ${http.status})`));
    }

    r.push(kop("Security-headers"));
    const csp = h["content-security-policy"] || "";
    const [hu, hb] = beoordeelHsts(h["strict-transport-security"] || "");
    r.push(rij(hu, "HSTS (een jaar)", hb));
    r.push(rij(csp ? "OK" : "FOUT", "Content-Security-Policy", csp ? csp.slice(0, 80) + (csp.length > 80 ? "..." : "") : "ontbreekt"));
    const xfo = h["x-frame-options"] || "";
    const frame = csp.includes("frame-ancestors") || ["DENY", "SAMEORIGIN"].includes(xfo.toUpperCase());
    r.push(rij(frame ? "OK" : "FOUT", "Clickjacking-bescherming", xfo || (frame ? "CSP frame-ancestors" : "ontbreekt")));
    const xcto = h["x-content-type-options"] || "";
    r.push(rij(xcto.toLowerCase() === "nosniff" ? "OK" : "FOUT", "X-Content-Type-Options", xcto || "ontbreekt"));
    const rp = h["referrer-policy"] || "";
    r.push(rij(rp ? "OK" : "FOUT", "Referrer-Policy", rp || "ontbreekt"));

    r.push(kop("Platform"));
    const isZacht = zacht.status === 200;
    const isWp = low.includes("/wp-content/") || low.includes("/wp-includes/") || wp.body.toLowerCase().includes("user_login");
    const xpb = h["x-powered-by"] || "";
    const sig: string[] = [];
    if (xpb.toLowerCase().includes("php")) sig.push("X-Powered-By: " + xpb);
    if ((h["set-cookie"] || "").toLowerCase().includes("phpsessid")) sig.push("PHPSESSID-cookie");
    if (isWp) sig.push("WordPress draait op PHP");
    if (!isZacht && idx.status === 200) sig.push("/index.php bestaat");
    r.push(rij("INFO", "PHP in gebruik", sig.join(", ") || "geen PHP-signaal van buiten"));
    const pv = beoordeelPhp(xpb);
    if (pv) r.push(rij(pv[0], "PHP-versie", pv[1]));
    const gen = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(a.body);
    r.push(rij("INFO", "CMS", gen ? gen[1] : isWp ? "WordPress" : "onbekend of maatwerk"));
    const [wu, wb] = beoordeelServer(h["server"] || "");
    r.push(rij(wu, "Webserver", wb));

    r.push(kop("Blootstelling"));
    const paden = ["/.git/HEAD", "/.env", "/phpinfo.php", ...(isWp ? ["/xmlrpc.php", "/readme.html"] : [])];
    const pres = await Promise.all(paden.map((p) => haal(base + p, "GET", false)));
    paden.forEach((p, i) => { const [u, t] = beoordeelPad(p, pres[i].status, pres[i].body); r.push(rij(u, p, t)); });
  }

  const [spf, dmarc] = await mailDns;
  r.push(kop(`Mail (${mail})`));
  const [pu, pb] = beoordeelSpf(spf);
  r.push(rij(pu, "SPF", pb));
  const [du, db] = beoordeelDmarc(dmarc);
  r.push(rij(du, "DMARC", db));

  // Als de https-poging faalde op het certificaat, zet dat ook als SSL-regel.
  if (a.status === null) {
    const sf = sslFout(a.fout);
    if (sf) r.splice(2, 0, rij("FOUT", "SSL-certificaat", `certificaat ${sf}`));
  }
  const t = telling(r);
  return { host, oordeel: t.oordeel, telling: t.n, rijen: r };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "Niet ingelogd" }, 401);
  const [{ data: keys }, { data: prof }] = await Promise.all([
    sb.rpc("my_tool_keys"),
    sb.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  const magHet = prof?.role === "admin" || (Array.isArray(keys) && keys.includes("webscan"));
  if (!magHet) return json({ error: "Je hebt geen toegang tot de webscan" }, 403);

  let body: { domeinen?: unknown } = {};
  try { body = await req.json(); } catch { /* */ }
  const invoer = Array.isArray(body.domeinen) ? body.domeinen.map(String) : [];
  const goed: string[] = [], fout: string[] = [];
  for (const d of invoer.slice(0, MAX_DOMEINEN)) {
    const h = normaliseer(d);
    if (h && !goed.includes(h)) goed.push(h); else if (!h) fout.push(d.slice(0, 100));
  }
  if (!goed.length) return json({ error: "Geen geldig domein", ongeldig: fout }, 400);

  const resultaten = await Promise.all(goed.map(scan));
  return json({ resultaten, ongeldig: fout, gescand_op: new Date().toISOString() });
});
