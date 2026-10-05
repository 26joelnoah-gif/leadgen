// Soorten afspraken in de agenda, elk met een eigen vaste duur.
// Noah (22-09-2026): alle afspraken waren shoots van 2,5 uur.
// v124 (05-10-2026): er is nu ook een "Bezoek" van 1 uur. De beller kiest de
// soort bij "Afspraak gemaakt" (belscherm en bord); hij staat in
// leads.appointment_type. Leeg (afspraken van voor v124) = shoot.
// De duur staat ALLEEN hier (en gespiegeld in de Edge Function
// google-agenda-push), niet in de database. Nieuwe soort = regel hier +
// de CHECK leads_appointment_type_check + de tabel in google-agenda-push.
export const APPOINTMENT_TYPES = [
  { id: 'shoot', label: 'Shoot', minutes: 150, uitleg: 'Video-opname bij de klant' },
  { id: 'bezoek', label: 'Bezoek', minutes: 60, uitleg: 'Bezoek bij de klant' },
]
export const DEFAULT_APPOINTMENT_TYPE = 'shoot'

// Oude namen blijven bestaan voor code die nog geen soort kent: dat zijn de
// waarden van de shoot.
export const APPOINTMENT_LABEL = 'Shoot'
export const APPOINTMENT_DURATION_MINUTES = 150 // 2,5 uur

// Soort opzoeken: accepteert een id ('bezoek'), een lead ({ appointment_type })
// of niets (= shoot).
export function appointmentType(leadOrId) {
  const id = typeof leadOrId === 'string' ? leadOrId : leadOrId?.appointment_type
  return APPOINTMENT_TYPES.find(t => t.id === id) || APPOINTMENT_TYPES[0]
}
export function appointmentMinutes(leadOrId) {
  return appointmentType(leadOrId).minutes
}
export function appointmentLabel(leadOrId) {
  return appointmentType(leadOrId).label
}
// "1 uur", "2,5 uur", "45 min"
export function duurTekst(minutes) {
  if (minutes < 60) return `${minutes} min`
  const uren = minutes / 60
  return `${uren.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} uur`
}
