import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Lock, CalendarClock, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { APPOINTMENT_LABEL, APPOINTMENT_DURATION_MINUTES } from '../lib/appointmentConfig'

// v96: visuele agendakeuze bij "Afspraak gemaakt" in het belscherm. Vroeger
// typte de beller een datum/tijd blind in en zag pas daarna (via een losse
// conflictcheck) of de accountmanager al bezet was. Nu kiest de beller eerst
// een accountmanager, ziet meteen diens week (afspraken + blokkades zoals in
// /agenda) en klikt een vrij moment aan. Bezette/geblokkeerde tijd is niet
// aanklikbaar. Bij bevestigen geeft dit component { amId, date } terug aan
// WorkInterface, dat zet dat gewoon in de bestaande velden (selectedAmId +
// nextContactDate) - de bestaande conflictcheck en afhandel-flow blijven
// verder ongewijzigd, dit is puur een fijnere manier om bij dat veld te komen.

function pad(n) { return String(n).padStart(2, '0') }

function startOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, days) {
  const next = new Date(d)
  next.setDate(next.getDate() + days)
  return next
}

function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatDateNl(d) {
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function minutesSinceMidnight(d) {
  return d.getHours() * 60 + d.getMinutes()
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)) }

const GRID_START_HOUR = 7
const GRID_END_HOUR = 21
const HOUR_PX = 44
const GRID_START_MIN = GRID_START_HOUR * 60
const GRID_END_MIN = GRID_END_HOUR * 60
const GRID_TOTAL_MIN = GRID_END_MIN - GRID_START_MIN
const GRID_HEIGHT = GRID_TOTAL_MIN * (HOUR_PX / 60)
const SNAP_MIN = 15
const HOURS_DISPLAY = Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => GRID_START_HOUR + i)

export default function AgendaPickerModal({ accountmanagers, defaultAmId, excludeLeadId, onConfirm, onClose }) {
  const [selectedAmId, setSelectedAmId] = useState(defaultAmId || accountmanagers?.[0]?.id || null)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()))
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState([])
  const [blockedSlots, setBlockedSlots] = useState([])
  const [pickedSlot, setPickedSlot] = useState(null) // { dayIdx, startMin }
  const gridBodyRef = useRef(null)

  const fetchData = useCallback(async () => {
    if (!selectedAmId) { setAppointments([]); setBlockedSlots([]); setLoading(false); return }
    setLoading(true)
    const rangeStart = addDays(currentWeekStart, -1).toISOString()
    const rangeEnd = addDays(currentWeekStart, 8).toISOString()
    try {
      const { data: leadsData } = await supabase
        .from('leads')
        .select(`
          id, name, appointment_at,
          lead_lists!inner(id, campaign_id, campaigns!inner(id, appointment_scheduling_enabled))
        `)
        .eq('status', 'afspraak_gemaakt')
        .eq('lead_lists.campaigns.appointment_scheduling_enabled', true)
        .eq('assigned_to', selectedAmId)
        .neq('id', excludeLeadId || '')
        .gte('appointment_at', rangeStart)
        .lte('appointment_at', rangeEnd)
        .is('deleted_at', null)

      const { data: blocksData } = await supabase
        .from('agenda_blocks')
        .select('*')
        .eq('user_id', selectedAmId)
        .gte('start_at', rangeStart)
        .lte('start_at', rangeEnd)

      setAppointments(leadsData || [])
      setBlockedSlots(blocksData || [])
    } catch (err) {
      console.error('Fout bij ophalen agenda:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedAmId, currentWeekStart, excludeLeadId])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => { setPickedSlot(null) }, [selectedAmId, currentWeekStart])

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i)), [currentWeekStart])

  // Bezette tijdvakken per dag (afspraken + blokkades), in minuten-sinds-
  // middernacht - gebruikt om te tekenen EN om te bepalen of een klik op een
  // vrij moment landt.
  const busyByDay = useMemo(() => {
    const map = weekDays.map(() => [])
    weekDays.forEach((day, dayIdx) => {
      const dayStr = day.toDateString()
      appointments.forEach(l => {
        if (!l.appointment_at) return
        const at = new Date(l.appointment_at)
        if (at.toDateString() !== dayStr) return
        const startMin = minutesSinceMidnight(at)
        map[dayIdx].push({ kind: 'appointment', id: `a-${l.id}`, label: l.name, startMin, endMin: startMin + APPOINTMENT_DURATION_MINUTES })
      })
      blockedSlots.forEach(b => {
        if (!b.start_at) return
        const at = new Date(b.start_at)
        if (at.toDateString() !== dayStr) return
        const end = new Date(b.end_at)
        map[dayIdx].push({ kind: 'block', id: `b-${b.id}`, label: b.title || 'Niet beschikbaar', startMin: minutesSinceMidnight(at), endMin: minutesSinceMidnight(at) + Math.max(15, (end - at) / 60000) })
      })
    })
    return map
  }, [weekDays, appointments, blockedSlots])

  function slotIsFree(dayIdx, startMin) {
    const endMin = startMin + APPOINTMENT_DURATION_MINUTES
    return !busyByDay[dayIdx].some(b => b.startMin < endMin && b.endMin > startMin)
  }

  function handleGridClick(e, dayIdx) {
    const gridEl = gridBodyRef.current
    if (!gridEl) return
    const gridRect = gridEl.getBoundingClientRect()
    const rawMin = e.clientY - gridRect.top
    const snapped = clamp(Math.round(rawMin / SNAP_MIN) * SNAP_MIN, 0, GRID_TOTAL_MIN - SNAP_MIN)
    const startMin = GRID_START_MIN + snapped
    if (!slotIsFree(dayIdx, startMin)) return
    setPickedSlot({ dayIdx, startMin })
  }

  const pickedDate = useMemo(() => {
    if (!pickedSlot) return null
    const d = addDays(currentWeekStart, pickedSlot.dayIdx)
    d.setHours(0, pickedSlot.startMin, 0, 0)
    return d
  }, [pickedSlot, currentWeekStart])

  function handleConfirm() {
    if (!pickedDate || !selectedAmId) return
    onConfirm({ amId: selectedAmId, date: pickedDate })
  }

  const now = new Date()
  const nowMin = minutesSinceMidnight(now)
  const showNowLine = weekDays.some(d => d.toDateString() === now.toDateString()) && nowMin >= GRID_START_MIN && nowMin <= GRID_END_MIN
  const nowDayIdx = weekDays.findIndex(d => d.toDateString() === now.toDateString())
  const nowLineTop = (nowMin - GRID_START_MIN) * (HOUR_PX / 60)

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10010, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', width: '100%', maxWidth: '920px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CalendarClock size={20} color="var(--primary)" />
            <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Zet in agenda</h3>
          </div>

          <select
            value={selectedAmId || ''}
            onChange={e => setSelectedAmId(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
          >
            {(accountmanagers || []).map(am => (
              <option key={am.id} value={am.id}>{am.full_name} ({am.role === 'admin' ? 'Admin' : 'Accountmanager'})</option>
            ))}
          </select>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={() => setCurrentWeekStart(p => addDays(p, -7))} style={navBtnStyle}><ChevronLeft size={16} /></button>
            <button onClick={() => setCurrentWeekStart(startOfWeek(new Date()))} style={{ ...navBtnStyle, width: 'auto', padding: '0 10px', fontSize: '0.78rem' }}>Vandaag</button>
            <button onClick={() => setCurrentWeekStart(p => addDays(p, 7))} style={navBtnStyle}><ChevronRight size={16} /></button>
          </div>

          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={22} /></button>
        </div>

        <div style={{ padding: '4px 22px 0', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--primary)', marginRight: 6, verticalAlign: 'middle' }} />Klik een vrij moment aan</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(239,68,68,0.55)', marginRight: 6, verticalAlign: 'middle' }} />Bezet / afspraak</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'rgba(148,163,184,0.4)', marginRight: 6, verticalAlign: 'middle' }} />Geblokkeerd</span>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '12px 22px 0' }}>
          {!selectedAmId ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Geen accountmanager beschikbaar.</div>
          ) : (
            <div style={{ minWidth: '640px' }}>
              {/* Dagkoppen */}
              <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>
                <div />
                {weekDays.map((d, i) => {
                  const isToday = d.toDateString() === now.toDateString()
                  return (
                    <div key={i} style={{ textAlign: 'center', padding: '6px 0 10px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                        {d.toLocaleDateString('nl-NL', { weekday: 'short' })}
                      </div>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 26, height: 26, borderRadius: '50%', marginTop: 2,
                        fontSize: '0.85rem', fontWeight: 700,
                        color: isToday ? 'var(--text-on-accent)' : 'var(--text-primary)',
                        background: isToday ? 'var(--primary)' : 'transparent'
                      }}>{d.getDate()}</div>
                    </div>
                  )
                })}
              </div>

              {/* Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(7, 1fr)', position: 'relative' }}>
                <div>
                  {HOURS_DISPLAY.map(h => (
                    <div key={h} style={{ height: HOUR_PX, position: 'relative' }}>
                      <span style={{ position: 'absolute', top: -7, right: 8, fontSize: '0.68rem', color: 'var(--text-muted)' }}>{h}:00</span>
                    </div>
                  ))}
                </div>

                <div ref={gridBodyRef} style={{ gridColumn: '2 / -1', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', position: 'relative', height: GRID_HEIGHT, borderLeft: '1px solid var(--border)' }}>
                  {HOURS_DISPLAY.map((h, i) => (
                    <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: i * HOUR_PX, borderTop: '1px solid var(--border)', opacity: 0.5 }} />
                  ))}

                  {showNowLine && nowDayIdx >= 0 && (
                    <div style={{ position: 'absolute', left: `${(nowDayIdx / 7) * 100}%`, width: `${100 / 7}%`, top: nowLineTop, borderTop: '2px solid #EF4444', zIndex: 3 }} />
                  )}

                  {weekDays.map((d, dayIdx) => (
                    <div
                      key={dayIdx}
                      onClick={e => handleGridClick(e, dayIdx)}
                      style={{ position: 'relative', borderRight: '1px solid var(--border)', cursor: 'crosshair' }}
                    >
                      {busyByDay[dayIdx].map(item => {
                        const top = (item.startMin - GRID_START_MIN) * (HOUR_PX / 60)
                        const height = Math.max(16, (item.endMin - item.startMin) * (HOUR_PX / 60))
                        const isBlock = item.kind === 'block'
                        return (
                          <div key={item.id} style={{
                            position: 'absolute', left: 2, right: 2, top, height,
                            background: isBlock ? 'rgba(148,163,184,0.28)' : 'rgba(239,68,68,0.28)',
                            border: `1px solid ${isBlock ? 'rgba(148,163,184,0.6)' : 'rgba(239,68,68,0.6)'}`,
                            borderRadius: 6, padding: '2px 6px', overflow: 'hidden',
                            fontSize: '0.68rem', color: 'var(--text-primary)', pointerEvents: 'none'
                          }}>
                            {isBlock ? <Lock size={10} style={{ marginRight: 3, verticalAlign: 'middle' }} /> : null}
                            {item.label}
                          </div>
                        )
                      })}

                      {pickedSlot && pickedSlot.dayIdx === dayIdx && (() => {
                        const top = (pickedSlot.startMin - GRID_START_MIN) * (HOUR_PX / 60)
                        const height = APPOINTMENT_DURATION_MINUTES * (HOUR_PX / 60)
                        return (
                          <div style={{
                            position: 'absolute', left: 2, right: 2, top, height,
                            background: 'var(--primary)', opacity: 0.85, borderRadius: 6,
                            padding: '2px 6px', fontSize: '0.7rem', fontWeight: 700,
                            color: 'var(--text-on-accent)', pointerEvents: 'none',
                            boxShadow: '0 0 0 2px var(--primary)'
                          }}>
                            <Check size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
                            {formatTime(pickedDate)}
                          </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </div>

              {loading && (
                <div style={{ textAlign: 'center', padding: '10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Agenda laden...</div>
              )}
            </div>
          )}
        </div>

        <div style={{ padding: '16px 22px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
            {pickedDate
              ? <>Gekozen: <strong style={{ textTransform: 'capitalize' }}>{formatDateNl(pickedDate)}</strong> om <strong>{formatTime(pickedDate)}</strong> ({APPOINTMENT_LABEL}, 2,5 uur)</>
              : <span style={{ color: 'var(--text-muted)' }}>Nog geen moment gekozen</span>}
          </div>
          <button
            onClick={handleConfirm}
            disabled={!pickedDate}
            style={{
              background: pickedDate ? 'var(--primary)' : 'var(--bg-dark)',
              color: pickedDate ? 'var(--text-on-accent)' : 'var(--text-muted)',
              border: pickedDate ? 'none' : '1px solid var(--border)',
              padding: '12px 20px', borderRadius: '10px', fontWeight: 800,
              cursor: pickedDate ? 'pointer' : 'not-allowed'
            }}
          >
            Bevestig dit moment
          </button>
        </div>
      </motion.div>
    </div>
  )
}

const navBtnStyle = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg-dark)', color: 'var(--text-primary)', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}
