// UITGESCHAKELD (v100, 2026-09-24).
// Deze functie maakte met de service-role key een account aan (ook admin)
// zonder te controleren wie hem aanriep: iedereen met de URL kon een
// admin-account maken. De app gebruikt hem niet meer (accounts gaan via
// Supabase). Hij geeft nu altijd 410 terug en raakt geen sleutels aan.
// Haal SUPABASE_SERVICE_ROLE_KEY ook weg uit de Netlify-omgeving.
export const handler = async () => ({
  statusCode: 410,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ error: 'Deze functie is uitgeschakeld.' }),
})
