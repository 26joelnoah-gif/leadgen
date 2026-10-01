// v117: staat de onderhoudsmodus aan?
//
// Eén rij in public.app_onderhoud. Iedereen mag die lezen, ook zonder account,
// want de inlogpagina moet het ook weten. Gaat het ophalen om wat voor reden
// dan ook mis, dan houden we 'uit' aan: een storing mag de app nooit zelf op
// slot zetten.
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useOnderhoud() {
  const [actief, setActief] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let gestopt = false

    async function haal() {
      try {
        const { data, error } = await supabase
          .from('app_onderhoud')
          .select('actief')
          .eq('id', 1)
          .maybeSingle()
        if (gestopt) return
        if (!error) setActief(data?.actief === true)
      } catch {
        /* offline of demo-modus: stil houden, stand blijft zoals hij was */
      } finally {
        if (!gestopt) setLoading(false)
      }
    }

    haal()

    // Vangnet naast realtime: elke minuut en zodra je terugkomt in het tabblad.
    const interval = setInterval(haal, 60 * 1000)
    const onFocus = () => haal()
    window.addEventListener('focus', onFocus)

    // Realtime, zodat een open tabblad binnen een paar seconden meegaat.
    let channel = null
    try {
      channel = supabase
        .channel(`app-onderhoud-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'app_onderhoud' }, (payload) => {
          if (!gestopt) setActief(payload?.new?.actief === true)
        })
        .subscribe()
    } catch { /* realtime niet beschikbaar: de poll doet het werk */ }

    return () => {
      gestopt = true
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      if (channel) { try { supabase.removeChannel(channel) } catch { /* al weg */ } }
    }
  }, [])

  return { actief, loading }
}

/** Aan- of uitzetten. Alleen een admin komt hier doorheen (check zit in de DB). */
export async function onderhoudZetten(actief) {
  const { data, error } = await supabase.rpc('onderhoud_zetten', { p_actief: !!actief })
  if (error) throw error
  return data === true
}
