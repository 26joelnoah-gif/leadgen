import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { DEMO_LEADS } from '../lib/demoData'

export function useLeads() {
  const { user, profile, isDemoMode } = useAuth()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  function calculateLeadScore(lead) {
    let score = 0
    if (lead.lead_source === 'referral') score += 15
    else if (lead.lead_source === 'linkedin') score += 10
    else if (lead.lead_source === 'cold') score += 5

    if (lead.decision_maker) score += 20

    // v34: verrijkte data telt mee - zelfde weging als claim_next_lead in de
    // database, zodat het bliksem-badge en "Beste leads eerst" hetzelfde zeggen
    if ((lead.contact_person || '').trim()) score += 15
    if ((lead.function || '').trim()) score += 5
    if ((lead.email || '').trim()) score += 5

    if (lead.company_size === '51+') score += 20
    else if (lead.company_size === '11-50') score += 10
    else if (lead.company_size === '1-10') score += 5

    score += (lead.contact_attempts || 0) * 2

    return score
  }

  async function fetchLeads() {
    setLoading(true)
    setError(null)

    if (isDemoMode) {
      let demoLeads = [...DEMO_LEADS].map(l => ({
        ...l,
        lead_score: calculateLeadScore(l)
      }))
      if (profile?.role !== 'admin') {
        demoLeads = demoLeads.filter(l => l.assigned_to === user?.id)
      }
      setLeads(demoLeads)
      setLoading(false)
      return
    }

    try {
      let filteredLeads = []
      
      if (profile?.role === 'admin') {
        const { data, error } = await supabase
          .from('leads')
          .select('*, lead_lists(assigned_team_id, campaigns(type))')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
        if (error) throw error
        filteredLeads = data || []
      } else {
        const me = user?.id
        // 1. Get user's teams
        const { data: memberships } = await supabase.from('team_members').select('team_id').eq('profile_id', me)
        const teamIds = memberships?.map(m => m.team_id) || []
        
        // 2. v23: team-route loopt via campaign_teams — een campagne kan
        // meerdere teams hebben; een team belt alleen op lijsten van
        // actieve campagnes waar het aan gekoppeld is
        let teamListIds = []
        if (teamIds.length > 0) {
          const { data: ctRows } = await supabase.from('campaign_teams').select('campaign_id').in('team_id', teamIds)
          const linkedIds = [...new Set((ctRows || []).map(r => r.campaign_id))]
          let campaignIds = []
          if (linkedIds.length > 0) {
            const { data: camps } = await supabase.from('campaigns').select('id').in('id', linkedIds).is('deleted_at', null).eq('is_active', true)
            campaignIds = camps?.map(c => c.id) || []
          }
          if (campaignIds.length > 0) {
            const { data: lists } = await supabase.from('lead_lists').select('id').in('campaign_id', campaignIds)
            teamListIds = lists?.map(l => l.id) || []
          }
        }

        // 3. Build OR filter: assigned to me OR in my team's lists
        let query = supabase.from('leads').select('*, lead_lists(assigned_team_id, campaigns(type))').is('deleted_at', null)
        
        if (teamListIds.length > 0) {
          query = query.or(`assigned_to.eq.${me},lead_list_id.in.(${teamListIds.join(',')})`)
        } else {
          query = query.eq('assigned_to', me)
        }
        
        const { data, error } = await query.order('created_at', { ascending: false })
        if (error) throw error
        filteredLeads = data || []
      }

      const scoredLeads = filteredLeads.map(l => ({
        ...l,
        lead_score: calculateLeadScore(l)
      }))
      setLeads(scoredLeads)
    } catch (err) {
      console.error('fetchLeads error:', err)
      setError(err.message)
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  // v29: herbelpogingen op het ANDERE dagdeel plannen. Wie 's ochtends niet
  // opneemt, neemt 's ochtends vaak weer niet op - dus de volgende poging
  // komt 's middags rond 15:00, en andersom rond 10:00.
  function nextContactOnOtherDaypart(daysAhead) {
    const d = new Date()
    const calledInMorning = d.getHours() < 13
    d.setDate(d.getDate() + daysAhead)
    d.setHours(calledInMorning ? 15 : 10, 0, 0, 0)
    return d.toISOString()
  }

  async function updateLeadStatus(leadId, status, additionalFields = {}) {
    const currentLead = leads.find(l => l.id === leadId)
    let updates = { status, ...additionalFields, updated_at: new Date().toISOString() }

    // v27: later bellen = morgen opnieuw; geen gehoor = max 2 pogingen
    // v29: herkansing op het andere dagdeel
    if (status === 'later_bellen') {
      updates.next_contact_date = nextContactOnOtherDaypart(1)
    }
    if (status === 'geen_gehoor') {
      const nextAttempt = (currentLead?.contact_attempts || 0) + 1
      updates.contact_attempts = nextAttempt
      if (nextAttempt >= 2) {
        updates.status = 'cold'
        updates.next_contact_date = null
      } else {
        updates.next_contact_date = nextContactOnOtherDaypart(2)
      }
    }

    if (isDemoMode) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updates } : l))
      return null
    }

    const { error } = await supabase.from('leads').update(updates).eq('id', leadId)
    if (!error) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updates } : l))
    }
    return error
  }

  async function assignLead(leadId, assignedTo) {
    if (isDemoMode) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, assigned_to: assignedTo } : l))
      return null
    }
    const { error } = await supabase.from('leads').update({ assigned_to: assignedTo || null }).eq('id', leadId)
    if (!error) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, assigned_to: assignedTo } : l))
    }
    return error
  }

  async function logActivity(leadId, action, notes) {
    if (isDemoMode || !user?.id) return
    await supabase.from('activities').insert({ lead_id: leadId, user_id: user.id, action, notes })
  }

  async function callLead(leadId) {
    await logActivity(leadId, 'call', 'Gebeld')
  }

  // v21: atomisch de volgende belbare lead uit een lijst claimen (RPC).
  // De database garandeert dat twee bellers nooit dezelfde lead krijgen.
  async function claimNextLead(listId) {
    if (isDemoMode || !listId) return null
    const { data, error } = await supabase.rpc('claim_next_lead', { p_list_id: listId })
    if (error) {
      console.error('claim_next_lead mislukt:', error)
      return null
    }
    const lead = Array.isArray(data) ? data[0] : data
    return lead || null
  }

  // v38: backoffice-wachtrij - alleen leads met status 'deal' (al gemaakte
  // sales), FIFO op sale_date (verkoopmoment) i.p.v. created_at. Gebruikt
  // door WorkInterface wanneer profile.role === 'backoffice'.
  async function claimNextBackofficeLead(listId) {
    if (isDemoMode || !listId) return null
    const { data, error } = await supabase.rpc('claim_next_backoffice_lead', { p_list_id: listId })
    if (error) {
      console.error('claim_next_backoffice_lead mislukt:', error)
      return null
    }
    const lead = Array.isArray(data) ? data[0] : data
    return lead || null
  }

  // Lock van één lead vrijgeven (bijv. bij overslaan)
  async function releaseLead(leadId) {
    if (isDemoMode) return { error: null }
    const { error } = await supabase.rpc('release_lead', { p_lead_id: leadId })
    return { error }
  }

  // Alle eigen locks vrijgeven (bij sluiten van de belmodus)
  async function releaseMyLeads() {
    if (isDemoMode) return
    await supabase.rpc('release_my_leads')
  }

  async function createLead(leadData) {
    const newLead = {
      name: leadData.name, phone: leadData.phone, email: leadData.email || null, notes: leadData.notes || '',
      status: 'new', assigned_to: leadData.assigned_to || user?.id, created_by: user?.id,
      lead_source: leadData.lead_source || 'cold', decision_maker: leadData.decision_maker || false,
      address: leadData.address || null, house_number: leadData.house_number || null,
      postal_code: leadData.postal_code || null, city: leadData.city || null,
      contact_person: leadData.contact_person || null, function: leadData.function || null, website: leadData.website || null,
      organization_id: profile?.organization_id
    }

    if (isDemoMode) {
      const demoLead = { ...newLead, id: `demo-${Date.now()}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), lead_score: calculateLeadScore(newLead) }
      setLeads(prev => [demoLead, ...prev])
      return demoLead
    }

    const { data, error } = await supabase.from('leads').insert(newLead).select()
    if (!error && data) {
      const createdLead = Array.isArray(data) ? data[0] : data
      setLeads(prev => [{ ...createdLead, lead_score: calculateLeadScore(createdLead) }, ...prev])
      await logActivity(createdLead.id, 'lead_created', 'Lead aangemaakt')
      return createdLead
    }
    return null
  }

  useEffect(() => {
    fetchLeads()
  }, [isDemoMode, profile?.role, user?.id])

  // Schrijft één rij per behandelde lead naar call_logs (basis voor telemetrie, targets en payouts)
  // v29: de gespreksnotitie gaat mee, zodat collega's de historie van een lead kunnen zien
  async function logCallToDatabase(currentLead, dispositionType, callMeta, notes = '', customDispositionId = null) {
    if (isDemoMode || !user?.id) return
    try {
      const disposedAt = new Date().toISOString()
      const startedAt = callMeta?.startedAt || disposedAt
      const duration = Math.max(0, Math.round((new Date(disposedAt) - new Date(startedAt)) / 1000))
      await supabase.from('call_logs').insert({
        agent_id: user.id,
        organization_id: profile?.organization_id ?? null,
        lead_id: currentLead.id,
        lead_list_id: currentLead.lead_list_id || null,
        disposition: dispositionType,
        started_at: startedAt,
        disposed_at: disposedAt,
        duration_seconds: duration,
        notes: notes || null,
        custom_disposition_id: customDispositionId || null
      })
    } catch (err) {
      // Call logging mag de dispositie-flow nooit blokkeren
      console.error('call_logs insert mislukt:', err)
    }
  }

  // ==========================================================
  // DISPOSITIE-LOGICA (v17)
  // Eén simpele regel: de lead BLIJFT in zijn projectlijst.
  // De uitkomst is de status op de lead + een rij in call_logs.
  // Er worden dus nooit meer automatisch lijsten aangemaakt.
  // flow_settings bepaalt alleen nog: toewijzing + notitie-tag.
  // ==========================================================
  // v41: customDispositionId - wanneer de beller een eigen afboekreden koos
  // (WorkInterface), zodat call_logs herleidbaar blijft naar de eigen reden.
  async function handleLeadDisposition(leadId, currentListName, dispositionType, notes, nextDate = null, callMeta = null, customDispositionId = null) {
    const currentLead = leads.find(l => l.id === leadId)
    if (!currentLead) return
    const agentName = profile?.full_name || user?.email || 'Onbekend'

    let newNotes = currentLead.notes || ''
    if (notes) newNotes = `${newNotes}\n[${new Date().toLocaleDateString('nl-NL')}] ${notes}`

    // Basis-update: status = de afboekreden zelf, lijst blijft ongewijzigd.
    // Lock wordt vrijgegeven zodat de lead (na een evt. terugbelmoment)
    // weer voor iedereen beschikbaar is.
    const updates = {
      status: dispositionType,
      notes: newNotes,
      next_contact_date: nextDate,
      locked_by: null,
      locked_at: null,
      call_status: 'available',
      updated_at: new Date().toISOString()
    }

    // Herbel-logica (v27):
    // - later bellen: het kwam gewoon niet uit -> morgen opnieuw proberen
    //   (tenzij de beller zelf een datum koos)
    // - geen gehoor: maximaal 2 pogingen, daarna gaat de lead uit de wachtrij (cold)
    // v29: de automatische herkansing valt op het andere dagdeel
    if (dispositionType === 'later_bellen' && !nextDate) {
      updates.next_contact_date = nextContactOnOtherDaypart(1)
    }
    if (dispositionType === 'geen_gehoor') {
      const nextAttempt = (currentLead.contact_attempts || 0) + 1
      updates.contact_attempts = nextAttempt
      if (nextAttempt >= 2) {
        updates.status = 'cold'
        updates.next_contact_date = null
      } else if (!nextDate) {
        updates.next_contact_date = nextContactOnOtherDaypart(2)
      }
    }

    // v38: backoffice - sale doorgezet / klant wil annuleren
    // - deal krijgt (indien nog niet gezet) een sale_date: het moment dat de
    //   sale IS gemaakt, gebruikt voor FIFO in de backoffice-wachtrij.
    // - wil_annuleren legt de reden apart vast (cancel_reason) zodat die
    //   los van de vrije notities getoond kan worden in het Annuleringen-overzicht.
    if ((dispositionType === 'deal' || dispositionType === 'bruto_deal') && !currentLead.sale_date) {
      updates.sale_date = new Date().toISOString()
    }
    if (dispositionType === 'wil_annuleren') {
      updates.cancel_reason = notes || null
    }

    if (isDemoMode) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...updates } : l))
      return
    }

    await logCallToDatabase(currentLead, dispositionType, callMeta, notes, customDispositionId)

    // Instellingen per afboekreden (alleen toewijzing + notitie-tag)
    const { data: rule } = await supabase.from('flow_settings').select('auto_assign_to, append_agent_note, cooldown_days').eq('disposition_type', dispositionType).eq('is_active', true).maybeSingle()
    if (rule) {
      if (rule.auto_assign_to === 'agent') updates.assigned_to = user?.id
      else if (rule.auto_assign_to === 'none') updates.assigned_to = null
      if (rule.append_agent_note) updates.notes = `${updates.notes}\n— Afgeboekt door ${agentName}`
    }

    // v27: onjuiste timing krijgt een instelbare cooldown; daarna komt de
    // lead automatisch terug in de belwachtrij
    if (dispositionType === 'onjuiste_timing' && !updates.next_contact_date) {
      const days = Math.max(1, Number(rule?.cooldown_days) || 30)
      const d = new Date()
      d.setDate(d.getDate() + days)
      updates.next_contact_date = d.toISOString()
    }

    await supabase.from('leads').update(updates).eq('id', leadId)
    await logActivity(leadId, dispositionType, `Afboeking: ${dispositionType}`)
    await fetchLeads()
  }

  return {
    leads, loading, error, fetchLeads, updateLeadStatus, assignLead, logActivity, callLead, claimNextLead, claimNextBackofficeLead, releaseLead, releaseMyLeads, createLead, handleLeadDisposition
  }
}