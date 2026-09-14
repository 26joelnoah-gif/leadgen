// v68: pipeline van een accountmanagement-project (BRIEF-leadgen 6a).
// nieuw -> gebeld -> offerte gestuurd -> geaccepteerd -> actief, plus afgewezen.
// 'geaccepteerd' en 'actief' zet het systeem (tekenlink / betaling), de rest
// zet de accountmanager zelf. De status-keys staan in leads.status en zijn
// toegevoegd aan leads_status_check in migration_v68.

export const AM_PIPELINE = [
  { id: 'new', label: 'Nieuw', color: 'var(--info)', manual: true, hint: 'Nog niet gesproken' },
  { id: 'gebeld', label: 'Gebeld', color: 'var(--warning)', manual: true, hint: 'Contact geweest, nog geen offerte' },
  { id: 'offerte_verzonden', label: 'Offerte gestuurd', color: 'var(--primary)', manual: false, hint: 'Wordt gezet zodra je een offerte verstuurt' },
  { id: 'geaccepteerd', label: 'Geaccepteerd', color: 'var(--success)', manual: false, hint: 'Klant heeft de offerte digitaal geaccepteerd' },
  { id: 'actief', label: 'Actief', color: 'var(--success)', manual: false, hint: 'Betaling gelukt, klant is live' },
  { id: 'afgewezen', label: 'Afgewezen', color: 'var(--danger)', manual: true, hint: 'Geen interesse of afgehaakt' },
]

export const AM_STATUS_IDS = AM_PIPELINE.map(s => s.id)
// Eindstatussen: geen opvolging meer nodig, vallen nooit terug in de pool.
export const AM_DONE = ['geaccepteerd', 'actief', 'afgewezen']
// Oude belstatussen die een lead kan hebben als hij uit een gewone bellijst
// komt: we tonen ze onder "Nieuw" tot de accountmanager hem oppakt.
export function amStage(status) {
  return AM_STATUS_IDS.includes(status) ? status : 'new'
}
export function amStageInfo(status) {
  return AM_PIPELINE.find(s => s.id === amStage(status)) || AM_PIPELINE[0]
}

export function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
export function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d }
export function startOfWeek() {
  const d = startOfToday()
  const day = (d.getDay() + 6) % 7 // maandag = 0
  d.setDate(d.getDate() - day)
  return d
}

// Opvolgen vandaag: eigen lead, niet afgerond, en volgende actie vandaag of
// verlopen (of nog nooit ingepland: dan hoort hij ook op de lijst).
export function needsFollowUpToday(lead) {
  if (AM_DONE.includes(lead.status)) return false
  if (!lead.next_contact_date) return true
  return new Date(lead.next_contact_date) <= endOfToday()
}

export function isOverdue(lead) {
  return lead.next_contact_date && new Date(lead.next_contact_date) < startOfToday()
}
