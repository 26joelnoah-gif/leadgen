import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { setterTool } from '../content/settertool'

// v159: gebruikt dit project de settertool? Leest campaigns.setter_tool apart
// van de rest, zodat een fout hier (bijv. kolom nog niet aangemaakt) het
// belscherm nooit raakt. Geeft { key, tool } of { key: null, tool: null }.
export function useSetterTool(campaignId) {
  const [key, setKey] = useState(null)
  useEffect(() => {
    if (!campaignId) { setKey(null); return }
    let weg = false
    supabase.from('campaigns').select('setter_tool').eq('id', campaignId).maybeSingle()
      .then(({ data, error }) => {
        if (weg) return
        setKey(!error && data?.setter_tool && setterTool(data.setter_tool) ? data.setter_tool : null)
      })
    return () => { weg = true }
  }, [campaignId])
  return { key, tool: setterTool(key) }
}

// Lege gesprekskaart voor een nieuwe lead
export function legeKaart() {
  return {
    haak: 'standaard', bezwaren: [], watVielOp: '', branche: '', kanaal: '',
    moment1: '', moment2: '', interesse: [], interesseAnders: '',
    beslisser: null, medeBeslisser: '', whatsapp: false, referentie: false,
    nietEigenaar: false, besteTijd: '', eisen: [],
  }
}

// Werkt deze gebruiker aan een project met de settertool? (voor het menu)
// RLS op campaigns bepaalt welke projecten iemand ziet.
export function useHeeftSetterTool(userId) {
  const [heeft, setHeeft] = useState(false)
  useEffect(() => {
    if (!userId) { setHeeft(false); return }
    let weg = false
    supabase.from('campaigns').select('id', { count: 'exact', head: true })
      .not('setter_tool', 'is', null).is('deleted_at', null)
      .then(({ count, error }) => { if (!weg) setHeeft(!error && (count || 0) > 0) })
    return () => { weg = true }
  }, [userId])
  return heeft
}
