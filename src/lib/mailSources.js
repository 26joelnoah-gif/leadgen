// v69: bronnen voor de Mailingservice. Per project kiest de admin in de
// projectinstellingen waar de mail vandaan komt. De URL en sleutel van een bron
// staan NIET hier en niet in de database, maar in Supabase secrets:
//   MAILSERVICE_<KEY>_URL en MAILSERVICE_<KEY>_KEY
// Nieuwe bron = die twee secrets zetten + hier een regel. De tekst van de mail
// beheert de bron zelf (voor MarketingKiezer: lib/leadgenMail.ts in die repo).
export const MAIL_SOURCES = [
  {
    key: 'MARKETINGKIEZER',
    label: 'MarketingKiezer',
    description: 'Intro-mail van MarketingKiezer met een link naar de pagina voor bureaus.',
  },
]

export const mailSourceLabel = (key) => MAIL_SOURCES.find(s => s.key === key)?.label || key

// v70: mailsoorten die de beller in het belscherm kan kiezen. De sleutel gaat
// als 'mail' mee naar de Edge Function mailingservice en van daar naar de bron;
// de bron bepaalt de tekst (MK: lib/leadgenMail.ts). Welke soorten een project
// mag gebruiken staat in campaign_mail_services.mail_types; mail_type is de
// standaardkeuze. Nieuwe soort = hier een regel + die soort in mail_types.
// v73: de sleutel moet LETTERLIJK gelijk zijn aan de sleutel bij de bron.
// MarketingKiezer noemt de aanmeldmail 'aanmelding'; hier stond 'aanmelden',
// waardoor de knop Aanmeldmail een 400 gaf en er nooit iets werd verstuurd.
export const MAIL_TYPES = [
  { key: 'introductie', label: 'Infomail', description: 'Korte uitleg met een persoonlijke knop naar de pagina voor bureaus.' },
  { key: 'aanmelding', label: 'Aanmeldmail', description: 'Directe aanmeldlink voor een bureau dat mee wil doen.' },
  { key: 'opvolging', label: 'Herinnering', description: 'Kort duwtje als het bureau niets met de infomail deed. Gaat na een aantal dagen ook vanzelf.' },
]

// Statussen waarbij de bron geen herinneringen meer hoort te sturen: het bureau
// zei nee, of is juist klant. Zonder deze melding stuurt MarketingKiezer vijf
// dagen later alsnog een opvolgmail.
export const STOP_MAIL_STATUSSEN = [
  'geen_interesse', 'afgewezen', 'verkeerd_nummer', 'blacklist', 'cold', 'wil_annuleren',
  'deal', 'bruto_deal', 'geaccepteerd', 'actief', 'monteur_ingepland',
]

export const mailTypeLabel = (key) => MAIL_TYPES.find(t => t.key === key)?.label || key
export const mailTypesVoor = (svc) => {
  const toegestaan = Array.isArray(svc?.mail_types) && svc.mail_types.length ? svc.mail_types : [svc?.mail_type].filter(Boolean)
  const lijst = MAIL_TYPES.filter(t => toegestaan.includes(t.key))
  return lijst.length ? lijst : toegestaan.map(key => ({ key, label: mailTypeLabel(key), description: '' }))
}
