// Opnieuw proberen bij een hikkel (betrouwbaarheid v71)
//
// De meeste mislukte opslagacties in een callcenter zijn geen echte fouten:
// de wifi valt een seconde weg, of Supabase heeft even een piek. Eén keer
// opnieuw proberen lost dat op zonder dat de beller iets merkt.
//
// Alleen tijdelijke problemen worden opnieuw geprobeerd. Een fout als "geen
// rechten" of "waarde klopt niet" komt bij een tweede poging net zo hard
// terug, dus die geven we meteen door.

const TIJDELIJK = [
  'failed to fetch', 'networkerror', 'network request failed',
  'timeout', 'timed out', 'fetch failed', 'load failed',
  'socket', 'econnreset', 'service unavailable', 'gateway'
]

export function isTijdelijkeFout(fout) {
  if (!fout) return false
  const tekst = `${fout.message || ''} ${fout.details || ''} ${fout.code || ''}`.toLowerCase()
  if (TIJDELIJK.some(t => tekst.includes(t))) return true
  // Supabase/PostgREST geeft bij overbelasting of onderhoud een 5xx terug
  const status = Number(fout.status || fout.statusCode || 0)
  return status >= 500 && status < 600
}

const wacht = (ms) => new Promise(r => setTimeout(r, ms))

/**
 * Voert een Supabase-actie uit en probeert het bij een tijdelijke storing
 * nog een paar keer. Verwacht een functie die { data, error } teruggeeft.
 * @returns {Promise<{data:any, error:any, pogingen:number}>}
 */
export async function metRetry(actie, { pogingen = 3, pauzeMs = 400 } = {}) {
  let laatste = null
  for (let i = 1; i <= pogingen; i++) {
    try {
      const resultaat = await actie()
      if (!resultaat?.error) return { ...resultaat, pogingen: i }
      laatste = resultaat.error
      if (!isTijdelijkeFout(laatste)) return { ...resultaat, pogingen: i }
    } catch (err) {
      laatste = err
      if (!isTijdelijkeFout(err)) return { data: null, error: err, pogingen: i }
    }
    if (i < pogingen) await wacht(pauzeMs * i) // iets langer wachten per poging
  }
  return { data: null, error: laatste, pogingen }
}

/** Korte, begrijpelijke tekst voor de beller. Geen Engelse technische taal. */
export function foutTekst(fout) {
  if (!fout) return 'Er ging iets mis.'
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'Geen internetverbinding, er is niets opgeslagen.'
  }
  if (isTijdelijkeFout(fout)) {
    return 'De verbinding met de server hapert, er is niets opgeslagen.'
  }
  const tekst = `${fout.message || ''}`.toLowerCase()
  if (tekst.includes('jwt') || tekst.includes('token') || tekst.includes('session')) {
    return 'Je sessie is verlopen. Log opnieuw in, anders wordt er niets opgeslagen.'
  }
  if (tekst.includes('row-level security') || tekst.includes('permission') || tekst.includes('policy')) {
    return 'Je hebt geen rechten voor deze actie.'
  }
  return fout.message || 'Er ging iets mis.'
}
