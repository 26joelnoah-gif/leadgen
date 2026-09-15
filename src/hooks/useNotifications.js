import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// v75: meldingen voor de ingelogde gebruiker (tabel public.notifications).
// Nu alleen gebruikt voor het overnemen van een lead: wie de lead kwijtraakt
// en wie hem overneemt krijgen allebei een regel. Meldingen worden alleen
// geschreven door security definer functies (claim_lead), nooit vanuit de
// browser; lezen en op gelezen zetten mag je alleen bij je eigen regels.
const MAX = 30

export function useNotifications() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const onNieuwRef = useRef(null)

  const load = useCallback(async () => {
    if (!user?.id) { setItems([]); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, lead_id, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(MAX)
    if (error) console.error('meldingen laden:', error)
    setItems(data || [])
    setLoading(false)
  }, [user?.id])

  useEffect(() => { load() }, [load])

  // Live: een overname moet meteen zichtbaar zijn bij degene die de lead kwijt is.
  useEffect(() => {
    if (!user?.id) return
    const ch = supabase
      .channel(`meldingen-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `profile_id=eq.${user.id}` },
        (payload) => {
          setItems(prev => [payload.new, ...prev].slice(0, MAX))
          if (onNieuwRef.current) onNieuwRef.current(payload.new)
        })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user?.id])

  const markAllRead = useCallback(async () => {
    const open = items.filter(i => !i.read_at).map(i => i.id)
    if (open.length === 0) return
    const nu = new Date().toISOString()
    setItems(prev => prev.map(i => i.read_at ? i : { ...i, read_at: nu }))
    const { error } = await supabase.from('notifications').update({ read_at: nu }).in('id', open)
    if (error) { console.error('melding op gelezen zetten:', error); load() }
  }, [items, load])

  const onNieuw = useCallback((fn) => { onNieuwRef.current = fn }, [])

  return { items, loading, unread: items.filter(i => !i.read_at).length, load, markAllRead, onNieuw }
}
