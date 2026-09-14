import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// v68: accountmanagement-projecten (campaigns.type = 'accountmanagement').
// Wie in het team van zo'n project zit, werkt daar als accountmanager: eigen
// leads (assigned_to) van eerste gesprek tot actieve klant. RLS (v68) zorgt dat
// een teamlid in zo'n lijst alleen eigen + vrije leads ziet; managers van het
// project en admin zien alles.

// Toegang: heb ik minimaal 1 lijst in een accountmanagement-project?
export function useAccountManagementAccess() {
  const { user, profile, isDemoMode } = useAuth()
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(() => {
    if (!user?.id || isDemoMode) { setLists([]); setLoading(false); return }
    setLoading(true)
    supabase.from('lead_lists')
      .select('id, name, campaign_id, campaigns!inner(id, name, type, product_code, am_release_days)')
      .is('deleted_at', null)
      .eq('campaigns.type', 'accountmanagement')
      .order('name')
      .then(({ data }) => { setLists(data || []); setLoading(false) })
  }, [user?.id, isDemoMode])

  useEffect(() => { reload() }, [reload, profile?.role])

  return { amLists: lists, hasAccountManagement: lists.length > 0, loading, reload }
}

// Leads + teamleden van één accountmanagement-lijst, live bijgewerkt.
export function useAccountManagementLeads(listId) {
  const { user } = useAuth()
  const [leads, setLeads] = useState([])
  const [owners, setOwners] = useState({}) // profile_id -> full_name
  const [loading, setLoading] = useState(true)
  const [released, setReleased] = useState(0)

  const load = useCallback(async () => {
    if (!listId) { setLeads([]); setLoading(false); return }
    setLoading(true)
    // Eerst de automatische terugval draaien (geen pg_cron op dit project):
    // leads waar am_release_days lang niets mee gebeurd is gaan terug in de pool.
    try {
      const { data: n } = await supabase.rpc('am_auto_release', { p_list_id: listId })
      if (n) setReleased(n)
    } catch { /* niet blokkerend */ }
    const { data } = await supabase.from('leads')
      .select('*')
      .eq('lead_list_id', listId)
      .is('deleted_at', null)
      .order('next_contact_date', { ascending: true, nullsFirst: false })
    const rows = data || []
    setLeads(rows)
    const ids = [...new Set(rows.map(l => l.assigned_to).filter(Boolean))]
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setOwners(Object.fromEntries((profs || []).map(p => [p.id, p.full_name])))
    } else setOwners({})
    setLoading(false)
  }, [listId])

  useEffect(() => { load() }, [load])

  // Realtime: een collega pakt een lead, een offerte wordt getekend, enz.
  useEffect(() => {
    if (!listId) return
    const ch = supabase.channel(`am-leads-${listId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `lead_list_id=eq.${listId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [listId, load])

  const mine = useMemo(() => leads.filter(l => l.assigned_to === user?.id), [leads, user?.id])
  const pool = useMemo(() => leads.filter(l => !l.assigned_to), [leads])
  const others = useMemo(() => leads.filter(l => l.assigned_to && l.assigned_to !== user?.id), [leads, user?.id])

  async function claim(leadId) {
    const { error } = await supabase.rpc('am_claim_lead', { p_lead_id: leadId })
    if (error) throw new Error(error.message)
    await load()
  }

  async function release(leadId, reason) {
    const { error } = await supabase.rpc('am_release_lead', { p_lead_id: leadId, p_reason: reason || null, p_auto: false })
    if (error) throw new Error(error.message)
    await load()
  }

  // Opslaan van status / volgende actie / notitie / contactgegevens.
  // last_activity_at telt mee voor de automatische terugval.
  async function save(leadId, patch) {
    const now = new Date().toISOString()
    const { error } = await supabase.from('leads')
      .update({ ...patch, last_activity_at: now, updated_at: now })
      .eq('id', leadId)
    if (error) throw new Error(error.message)
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...patch, last_activity_at: now } : l))
  }

  // Contactmoment vastleggen (telt in de weekteller "gebeld").
  async function logContact(lead, disposition, notes) {
    const now = new Date().toISOString()
    await supabase.from('call_logs').insert({
      agent_id: user.id,
      organization_id: lead.organization_id ?? null,
      lead_id: lead.id,
      lead_list_id: lead.lead_list_id,
      disposition,
      started_at: now,
      disposed_at: now,
      duration_seconds: 0,
      source: 'accountmanagement',
      notes: notes || null,
    })
  }

  return { leads, mine, pool, others, owners, loading, released, reload: load, claim, release, save, logContact }
}

// Weekteller per accountmanager: gebeld / offertes / getekend deze week.
export function useAccountManagementWeekStats(listId, weekStart) {
  const { user } = useAuth()
  const [stats, setStats] = useState({ gebeld: 0, offertes: 0, getekend: 0 })

  const load = useCallback(async () => {
    if (!listId || !user?.id) return
    const since = weekStart.toISOString()
    const [{ data: logs }, { data: offs }] = await Promise.all([
      supabase.from('call_logs').select('disposition').eq('agent_id', user.id).eq('lead_list_id', listId).gte('disposed_at', since),
      supabase.from('offertes').select('id, status, getekend_op, verzonden_op').eq('user_id', user.id)
        .or(`getekend_op.gte.${since},verzonden_op.gte.${since}`),
    ])
    const l = logs || []
    const o = offs || []
    setStats({
      gebeld: l.filter(x => x.disposition !== 'teruggezet' && x.disposition !== 'offerte_verzonden').length,
      offertes: o.filter(x => x.verzonden_op && new Date(x.verzonden_op) >= weekStart).length,
      getekend: o.filter(x => x.status === 'getekend' && x.getekend_op && new Date(x.getekend_op) >= weekStart).length,
    })
  }, [listId, user?.id, weekStart])

  useEffect(() => { load() }, [load])
  return { stats, reload: load }
}
