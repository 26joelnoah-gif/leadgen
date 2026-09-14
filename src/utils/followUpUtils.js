// v72: één plek voor "wanneer komt deze lead terug en moet er nu iets mee".
// Zat eerst alleen in useLeads; het bord op /leads heeft dezelfde regels nodig.

// v29: herbelpogingen op het ANDERE dagdeel plannen. Wie 's ochtends niet
// opneemt, neemt 's ochtends vaak weer niet op - dus de volgende poging
// komt 's middags rond 15:00, en andersom rond 10:00.
export function nextContactOnOtherDaypart(daysAhead) {
  const d = new Date()
  const calledInMorning = d.getHours() < 13
  d.setDate(d.getDate() + daysAhead)
  d.setHours(calledInMorning ? 15 : 10, 0, 0, 0)
  return d.toISOString()
}

// Staat de opvolgdatum van deze lead in het verleden? Dan vraagt hij om actie.
export function isFollowUpDue(lead, now = Date.now()) {
  if (!lead?.next_contact_date) return false
  const t = new Date(lead.next_contact_date).getTime()
  return !isNaN(t) && t <= now
}

// Hele dagen sinds een tijdstip (null als er geen tijdstip is).
export function daysSince(iso, now = Date.now()) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  return Math.floor((now - t) / 86400000)
}
