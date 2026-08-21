import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useLeadLists() {
  const { profile, isDemoMode } = useAuth()
  const [leadLists, setLeadLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchLeadLists(includeDeleted = false) {
    setLoading(true)
    setError(null)

    if (isDemoMode) {
      setLeadLists([
        { id: 'list-1', name: 'Zorg & Welzijn Bulk', description: 'Grote lijst met zorginstellingen', created_at: new Date().toISOString() },
        { id: 'list-2', name: 'Horeca Randstad', description: 'Nieuwe restaurants in Amsterdam/Utrecht', created_at: new Date().toISOString() }
      ])
      setLoading(false)
      return
    }

    try {
      let query = supabase
        .from('lead_lists')
        .select('*')
      
      if (!includeDeleted) {
        query = query.is('deleted_at', null)
      }

      query = query.order('created_at', { ascending: false })
      
      const { data, error } = await query
      if (error) throw error
      
      setLeadLists(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function createLeadList(name, description = '') {
    if (isDemoMode) {
      const newList = {
        id: `demo-${Date.now()}`,
        name,
        description,
        created_at: new Date().toISOString()
      }
      setLeadLists(prev => [newList, ...prev])
      return newList
    }

    const { data, error } = await supabase
      .from('lead_lists')
      .insert({ name, description, created_by: profile?.id, organization_id: profile?.organization_id })
      .select()
      .single()

    if (!error && data) {
      setLeadLists(prev => [data, ...prev])
    }
    return { data, error }
  }

  async function addLeadsToList(listId, leadIds) {
    if (isDemoMode) return { error: null }

    let query = supabase
      .from('leads')
      .update({ lead_list_id: listId })
      .in('id', leadIds)

    // Alleen op organisatie filteren als de gebruiker er echt één heeft —
    // met organization_id = null zou de update stilletjes 0 rijen raken
    if (profile?.organization_id) {
      query = query.eq('organization_id', profile.organization_id)
    }

    const { error } = await query

    return { error }
  }

  async function removeLeadFromList(listId, leadId) {
    if (isDemoMode) return { error: null }

    const { error } = await supabase
      .from('leads')
      .update({ lead_list_id: null })
      .eq('id', leadId)

    return { error }
  }

  async function getLeadsInList(listId) {
    if (isDemoMode) return []

    try {
      // Haal leads via lead_list_id - filter meteen in de query
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, phone, email, status, notes')
        .eq('lead_list_id', listId)

      if (error) {
        console.error('Error fetching leads:', error)
        return []
      }

      return data || []
    } catch (err) {
      console.error('getLeadsInList catch:', err)
      return []
    }
  }

  async function deleteLeadList(listId) {
    if (isDemoMode) {
      setLeadLists(prev => prev.filter(l => l.id !== listId))
      return { error: null }
    }

    // Soft delete: set deleted_at to current timestamp
    const { error } = await supabase
      .from('lead_lists')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', listId)

    if (!error) {
      setLeadLists(prev => prev.filter(l => l.id !== listId))
    }
    return { error }
  }

  async function restoreLeadList(listId) {
    if (isDemoMode) return { error: null }
    const { error } = await supabase
      .from('lead_lists')
      .update({ deleted_at: null })
      .eq('id', listId)
    return { error }
  }

  async function permanentDeleteLeadList(listId) {
    if (isDemoMode) return { error: null }
    // Eerst de leads van deze lijst soft-deleten. Zonder dit zou de
    // FK (ON DELETE SET NULL) ze loskoppelen: onzichtbare "zwevende"
    // leads die nergens meer in beeld komen maar wel meetellen.
    const { error: leadsError } = await supabase
      .from('leads')
      .update({ deleted_at: new Date().toISOString() })
      .eq('lead_list_id', listId)
      .is('deleted_at', null)
    if (leadsError) return { error: leadsError }
    const { error } = await supabase
      .from('lead_lists')
      .delete()
      .eq('id', listId)
    return { error }
  }

  async function assignListToAgent(listId, agentId) {
    if (isDemoMode) return { error: null }
    const { error } = await supabase
      .from('lead_lists')
      .update({ assigned_to: agentId || null })
      .eq('id', listId)
    if (!error) {
      setLeadLists(prev => prev.map(l => l.id === listId ? { ...l, assigned_to: agentId } : l))
    }
    return { error }
  }

  useEffect(() => {
    if (profile?.id) {
      fetchLeadLists()
    }
  }, [profile?.id, isDemoMode])

  return {
    leadLists,
    loading,
    error,
    fetchLeadLists,
    createLeadList,
    addLeadsToList,
    removeLeadFromList,
    getLeadsInList,
    deleteLeadList,
    restoreLeadList,
    permanentDeleteLeadList,
    assignListToAgent
  }
}
