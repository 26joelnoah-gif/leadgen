// v97: gedeelde helpers voor afspraken (sentiment, uitkomst, adres/navigatie,
// conflictcheck). Gebruikt door WorkInterface, LeadBoard en Agenda.
import { supabase } from './supabase'
import { appointmentMinutes, APPOINTMENT_TYPES } from './appointmentConfig'

// Langste afspraaksoort in ms: zo ver kijken we terug bij de conflictcheck.
const MAX_APPOINTMENT_MS = Math.max(...APPOINTMENT_TYPES.map(t => t.minutes)) * 60 * 1000

// Hoe staat de klant erin? Verplicht bij inplannen.
export const SENTIMENTS = [
  { id: 'positief', label: 'Positief', emoji: '🟢', color: '#10B981' },
  { id: 'neutraal', label: 'Neutraal', emoji: '🟡', color: '#F59E0B' },
  { id: 'negatief', label: 'Negatief', emoji: '🔴', color: '#EF4444' },
]
export function sentimentInfo(id) {
  return SENTIMENTS.find(s => s.id === id) || null
}

// Uitkomst die de accountmanager na de afspraak afboekt.
// deal/betaald zetten leads.status op 'deal'; wil_nadenken laat de afspraak staan.
export const OUTCOMES = [
  { id: 'wil_nadenken', label: 'Wil nadenken', color: '#8B5CF6', leadStatus: 'afspraak_gemaakt' },
  { id: 'deal', label: 'Deal', color: '#10B981', leadStatus: 'deal' },
  { id: 'betaald', label: 'Betaald', color: '#047857', leadStatus: 'deal' },
]
export function outcomeInfo(id) {
  return OUTCOMES.find(o => o.id === id) || null
}

// v110: hoe staat mijn afspraak ervoor? Gebruikt op de pagina "Mijn afspraken"
// en waar we in een lijst willen laten zien wat er met een afspraak gebeurd is.
export function afspraakStand(lead) {
  const o = outcomeInfo(lead?.appointment_outcome)
  if (o) {
    if (o.id === 'betaald') return { key: 'betaald', label: 'Betaald', color: '#047857', klaar: true, deal: true }
    if (o.id === 'deal') return { key: 'deal', label: 'Deal', color: '#10B981', klaar: true, deal: true }
    return { key: 'wil_nadenken', label: 'Wil nadenken', color: '#8B5CF6', klaar: true, deal: false }
  }
  const moment = lead?.appointment_at ? new Date(lead.appointment_at) : null
  if (moment && moment.getTime() > Date.now()) {
    return { key: 'gepland', label: 'Staat gepland', color: '#3B82F6', klaar: false, deal: false }
  }
  return { key: 'wacht', label: 'Wacht op uitkomst', color: '#F59E0B', klaar: false, deal: false }
}

export function euro(bedrag) {
  if (bedrag == null || bedrag === '') return null
  const n = Number(bedrag)
  if (isNaN(n)) return null
  return `\u20AC ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function leadAddressText(lead) {
  if (!lead) return ''
  const straat = [lead.address, lead.house_number].filter(Boolean).join(' ').trim()
  const plaats = [lead.postal_code, lead.city].filter(Boolean).join(' ').trim()
  return [straat, plaats].filter(Boolean).join(', ')
}

// Link die op telefoon de navigatie opent (Google Maps app of web).
export function navigationUrl(lead) {
  const adres = leadAddressText(lead)
  if (!adres) return null
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adres)}&travelmode=driving`
}

// Is dit moment vrij bij deze accountmanager? Kijkt naar blokkades en naar
// andere afspraken. v124: elke afspraak heeft zijn eigen duur (shoot 2,5 uur,
// bezoek 1 uur) - geef met `type` de soort van de NIEUWE afspraak mee; van
// bestaande afspraken lezen we de soort uit de lead zelf.
// Geeft null terug als het vrij is, anders een korte uitleg.
export async function findAppointmentConflict({ amId, start, excludeLeadId, type }) {
  if (!amId || !start) return null
  const targetStart = new Date(start)
  const dur = appointmentMinutes(type) * 60 * 1000
  const targetEnd = new Date(targetStart.getTime() + dur)
  // Ruimste duur die een bestaande afspraak kan hebben: zo ver terugkijken
  const maxDur = MAX_APPOINTMENT_MS

  const { data: blocks } = await supabase
    .from('agenda_blocks')
    .select('id, title')
    .eq('user_id', amId)
    .lt('start_at', targetEnd.toISOString())
    .gt('end_at', targetStart.toISOString())
  if (blocks && blocks.length > 0) {
    return `Dit tijdvak is geblokkeerd ("${blocks[0].title || 'Niet beschikbaar'}")`
  }

  let q = supabase
    .from('leads')
    .select('id, name, appointment_at, appointment_type')
    .eq('assigned_to', amId)
    .eq('status', 'afspraak_gemaakt')
    .gte('appointment_at', new Date(targetStart.getTime() - maxDur).toISOString())
    .lte('appointment_at', targetEnd.toISOString())
    .is('deleted_at', null)
  if (excludeLeadId) q = q.neq('id', excludeLeadId)
  const { data: appts } = await q
  const overlap = (appts || []).find(a => {
    const s = new Date(a.appointment_at)
    const e = new Date(s.getTime() + appointmentMinutes(a) * 60 * 1000)
    return s < targetEnd && e > targetStart
  })
  if (overlap) return `Er staat al een afspraak op dit moment (${overlap.name})`
  return null
}
