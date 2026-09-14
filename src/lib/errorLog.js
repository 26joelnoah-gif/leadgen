// Foutlogboek (betrouwbaarheid v71)
//
// Doel: Noah hoeft niet meer te wachten tot een beller belt met "mijn scherm
// is leeg". Elke crash en elke mislukte actie gaat hier langs, komt in de
// console EN in de tabel public.app_errors, zodat je ze terug kunt kijken.
//
// Harde regel: dit onderdeel mag NOOIT zelf een fout veroorzaken. Alles staat
// in try/catch en faalt stil. Logging is een vangnet, geen werkende functie
// waar de app van afhangt.
import { supabase } from './supabase'

const MAX_PER_SESSIE = 30        // niet meer dan dit wegschrijven per tabblad
const MAX_PER_SOORT = 5          // en per unieke fout, tegen crash-lussen
const geteld = new Map()
let totaal = 0

function sleutelVan(context, boodschap) {
  return `${context}::${String(boodschap).slice(0, 120)}`
}

function magSchrijven(sleutel) {
  if (totaal >= MAX_PER_SESSIE) return false
  const n = geteld.get(sleutel) || 0
  if (n >= MAX_PER_SOORT) return false
  geteld.set(sleutel, n + 1)
  totaal += 1
  return true
}

function leesbaar(error) {
  if (!error) return 'onbekende fout'
  if (typeof error === 'string') return error
  return error.message || error.error_description || error.details || JSON.stringify(error).slice(0, 500)
}

/**
 * Schrijft een fout weg. Roep dit aan waar een actie van de gebruiker mislukt.
 * @param {string} context  waar het misging, bijv. 'afboeken' of 'render:/leads'
 * @param {*} error         de fout (Error, Supabase-error of tekst)
 * @param {object} extra    vrije context, bijv. { leadId, status }
 */
export async function logAppError(context, error, extra = {}) {
  const boodschap = leesbaar(error)
  try {
    console.error(`[${context}]`, error, extra)
  } catch { /* console kan in rare omgevingen ontbreken */ }

  const sleutel = sleutelVan(context, boodschap)
  if (!magSchrijven(sleutel)) return

  try {
    const { data: sessie } = await supabase.auth.getSession()
    const gebruiker = sessie?.session?.user
    if (!gebruiker) return // niet ingelogd: niets wegschrijven, RLS laat het toch niet toe

    await supabase.from('app_errors').insert({
      user_id: gebruiker.id,
      context,
      message: boodschap.slice(0, 1000),
      stack: (error?.stack || '').slice(0, 4000) || null,
      path: typeof window !== 'undefined' ? window.location.pathname : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 300) : null,
      app_build: typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__) : null,
      extra: extra && Object.keys(extra).length ? extra : null
    })
  } catch { /* nooit laten opvallen */ }
}

/**
 * Vangt fouten op die buiten React ontstaan: losse promises die klappen en
 * fouten in event-handlers. Zonder dit verdwijnen die geruisloos.
 */
export function installGlobalErrorHandlers() {
  if (typeof window === 'undefined' || window.__leadgenErrorHandlers) return
  window.__leadgenErrorHandlers = true

  window.addEventListener('error', (e) => {
    logAppError('window.error', e?.error || e?.message, { bron: e?.filename, regel: e?.lineno })
  })

  window.addEventListener('unhandledrejection', (e) => {
    logAppError('promise.rejected', e?.reason)
  })
}
