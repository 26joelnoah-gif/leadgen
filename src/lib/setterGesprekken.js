import { supabase } from './supabase'
import { uitkomstVoorStatus } from '../content/settertool'
import { logAppError } from './errorLog'

// v159: legt na een gelukte afboeking het gesprek van de settertool vast.
// De status zelf is dan al opgeslagen via handleLeadDisposition; dit is de
// extra informatie (haak, bezwaren, interesse, beslisser, WhatsApp).
// Mislukt dit, dan blijft de afboeking staan en loggen we de fout.
export async function bewaarSetterGesprek({ toolKey, campaignId, lead, status, kaart, closerId, afspraakOp, afspraakType, notitie }) {
  if (!toolKey || !campaignId || !lead?.id || !status) return { ok: false }
  const uitkomst = uitkomstVoorStatus(status, kaart?.nietEigenaar)
  const isAfspraak = uitkomst === 'afspraak'
  const rij = {
    tool: toolKey,
    campaign_id: campaignId,
    lead_id: lead.id,
    uitkomst,
    status,
    haak: kaart?.haak || null,
    bezwaren: kaart?.bezwaren || [],
    wat_viel_op: (kaart?.watVielOp || '').trim().slice(0, 500) || null,
    interesse: kaart?.interesse || [],
    interesse_anders: (kaart?.interesse || []).includes('anders') ? ((kaart?.interesseAnders || '').trim().slice(0, 200) || null) : null,
    afspraak_vorm: isAfspraak ? (afspraakType === 'videocall' ? 'online' : 'fysiek') : null,
    afspraak_op: isAfspraak && afspraakOp ? new Date(afspraakOp).toISOString() : null,
    closer_id: isAfspraak ? (closerId || null) : null,
    beslisser_aanwezig: isAfspraak ? kaart?.beslisser : null,
    mede_beslisser: (kaart?.medeBeslisser || '').trim().slice(0, 120) || null,
    whatsapp_bevestigd: isAfspraak ? !!kaart?.whatsapp : false,
    whatsapp_bevestigd_op: isAfspraak && kaart?.whatsapp ? new Date().toISOString() : null,
    referentie_gevraagd: !!kaart?.referentie,
    notitie: (notitie || '').trim().slice(0, 2000) || null,
  }
  const { error } = await supabase.from('setter_gesprekken').insert(rij)
  if (error) {
    logAppError('settertool.gesprekOpslaan', error, { leadId: lead.id, status })
    return { ok: false, error }
  }
  return { ok: true }
}

// Achteraf aanvinken: klant heeft de WhatsApp bevestigd
export async function zetWhatsappBevestigd(gesprekId) {
  const { error } = await supabase.from('setter_gesprekken')
    .update({ whatsapp_bevestigd: true, whatsapp_bevestigd_op: new Date().toISOString() })
    .eq('id', gesprekId)
  return { ok: !error, error }
}

// Notitie-regel die mee gaat in de afboeking (zichtbaar in de leadhistorie)
export function setterNotitie(tool, kaart) {
  if (!tool || !kaart) return ''
  const delen = []
  const haak = tool.haken.find(h => h.id === kaart.haak)
  if (haak && haak.id !== 'standaard') delen.push(`Haak: ${haak.label}`)
  if (kaart.nietEigenaar) delen.push(`Niet de eigenaar${kaart.besteTijd?.trim() ? `, beste tijd: ${kaart.besteTijd.trim()}` : ''}`)
  if (kaart.interesse?.length) {
    const labels = kaart.interesse.map(i => i === 'anders' && kaart.interesseAnders?.trim()
      ? `anders (${kaart.interesseAnders.trim()})`
      : (tool.interesseOpties.find(o => o.id === i)?.label || i).toLowerCase())
    delen.push(`Interesse: ${labels.join(', ')}`)
  }
  if (kaart.beslisser === false && kaart.medeBeslisser?.trim()) delen.push(`Mede-beslisser: ${kaart.medeBeslisser.trim()}`)
  if (kaart.bezwaren?.length) delen.push(`Bezwaar: ${kaart.bezwaren.map(b => tool.bezwaren.find(x => x.id === b)?.label || b).join(', ')}`)
  if (kaart.referentie) delen.push('Wil een referentie bellen')
  if (kaart.watVielOp?.trim()) delen.push(`Viel op: ${kaart.watVielOp.trim()}`)
  return delen.join(' | ')
}
