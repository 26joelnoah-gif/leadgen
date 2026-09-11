import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// v69: staat de Mailingservice aan in het PROJECT van deze lijst? Geeft de
// instelling terug (bron, mailsoort, opvolgdagen) of null. Zelfde route als
// useProjectTools: lead_lists.campaign_id -> campaign_mail_services.
export function useProjectMailService(listId) {
  const { isDemoMode } = useAuth()
  const [mailService, setMailService] = useState(null)

  useEffect(() => {
    let alive = true
    if (!listId || isDemoMode) { setMailService(null); return }
    supabase.from('lead_lists').select('campaign_id').eq('id', listId).maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        if (!data?.campaign_id) { setMailService(null); return }
        return supabase.from('campaign_mail_services')
          .select('campaign_id, enabled, source, mail_type, follow_up_days')
          .eq('campaign_id', data.campaign_id)
          .eq('enabled', true)
          .maybeSingle()
          .then(({ data: svc }) => { if (alive) setMailService(svc || null) })
      })
    return () => { alive = false }
  }, [listId, isDemoMode])

  return { mailService }
}
