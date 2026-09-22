import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight,
  Lock, Trash2, User,
  RefreshCw, Filter, List, Grid, CalendarDays
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import BlockTimeModal from '../components/BlockTimeModal'
import LeadDetailModal from '../components/LeadDetailModal'
import { APPOINTMENT_LABEL, APPOINTMENT_DURATION_MINUTES } from '../lib/appointmentConfig'
import AppointmentModal from '../components/AppointmentModal'
import { findAppointmentConflict, outcomeInfo, sentimentInfo, leadAddressText, navigationUrl } from '../lib/appointments'

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

// Google Calendar-achtige weekgrid: uren op de y-as, dagen op de x-as.
// 1 minuut = 1 pixel (HOUR_PX = 60), dat houdt de tijd-wiskunde simpel.
const GRID_START_HOUR = 7
const GRID_END_HOUR = 21 // exclusief - laatste getekende lijn
const HOUR_PX = 60
const GRID_START_MIN = GRID_START_HOUR * 60
const GRID_END_MIN = GRID_END_HOUR * 60
const GRID_TOTAL_MIN = GRID_END_MIN - GRID_START_MIN
const GRID_HEIGHT = GRID_TOTAL_MIN * (HOUR_PX / 60)
const SNAP_MIN = 15
const HOURS_DISPLAY = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i)

function minutesSinceMidnight(d) {
  return d.getHours() * 60 + d.getMinutes()
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

// Verdeelt items van 1 dag over kolommen zodat overlappende afspraken/
// blokkades naast elkaar komen te staan i.p.v. over elkaar heen (zoals
// Google Calendar dat ook doet).
function layoutDayItems(items) {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const clusters = []
  let current = []
  let clusterEnd = -Infinity
  sorted.forEach(it => {
    if (current.length && it.startMin >= clusterEnd) {
      clusters.push(current)
      current = []
      clusterEnd = -Infinity
    }
    current.push(it)
    clusterEnd = Math.max(clusterEnd, it.endMin)
  })
  if (current.length) clusters.push(current)

  const positioned = []
  clusters.forEach(cluster => {
    const columnEnds = []
    const colOf = new Map()
    cluster.forEach(it => {
      let placed = false
      for (let c = 0; c < columnEnds.length; c++) {
        if (columnEnds[c] <= it.startMin) { columnEnds[c] = it.endMin; colOf.set(it.id, c); placed = true; break }
      }
      if (!placed) { columnEnds.push(it.endMin); colOf.set(it.id, columnEnds.length - 1) }
    })
    const numCols = columnEnds.length
    cluster.forEach(it => positioned.push({ ...it, col: colOf.get(it.id), numCols }))
  })
  return positioned
}

export default function Agenda() {
  const { user, profile, effectiveRole } = useAuth()
  const toast = useToast()

  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()))
  const [viewMode, setViewMode] = useState('week') // 'week' | 'list'
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(() => new Date())

  const [accountmanagers, setAccountmanagers] = useState([])
  const [selectedAmId, setSelectedAmId] = useState('all')

  const [appointments, setAppointments] = useState([])
  const [blockedSlots, setBlockedSlots] = useState([])

  const [showBlockModal, setShowBlockModal] = useState(false)
  const [blockModalDate, setBlockModalDate] = useState(null)
  const [detailLead, setDetailLead] = useState(null)
  // v97: afspraakpopup (navigatie, afboeken, verplaatsen, verwijderen)
  const [apptLead, setApptLead] = useState(null)
  // Project-conventie: geen window.confirm, klik nogmaals om te bevestigen (zelfde patroon als Admin > Prullenbak)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const isRealAdmin = profile?.role === 'admin'
  const isAm = profile?.role === 'accountmanager' || effectiveRole === 'accountmanager'
  // v97: alleen admin en manager mogen afspraken verplaatsen of verwijderen
  const canManage = profile?.role === 'admin' || profile?.role === 'manager'

  // Klok voor de rode "nu"-lijn, elke minuut bijgewerkt
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])

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
      // Alleen projecten met campaigns.appointment_scheduling_enabled horen in
      // deze accountmanager-agenda thuis (v91). Sollicitanten uit recruitment-
      // projecten (type 'recruitment') krijgen ook appointment_at + status
      // 'afspraak_gemaakt' voor hun gesprek, maar horen NIET in deze agenda -
      // elk project heeft zijn eigen agenda. Daarom hier een !inner-join op
      // lead_lists/campaigns zodat we op die vlag kunnen filteren.
      let leadsQuery = supabase
        .from('leads')
        .select(`
          id, name, contact_person, phone, email, status, appointment_at, notes,
          assigned_to, lead_list_id, sale_date,
          address, house_number, postal_code, city,
          appointment_sentiment, appointment_outcome, appointment_outcome_at,
          lead_lists!inner(id, name, campaign_id, campaigns!inner(id, name, appointment_scheduling_enabled))
        `)
        .in('status', ['afspraak_gemaakt', 'deal'])
        .eq('lead_lists.campaigns.appointment_scheduling_enabled', true)
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

  // Items per dag indelen (voor de weekgrid, met start/eind in minuten)
  const itemsByDay = useMemo(() => {
    const map = weekDays.map(() => [])
    weekDays.forEach((day, dayIdx) => {
      const dayStr = day.toDateString()

      appointments.forEach(l => {
        if (!l.appointment_at) return
        const at = new Date(l.appointment_at)
        if (at.toDateString() !== dayStr) return
        const startMin = minutesSinceMidnight(at)
        map[dayIdx].push({
          kind: 'appointment',
          id: `a-${l.id}`,
          leadId: l.id,
          at,
          startMin,
          endMin: startMin + APPOINTMENT_DURATION_MINUTES,
          lead: l
        })
      })

      blockedSlots.forEach(b => {
        if (!b.start_at) return
        const at = new Date(b.start_at)
        if (at.toDateString() !== dayStr) return
        const end = new Date(b.end_at)
        map[dayIdx].push({
          kind: 'block',
          id: `b-${b.id}`,
          blockId: b.id,
          at,
          end,
          startMin: minutesSinceMidnight(at),
          endMin: minutesSinceMidnight(at) + Math.max(15, (end - at) / 60000),
          block: b
        })
      })
    })
    return map.map(layoutDayItems)
  }, [weekDays, appointments, blockedSlots])

  // Simpele lijst per dag (voor de lijstweergave, ongewijzigd)
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

  // ---- Drag & drop: een afspraak of blokkade verslepen naar een ander
  // moment (dag + tijd), zoals in Google Calendar. Muis-gebaseerd (geen
  // externe library nodig): mousedown start het slepen pas na een kleine
  // beweging, zodat een gewone klik nog steeds de leadkaart/detail opent.
  const gridBodyRef = useRef(null)
  const dragStateRef = useRef(null)
  const [dragPreview, setDragPreview] = useState(null) // { itemId, dayIdx, startMin }
  const [savingDragId, setSavingDragId] = useState(null)

  const handleItemMouseDown = useCallback((e, item, dayIdx) => {
    if (e.button !== 0) return
    // v97: afspraken slepen mag alleen admin/manager; anderen klikken alleen (popup)
    const mayDrag = item.kind !== 'appointment' || canManage
    const gridEl = gridBodyRef.current
    if (!gridEl) return
    const gridRect = gridEl.getBoundingClientRect()
    dragStateRef.current = {
      item,
      startDayIdx: dayIdx,
      pointerStartX: e.clientX,
      pointerStartY: e.clientY,
      grabOffsetMin: (e.clientY - gridRect.top) - (item.startMin - GRID_START_MIN),
      moved: false,
      gridRect
    }

    const handleMove = (ev) => {
      const ds = dragStateRef.current
      if (!ds) return
      const dx = ev.clientX - ds.pointerStartX
      const dy = ev.clientY - ds.pointerStartY
      if (!ds.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return
      if (!mayDrag) return
      ds.moved = true

      const colWidth = ds.gridRect.width / 7
      const dayIdxNew = clamp(Math.floor((ev.clientX - ds.gridRect.left) / colWidth), 0, 6)
      const rawMin = ((ev.clientY - ds.gridRect.top) - ds.grabOffsetMin)
      const snapped = clamp(Math.round(rawMin / SNAP_MIN) * SNAP_MIN, 0, GRID_TOTAL_MIN - SNAP_MIN)
      setDragPreview({ itemId: ds.item.id, dayIdx: dayIdxNew, startMin: GRID_START_MIN + snapped })
    }

    const handleUp = async (ev) => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      const ds = dragStateRef.current
      dragStateRef.current = null
      setDragPreview(null)
      if (!ds) return

      if (!ds.moved) {
        // Geen sleep, gewone klik - open het detail
        if (ds.item.kind === 'appointment') setApptLead(ds.item.lead)
        return
      }

      const colWidth = ds.gridRect.width / 7
      const dayIdxNew = clamp(Math.floor((ev.clientX - ds.gridRect.left) / colWidth), 0, 6)
      const rawMin = ((ev.clientY - ds.gridRect.top) - ds.grabOffsetMin)
      const snapped = clamp(Math.round(rawMin / SNAP_MIN) * SNAP_MIN, 0, GRID_TOTAL_MIN - SNAP_MIN)
      const newStartMin = GRID_START_MIN + snapped

      const newDate = addDays(currentWeekStart, dayIdxNew)
      newDate.setHours(0, newStartMin, 0, 0)

      // Niets veranderd? Dan niets opslaan.
      if (dayIdxNew === ds.startDayIdx && newStartMin === ds.item.startMin) return

      setSavingDragId(ds.item.id)
      try {
        if (ds.item.kind === 'appointment') {
          // v97: niet slepen op een moment waar de accountmanager al bezet is
          const conflict = await findAppointmentConflict({ amId: ds.item.lead.assigned_to, start: newDate, excludeLeadId: ds.item.leadId })
          if (conflict) {
            toast(`${conflict}. Afspraak niet verplaatst.`, 'error', 7000)
            return
          }
          const { error } = await supabase
            .from('leads')
            .update({ appointment_at: newDate.toISOString() })
            .eq('id', ds.item.leadId)
          if (error) throw error
          setAppointments(prev => prev.map(a => a.id === ds.item.leadId ? { ...a, appointment_at: newDate.toISOString() } : a))
          toast(`Afspraak verplaatst naar ${formatDateNl(newDate)} ${formatTime(newDate.toISOString())}`, 'success')
        } else {
          const durationMs = ds.item.end.getTime() - ds.item.at.getTime()
          const newEnd = new Date(newDate.getTime() + durationMs)
          const { error } = await supabase
            .from('agenda_blocks')
            .update({ start_at: newDate.toISOString(), end_at: newEnd.toISOString() })
            .eq('id', ds.item.blockId)
          if (error) throw error
          setBlockedSlots(prev => prev.map(b => b.id === ds.item.blockId ? { ...b, start_at: newDate.toISOString(), end_at: newEnd.toISOString() } : b))
          toast('Blokkade verplaatst', 'success')
        }
      } catch (err) {
        console.error('Verplaatsen mislukt:', err)
        toast(err.message || 'Kon niet verplaatsen', 'error')
        fetchData()
      } finally {
        setSavingDragId(null)
      }
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [currentWeekStart, toast, fetchData, canManage])

  // Klikken op een leeg stuk van de grid -> snel een blokkade aanmaken op
  // dat exacte moment (net als in Google Calendar).
  function handleGridClick(e, dayIdx) {
    if (dragStateRef.current?.moved) return // was een sleep, geen klik
    const gridEl = gridBodyRef.current
    if (!gridEl) return
    const gridRect = gridEl.getBoundingClientRect()
    const rawMin = e.clientY - gridRect.top
    const snapped = clamp(Math.round(rawMin / SNAP_MIN) * SNAP_MIN, 0, GRID_TOTAL_MIN - SNAP_MIN)
    const clickDate = addDays(currentWeekStart, dayIdx)
    clickDate.setHours(0, GRID_START_MIN + snapped, 0, 0)
    setBlockModalDate(clickDate)
    setShowBlockModal(true)
  }

  const nowMin = minutesSinceMidnight(now)
  const showNowLine = nowMin >= GRID_START_MIN && nowMin <= GRID_END_MIN
  const nowLineTop = (nowMin - GRID_START_MIN) * (HOUR_PX / 60)

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
              Klik op een afspraak voor adres, navigatie en afboeken.{canManage ? ' Sleep een afspraak naar een ander moment om hem te verzetten.' : ''} Elke afspraak is een {APPOINTMENT_LABEL.toLowerCase()} van 2,5 uur.
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
                const d = new Date()
                d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
                setBlockModalDate(d)
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
          /* WEEK WEERGAVE - GOOGLE CALENDAR-ACHTIGE TIJDGRID */
          <div className="glass-panel border border-border" style={{ borderRadius: '12px', overflow: 'hidden' }}>
            {/* Dagkoppen */}
            <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
              <div />
              {weekDays.map(day => {
                const isToday = day.toDateString() === new Date().toDateString()
                return (
                  <div
                    key={day.toISOString()}
                    style={{
                      padding: '8px 6px',
                      textAlign: 'center',
                      background: isToday ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-elevated)',
                      borderLeft: '1px solid var(--border)'
                    }}
                  >
                    <div style={{
                      fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px',
                      color: isToday ? 'var(--primary)' : 'var(--text-main)'
                    }}>
                      {day.toLocaleDateString('nl-NL', { weekday: 'short' })}
                    </div>
                    <div className="text-muted text-xs">
                      {day.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Scrollbare tijdgrid */}
            <div style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(7, 1fr)', position: 'relative' }}>
                {/* Uur-labels kolom */}
                <div style={{ position: 'relative', height: GRID_HEIGHT }}>
                  {HOURS_DISPLAY.map(h => (
                    <div
                      key={h}
                      style={{
                        position: 'absolute', top: (h - GRID_START_HOUR) * HOUR_PX - 7, right: 8,
                        fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600
                      }}
                    >
                      {pad(h)}:00
                    </div>
                  ))}
                </div>

                {/* 7 dagkolommen, samen de sleep/klik-grid */}
                <div
                  ref={gridBodyRef}
                  style={{
                    gridColumn: '2 / span 7', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)',
                    position: 'relative', height: GRID_HEIGHT
                  }}
                >
                  {/* Urenlijnen (horizontaal, over alle dagen heen) */}
                  {HOURS_DISPLAY.map(h => (
                    <div
                      key={h}
                      style={{
                        position: 'absolute', left: 0, right: 0, top: (h - GRID_START_HOUR) * HOUR_PX,
                        borderTop: '1px solid var(--border)', opacity: 0.6
                      }}
                    />
                  ))}

                  {/* Rode "nu"-lijn */}
                  {showNowLine && (
                    <div style={{ position: 'absolute', left: 0, right: 0, top: nowLineTop, zIndex: 5, pointerEvents: 'none' }}>
                      <div style={{ position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: '50%', background: '#EF4444' }} />
                      <div style={{ borderTop: '2px solid #EF4444' }} />
                    </div>
                  )}

                  {weekDays.map((day, dayIdx) => (
                    <div
                      key={day.toISOString()}
                      onClick={e => handleGridClick(e, dayIdx)}
                      style={{
                        position: 'relative', borderLeft: '1px solid var(--border)', cursor: 'copy',
                        background: day.toDateString() === new Date().toDateString() ? 'rgba(59, 130, 246, 0.04)' : 'transparent'
                      }}
                      title="Klik om een tijdvak te blokkeren op dit moment"
                    >
                      {itemsByDay[dayIdx].map(item => {
                        const isDragPreviewSource = dragPreview?.itemId === item.id
                        const displayDayIdx = isDragPreviewSource ? dragPreview.dayIdx : dayIdx
                        if (isDragPreviewSource && displayDayIdx !== dayIdx) return null // wordt in de doelkolom getekend

                        const top = ((isDragPreviewSource ? dragPreview.startMin : item.startMin) - GRID_START_MIN) * (HOUR_PX / 60)
                        const height = Math.max(20, (item.endMin - item.startMin) * (HOUR_PX / 60))
                        const widthPct = 100 / item.numCols
                        const leftPct = item.col * widthPct
                        const isSaving = savingDragId === item.id

                        if (item.kind === 'appointment') {
                          const l = item.lead
                          const amName = amMap[l.assigned_to] || 'Onbekend'
                          const oc = outcomeInfo(l.appointment_outcome)
                          const snt = sentimentInfo(l.appointment_sentiment)
                          const kleur = oc ? oc.color : '#3B82F6'
                          const startLabel = isDragPreviewSource
                            ? `${pad(Math.floor(dragPreview.startMin / 60))}:${pad(dragPreview.startMin % 60)}`
                            : formatTime(l.appointment_at)
                          return (
                            <div
                              key={item.id}
                              onMouseDown={e => handleItemMouseDown(e, item, dayIdx)}
                              onClick={e => e.stopPropagation()}
                              style={{
                                position: 'absolute', top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                                background: kleur,
                                border: `1px solid ${kleur}`,
                                borderRadius: '6px', padding: '4px 6px', overflow: 'hidden',
                                cursor: isSaving ? 'wait' : (canManage ? 'grab' : 'pointer'), color: '#fff', zIndex: isDragPreviewSource ? 20 : 2,
                                opacity: isSaving ? 0.6 : 1, boxShadow: isDragPreviewSource ? '0 4px 14px rgba(0,0,0,0.4)' : 'none',
                                transition: isDragPreviewSource ? 'none' : 'top 0.12s ease'
                              }}
                              title={`${APPOINTMENT_LABEL} · ${l.name}${canManage ? ' · sleep om te verzetten' : ''}, klik om te openen`}
                            >
                              <div style={{ fontSize: '0.68rem', fontWeight: 800 }}>{snt ? `${snt.emoji} ` : ''}{startLabel} · {oc ? oc.label : APPOINTMENT_LABEL}</div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700 }} className="truncate">{l.name}</div>
                              {height > 44 && l.contact_person && (
                                <div style={{ fontSize: '0.65rem', opacity: 0.9 }} className="truncate">
                                  <User size={9} style={{ verticalAlign: -1, marginRight: 2 }} />{l.contact_person}
                                </div>
                              )}
                              {height > 60 && (l.city || l.address) && (
                                <div style={{ fontSize: '0.62rem', opacity: 0.9 }} className="truncate">📍 {l.city || l.address}</div>
                              )}
                              {height > 76 && selectedAmId === 'all' && (
                                <div style={{ fontSize: '0.6rem', opacity: 0.85, fontWeight: 700, marginTop: 2 }} className="truncate">👤 {amName}</div>
                              )}
                            </div>
                          )
                        }

                        // Geblokkeerd tijdvak
                        const b = item.block
                        const amName = amMap[b.user_id] || 'Accountmanager'
                        return (
                          <div
                            key={item.id}
                            onMouseDown={e => handleItemMouseDown(e, item, dayIdx)}
                            onClick={e => e.stopPropagation()}
                            style={{
                              position: 'absolute', top, height, left: `calc(${leftPct}% + 2px)`, width: `calc(${widthPct}% - 4px)`,
                              background: 'repeating-linear-gradient(45deg, rgba(245, 158, 11, 0.25), rgba(245, 158, 11, 0.25) 6px, rgba(245, 158, 11, 0.35) 6px, rgba(245, 158, 11, 0.35) 12px)',
                              border: '1px solid rgba(245, 158, 11, 0.7)',
                              borderRadius: '6px', padding: '4px 6px', overflow: 'hidden',
                              cursor: isSaving ? 'wait' : 'grab', zIndex: isDragPreviewSource ? 20 : 1,
                              opacity: isSaving ? 0.6 : 1, boxShadow: isDragPreviewSource ? '0 4px 14px rgba(0,0,0,0.4)' : 'none',
                              transition: isDragPreviewSource ? 'none' : 'top 0.12s ease'
                            }}
                            title={`Geblokkeerd · sleep om te verzetten`}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <Lock size={10} /> {formatTime(b.start_at)}
                              </span>
                              <button
                                type="button"
                                onMouseDown={e => e.stopPropagation()}
                                onClick={e => {
                                  e.stopPropagation()
                                  if (confirmDeleteId === b.id) { handleDeleteBlock(b.id) }
                                  else { setConfirmDeleteId(b.id) }
                                }}
                                className={confirmDeleteId === b.id ? 'text-error' : 'text-muted hover:text-error'}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '0.6rem', fontWeight: 800 }}
                                title={confirmDeleteId === b.id ? 'Klik nogmaals om te bevestigen' : 'Blokkade opheffen'}
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                            {height > 30 && (
                              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-main)', marginTop: 1 }} className="truncate">
                                {b.title || 'Geblokkeerd'}
                              </div>
                            )}
                            {height > 48 && selectedAmId === 'all' && (
                              <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontWeight: 700, marginTop: 1 }} className="truncate">👤 {amName}</div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
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
                      const endLabel = formatTime(new Date(item.at.getTime() + APPOINTMENT_DURATION_MINUTES * 60000).toISOString())
                      return (
                        <div
                          key={`l-${l.id}`}
                          onClick={() => setApptLead(l)}
                          className="card glow-hover p-4 flex justify-between items-center cursor-pointer"
                          style={{ borderLeft: `4px solid ${outcomeInfo(l.appointment_outcome)?.color || 'var(--primary)'}`, gap: '12px', flexWrap: 'wrap' }}
                        >
                          <div className="flex items-center gap-4">
                            <div className="text-center min-w-[70px]">
                              <div className="text-xs font-bold text-primary">{formatDateNl(item.at)}</div>
                              <div className="text-base font-black text-body">{formatTime(l.appointment_at)}&ndash;{endLabel}</div>
                            </div>

                            <div>
                              <div className="font-bold text-body text-base flex items-center gap-2">
                                {l.name}
                                <span className="badge badge-info text-[10px]">{outcomeInfo(l.appointment_outcome)?.label || APPOINTMENT_LABEL}</span>
                                {sentimentInfo(l.appointment_sentiment) && <span title={`Klant ${sentimentInfo(l.appointment_sentiment).label.toLowerCase()}`}>{sentimentInfo(l.appointment_sentiment).emoji}</span>}
                              </div>
                              <div className="text-xs text-muted mt-0.5 flex gap-3">
                                {l.contact_person && <span>👤 {l.contact_person}</span>}
                                {l.phone && <span>📞 {l.phone}</span>}
                                {l.lead_lists?.campaigns?.name && <span>🏷️ {l.lead_lists.campaigns.name}</span>}
                              </div>
                              {navigationUrl(l) && (
                                <a
                                  href={navigationUrl(l)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-xs text-primary font-bold"
                                  style={{ display: 'inline-block', marginTop: 4, textDecoration: 'none' }}
                                >
                                  📍 {leadAddressText(l)} · navigeer
                                </a>
                              )}
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

        {/* v97: afspraakpopup */}
        {apptLead && (
          <AppointmentModal
            lead={apptLead}
            accountmanagers={accountmanagers}
            canManage={canManage}
            onClose={() => setApptLead(null)}
            onOpenContactCard={(l) => { setApptLead(null); setDetailLead(l) }}
            onChanged={(id, updates, opts) => {
              if (opts?.removed) {
                setAppointments(prev => prev.filter(a => a.id !== id))
              } else {
                setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a))
                setApptLead(prev => prev && prev.id === id ? { ...prev, ...updates } : prev)
              }
            }}
          />
        )}

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
