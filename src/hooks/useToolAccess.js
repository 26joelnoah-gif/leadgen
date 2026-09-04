import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { ALL_TOOL_KEYS } from '../lib/tools'

// v60: welke tools mag de ingelogde gebruiker zien? Admin: alles. Anders de
// union van campaign_tools over de projecten waar hij manager van is of via een
// team aan hangt (RPC my_tool_keys, migration v60). Header, MobileNav, de
// /tools-route en de Tools-pagina lezen allemaal deze hook.
export function useToolAccess() {
  const { user, profile, isDemoMode } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [keys, setKeys] = useState(isAdmin ? ALL_TOOL_KEYS : [])
  const [loading, setLoading] = useState(!isAdmin)

  useEffect(() => {
    let alive = true
    if (isAdmin) { setKeys(ALL_TOOL_KEYS); setLoading(false); return }
    if (!user?.id || isDemoMode) { setKeys([]); setLoading(false); return }
    setLoading(true)
    supabase.rpc('my_tool_keys').then(({ data }) => {
      if (!alive) return
      setKeys(Array.isArray(data) ? data : [])
      setLoading(false)
    })
    return () => { alive = false }
  }, [user?.id, isAdmin, isDemoMode])

  return { toolKeys: keys, hasTools: keys.length > 0, loading }
}
