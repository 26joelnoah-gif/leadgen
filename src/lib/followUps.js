// v130: een plek voor "wat moet er wanneer met deze lead gebeuren".
// Gebruikt door het Te doen-paneel (FollowUpReminders), de lijstweergave
// (kopjes Achterstallig / Vandaag / ...) en het bord (eerstvolgende bovenaan).

// Statussen waarvoor een beller een melding krijgt als de opvolgdatum bereikt
// is. v131b: geen gehoor/voicemail alleen als de lead van JOU is (eerder
// contact gehad); vrije geen-gehoor-leads zijn van niemand en komen hier niet.
export const REMINDER_STATUSES = ['terugbelafspraak', 'later_bellen', 'onjuiste_timing', 'mail_verstuurd', 'geen_gehoor', 'voicemail']

export function reminderLabel(status) {
  if (status === 'terugbelafspraak') return 'Terugbelafspraak'
  if (status === 'mail_verstuurd') return 'Opvolgen na mail'
  if (status === 'geen_gehoor' || status === 'voicemail') return 'Opnieuw proberen'
  return 'Opvolgen'
}

export function startOfToday(now = new Date()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfToday(now = new Date()) {
  const d = startOfToday(now)
  d.setDate(d.getDate() + 1)
  return d
}

// Welke datum telt voor de planning? Afspraak = afspraakmoment, anders de
// opvolgdatum. Afgeronde leads (deal, geen interesse, ...) hebben er geen.
export function planningDate(lead, doneStatuses = []) {
  if (!lead) return null
  if (lead.status === 'afspraak_gemaakt') return lead.appointment_at || null
  if (doneStatuses.includes(lead.status)) return null
  return lead.next_contact_date || null
}

// Groep in de lijstweergave
export const PLANNING_GROUPS = [
  { id: 'overdue', label: 'Achterstallig', color: 'var(--danger)', uitleg: 'Had al gedaan moeten zijn' },
  { id: 'today', label: 'Vandaag', color: 'var(--warning)', uitleg: 'Opvolgingen en terugbelafspraken van vandaag' },
  { id: 'appointments', label: 'Afspraken', color: 'var(--secondary)', uitleg: 'Ingeplande afspraken, eerstvolgende bovenaan' },
  { id: 'later', label: 'Later', color: 'var(--text-secondary)', uitleg: 'Opvolging staat op een latere dag' },
  { id: 'none', label: 'Zonder datum', color: 'var(--text-muted)', uitleg: 'Nieuwe leads en leads zonder opvolgdatum' },
]

export function planningGroup(lead, doneStatuses = [], now = new Date()) {
  const iso = planningDate(lead, doneStatuses)
  if (lead?.status === 'afspraak_gemaakt') {
    // Afspraak die al voorbij is hoort niet meer bovenaan
    if (!iso || new Date(iso) < startOfToday(now)) return 'none'
    return 'appointments'
  }
  if (!iso) return 'none'
  const t = new Date(iso)
  if (isNaN(t)) return 'none'
  if (t < startOfToday(now)) return 'overdue'
  if (t < endOfToday(now)) return 'today'
  return 'later'
}

// Sorteren op eerstvolgende datum, leads zonder datum onderaan.
export function byPlanningDate(doneStatuses = []) {
  return (a, b) => {
    const da = planningDate(a, doneStatuses)
    const db = planningDate(b, doneStatuses)
    if (da && db) return new Date(da) - new Date(db)
    if (da) return -1
    if (db) return 1
    return 0
  }
}

// "2 uur te laat", "over 30 min", "gisteren 14:00"
export function relativeDue(iso, now = new Date()) {
  if (!iso) return ''
  const t = new Date(iso)
  const diffMin = Math.round((t - now) / 60000)
  const abs = Math.abs(diffMin)
  const tijd = t.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  if (abs < 1) return 'nu'
  if (t >= startOfToday(now) && t < endOfToday(now)) {
    if (abs < 60) return diffMin < 0 ? `${abs} min te laat (${tijd})` : `over ${abs} min (${tijd})`
    return diffMin < 0 ? `vandaag ${tijd}, ${Math.round(abs / 60)} uur te laat` : `vandaag ${tijd}`
  }
  const datum = t.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
  if (diffMin < 0) {
    const dagen = Math.max(1, Math.round((startOfToday(now) - startOfToday(t)) / 86400000))
    return `${datum} ${tijd}, ${dagen} dag${dagen === 1 ? '' : 'en'} te laat`
  }
  return `${datum} ${tijd}`
}

// Morgen 10:00 / over x uur, als ISO
export function tomorrowAt(hour = 10) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

export function inHours(h) {
  return new Date(Date.now() + h * 3600000).toISOString()
}
