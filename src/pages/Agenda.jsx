import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, Plus,
  Lock, Trash2, Phone, Mail, User, Building, ExternalLink, AlertCircle,
  CheckCircle, RefreshCw, Filter, List, Grid, CalendarDays
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import BlockTimeModal from '../components/BlockTimeModal'
import LeadDetailModal from '../components/LeadDetailModal'

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Maandag als begin
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, days) {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

function pad(n) { return String(n).padStart(2, '0') }

function formatTime(isoString) {
  if (!isoString) return ''
  const d = new Date(isoString)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateNl(d) {
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

const HOURS = Array.from({ length: 11 }, (_, i) => i + 8) // 08:00 t/m 18:00

export default function Agenda() {
  const { user, profile, effectiveRole } = useAuth()
  const toast = useToast()

  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()))
  const [viewMode, setViewMode] = useState('week') // 'week' | 'list'
  const [loading, setLoading] = useState(true)

  const [accountmanagers, setAccountmanagers] = useState([])
  const [selectedAmId, setSelectedAmId] = useState('all')

  const [appointments, setAppointments] = useState([])
  const [blockedSlots, setBlockedSlots] = useState([])

  const [showBlockModal, setShowBlockModal] = useState(false)
  const [blockModalDate, setBlockModalDate] = useState(null)
  const [detailLead, setDetailLead] = useState(null)
  // Project-conventie: geen window.confirm, klik nogmaals om te bevestigen (zelfde patroon als Admin > Prullenbak)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const isRealAdmin = profile?.role === 'admin'
  const isAm = profile?.role === 'accountmanager' || effectiveRole === 'accountmanager'

  // Haal accountmanagers op
  const fetchAccountmanagers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['accountmanager', 'admin'])
        .is('deleted_at', null)
        .order('full_name')

      if (!error && data) {
        setAccountmanagers(data)
      }
    } catch (err) {
      console.error('Fout bij ophalen accountmanagers:', err)
    }
  }, [])

  // v94-fix: een accountmanager (ook een admin die via de rol-pill "werkt als"
  // accountmanager) ziet standaard ALLEEN zijn eigen agenda, nooit die van
  // collega's - dat kon eerder omdat de select-query van bovenstaande lijst
  // soms later klaar was dan de eerste keer laden, waardoor selectedAmId op
  // 'all' bleef staan. Nu zet dit los effect het altijd meteen goed, ook bij
  // het wisselen van werkmodus. Via het "AM:"-filter hierboven kan een
  // accountmanager zelf nog altijd naar een collega's agenda schakelen; een
  // gewone beller of admin ziet standaard gewoon iedereen (nodig om voor
  // meerdere accountmanagers een afspraak te kunnen inplannen).
  useEffect(() => {
    setSelectedAmId(isAm ? (user?.id || 'all') : 'all')
  }, [isAm, user?.id])

  // Haal afspraken en blokkades op voor de huidige week (met ruime marge)
  const fetchData = useCallback(async () => {
    setLoading(true)
    const rangeStart = addDays(currentWeekStart, -1).toISOString()
    const rangeEnd = addDays(currentWeekStart, 8).toISOString()

    try {
      // 1. Leads met afspraak
      let leadsQuery = supabase
        .from('leads')
        .select(`
          id, name, contact_person, phone, email, status, appointment_at, notes,
          assigned_to, lead_list_id,
          lead_lists(id, name, campaign_id, campaigns(id, name))
        `)
        .eq('status', 'afspraak_gemaakt')
        .gte('appointment_at', rangeStart)
        .lte('appointment_at', rangeEnd)
        .is('deleted_at', null)

      if (selectedAmId !== 'all') {
        leadsQuery = leadsQuery.eq('assigned_to', selectedAmId)
      }

      const { data: leadsData, error: leadsErr } = await leadsQuery
      if (leadsErr) throw leadsErr

      // 2. Tijdsblokkades
      let blocksQuery = supabase
        .from('agenda_blocks')
        .select('*')
        .gte('start_at', rangeStart)
        .lte('start_at', rangeEnd)

      if (selectedAmId !== 'all') {
        blocksQuery = blocksQuery.eq('user_id', selectedAmId)
      }

      const { data: blocksData, error: blocksErr } = await blocksQuery
      if (blocksErr) throw blocksErr

      setAppointments(leadsData || [])
      setBlockedSlots(blocksData || [])
    } catch (err) {
      console.error('Fout bij ophalen agenda:', err)
      toast('Kon agenda niet verversen', 'error')
    } finally {
      setLoading(false)
    }
  }, [currentWeekStart, selectedAmId, toast])

  useEffect(() => {
    fetchAccountmanagers()
  }, [fetchAccountmanagers])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Realtime subscription voor agenda_blocks
  useEffect(() => {
    const channel = supabase.channel('agenda-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_blocks' }, () => {
        fetchData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        fetchData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [fetchData])

  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i))
  }, [currentWeekStart])

  // Blokkade verwijderen
  async function handleDeleteBlock(blockId) {
    try {
      const { error } = await supabase.from('agenda_blocks').delete().eq('id', blockId)
      if (error) throw error
      toast('Tijdsblokkade verwijderd', 'success')
      setBlockedSlots(prev => prev.filter(b => b.id !== blockId))
    } catch (err) {
      toast(err.message || 'Kon blokkade niet verwijderen', 'error')
    } finally {
      setConfirmDeleteId(null)
    }
  }

  // Items per dag indelen
  function getItemsForDay(date) {
    const dayStr = date.toDateString()

    const dayAppointments = appointments.filter(l => {
      if (!l.appointment_at) return false
      return new Date(l.appointment_at).toDateString() === dayStr
    }).map(l => ({
      kind: 'appointment',
      id: l.id,
      at: new Date(l.appointment_at),
      lead: l
    }))

    const dayBlocks = blockedSlots.filter(b => {
      if (!b.start_at) return false
      return new Date(b.start_at).toDateString() === dayStr
    }).map(b => ({
      kind: 'block',
      id: b.id,
      at: new Date(b.start_at),
      end: new Date(b.end_at),
      block: b
    }))

    return [...dayAppointments, ...dayBlocks].sort((a, b) => a.at - b.at)
  }

  const amMap = useMemo(() => {
    const map = {}
    accountmanagers.forEach(am => { map[am.id] = am.full_name })
    return map
  }, [accountmanagers])

  return (
    <>
      <Header />
      <main className="container pb-12" style={{ maxWidth: '1440px' }}>
        {/* Header & Titel */}
        <div className="flex justify-between items-center mb-6 pt-4" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 className="page-title flex items-center gap-2" style={{ margin: 0 }}>
              <CalendarDays size={26} className="text-primary" /> Agenda &amp; Afspraken
            </h1>
            <p className="page-subtitle text-xs" style={{ margin: '4px 0 0' }}>
              Ingeplande afspraken van leads en geblokkeerde tijdvakken van accountmanagers.
            </p>
          </div>

          <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
            {/* Accountmanager filter */}
            {(isRealAdmin || accountmanagers.length > 1) && (
              <div className="flex items-center gap-2 bg-elevated px-3 py-1.5 rounded-lg border border-border">
                <Filter size={14} className="text-muted" />
                <span className="text-xs text-muted font-bold uppercase">AM:</span>
                <select
                  value={selectedAmId}
                  onChange={e => setSelectedAmId(e.target.value)}
                  className="form-dark text-xs"
                  style={{ padding: '2px 6px', border: 'none', background: 'transparent' }}
                >
                  <option value="all">Alle accountmanagers ({accountmanagers.length})</option>
                  {accountmanagers.map(am => (
                    <option key={am.id} value={am.id}>{am.full_name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Weergave toggle */}
            <div className="flex bg-elevated rounded-lg p-0.5 border border-border">
              <button
                type="button"
                onClick={() => setViewMode('week')}
                className={`btn btn-sm ${viewMode === 'week' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '5px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
                title="Weekoverzicht"
              >
                <Grid size={14} /> Week
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ padding: '5px 10px', fontSize: '0.75rem', borderRadius: '6px' }}
                title="Lijstweergave"
              >
                <List size={14} /> Lijst
              </button>
            </div>

            {/* Tijd blokkeren knop */}
            <button
              type="button"
              onClick={() => {
                setBlockModalDate(new Date())
                setShowBlockModal(true)
              }}
              className="btn btn-secondary btn-sm"
              style={{ fontWeight: 800, padding: '7px 14px' }}
            >
              <Lock size={15} /> Tijd blokkeren
            </button>

            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="btn btn-outline btn-sm"
              title="Vernieuwen"
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Weeknavigatie balk */}
        <div className="glass-panel p-3 mb-6 flex justify-between items-center border border-border" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentWeekStart(prev => addDays(prev, -7))}
              className="btn btn-outline btn-sm"
              style={{ padding: '6px 10px' }}
            >
              <ChevronLeft size={16} /> Vorige week
            </button>
            <button
              type="button"
              onClick={() => setCurrentWeekStart(startOfWeek(new Date()))}
              className="btn btn-outline btn-sm"
              style={{ padding: '6px 12px', fontWeight: 700 }}
            >
              Vandaag
            </button>
            <button
              type="button"
              onClick={() => setCurrentWeekStart(prev => addDays(prev, 7))}
              className="btn btn-outline btn-sm"
              style={{ padding: '6px 10px' }}
            >
              Volgende week <ChevronRight size={16} />
            </button>
          </div>

          <div className="font-bold text-sm text-body">
            {formatDateNl(currentWeekStart)} &mdash; {formatDateNl(addDays(currentWeekStart, 6))}
          </div>

          <div className="flex gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-primary">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--primary)' }} />
              {appointments.length} {appointments.length === 1 ? 'afspraak' : 'afspraken'}
            </span>
            <span className="flex items-center gap-1.5 text-warning">
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--warning)' }} />
              {blockedSlots.length} {blockedSlots.length === 1 ? 'blokkade' : 'blokkades'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <LoadingSpinner size="lg" />
            <div className="text-muted text-xs mt-3">Agenda laden...</div>
          </div>
        ) : viewMode === 'week' ? (
          /* WEEK WEERGAVE GRID */
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
            alignItems: 'stretch'
          }}>
            {weekDays.map(day => {
              const isToday = day.toDateString() === new Date().toDateString()
              const items = getItemsForDay(day)

              return (
                <div
                  key={day.toISOString()}
                  className="glass-panel"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '440px',
                    borderRadius: '12px',
                    border: isToday ? '2px solid var(--primary)' : '1px solid var(--border)',
                    background: isToday ? 'rgba(59, 130, 246, 0.04)' : 'var(--bg-card)',
                    overflow: 'hidden'
                  }}
                >
                  {/* Dag Header */}
                  <div style={{
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    background: isToday ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-elevated)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: isToday ? 'var(--primary)' : 'var(--text-main)'
                      }}>
                        {day.toLocaleDateString('nl-NL', { weekday: 'short' })}
                      </div>
                      <div className="text-muted text-xs">
                        {day.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setBlockModalDate(day)
                        setShowBlockModal(true)
                      }}
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '3px 6px', fontSize: '0.65rem' }}
                      title={`Tijd blokkeren op ${formatDateNl(day)}`}
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* Items lijst in de dag */}
                  <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
                    {items.length === 0 ? (
                      <div className="text-muted text-[11px] text-center italic py-10 opacity-50">
                        Geen afspraken
                      </div>
                    ) : (
                      items.map(item => {
                        if (item.kind === 'appointment') {
                          const l = item.lead
                          const amName = amMap[l.assigned_to] || 'Onbekend'
                          return (
                            <div
                              key={item.id}
                              onClick={() => setDetailLead(l)}
                              style={{
                                background: 'rgba(59, 130, 246, 0.12)',
                                border: '1px solid rgba(59, 130, 246, 0.35)',
                                borderRadius: '8px',
                                padding: '8px 10px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              className="hover:border-primary"
                              title="Klik om leadkaart te openen"
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 900,
                                  background: 'var(--primary)',
                                  color: '#fff',
                                  padding: '1px 6px',
                                  borderRadius: '4px'
                                }}>
                                  {formatTime(l.appointment_at)}
                                </span>
                                <span className="text-[10px] text-muted truncate max-w-[90px]" title={l.lead_lists?.campaigns?.name || ''}>
                                  {l.lead_lists?.campaigns?.name || ''}
                                </span>
                              </div>

                              <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-main)', marginBottom: 2 }} className="truncate">
                                {l.name}
                              </div>

                              {l.contact_person && (
                                <div className="text-muted text-[11px] truncate flex items-center gap-1">
                                  <User size={10} /> {l.contact_person}
                                </div>
                              )}

                              {l.phone && (
                                <div className="text-[11px] text-muted truncate flex items-center gap-1 mt-0.5">
                                  <Phone size={10} /> {l.phone}
                                </div>
                              )}

                              {selectedAmId === 'all' && (
                                <div className="text-[9px] text-primary/80 font-bold uppercase tracking-wider mt-1 truncate">
                                  👤 {amName}
                                </div>
                              )}
                            </div>
                          )
                        } else {
                          // Geblokkeerd tijdvak
                          const b = item.block
                          const amName = amMap[b.user_id] || 'Accountmanager'
                          return (
                            <div
                              key={item.id}
                              style={{
                                background: 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.08), rgba(245, 158, 11, 0.08) 6px, rgba(245, 158, 11, 0.14) 6px, rgba(245, 158, 11, 0.14) 12px)',
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                borderRadius: '8px',
                                padding: '8px 10px',
                                position: 'relative'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  color: 'var(--warning)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}>
                                  <Lock size={11} /> {formatTime(b.start_at)} &ndash; {formatTime(b.end_at)}
                                </span>

                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (confirmDeleteId === b.id) { handleDeleteBlock(b.id) }
                                    else { setConfirmDeleteId(b.id) }
                                  }}
                                  className={confirmDeleteId === b.id ? 'text-error' : 'text-muted hover:text-error'}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 3 }}
                                  title={confirmDeleteId === b.id ? 'Klik nogmaals om te bevestigen' : 'Blokkade opheffen'}
                                >
                                  <Trash2 size={12} /> {confirmDeleteId === b.id ? 'Zeker?' : ''}
                                </button>
                              </div>

                              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-main)', marginTop: 3 }}>
                                {b.title || 'Geblokkeerd'}
                              </div>

                              {selectedAmId === 'all' && (
                                <div className="text-[9px] text-muted font-bold uppercase tracking-wider mt-1 truncate">
                                  👤 {amName}
                                </div>
                              )}
                            </div>
                          )
                        }
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* LIJSTWEERGAVE */
          <div className="glass-panel p-6 border border-border">
            <h3 className="font-bold text-sm mb-4 uppercase tracking-wider text-muted">
              Overzicht deze week
            </h3>

            {appointments.length === 0 && blockedSlots.length === 0 ? (
              <div className="text-center py-12 text-muted italic text-sm">
                Geen afspraken of blokkades gevonden voor deze periode.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {[
                  ...appointments.map(a => ({ kind: 'appointment', at: new Date(a.appointment_at), data: a })),
                  ...blockedSlots.map(b => ({ kind: 'block', at: new Date(b.start_at), data: b }))
                ]
                  .sort((a, b) => a.at - b.at)
                  .map(item => {
                    if (item.kind === 'appointment') {
                      const l = item.data
                      const amName = amMap[l.assigned_to] || 'Onbekend'
                      return (
                        <div
                          key={`l-${l.id}`}
                          onClick={() => setDetailLead(l)}
                          className="card glow-hover p-4 flex justify-between items-center cursor-pointer"
                          style={{ borderLeft: '4px solid var(--primary)' }}
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[70px]">
                              <div className="text-xs font-bold text-primary">{formatDateNl(item.at)}</div>
                              <div className="text-base font-black text-body">{formatTime(l.appointment_at)}</div>
                            </div>

                            <div>
                              <div className="font-bold text-body text-base flex items-center gap-2">
                                {l.name}
                                <span className="badge badge-info text-[10px]">Afspraak</span>
                              </div>
                              <div className="text-xs text-muted mt-0.5 flex gap-3">
                                {l.contact_person && <span>👤 {l.contact_person}</span>}
                                {l.phone && <span>📞 {l.phone}</span>}
                                {l.lead_lists?.campaigns?.name && <span>🏷️ {l.lead_lists.campaigns.name}</span>}
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <span className="text-xs text-muted block">Toegewezen aan:</span>
                            <span className="text-xs font-bold text-body">{amName}</span>
                          </div>
                        </div>
                      )
                    } else {
                      const b = item.data
                      const amName = amMap[b.user_id] || 'Accountmanager'
                      return (
                        <div
                          key={`b-${b.id}`}
                          className="card p-4 flex justify-between items-center"
                          style={{ borderLeft: '4px solid var(--warning)', background: 'rgba(245, 158, 11, 0.05)' }}
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[70px]">
                              <div className="text-xs font-bold text-warning">{formatDateNl(item.at)}</div>
                              <div className="text-xs font-black text-body">{formatTime(b.start_at)} - {formatTime(b.end_at)}</div>
                            </div>

                            <div>
                              <div className="font-bold text-body flex items-center gap-2">
                                <Lock size={14} className="text-warning" /> {b.title || 'Geblokkeerd'}
                                <span className="badge badge-warning text-[10px]">Blokkade</span>
                              </div>
                              <div className="text-xs text-muted mt-0.5">
                                Geen afspraken mogelijk tijdens dit tijdvak
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span className="text-xs text-muted block">Accountmanager:</span>
                              <span className="text-xs font-bold text-body">{amName}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirmDeleteId === b.id) { handleDeleteBlock(b.id) }
                                else { setConfirmDeleteId(b.id) }
                              }}
                              className="btn btn-outline btn-sm text-error border-error/40 hover:bg-error/10"
                              title={confirmDeleteId === b.id ? 'Klik nogmaals om te bevestigen' : 'Blokkade opheffen'}
                            >
                              <Trash2 size={14} /> {confirmDeleteId === b.id ? 'Zeker? Klik nogmaals' : ''}
                            </button>
                          </div>
                        </div>
                      )
                    }
                  })}
              </div>
            )}
          </div>
        )}

        {/* Modal voor blokkeren */}
        <BlockTimeModal
          isOpen={showBlockModal}
          onClose={() => setShowBlockModal(false)}
          onSaved={fetchData}
          initialDate={blockModalDate}
          accountmanagers={accountmanagers}
          defaultUserId={selectedAmId !== 'all' ? selectedAmId : user?.id}
        />

        {/* Contactkaart LeadDetailModal */}
        <LeadDetailModal
          isOpen={!!detailLead}
          onClose={() => setDetailLead(null)}
          lead={detailLead}
          assignedName={detailLead?.assigned_to ? (amMap[detailLead.assigned_to] || 'Collega') : ''}
          onUpdated={(id, updates) => {
            setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
          }}
        />
      </main>
    </>
  )
}
