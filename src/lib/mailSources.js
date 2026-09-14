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
export const MAIL_TYPES = [
  { key: 'introductie', label: 'Infomail', description: 'Korte uitleg met een persoonlijke knop naar de pagina voor bureaus.' },
  { key: 'aanmelden', label: 'Aanmeldmail', description: 'Directe aanmeldlink voor een bureau dat mee wil doen.' },
]

export const mailTypeLabel = (key) => MAIL_TYPES.find(t => t.key === key)?.label || key
export const mailTypesVoor = (svc) => {
  const toegestaan = Array.isArray(svc?.mail_types) && svc.mail_types.length ? svc.mail_types : [svc?.mail_type].filter(Boolean)
  const lijst = MAIL_TYPES.filter(t => toegestaan.includes(t.key))
  return lijst.length ? lijst : toegestaan.map(key => ({ key, label: mailTypeLabel(key), description: '' }))
}
