import { supabase } from './supabase'
import { STOP_MAIL_STATUSSEN } from './mailSources'

/**
 * v73: "stuur deze geen herinnering meer".
 *
 * Boekt een beller een gemailde lead af als geen interesse, verkeerd nummer,
 * blacklist of juist als klant, dan moet de bron dat weten. Anders stuurt
 * MarketingKiezer vijf dagen na de infomail alsnog een herinnering naar een
 * bureau dat aan de telefoon nee heeft gezegd.
 *
 * Gaat via de Edge Function `mailstop`, zodat de sleutel van de bron niet in de
 * browser komt. Faalt stil: een afboeking mag hier nooit op stuklopen.
 */
export async function stopMailsVoorLead(leadId, status) {
  if (!leadId || !STOP_MAIL_STATUSSEN.includes(status)) return
  try {
    await supabase.functions.invoke('mailstop', { body: { lead_id: leadId, reden: status } })
  } catch (err) {
    console.error('mailstop mislukt:', err)
  }
}
