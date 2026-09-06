import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// v62: mag de ingelogde gebruiker de pagina Leads (gedeelde leadlijst) zien?
// Ja zodra hij minimaal 1 bel-/acquisitielijst kan lezen (RLS bepaalt dat:
// team, manager, of planning-account met projectvlag planning_can_view_leads).
// Header en de /leads-route lezen deze hook.
export function useLeadBoardAccess() {
  const { user, profile, isDemoMode } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [hasLists, setHasLists] = useState(isAdmin)
  const [loading, setLoading] = useState(!isAdmin)

  useEffect(() => {
    let alive = true
    if (isAdmin) { setHasLists(true); setLoading(false); return }
    if (!user?.id || isDemoMode) { setHasLists(false); setLoading(false); return }
    setLoading(true)
    supabase.from('lead_lists')
      .select('id, campaigns!inner(type)')
      .is('deleted_at', null)
      .neq('campaigns.type', 'recruitment')
      .limit(1)
      .then(({ data }) => {
        if (!alive) return
        setHasLists((data || []).length > 0)
        setLoading(false)
      })
    return () => { alive = false }
  }, [user?.id, isAdmin, isDemoMode, profile?.role])

  return { hasLeadBoard: hasLists, loading }
}
