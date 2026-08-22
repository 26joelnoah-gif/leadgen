// =====================================================
// Effectieve beltijd (v24)
//
// Per afboeking geldt een maximum aan AFHANDELTIJD die meetelt voor
// uren/uitbetaling (de timer loopt vanaf het tonen van de lead t/m de
// afboeking, dus incl. lezen, rinkelen en afboeken). Duurt het langer,
// dan telt alleen het maximum mee ("effectieve beltijd"); de kloktijd
// blijft zichtbaar in de gesprekkenlijsten.
//
// Waarden getoetst aan benchmarks (Cognism 204k+ calls, Orum, Sales
// Hacker, 22-08-2026): gemiddelde cold call 52-93 sec, 90% klaar
// binnen 2 min, succesvolle calls 5-7 min gesprekstijd, telefoon
// rinkelt 20-25 sec voor de voicemail aanslaat.
// Pas de waarden hieronder aan als de regels veranderen; alle
// schermen (Payouts, Earnings, Reports, Manager) rekenen hiermee.
// =====================================================

export const EFFECTIVE_CALL_CAPS = {
  // geen contact: rinkelen (20-25s) + afboeken moet er wel in passen
  geen_gehoor: 30,            // 30 sec
  voicemail: 45,              // 45 sec (rinkelen + korte boodschap)
  mailbox: 45,                // legacy naam voor voicemail
  verkeerd_nummer: 60,        // 1 min (kort gesprekje nodig)
  blacklist: 60,              // 1 min (kort gesprekje / constatering)

  // kort contact
  geen_interesse: 3 * 60,     // 3 min
  later_bellen: 3 * 60,
  onjuiste_timing: 3 * 60,
  mailen: 3 * 60,
  cold: 3 * 60,

  // positief
  terugbelafspraak: 6 * 60,   // 6 min
  ptfu: 6 * 60,
  goed_op_weg: 10 * 60,
  afspraak_gemaakt: 10 * 60,  // 10 min
  deal: 10 * 60,              // 10 min
  verbetering_nodig: 10 * 60
}

// Onbekende/nieuwe afboekingen: veilige middenweg
export const DEFAULT_CALL_CAP = 5 * 60

export function callCap(disposition) {
  return EFFECTIVE_CALL_CAPS[disposition] ?? DEFAULT_CALL_CAP
}

// De beltijd die meetelt voor uren en uitbetaling
export function effectiveSeconds(disposition, rawSeconds) {
  return Math.min(rawSeconds || 0, callCap(disposition))
}

// True als de kloktijd boven het maximum voor deze afboeking zat
export function isCapped(disposition, rawSeconds) {
  return (rawSeconds || 0) > callCap(disposition)
}
