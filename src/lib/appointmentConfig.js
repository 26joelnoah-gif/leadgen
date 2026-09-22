// Vaste afspraakduur voor een "Shoot" (video-opname bij de klant).
// Noah (22-09-2026): alle afspraken in de agenda zijn shoots en duren
// standaard 2,5 uur. Eén vaste waarde, geen apart type-veld in de DB -
// als dat later verandert (meerdere soorten afspraken, eigen duur per
// afspraak), begin dan hier en denk aan Agenda.jsx (blokhoogte in de
// weekweergave) en WorkInterface.jsx (conflictcontrole bij inplannen).
export const APPOINTMENT_LABEL = 'Shoot'
export const APPOINTMENT_DURATION_MINUTES = 150 // 2,5 uur

