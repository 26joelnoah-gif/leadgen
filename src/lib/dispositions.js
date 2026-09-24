// v104: welke afboekknoppen kan een project uitzetten (campaigns.hidden_dispositions).
// `key` is wat in hidden_dispositions staat. 'deal' geldt ook voor 'bruto_deal'
// (zelfde knop, in een backoffice-project heet de status alleen anders).
// Eigen redenen (custom_dispositions) gebruiken de sleutel 'custom:<uuid>'.
export const SALES_DISPOSITION_KEYS = [
  { key: 'deal', label: 'Deal' },
  { key: 'afspraak_gemaakt', label: 'Afspraak' },
  { key: 'terugbelafspraak', label: 'TBA (terugbellen)' },
  { key: 'later_bellen', label: 'Later bellen' },
  { key: 'nieuw_kwartaal', label: 'Nieuw kwartaal', note: 'alleen als "In nieuw kwartaal bellen" aan staat' },
  { key: 'geen_gehoor', label: 'Geen gehoor' },
  { key: 'verkeerd_nummer', label: 'Foutieve info' },
  { key: 'geen_interesse', label: 'Geen interesse' },
  { key: 'onjuiste_timing', label: 'Onjuiste timing' },
  { key: 'blacklist', label: 'Blacklist' },
]

export function dispositionKey(id) {
  return id === 'bruto_deal' ? 'deal' : id
}
