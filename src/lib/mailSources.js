// v69: bronnen voor de Mailingservice. Per project kiest de admin in de
// projectinstellingen waar de mail vandaan komt.
// v119: webhook-URL, token en body-template zet je gewoon bij het project zelf
// (projectinstellingen -> Mailingservice). Deze lijst bepaalt alleen nog de
// naam van de bron en welke mailsoorten hij kent. Vult een project geen eigen
// webhook in, dan valt hij terug op de oude secrets MAILSERVICE_<KEY>_URL en
// MAILSERVICE_<KEY>_KEY. De tekst van de mail beheert de bron zelf (voor
// MarketingKiezer: lib/leadgenMail.ts in die repo).
// v118: elke bron kent zijn eigen mailsoorten (types). BeautyInfo kent geen
// infomail, alleen een aanmeldmail en een herinnering. Welke soorten een
// project daarvan gebruikt staat in campaign_mail_services.mail_types.
export const MAIL_SOURCES = [
  {
    key: 'MARKETINGKIEZER',
    label: 'MarketingKiezer',
    description: 'Intro-mail van MarketingKiezer met een link naar de pagina voor bureaus.',
    types: ['introductie', 'aanmelding', 'opvolging'],
  },
  {
    key: 'BEAUTYINFO',
    label: 'BeautyInfo',
    description: 'Aanmeldmail van BeautyInfo waarmee een beautyzaak zich direct kan aansluiten en afrekenen.',
    types: ['aanmelding', 'opvolging'],
  },
]

export const mailSourceLabel = (key) => MAIL_SOURCES.find(s => s.key === key)?.label || key

// Welke mailsoorten deze bron kent. Bron zonder lijst = alle soorten.
export const mailTypesVanBron = (key) => {
  const bron = MAIL_SOURCES.find(s => s.key === key)
  const sleutels = Array.isArray(bron?.types) && bron.types.length ? bron.types : MAIL_TYPES.map(t => t.key)
  return MAIL_TYPES.filter(t => sleutels.includes(t.key))
}

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
