// v103: slepen op een bord telt als werkzaamheid.
//
// Een statuswissel via een bord (LeadBoard /leads en het sollicitantenbord
// in Recruitment) schrijft nu ook een rij in call_logs, net als een
// afboeking in het belscherm. Daardoor telt de actie mee in Rapportage,
// Dashboard, Manager en de dagtellers (agent_daily_stats).
//
// Regels:
// - source = 'bord' zodat je bord-acties altijd kunt herkennen/filteren.
// - duration_seconds = 0: een sleep is geen gesprek, dus telt NIET als
//   beltijd (uren en uitbetaling per beluur blijven eerlijk).
// - Maximaal 1x per medewerker + lead + status: heen en weer slepen levert
//   geen extra tellingen op.
// - Mag de bord-actie zelf nooit blokkeren: fout = alleen loggen.
import { supabase } from './supabase'
import { logAppError } from './errorLog'

export async function logBoardAction({ lead, status, userId, organizationId, notes = null }) {
  if (!lead?.id || !status || !userId) return
  try {
    const { data: bestaand, error: leesFout } = await supabase
      .from('call_logs')
      .select('id')
      .eq('agent_id', userId)
      .eq('lead_id', lead.id)
      .eq('disposition', status)
      .eq('source', 'bord')
      .limit(1)
    if (leesFout) throw leesFout
    if (bestaand && bestaand.length) return

    const nu = new Date().toISOString()
    const { error } = await supabase.from('call_logs').insert({
      agent_id: userId,
      organization_id: organizationId ?? null,
      lead_id: lead.id,
      lead_list_id: lead.lead_list_id || null,
      disposition: status,
      started_at: nu,
      disposed_at: nu,
      duration_seconds: 0,
      notes,
      source: 'bord'
    })
    if (error) throw error
  } catch (err) {
    logAppError('call_logs.bord', err, { leadId: lead?.id, status })
  }
}
