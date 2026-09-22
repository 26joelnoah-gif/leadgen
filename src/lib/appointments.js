// v97: gedeelde helpers voor afspraken (sentiment, uitkomst, adres/navigatie,
// conflictcheck). Gebruikt door WorkInterface, LeadBoard en Agenda.
import { supabase } from './supabase'
import { APPOINTMENT_DURATION_MINUTES } from './appointmentConfig'

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
// andere afspraken (elke afspraak duurt APPOINTMENT_DURATION_MINUTES).
// Geeft null terug als het vrij is, anders een korte uitleg.
export async function findAppointmentConflict({ amId, start, excludeLeadId }) {
  if (!amId || !start) return null
  const targetStart = new Date(start)
  const dur = APPOINTMENT_DURATION_MINUTES * 60 * 1000
  const targetEnd = new Date(targetStart.getTime() + dur)

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
    .select('id, name, appointment_at')
    .eq('assigned_to', amId)
    .eq('status', 'afspraak_gemaakt')
    .gte('appointment_at', new Date(targetStart.getTime() - dur).toISOString())
    .lte('appointment_at', new Date(targetStart.getTime() + dur).toISOString())
    .is('deleted_at', null)
  if (excludeLeadId) q = q.neq('id', excludeLeadId)
  const { data: appts } = await q
  const overlap = (appts || []).find(a => {
    const s = new Date(a.appointment_at)
    const e = new Date(s.getTime() + dur)
    return s < targetEnd && e > targetStart
  })
  if (overlap) return `Er staat al een afspraak op dit moment (${overlap.name})`
  return null
}
