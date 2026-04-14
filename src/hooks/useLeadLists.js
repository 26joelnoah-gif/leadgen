import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function useLeadLists() {
  const { profile, isDemoMode } = useAuth()
  const [leadLists, setLeadLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchLeadLists() {
    setLoading(true)
    setError(null)

    if (isDemoMode) {
      setLeadLists([])
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('lead_lists')
        .select('*')
        .order('created_at', { ascending: false })
      
      // Try fallback if join fails (due to naming)
      if (error && error.code === 'PGRST100') {
        const { data: fallbackData } = await supabase
          .from('lead_lists')
          .select('*, profiles:profiles(full_name)')
          .order('created_at', { ascending: false })
        setLeadLists(fallbackData || [])
        return
      }

      if (error) throw error
      // Agents only see lists assigned to them or created by them
      const lists = profile?.role === 'admin'
        ? (data || [])
        : (data || []).filter(l => l.assigned_to === profile?.id || l.created_by === profile?.id)
      setLeadLists(lists)
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
      setLeadLists([newList, ...leadLists])
      return newList
    }

    const { data, error } = await supabase
      .from('lead_lists')
      .insert({ name, description, created_by: profile?.id })
      .select()
      .single()

    if (!error && data) {
      setLeadLists([data, ...leadLists])
    }
    return { data, error }
  }

  async function addLeadsToList(listId, leadIds) {
    if (isDemoMode) return { error: null }

    const { error } = await supabase
      .from('leads')
      .update({ lead_list_id: listId })
      .in('id', leadIds)

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
      setLeadLists(leadLists.filter(l => l.id !== listId))
      return { error: null }
    }

    const { error } = await supabase
      .from('lead_lists')
      .delete()
      .eq('id', listId)

    if (!error) {
      setLeadLists(leadLists.filter(l => l.id !== listId))
    }
    return { error }
  }

  async function assignListToAgent(listId, agentId) {
    if (isDemoMode) return { error: null }
    const { error } = await supabase
      .from('lead_lists')
      .update({ assigned_to: agentId || null })
      .eq('id', listId)
    if (!error) {
      setLeadLists(leadLists.map(l => l.id === listId ? { ...l, assigned_to: agentId } : l))
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
    assignListToAgent
  }
}
