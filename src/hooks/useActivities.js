import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { DEMO_ACTIVITIES, DEMO_LEADS, DEMO_USERS } from '../lib/demoData'

export function useActivities(limit = 50) {
  const { user, profile, isDemoMode } = useAuth()
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchActivities() {
    setLoading(true)

    if (isDemoMode) {
      // Use demo data
      setActivities(DEMO_ACTIVITIES.slice(0, limit))
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('activities')
      .select('*, user:profiles(full_name), lead:leads(name)')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) console.error('fetchActivities error:', error.message)
    setActivities(data || [])
    setLoading(false)
  }

  // Draaide eerder alleen op isDemoMode, dus de fetch vuurde voordat de sessie
  // rond was en kwam standaard leeg terug.
  useEffect(() => {
    if (!isDemoMode && !user?.id) return
    fetchActivities()
  }, [isDemoMode, user?.id, profile?.role, limit])

  return { activities, loading, refetch: fetchActivities }
}