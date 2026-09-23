// LEADGEN v98 - AVG/ACM-compliance voor bellen en mailen.
//
// Sinds 1 juli 2026 (art. 11.7 Telecommunicatiewet) mag je zonder toestemming
// alleen nog rechtspersonen bellen: bv, nv, stichting, vereniging, cooperatie.
// Eenmanszaak, vof, cv en maatschap vallen onder dezelfde opt-in als
// consumenten.
//
// De echte regel staat in de database (lead_belstatus_basis + claim_next_lead).
// leadBelstatus() hieronder is precies dezelfde regel voor de schermen.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const RECHTSVORMEN = [
  { key: 'bv', label: 'BV', mag: true },
  { key: 'nv', label: 'NV', mag: true },
  { key: 'stichting', label: 'Stichting', mag: true },
  { key: 'vereniging', label: 'Vereniging', mag: true },
  { key: 'cooperatie', label: 'Cooperatie', mag: true },
  { key: 'eenmanszaak', label: 'Eenmanszaak / zzp', mag: false },
  { key: 'vof', label: 'VOF', mag: false },
  { key: 'cv', label: 'CV', mag: false },
  { key: 'maatschap', label: 'Maatschap', mag: false },
]
export const rechtsvormLabel = (key) => RECHTSVORMEN.find(r => r.key === key)?.label || (key === 'particulier' ? 'Particulier' : 'Onbekend')

const MAG_ZONDER_TOESTEMMING = ['bv', 'nv', 'stichting', 'vereniging', 'cooperatie']
const OPT_IN_NODIG = ['eenmanszaak', 'vof', 'cv', 'maatschap', 'particulier']

/** 'ok' | 'kvk_check' | 'toestemming_nodig' | 'afgemeld' */
export function leadBelstatus(lead, project) {
  if (!lead) return 'ok'
  if (lead.afgemeld_at) return 'afgemeld'
  if (lead.opt_in_at) return 'ok'
  const doelgroep = project?.doelgroep || null
  if (!doelgroep || doelgroep === 'geen_telemarketing') return 'ok'
  if (doelgroep === 'particulier') return 'toestemming_nodig'
  if (MAG_ZONDER_TOESTEMMING.includes(lead.rechtsvorm)) return 'ok'
  if (OPT_IN_NODIG.includes(lead.rechtsvorm)) return 'toestemming_nodig'
  if ((project?.rechtsvorm_modus || 'waarschuwen') === 'streng') return 'toestemming_nodig'
  return 'kvk_check'
}

export const BELSTATUS = {
  ok: { label: 'Mag gebeld worden', kort: null, color: 'var(--success)', bg: 'var(--success-bg)' },
  kvk_check: { label: 'Eerst KvK checken', kort: 'KvK-check', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  toestemming_nodig: { label: 'Alleen na toestemming', kort: 'Toestemming nodig', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  afgemeld: { label: 'Afgemeld', kort: 'Afgemeld', color: 'var(--danger)', bg: 'var(--danger-bg)' },
}

export const DOELGROEPEN = [
  { key: 'zakelijk', label: 'Zakelijk (bedrijven)', uitleg: 'Bv, nv, stichting en vereniging mag je bellen. Eenmanszaak, vof, cv en maatschap alleen met toestemming.' },
  { key: 'particulier', label: 'Particulieren', uitleg: 'Bellen mag alleen met vooraf vastgelegde toestemming. Ook bij bestaande klanten (sinds 1 juli 2026).' },
  { key: 'geen_telemarketing', label: 'Geen verkoop (service, planning, sollicitanten)', uitleg: 'Bellen over een bestaande afspraak of sollicitatie. Geen verkoopgesprek, dus geen opt-in nodig.' },
]

export const MELDING_SOORTEN = [
  { key: 'klacht', label: 'Klacht' },
  { key: 'bezwaar', label: 'Bezwaar (wil niet benaderd worden)' },
  { key: 'avg_verzoek', label: 'AVG-verzoek (inzage / verwijderen)' },
  { key: 'acm', label: 'ACM / toezichthouder' },
  { key: 'anders', label: 'Anders' },
]
export const meldingSoortLabel = (k) => MELDING_SOORTEN.find(s => s.key === k)?.label || k

export const kvkZoekUrl = (naam) =>
  `https://www.kvk.nl/zoeken/?source=all&q=${encodeURIComponent((naam || '').replace(/^\s*\d+\.\s*/, '').trim())}`

/** Uren tot een afgemelde lead automatisch gewist wordt (48 uur na afmelden). */
export function urenTotWissen(lead) {
  if (!lead?.afgemeld_at) return null
  const ms = new Date(lead.afgemeld_at).getTime() + 48 * 3600_000 - Date.now()
  return Math.max(0, Math.ceil(ms / 3600_000))
}

/** Doelgroep + rechtsvorm-modus van het project van een lijst.
 *  undefined = nog aan het laden, null = geen project. */
export function useProjectCompliance(listId) {
  const [project, setProject] = useState(undefined)
  useEffect(() => {
    let alive = true
    if (!listId) { setProject(null); return }
    setProject(undefined)
    supabase.from('lead_lists').select('campaign_id, campaigns(id, name, type, doelgroep, rechtsvorm_modus, compliance_ok_at)')
      .eq('id', listId).maybeSingle()
      .then(({ data }) => { if (alive) setProject(data?.campaigns || null) })
    return () => { alive = false }
  }, [listId])
  return project
}
