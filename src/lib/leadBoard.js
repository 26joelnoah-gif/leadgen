// v72: kolommen van het leadbord (/leads, bordweergave). Zelfde idee als het
// sollicitantenbord van de recruiter (v36b): een kolom is puur een groepje
// bestaande statussen, er komen GEEN nieuwe statussen in de database bij.
//
//  statuses   = welke leads in deze kolom staan
//  dropStatus = status die gezet wordt als je een kaart hier op laat vallen
//  needsDate  = vraagt eerst om een datum (terugbelmoment)
//  mail       = deze kolom stuurt geen status maar opent de Mailingservice;
//               de lead komt pas op "Mail verstuurd" als de mail echt weg is
// v131: geen gehoor hoort weer in Nieuw (terug in de leadlijst); vanaf
// GEEN_GEHOOR_MAX keer op een rij in "Niet bereikbaar".
export const GEEN_GEHOOR_STATUSES = ['geen_gehoor', 'voicemail']
export const GEEN_GEHOOR_MAX = 5
export const isNietBereikbaar = (lead) =>
  GEEN_GEHOOR_STATUSES.includes(lead?.status) && (lead?.geen_gehoor_reeks || 0) >= GEEN_GEHOOR_MAX

export const SALES_BOARD_COLUMNS = [
  {
    id: 'new', label: 'Nieuw', statuses: ['new', 'geen_gehoor', 'voicemail'], dropStatus: 'new', color: 'var(--primary)',
    match: (l) => l.status === 'new' || (GEEN_GEHOOR_STATUSES.includes(l.status) && !isNietBereikbaar(l))
  },
  {
    id: 'followup', label: 'Opvolgen',
    statuses: ['later_bellen', 'mailen', 'onjuiste_timing', 'ptfu', 'gebeld', 'goed_op_weg', 'verbetering_nodig'],
    dropStatus: 'later_bellen', color: 'var(--warning)'
  },
  {
    id: 'tba', label: 'Terugbellen', statuses: ['terugbelafspraak'], dropStatus: 'terugbelafspraak',
    color: 'var(--secondary)', needsDate: true, dateField: 'next_contact_date',
    dateTitle: 'Terugbelmoment', dateLabel: 'Wanneer terugbellen?', dateButton: 'Terugbelafspraak zetten'
  },
  // v78: mail bewaard in de Mailinglijst, nog niet weg. Slepen opent ook de Mailingservice.
  { id: 'mail_gepland', label: 'Mail gepland', statuses: ['mail_gepland'], color: 'var(--text-muted)', mail: true },
  { id: 'mail', label: 'Mail verstuurd', statuses: ['mail_verstuurd'], color: 'var(--info)', mail: true },
  { id: 'offerte', label: 'Afspraak / offerte', statuses: ['afspraak_gemaakt', 'offerte_verzonden'], dropStatus: 'afspraak_gemaakt', color: 'var(--secondary)' },
  { id: 'klant', label: 'Klant', statuses: ['deal', 'bruto_deal', 'geaccepteerd', 'actief', 'monteur_ingepland'], dropStatus: 'deal', color: 'var(--success)' },
  {
    id: 'onbereikbaar', label: 'Niet bereikbaar', statuses: ['geen_gehoor', 'voicemail'], color: 'var(--text-muted)',
    match: isNietBereikbaar, dropStatus: 'geen_gehoor', dropExtra: { geen_gehoor_reeks: GEEN_GEHOOR_MAX, next_contact_date: null }
  },
  { id: 'weg', label: 'Geen interesse', statuses: ['geen_interesse', 'afgewezen', 'verkeerd_nummer', 'blacklist', 'cold', 'wil_annuleren'], dropStatus: 'geen_interesse', color: 'var(--danger)' }
]

// Statussen waarbij een opvolgdatum niet meer hoort; die maken we leeg bij een
// verplaatsing zodat een afgeronde lead niet terugkomt in de wachtrij.
export const BOARD_CLOSED_STATUSES = ['deal', 'bruto_deal', 'geaccepteerd', 'actief', 'monteur_ingepland', 'geen_interesse', 'afgewezen', 'verkeerd_nummer', 'blacklist', 'cold']

// In welke kolom hoort deze lead? Een status die (nog) in geen enkele kolom
// staat valt terug op Opvolgen, zodat er nooit een lead van het bord verdwijnt.
export function boardColumnFor(lead, columns = SALES_BOARD_COLUMNS) {
  const col = columns.find(c => (c.match ? c.match(lead || {}) : c.statuses.includes(lead?.status)))
  return (col || columns.find(c => c.id === 'followup') || columns[0]).id
}
