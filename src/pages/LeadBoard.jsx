import { useState, useEffect, useMemo, useCallback } from 'react'
import { Phone, MapPin, Lock, Search, RefreshCw, User, Inbox, Navigation, List, Map as MapIcon, Compass } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLeadLists } from '../hooks/useLeadLists'
import { useGeolocation } from '../hooks/useGeolocation'
import { useToast } from '../components/Toast'
import { getStatusDetails } from '../utils/statusUtils'
import { distanceM, formatDistance, distanceBand } from '../utils/geoUtils'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import LeadMap from '../components/LeadMap'

// v62: gedeelde Leadlijst. Iedereen die in een project zit (team, manager,
// planning-account met projectvlag) ziet ALLE leads van de gekozen lijst en
// kiest zelf welke hij oppakt. Klik = RPC claim_lead: de lead wordt 10 min
// vergrendeld en gaat open in het belscherm (WorkInterface, single-lead-modus).
// Collega's zien "In behandeling door <naam>" en kunnen die lead niet openen.
// Sluiten of afboeken geeft de lock weer vrij (release_my_leads / disposition).
//
// v64 (Outside, stap 1): accountmanager zet "Locatie aan" -> elke lead krijgt
// een afstand (leads.lat/lng, gevuld door Edge Function geocode-leads), de lijst
// sorteert op dichtbij-eerst en er is een kaartweergave (LeadMap).
const LOCK_TTL_MS = 10 * 60 * 1000
const POLL_MS = 8000
const DONE_STATUSES = ['deal', 'bruto_deal', 'afspraak_gemaakt', 'geen_interesse', 'verkeerd_nummer', 'cold', 'blacklist', 'monteur_ingepland', 'wil_annuleren']

export default function LeadBoard() {
  const { user, profile, isWorking, toggleWorkingMode } = useAuth()
  const { leadLists, loading: listsLoading } = useLeadLists()
  const toast = useToast()
  const geo = useGeolocation()
  const isStaff = profile?.role === 'admin' || profile?.role === 'manager'

  // Alleen bel-/acquisitielijsten; sollicitanten horen op de wervingspagina
  const lists = useMemo(
    () => (leadLists || []).filter(l => l.campaigns?.type !== 'recruitment'),
    [leadLists]
  )
  const [listId, setListId] = useState(null)
  useEffect(() => {
    if (!listId && lists.length > 0) setListId(lists[0].id)
  }, [lists, listId])

  const [leads, setLeads] = useState([])
  const [lockNames, setLockNames] = useState({})
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [claimingId, setClaimingId] = useState(null)
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('leadgen-leads-view') === 'map' ? 'map' : 'list' } catch { return 'list' }
  })
  const [sortBy, setSortBy] = useState('distance') // 'distance' | 'order'
  const [geocoding, setGeocoding] = useState(false)
  useEffect(() => { try { localStorage.setItem('leadgen-leads-view', view) } catch { /* privémodus */ } }, [view])

  const load = useCallback(async (silent = false) => {
    if (!listId) return
    if (!silent) setLoading(true)
    const [{ data: rows, error }, { data: locks }] = await Promise.all([
      supabase.from('leads')
        .select('id, name, phone, city, address, house_number, contact_person, status, locked_by, locked_at, next_contact_date, contact_attempts, created_at, lat, lng')
        .eq('lead_list_id', listId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      supabase.rpc('lead_lock_names', { p_list_id: listId })
    ])
    if (error) console.error('LeadBoard load:', error)
    setLeads(rows || [])
    const map = {}
    ;(locks || []).forEach(r => { map[r.lead_id] = r.full_name })
    setLockNames(map)
    setLoading(false)
  }, [listId])

  // Eerste keer + elke 8s verversen, en direct opnieuw zodra het belscherm sluit
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!listId) return
    const t = setInterval(() => { if (!document.hidden) load(true) }, POLL_MS)
    return () => clearInterval(t)
  }, [listId, load])
  useEffect(() => { if (!isWorking) load(true) }, [isWorking]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (geo.error) toast(geo.error, 'error') }, [geo.error]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLockedByOther = useCallback((l) =>
    !!(l.locked_by && l.locked_by !== user?.id && l.locked_at &&
    (Date.now() - new Date(l.locked_at).getTime()) < LOCK_TTL_MS), [user?.id])

  const openLead = useCallback(async (lead) => {
    if (claimingId || isWorking) return
    setClaimingId(lead.id)
    const { data, error } = await supabase.rpc('claim_lead', { p_lead_id: lead.id })
    setClaimingId(null)
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) {
      const who = lockNames[lead.id]
      toast(who ? `Deze lead is in behandeling bij ${who}` : 'Deze lead is op dit moment in behandeling bij een collega', 'error')
      load(true)
      return
    }
    setLeads(prev => prev.map(l => l.id === row.id ? { ...l, locked_by: row.locked_by, locked_at: row.locked_at } : l))
    toggleWorkingMode(row)
  }, [claimingId, isWorking, lockNames, toast, load, toggleWorkingMode])

  // v64: leads zonder coordinaten alsnog laten geocoderen (admin/manager)
  const missingCoords = leads.filter(l => l.lat == null).length
  async function geocodeList() {
    if (!listId || geocoding) return
    setGeocoding(true)
    const { data, error } = await supabase.functions.invoke('geocode-leads', { body: { list_id: listId } })
    setGeocoding(false)
    if (error) { toast('Coördinaten ophalen mislukt', 'error'); return }
    toast(`${data?.ok || 0} adressen gevonden${data?.failed ? `, ${data.failed} niet gevonden` : ''}`, 'success')
    load(true)
  }

  const pos = geo.enabled ? geo.position : null
  const q = search.trim().toLowerCase()
  const visible = useMemo(() => {
    const rows = leads
      .filter(l => {
        if (filter === 'open' && DONE_STATUSES.includes(l.status)) return false
        if (filter === 'done' && !DONE_STATUSES.includes(l.status)) return false
        if (!q) return true
        return [l.name, l.phone, l.city, l.address, l.contact_person].some(v => (v || '').toLowerCase().includes(q))
      })
      .map(l => ({ ...l, _distance: pos ? distanceM(pos.lat, pos.lng, l.lat, l.lng) : null }))
    if (pos && sortBy === 'distance') {
      rows.sort((a, b) => (a._distance ?? Infinity) - (b._distance ?? Infinity))
    }
    return rows
  }, [leads, filter, q, pos, sortBy])
  const openCount = leads.filter(l => !DONE_STATUSES.includes(l.status)).length
  const busyCount = leads.filter(isLockedByOther).length

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 96 }}>
        <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>Leads</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              Iedereen in het project ziet dezelfde lijst. Open je een lead, dan is hij tijdelijk niet beschikbaar voor je collega's.
            </p>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {geo.supported && (
              <button
                type="button"
                className={`btn btn-sm ${geo.enabled ? 'btn-secondary' : 'btn-outline'}`}
                onClick={geo.toggle}
                title={geo.enabled ? 'Locatie uitzetten' : 'Zet je locatie aan om afstanden te zien'}
              >
                <Navigation size={14} /> {geo.enabled ? (geo.locating ? 'Locatie zoeken...' : 'Locatie aan') : 'Locatie aan'}
              </button>
            )}
            <button type="button" className="btn btn-sm btn-outline" onClick={() => load()} disabled={loading}>
              <RefreshCw size={14} /> Verversen
            </button>
          </div>
        </div>

        {listsLoading ? (
          <LoadingSpinner />
        ) : lists.length === 0 ? (
          <EmptyState icon={Inbox} title="Geen leadlijsten" message="Je bent nog aan geen enkel project met leads gekoppeld." />
        ) : (
          <>
            <div className="filter-bar glass-panel mb-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {lists.length > 1 && (
                <select className="form-control" value={listId || ''} onChange={e => setListId(e.target.value)} style={{ minWidth: 200, flex: '0 1 auto' }}>
                  {lists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="form-control"
                  style={{ paddingLeft: 36, width: '100%' }}
                  placeholder="Zoek op naam, plaats of telefoon..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                {[['open', `Open (${openCount})`], ['done', `Afgerond (${leads.length - openCount})`], ['all', `Alles (${leads.length})`]].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 20 }}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
                {pos && (
                  <button type="button" onClick={() => setSortBy(s => s === 'distance' ? 'order' : 'distance')} className="btn btn-sm btn-outline" style={{ borderRadius: 20 }} title="Sortering wisselen">
                    <Compass size={14} /> {sortBy === 'distance' ? 'Dichtbij eerst' : 'Lijstvolgorde'}
                  </button>
                )}
                <div style={{ display: 'inline-flex', border: '1px solid var(--border-subtle)', borderRadius: 20, overflow: 'hidden' }}>
                  <button type="button" onClick={() => setView('list')} className={`btn btn-sm ${view === 'list' ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 0, border: 0 }} title="Lijst">
                    <List size={14} /> Lijst
                  </button>
                  <button type="button" onClick={() => setView('map')} className={`btn btn-sm ${view === 'map' ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 0, border: 0 }} title="Kaart">
                    <MapIcon size={14} /> Kaart
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center mb-2" style={{ gap: 12, flexWrap: 'wrap', fontSize: '0.8rem' }}>
              {busyCount > 0 && (
                <span className="text-muted">
                  <Lock size={12} style={{ verticalAlign: -2 }} /> {busyCount} lead{busyCount === 1 ? '' : 's'} nu in behandeling bij collega's
                </span>
              )}
              {geo.supported && !geo.enabled && (
                <span className="text-muted"><Navigation size={12} style={{ verticalAlign: -2 }} /> Zet "Locatie aan" om te zien hoe ver elke lead van je vandaan is.</span>
              )}
              {missingCoords > 0 && (
                <span className="text-muted">
                  <MapPin size={12} style={{ verticalAlign: -2 }} /> {missingCoords} lead{missingCoords === 1 ? '' : 's'} zonder coördinaten
                  {isStaff && (
                    <button type="button" className="btn btn-sm btn-outline" style={{ marginLeft: 8 }} onClick={geocodeList} disabled={geocoding}>
                      {geocoding ? 'Bezig...' : 'Coördinaten ophalen'}
                    </button>
                  )}
                </span>
              )}
            </div>

            {loading && leads.length === 0 ? (
              <LoadingSpinner />
            ) : view === 'map' ? (
              <LeadMap
                leads={visible}
                position={pos}
                lockNames={lockNames}
                isLockedByOther={isLockedByOther}
                onOpen={openLead}
                height={Math.max(420, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300)}
              />
            ) : visible.length === 0 ? (
              <EmptyState icon={Inbox} title="Geen leads" message={filter === 'open' ? 'Alle leads in deze lijst zijn afgerond.' : 'Niets gevonden.'} />
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {visible.map(lead => {
                  const busy = isLockedByOther(lead)
                  const mine = lead.locked_by === user?.id && lead.locked_at && (Date.now() - new Date(lead.locked_at).getTime()) < LOCK_TTL_MS
                  const st = getStatusDetails(lead.status)
                  const done = DONE_STATUSES.includes(lead.status)
                  const place = [lead.address && `${lead.address} ${lead.house_number || ''}`.trim(), lead.city].filter(Boolean).join(', ')
                  const band = distanceBand(lead._distance)
                  return (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => !busy && openLead(lead)}
                      disabled={busy || claimingId === lead.id}
                      className="card glow-hover"
                      style={{
                        textAlign: 'left', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.55 : 1,
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', margin: 0,
                        border: mine ? '1px solid var(--primary)' : undefined, width: '100%'
                      }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {lead.name || 'Naam onbekend'}
                          {lead.contact_person && <span className="text-muted" style={{ fontWeight: 400 }}> · {lead.contact_person}</span>}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.8rem', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          {lead.phone && <span><Phone size={12} style={{ verticalAlign: -2 }} /> {lead.phone}</span>}
                          {place && <span><MapPin size={12} style={{ verticalAlign: -2 }} /> {place}</span>}
                          {(lead.contact_attempts || 0) > 0 && <span>{lead.contact_attempts}x gebeld</span>}
                        </div>
                      </div>
                      {pos && (
                        <span
                          title={band === 'far' ? 'Ver weg' : band === 'near' ? 'Dichtbij' : ''}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
                            padding: '4px 10px', borderRadius: 'var(--radius-full)',
                            color: band === 'far' ? 'var(--warning)' : band === 'near' ? 'var(--success)' : 'var(--text-secondary)',
                            background: band === 'far' ? 'var(--warning-bg)' : band === 'near' ? 'var(--success-bg)' : 'var(--bg-elevated)'
                          }}
                        >
                          <Navigation size={11} /> {lead._distance == null ? 'geen adres' : formatDistance(lead._distance)}
                        </span>
                      )}
                      {busy ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-bg)', padding: '4px 10px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap' }}>
                          <Lock size={12} /> {lockNames[lead.id] ? `Bij ${lockNames[lead.id]}` : 'In behandeling'}
                        </span>
                      ) : mine ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', background: 'var(--info-bg)', padding: '4px 10px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap' }}>
                          <User size={12} /> Jouw lead
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: st.color, background: st.bg, padding: '4px 10px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap', opacity: done ? 0.8 : 1 }}>
                          {st.label}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
