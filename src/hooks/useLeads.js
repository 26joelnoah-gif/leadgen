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
      // 1. Get user's teams if not admin
      let userTeamIds = []
      if (profile?.role !== 'admin') {
        const { data: memberships } = await supabase.from('team_members').select('team_id').eq('profile_id', user?.id)
        userTeamIds = memberships?.map(m => m.team_id) || []
      }

      // 2. Fetch leads with list info for filtering
      let query = supabase.from('leads').select('*, lead_lists(assigned_team_id)')

      if (profile?.role !== 'admin') {
        const me = user?.id
        let filterStr = `assigned_to.eq.${me}`
        if (userTeamIds.length > 0) {
           const teamIdsStr = userTeamIds.map(id => `"${id}"`).join(',')
           // Better filtering logic for teams:
           query = query.or(`assigned_to.eq.${me},lead_list_id.in.(select id from lead_lists where assigned_team_id.in.(${teamIdsStr}))`)
        } else {
           query = query.eq('assigned_to', me)
        }
      }

      query = query.order('created_at', { ascending: false })
      const { data, error } = await query
      if (error) throw error

      const scoredLeads = (data || []).map(l => ({
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

  async function updateLeadStatus(leadId, status, additionalFields = {}) {
    const currentLead = leads.find(l => l.id === leadId)
    let updates = { status, ...additionalFields, updated_at: new Date().toISOString() }

    if (status === 'later_bellen' || status === 'geen_gehoor') {
      const nextAttempt = (currentLead?.contact_attempts || 0) + 1
      updates.contact_attempts = nextAttempt
      if (nextAttempt >= 3) {
        updates.status = 'cold'
        updates.next_contact_date = null
      } else {
        const daysToAdd = nextAttempt === 1 ? 2 : 3
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + daysToAdd)
        updates.next_contact_date = nextDate.toISOString()
      }
    } else if (['deal', 'afspraak_gemaakt', 'geen_interesse', 'verkeerd_nummer'].includes(status)) {
      updates.next_contact_date = null
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

  async function claimLead(leadId) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('leads')
      .update({ locked_by: user.id, locked_at: now, call_status: 'calling' })
      .eq('id', leadId)
      .or(`locked_by.is.null,locked_at.lt.${new Date(Date.now() - 5*60000).toISOString()}`)

    if (!error) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, locked_by: user.id, locked_at: now, call_status: 'calling' } : l))
      await logActivity(leadId, 'lead_claimed', 'Lead geclaimd voor bellen')
    }
    return error
  }

  async function releaseLead(leadId) {
    const { error } = await supabase.from('leads').update({ locked_by: null, locked_at: null, call_status: 'available' }).eq('id', leadId)
    if (!error) {
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, locked_by: null, locked_at: null, call_status: 'available' } : l))
    }
    return { error }
  }

  async function getNextLead() {
    const available = leads.find(l => l.call_status === 'available' && !l.locked_by)
    if (available) {
      await claimLead(available.id)
      return available
    }
    return null
  }

  async function createLead(leadData) {
    const newLead = {
      name: leadData.name, phone: leadData.phone, email: leadData.email || null, notes: leadData.notes || '',
      status: 'new', assigned_to: leadData.assigned_to || user?.id, created_by: user?.id,
      lead_source: leadData.lead_source || 'cold', decision_maker: leadData.decision_maker || false,
      address: leadData.address || null, house_number: leadData.house_number || null,
      postal_code: leadData.postal_code || null, city: leadData.city || null,
      contact_person: leadData.contact_person || null, function: leadData.function || null, website: leadData.website || null
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

  async function handleLeadDisposition(leadId, currentListName, dispositionType, notes, nextDate = null) {
    const currentLead = leads.find(l => l.id === leadId)
    if (!currentLead) return
    const agentName = profile?.full_name || user?.email || 'Onbekend'

    const { data: rule } = await supabase.from('flow_settings').select('*').eq('disposition_type', dispositionType).single()
    const getOrCreateList = async (listName) => {
      const { data: existing } = await supabase.from('lead_lists').select('id').eq('name', listName).limit(1)
      if (existing?.length > 0) return existing[0].id
      const { data: newList } = await supabase.from('lead_lists').insert({ name: listName, created_by: user?.id }).select().single()
      return newList?.id
    }

    let status = currentLead.status
    let newNotes = currentLead.notes || ''
    if (notes) newNotes = `${newNotes}\n[${new Date().toLocaleDateString()}] ${notes}`

    if (rule) {
      const targetListName = rule.target_list_name.replace('{{agent}}', agentName)
      const listId = await getOrCreateList(targetListName)
      let assignedTo = currentLead.assigned_to
      if (rule.auto_assign_to === 'agent') assignedTo = user?.id
      else if (rule.auto_assign_to === 'none') assignedTo = null
      
      const updates = {
         status: ['deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer'].includes(dispositionType) ? dispositionType : 'new',
         notes: rule.append_agent_note ? `${newNotes}\n🚨 AFBOEKING DOOR: ${agentName}` : newNotes,
         lead_list_id: listId,
         assigned_to: assignedTo,
         next_contact_date: nextDate,
         updated_at: new Date().toISOString()
      }
      await supabase.from('leads').update(updates).eq('id', leadId)
      await logActivity(leadId, dispositionType, `Automated flow: ${targetListName}`)
    } else {
      await supabase.from('leads').update({ status: dispositionType, notes: newNotes, next_contact_date: nextDate, updated_at: new Date().toISOString() }).eq('id', leadId)
    }
    await fetchLeads()
  }

  return {
    leads, loading, error, fetchLeads, updateLeadStatus, assignLead, logActivity, callLead, claimLead, releaseLead, getNextLead, createLead, handleLeadDisposition
  }
}