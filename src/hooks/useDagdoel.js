// v150: eigen dagdoel van de beller ("hoeveel gesprekken wil ik vandaag doen").
// Tabel public.dagdoelen (user_id, dag, doel). Geen doel voor vandaag? Dan
// stellen we het doel van de vorige keer voor.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function vandaagIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useDagdoel() {
  const { user, isDemoMode } = useAuth()
  const [doel, setDoel] = useState(null)        // doel van vandaag
  const [voorstel, setVoorstel] = useState(null) // laatst gebruikte doel
  const [geladen, setGeladen] = useState(false)

  const laad = useCallback(async () => {
    if (!user?.id || isDemoMode) return
    const { data } = await supabase.from('dagdoelen').select('dag, doel')
      .eq('user_id', user.id).order('dag', { ascending: false }).limit(1)
    const r = data?.[0]
    if (r && r.dag === vandaagIso()) { setDoel(r.doel); setVoorstel(r.doel) }
    else { setDoel(null); setVoorstel(r?.doel || null) }
    setGeladen(true)
  }, [user?.id, isDemoMode])

  useEffect(() => { laad().catch(() => setGeladen(true)) }, [laad])

  const bewaar = useCallback(async (nieuw) => {
    const n = Math.max(1, Math.min(1000, Math.round(Number(nieuw) || 0)))
    if (!user?.id || !n) return false
    const { error } = await supabase.from('dagdoelen')
      .upsert({ user_id: user.id, dag: vandaagIso(), doel: n, updated_at: new Date().toISOString() }, { onConflict: 'user_id,dag' })
    if (error) throw error
    setDoel(n); setVoorstel(n)
    try { window.dispatchEvent(new CustomEvent('reachconnect-dagdoel', { detail: n })) } catch { /* oud */ }
    return true
  }, [user?.id])

  // andere onderdelen (dashboard en belscherm) blijven gelijk
  useEffect(() => {
    const opDoel = (e) => { setDoel(e.detail); setVoorstel(e.detail) }
    window.addEventListener('reachconnect-dagdoel', opDoel)
    return () => window.removeEventListener('reachconnect-dagdoel', opDoel)
  }, [])

  return { doel, voorstel, geladen, bewaar }
}

// Gesprekken van vandaag (zelfde telling als het belscherm: alle call_logs van jou)
export async function telGesprekkenVandaag(userId) {
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const { count } = await supabase.from('call_logs').select('id', { count: 'exact', head: true })
    .eq('agent_id', userId).gte('disposed_at', start.toISOString())
  return count || 0
}

// Op dit tempo: hoe laat haal je je doel? (null als nog te weinig gedaan)
export function tempoVoorspelling(gedaan, doel, startUur = 9) {
  if (!doel || gedaan >= doel || gedaan < 3) return null
  const nu = new Date()
  const start = new Date(nu); start.setHours(startUur, 0, 0, 0)
  const minutenBezig = Math.max(30, (nu - start) / 60000)
  const perMinuut = gedaan / minutenBezig
  if (perMinuut <= 0) return null
  const klaar = new Date(nu.getTime() + ((doel - gedaan) / perMinuut) * 60000)
  return klaar
}
