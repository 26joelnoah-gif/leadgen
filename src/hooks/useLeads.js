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
      let query = supabase
        .from('leads')
        .select('*')

      if (profile?.role !== 'admin') {
        query = query.eq('assigned_to', user?.id)
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
      // Fallback to empty on error
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
      setLeads(leads.map(l => l.id === leadId ? { ...l, ...updates } : l))
      return null
    }

    const { error } = await supabase
      .from('leads')
      .update(updates)
      .eq('id', leadId)

    if (!error) {
      setLeads(leads.map(l => l.id === leadId ? { ...l, ...updates } : l))
    }
    return error
  }

  async function assignLead(leadId, assignedTo) {
    if (isDemoMode) {
      setLeads(leads.map(l => l.id === leadId ? { ...l, assigned_to: assignedTo } : l))
      return null
    }

    const { error } = await supabase
      .from('leads')
      .update({ assigned_to: assignedTo || null })
      .eq('id', leadId)

    if (!error) {
      setLeads(leads.map(l => l.id === leadId ? { ...l, assigned_to: assignedTo } : l))
    }
    return error
  }

  async function logActivity(leadId, action, notes) {
    if (isDemoMode || !user?.id) return

    await supabase.from('activities').insert({
      lead_id: leadId,
      user_id: user.id,
      action,
      notes
    })
  }

  async function callLead(leadId) {
    await logActivity(leadId, 'call', 'Gebeld')
  }

  async function claimLead(leadId) {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('leads')
      .update({
        locked_by: user.id,
        locked_at: now,
        call_status: 'calling'
      })
      .eq('id', leadId)
      .or(`locked_by.is.null,locked_at.lt.${new Date(Date.now() - 5*60000).toISOString()}`)

    if (!error) {
      setLeads(leads.map(l => l.id === leadId ? { ...l, locked_by: user.id, locked_at: now, call_status: 'calling' } : l))
      await logActivity(leadId, 'lead_claimed', 'Lead geclaimd voor bellen')
    }
    return error
  }

  async function releaseLead(leadId) {
    const { error } = await supabase.from('leads').update({
      locked_by: null,
      locked_at: null,
      call_status: 'available'
    }).eq('id', leadId)

    if (!error) {
      setLeads(leads.map(l => l.id === leadId ? { ...l, locked_by: null, locked_at: null, call_status: 'available' } : l))
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
      name: leadData.name,
      phone: leadData.phone,
      email: leadData.email || null,
      notes: leadData.notes || '',
      status: 'new',
      assigned_to: leadData.assigned_to || user?.id,
      created_by: user?.id,
      lead_source: leadData.lead_source || 'cold',
      decision_maker: leadData.decision_maker || false
    }

    if (isDemoMode) {
      const demoLead = {
        ...newLead,
        id: `demo-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      demoLead.lead_score = calculateLeadScore(demoLead)
      setLeads([demoLead, ...leads])
      return demoLead
    }

    try {
      const { data, error } = await supabase
        .from('leads')
        .insert(newLead)
        .select()

      if (error) {
        console.error('createLead error:', error)
        throw error
      }

      // Handle both array and single object response
      const createdLead = Array.isArray(data) ? data[0] : data
      if (createdLead) {
        const leadWithScore = { ...createdLead, lead_score: calculateLeadScore(createdLead) }
        setLeads(prev => [leadWithScore, ...prev])
        await logActivity(createdLead.id, 'lead_created', 'Lead aangemaakt')
        return createdLead
      }
      // If no data returned, refetch to get the created lead
      console.log('createLead: no data returned, refetching...')
      await fetchLeads()
      return null
    } catch (err) {
      console.error('createLead failed:', err)
      throw err
    }
  }

  useEffect(() => {
    fetchLeads()
  }, [isDemoMode, profile?.role, user?.id])

  async function handleLeadDisposition(leadId, currentListName, dispositionType, notes, nextDate = null) {
    const currentLead = leads.find(l => l.id === leadId)
    if (!currentLead) return

    // Demo mode: update local state only
    if (isDemoMode) {
      const statusMap = {
        'geen_interesse': 'geen_interesse',
        'verkeerde_info': 'verkeerd_nummer',
        'deal': 'deal',
        'afspraak_gemaakt': 'afspraak_gemaakt',
        'terugbelopdracht': 'terugbelafspraak',
        'niet_bereikbaar': 'niet_bereikbaar',
        'later_bellen': 'later_bellen'
      }
      const newStatus = statusMap[dispositionType] || currentLead.status
      const updatedLead = {
        ...currentLead,
        status: newStatus,
        next_contact_date: dispositionType === 'terugbelopdracht' ? nextDate : currentLead.next_contact_date,
        contact_attempts: dispositionType === 'niet_bereikbaar'
          ? (currentLead.contact_attempts || 0) + 1
          : currentLead.contact_attempts
      }
      setLeads(prev => prev.map(l => l.id === leadId ? updatedLead : l))
      return
    }

    const moveToBatch = async (batchNamePrefix) => {
      if (!currentListName) return
      const batchedListName = `${batchNamePrefix} - ${currentListName}`
      let targetListId = null

      const { data: existingLists } = await supabase.from('lead_lists').select('id').eq('name', batchedListName)
      if (existingLists && existingLists.length > 0) {
        targetListId = existingLists[0].id
      } else {
        const { data: newList } = await supabase.from('lead_lists').insert({
          name: batchedListName,
          description: `Automatische batch: ${batchNamePrefix}`,
          created_by: user?.id
        }).select().single()
        if (newList) targetListId = newList.id
      }

      if (targetListId) {
        await supabase.from('leads').update({ lead_list_id: targetListId }).eq('id', leadId)
      }
    }

    if (dispositionType === 'geen_interesse') {
      await updateLeadStatus(leadId, 'geen_interesse')
      await logActivity(leadId, 'reason_lost', notes || 'Geen interesse')
      await moveToBatch('Geen interesse')
    }
    else if (dispositionType === 'verkeerde_info') {
      await updateLeadStatus(leadId, 'verkeerd_nummer')
      await logActivity(leadId, 'note', notes || 'Verkeerde info')
      await moveToBatch('Verkeerde info')
    }
    else if (dispositionType === 'deal') {
      await updateLeadStatus(leadId, 'deal')
      await logActivity(leadId, 'deal_won', notes || 'BRUTO Deal gescoord')
      await moveToBatch('Deals')
    }
    else if (dispositionType === 'afspraak_gemaakt') {
      await updateLeadStatus(leadId, 'afspraak_gemaakt')
      await logActivity(leadId, 'appointment_set', notes || 'BRUTO Afspraak gemaakt')
      await moveToBatch('Afspraken')
    }
    else if (dispositionType === 'terugbelopdracht') {
      await updateLeadStatus(leadId, 'terugbelafspraak', { next_contact_date: nextDate })
      await logActivity(leadId, 'snooze', notes || 'TBA ingepland')
    }
    else if (dispositionType === 'niet_bereikbaar') {
      const attempts = (currentLead.contact_attempts || 0) + 1
      if (attempts >= 3) {
        await updateLeadStatus(leadId, 'cold', { contact_attempts: attempts, next_contact_date: null })
        await logActivity(leadId, 'note', 'Voor 3de keer niet bereikbaar, lead afgesloten.')
        await moveToBatch('Niet bereikbaar')
      } else {
        await updateLeadStatus(leadId, currentLead.status, { contact_attempts: attempts }) // Keep current status but incr attempts
        await logActivity(leadId, 'note', `Niet bereikbaar (Poging ${attempts}/3)`)
      }
    }
    else if (dispositionType === 'later_bellen') {
      await updateLeadStatus(leadId, 'later_bellen')
      await logActivity(leadId, 'note', 'Uitgesteld: later bellen')
    }

    await fetchLeads()
  }

  return {
    leads,
    loading,
    error,
    fetchLeads,
    updateLeadStatus,
    assignLead,
    logActivity,
    callLead,
    createLead,
    claimLead,
    releaseLead,
    getNextLead,
    handleLeadDisposition
  }
}