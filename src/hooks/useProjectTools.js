import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { ALL_TOOL_KEYS } from '../lib/tools'

// v66: welke tools staan aan in het PROJECT van een lead? Verschil met
// useToolAccess (v60): die geeft de union over al je projecten en bepaalt of
// je de Tools-tab ziet. Deze hook kijkt naar één lijst (lead_lists.campaign_id
// -> campaign_tools) en is bedoeld voor knoppen bij een lead, zoals
// "Offerte maken" in het belscherm en op de contactkaart: die horen alleen te
// verschijnen als de offerte-tool in dát project aanstaat. Admin: altijd alles
// (zelfde regel als v60).
export function useProjectTools(listId) {
  const { profile, isDemoMode } = useAuth()
  const isAdmin = profile?.role === 'admin'
  const [keys, setKeys] = useState(isAdmin ? ALL_TOOL_KEYS : [])

  useEffect(() => {
    let alive = true
    if (isAdmin) { setKeys(ALL_TOOL_KEYS); return }
    if (!listId || isDemoMode) { setKeys([]); return }
    supabase.from('lead_lists').select('campaign_id').eq('id', listId).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (!data?.campaign_id) { setKeys([]); return }
        return supabase.from('campaign_tools').select('tool_key').eq('campaign_id', data.campaign_id)
          .then(({ data: rows }) => { if (alive) setKeys((rows || []).map(r => r.tool_key)) })
      })
    return () => { alive = false }
  }, [listId, isAdmin, isDemoMode])

  return { projectToolKeys: keys, hasTool: (key) => keys.includes(key) }
}

// Link naar de offerte-tool, voorgevuld vanuit een lead (de tool haalt naam,
// contactpersoon, e-mail, telefoon en adres zelf op via ?lead=).
export const offerteHrefForLead = (leadId) => `/tools/offerte-tool.html?lead=${encodeURIComponent(leadId)}`
// v76: zelfde idee voor de verduurzaming-tool; ?id= opent een bestaande offerte.
export const verduurzamingHrefForLead = (leadId) => `/tools/verduurzaming-tool.html?lead=${encodeURIComponent(leadId)}`
export const verduurzamingHrefForOfferte = (offerteId) => `/tools/verduurzaming-tool.html?id=${encodeURIComponent(offerteId)}`
export const OFFERTE_TOOL_KEYS = ['offerte_bestelplatform', 'offerte_verduurzaming']
