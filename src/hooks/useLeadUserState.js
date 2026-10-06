import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// v130: per beller per lead: verborgen tot (hidden_until) en "Straks" in het
// Te doen-paneel (snoozed_until/snoozed_due). Tabel lead_user_state, RLS:
// alleen je eigen regels. Ontbreekt de tabel (migratie nog niet gedraaid),
// dan werkt alles gewoon door zonder verbergen.
// Gedeeld tussen paneel en /leads via een simpele module-store, zodat
// verbergen op de ene plek meteen op de andere zichtbaar is.
let store = {}
let loadedFor = null
const listeners = new Set()
const emit = () => listeners.forEach(fn => fn(store))

export function useLeadUserState() {
  const { user } = useAuth()
  const [state, setState] = useState(store)

  useEffect(() => {
    listeners.add(setState)
    return () => { listeners.delete(setState) }
  }, [])

  const reload = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase
      .from('lead_user_state')
      .select('lead_id, hidden_until, snoozed_until, snoozed_due')
      .eq('user_id', user.id)
    if (error) { console.warn('lead_user_state laden:', error.message); return }
    const map = {}
    ;(data || []).forEach(r => { map[r.lead_id] = r })
    store = map
    loadedFor = user.id
    emit()
  }, [user?.id])

  useEffect(() => {
    if (user?.id && loadedFor !== user.id) reload()
  }, [user?.id, reload])

  const upsert = useCallback(async (leadId, patch) => {
    if (!user?.id) return false
    const prev = store[leadId]
    store = { ...store, [leadId]: { ...(prev || { lead_id: leadId }), ...patch } }
    emit()
    const { error } = await supabase.from('lead_user_state')
      .upsert({ user_id: user.id, lead_id: leadId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id,lead_id' })
    if (error) {
      console.error('lead_user_state opslaan:', error)
      store = { ...store }
      if (prev) store[leadId] = prev; else delete store[leadId]
      emit()
      return false
    }
    return true
  }, [user?.id])

  const isHidden = useCallback((leadId, now = Date.now()) => {
    const h = state[leadId]?.hidden_until
    return !!h && new Date(h).getTime() > now
  }, [state])

  const hideUntil = useCallback((leadId, iso) => upsert(leadId, { hidden_until: iso }), [upsert])
  const unhide = useCallback((leadId) => upsert(leadId, { hidden_until: null }), [upsert])
  const snooze = useCallback((leadId, untilIso, dueIso) => upsert(leadId, { snoozed_until: untilIso, snoozed_due: dueIso }), [upsert])

  // Staat deze lead (met deze opvolgdatum) op "Straks"?
  const isSnoozed = useCallback((lead, now = Date.now()) => {
    const s = state[lead.id]
    if (!s?.snoozed_until || new Date(s.snoozed_until).getTime() <= now) return false
    return !!s.snoozed_due && !!lead.next_contact_date &&
      new Date(s.snoozed_due).getTime() === new Date(lead.next_contact_date).getTime()
  }, [state])

  return { state, reload, isHidden, hideUntil, unhide, snooze, isSnoozed }
}
