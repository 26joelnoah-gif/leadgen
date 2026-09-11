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
