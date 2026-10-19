// v150: hoe goed nemen mensen op, per uur van de dag? Uit de eigen
// gesprekken van de laatste 6 weken (RPC bereik_per_uur, alleen werkdagen,
// geen bord-acties). Eén keer per half uur opgehaald, gedeeld door alle
// onderdelen die het tonen.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

let cache = null // { at, rijen }
let bezig = null

async function haal() {
  if (cache && Date.now() - cache.at < 30 * 60 * 1000) return cache.rijen
  if (bezig) return bezig
  bezig = supabase.rpc('bereik_per_uur', { p_dagen: 42 }).then(({ data, error }) => {
    bezig = null
    if (error) throw error
    cache = { at: Date.now(), rijen: data || [] }
    return cache.rijen
  }).catch(err => { bezig = null; throw err })
  return bezig
}

// Een uur telt pas mee met genoeg gesprekken, anders zegt het percentage niets
const MIN_POGINGEN = 15

export function bereikOordeel(kans, gemiddeld) {
  if (kans == null || gemiddeld == null) return null
  if (kans >= gemiddeld + 0.03) return { key: 'goed', label: 'Goed bereik', kleur: 'var(--success)', bg: 'var(--success-bg)' }
  if (kans <= gemiddeld - 0.05) return { key: 'matig', label: 'Minder bereik', kleur: 'var(--warning)', bg: 'var(--warning-bg)' }
  return { key: 'gemiddeld', label: 'Gemiddeld bereik', kleur: 'var(--text-secondary)', bg: 'var(--bg-elevated)' }
}

export function useBereik() {
  const [rijen, setRijen] = useState(cache?.rijen || null)
  const [nu, setNu] = useState(() => new Date())

  useEffect(() => {
    let alive = true
    haal().then(r => { if (alive) setRijen(r) }).catch(() => { if (alive) setRijen([]) })
    const t = setInterval(() => setNu(new Date()), 5 * 60 * 1000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  const perUur = (rijen || [])
    .filter(r => r.pogingen >= MIN_POGINGEN && r.uur >= 8 && r.uur <= 20)
    .map(r => ({ uur: r.uur, pogingen: r.pogingen, kans: r.opgenomen / r.pogingen }))
  const totaalP = perUur.reduce((s, r) => s + r.pogingen, 0)
  const gemiddeld = totaalP ? perUur.reduce((s, r) => s + r.kans * r.pogingen, 0) / totaalP : null
  const isWerkdag = nu.getDay() >= 1 && nu.getDay() <= 5
  const ditUur = isWerkdag ? perUur.find(r => r.uur === nu.getHours()) : null
  const beste = [...perUur].sort((a, b) => b.kans - a.kans).slice(0, 2).map(r => r.uur).sort((a, b) => a - b)

  return {
    geladen: rijen !== null,
    perUur,
    gemiddeld,
    nu: ditUur ? { ...ditUur, oordeel: bereikOordeel(ditUur.kans, gemiddeld) } : null,
    besteUren: beste,
  }
}
