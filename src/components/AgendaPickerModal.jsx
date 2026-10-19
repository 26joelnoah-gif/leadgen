import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Lock, CalendarClock, Check, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { appointmentMinutes, appointmentLabel, duurTekst, WERKTIJDEN, MIN_VOORUIT_MIN } from '../lib/appointmentConfig'
import PersonSelect from './PersonSelect' // v102

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

// v124: `type` = soort van de nieuwe afspraak (shoot/bezoek), bepaalt de blokhoogte
// en of een klik op een vrij moment past.
// v128: loadBusy(amId, rangeStartIso, rangeEndIso) -> { appointments, blocks }
// laat een andere bron de bezette tijden leveren (de aanbrenger mag leads en
// agenda_blocks niet lezen en krijgt ze via RPC aanbreng_bezet, zonder namen).
// anoniem = toon "Bezet" in plaats van bedrijfsnamen.
export default function AgendaPickerModal({ accountmanagers, defaultAmId, excludeLeadId, type, onConfirm, onClose, loadBusy = null, anoniem = false }) {
  const nieuwMin = appointmentMinutes(type)
  const [selectedAmId, setSelectedAmId] = useState(defaultAmId || accountmanagers?.[0]?.id || null)
  const [currentWeekStart, setCurrentWeekStart] = useState(() => startOfWeek(new Date()))
  const [loading, setLoading] = useState(true)
  const [appointments, setAppointments] = useState([])
  const [blockedSlots, setBlockedSlots] = useState([])
  const [pickedSlot, setPickedSlot] = useState(null) // { dayIdx, startMin }
  const gridBodyRef = useRef(null)

  // v146: een plek die de bezette tijden ophaalt, voor de week EN voor de
  // vrije-momenten-rij (komende 14 dagen).
  const haalBezet = useCallback(async (amId, rangeStart, rangeEnd) => {
    if (loadBusy) {
      const r = await loadBusy(amId, rangeStart, rangeEnd)
      return { appointments: r?.appointments || [], blocks: r?.blocks || [] }
    }
    const [{ data: leadsData }, { data: blocksData }] = await Promise.all([
      supabase
        .from('leads')
        .select('id, name, appointment_at, appointment_type, lead_lists!inner(id, campaign_id, campaigns!inner(id, appointment_scheduling_enabled))')
        .eq('status', 'afspraak_gemaakt')
        .eq('lead_lists.campaigns.appointment_scheduling_enabled', true)
        .eq('assigned_to', amId)
        .neq('id', excludeLeadId || '')
        .gte('appointment_at', rangeStart)
        .lte('appointment_at', rangeEnd)
        .is('deleted_at', null),
      supabase
        .from('agenda_blocks')
        .select('*')
        .eq('user_id', amId)
        .lte('start_at', rangeEnd)
        .gte('end_at', rangeStart),
    ])
    return { appointments: leadsData || [], blocks: blocksData || [] }
  }, [loadBusy, excludeLeadId])

  const fetchData = useCallback(async () => {
    if (!selectedAmId) { setAppointments([]); setBlockedSlots([]); setLoading(false); return }
    setLoading(true)
    const rangeStart = addDays(currentWeekStart, -1).toISOString()
    const rangeEnd = addDays(currentWeekStart, 8).toISOString()
    try {
      const r = await haalBezet(selectedAmId, rangeStart, rangeEnd)
      setAppointments(r.appointments)
      setBlockedSlots(r.blocks)
    } catch (err) {
      console.error('Fout bij ophalen agenda:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedAmId, currentWeekStart, haalBezet])

  useEffect(() => { fetchData() }, [fetchData])
  // v146: een gekozen moment onthoudt zijn eigen week, dus bladeren wist hem niet meer
  useEffect(() => { setPickedSlot(null) }, [selectedAmId])

  // v146: de eerstvolgende vrije momenten (komende 14 dagen), met 1 klik te kiezen
  const [voorstellen, setVoorstellen] = useState([])
  useEffect(() => {
    if (!selectedAmId) { setVoorstellen([]); return }
    let alive = true
    const start = new Date()
    const eind = addDays(start, 15)
    haalBezet(selectedAmId, addDays(start, -1).toISOString(), eind.toISOString()).then(({ appointments: ap, blocks: bl }) => {
      if (!alive) return
      const bezet = [
        ...ap.filter(l => l.appointment_at).map(l => { const s = new Date(l.appointment_at).getTime(); return [s, s + appointmentMinutes(l) * 60000] }),
        ...bl.map(b => [new Date(b.start_at).getTime(), new Date(b.end_at).getTime()]),
      ]
      const vroegst = Date.now() + MIN_VOORUIT_MIN * 60000
      const uit = []
      for (let i = 0; i < 15 && uit.length < 8; i++) {
        const dag = addDays(start, i); dag.setHours(0, 0, 0, 0)
        if (!WERKTIJDEN.dagen.includes(dag.getDay())) continue
        let perDag = 0
        for (let m = WERKTIJDEN.startMin; m + nieuwMin <= WERKTIJDEN.eindMin && perDag < 2 && uit.length < 8; m += 30) {
          const s = dag.getTime() + m * 60000
          const e = s + nieuwMin * 60000
          if (s < vroegst) continue
          if (bezet.some(([bs, be]) => bs < e && be > s)) continue
          uit.push(new Date(s)); perDag++
          m += Math.max(0, nieuwMin - 30) // volgende voorstel na dit blok
        }
      }
      setVoorstellen(uit)
    }).catch(() => { if (alive) setVoorstellen([]) })
    return () => { alive = false }
  }, [selectedAmId, haalBezet, nieuwMin])

  function kiesVoorstel(d) {
    const week = startOfWeek(d)
    const dayIdx = Math.round((new Date(d).setHours(0, 0, 0, 0) - week.getTime()) / 86400000)
    setCurrentWeekStart(week)
    setPickedSlot({ weekKey: week.getTime(), dayIdx, startMin: minutesSinceMidnight(d) })
  }

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
        map[dayIdx].push({ kind: 'appointment', id: `a-${l.id}`, label: anoniem ? 'Bezet' : l.name, startMin, endMin: startMin + appointmentMinutes(l) })
      })
      blockedSlots.forEach(b => {
        if (!b.start_at) return
        const at = new Date(b.start_at)
        if (at.toDateString() !== dayStr) return
        const end = new Date(b.end_at)
        map[dayIdx].push({ kind: 'block', id: `b-${b.id}`, label: anoniem ? 'Niet beschikbaar' : (b.title || 'Niet beschikbaar'), startMin: minutesSinceMidnight(at), endMin: minutesSinceMidnight(at) + Math.max(15, (end - at) / 60000) })
      })
    })
    return map
  }, [weekDays, appointments, blockedSlots, anoniem])

  // v146: alleen binnen werktijden en niet in het verleden
  function binnenWerktijd(dayIdx, startMin) {
    const dag = weekDays[dayIdx]
    if (!WERKTIJDEN.dagen.includes(dag.getDay())) return false
    if (startMin < WERKTIJDEN.startMin || startMin + nieuwMin > WERKTIJDEN.eindMin) return false
    const d = new Date(dag); d.setHours(0, startMin, 0, 0)
    return d.getTime() >= Date.now() + MIN_VOORUIT_MIN * 60000
  }

  function slotIsFree(dayIdx, startMin) {
    if (!binnenWerktijd(dayIdx, startMin)) return false
    const endMin = startMin + nieuwMin
    return !busyByDay[dayIdx].some(b => b.startMin < endMin && b.endMin > startMin)
  }

  // v146: hoeveel werktijd is er per dag nog vrij (voor de dagkop)
  const vrijPerDag = useMemo(() => weekDays.map((dag, i) => {
    if (!WERKTIJDEN.dagen.includes(dag.getDay())) return null
    const dagStart = new Date(dag); dagStart.setHours(0, 0, 0, 0)
    const vanaf = Math.max(WERKTIJDEN.startMin, Math.ceil((Date.now() - dagStart.getTime()) / 60000))
    if (vanaf >= WERKTIJDEN.eindMin) return 0
    const stukken = busyByDay[i]
      .map(b => [Math.max(b.startMin, vanaf), Math.min(b.endMin, WERKTIJDEN.eindMin)])
      .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0])
    let bezet = 0, tot = vanaf
    stukken.forEach(([a, b]) => { if (b > tot) { bezet += b - Math.max(a, tot); tot = b } })
    return WERKTIJDEN.eindMin - vanaf - bezet
  }), [weekDays, busyByDay])

  function handleGridClick(e, dayIdx) {
    const gridEl = gridBodyRef.current
    if (!gridEl) return
    const gridRect = gridEl.getBoundingClientRect()
    const rawMin = e.clientY - gridRect.top
    const snapped = clamp(Math.round(rawMin / SNAP_MIN) * SNAP_MIN, 0, GRID_TOTAL_MIN - SNAP_MIN)
    const startMin = GRID_START_MIN + snapped
    if (!slotIsFree(dayIdx, startMin)) return
    setPickedSlot({ weekKey: currentWeekStart.getTime(), dayIdx, startMin })
  }

  const pickedDate = useMemo(() => {
    if (!pickedSlot) return null
    const d = addDays(new Date(pickedSlot.weekKey), pickedSlot.dayIdx)
    d.setHours(0, pickedSlot.startMin, 0, 0)
    return d
  }, [pickedSlot])
  const pickedInDezeWeek = !!pickedSlot && pickedSlot.weekKey === currentWeekStart.getTime()

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

          <PersonSelect
            people={accountmanagers || []}
            value={selectedAmId || ''}
            onChange={id => setSelectedAmId(id)}
            placeholder="Kies een accountmanager"
            showRole
            className=""
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem', minWidth: 200 }}
          />

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
          <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border)', marginRight: 6, verticalAlign: 'middle' }} />Buiten werktijd (ma-vr {formatTime(new Date(0, 0, 0, 0, WERKTIJDEN.startMin))} tot {formatTime(new Date(0, 0, 0, 0, WERKTIJDEN.eindMin))})</span>
        </div>

        {/* v146: eerstvolgende vrije momenten */}
        {selectedAmId && (
          <div style={{ padding: '12px 22px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
              <Sparkles size={14} color="var(--primary)" /> Eerstvolgende vrije momenten ({duurTekst(nieuwMin)})
            </div>
            {voorstellen.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Geen vrij moment in de komende 2 weken binnen de werktijden.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {voorstellen.map(d => {
                  const gekozen = pickedDate && pickedDate.getTime() === d.getTime()
                  return (
                    <button key={d.getTime()} type="button" onClick={() => kiesVoorstel(d)}
                      style={{
                        padding: '8px 12px', borderRadius: 10, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700,
                        border: `1px solid ${gekozen ? 'var(--primary)' : 'var(--border)'}`,
                        background: gekozen ? 'var(--primary)' : 'var(--bg-elevated)',
                        color: gekozen ? 'var(--text-on-accent)' : 'var(--text-primary)'
                      }}>
                      <span style={{ textTransform: 'capitalize' }}>{d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}</span> {formatTime(d)}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

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
                      <div style={{ fontSize: '0.66rem', marginTop: 2, fontWeight: 700, color: vrijPerDag[i] ? 'var(--success)' : 'var(--text-muted)' }}>
                        {vrijPerDag[i] == null ? 'vrij weekend' : vrijPerDag[i] === 0 ? 'vol' : `${Math.floor(vrijPerDag[i] / 60)}u${vrijPerDag[i] % 60 ? ` ${vrijPerDag[i] % 60}m` : ''} vrij`}
                      </div>
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
                      {/* v146: buiten werktijd en verleden grijs, niet aanklikbaar */}
                      {(() => {
                        const px = HOUR_PX / 60
                        const isWerkdag = WERKTIJDEN.dagen.includes(d.getDay())
                        const dagStart = new Date(d); dagStart.setHours(0, 0, 0, 0)
                        const nuMin = Math.ceil((Date.now() - dagStart.getTime()) / 60000)
                        const grijs = { position: 'absolute', left: 0, right: 0, background: 'var(--bg-elevated)', opacity: 0.75, pointerEvents: 'none' }
                        if (!isWerkdag) return <div style={{ ...grijs, top: 0, height: GRID_HEIGHT }} />
                        const bovenTot = clamp(Math.max(WERKTIJDEN.startMin, nuMin), GRID_START_MIN, GRID_END_MIN)
                        return (
                          <>
                            <div style={{ ...grijs, top: 0, height: (bovenTot - GRID_START_MIN) * px }} />
                            <div style={{ ...grijs, top: (WERKTIJDEN.eindMin - GRID_START_MIN) * px, height: (GRID_END_MIN - WERKTIJDEN.eindMin) * px }} />
                          </>
                        )
                      })()}
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

                      {pickedInDezeWeek && pickedSlot.dayIdx === dayIdx && (() => {
                        const top = (pickedSlot.startMin - GRID_START_MIN) * (HOUR_PX / 60)
                        const height = nieuwMin * (HOUR_PX / 60)
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
              ? <>Gekozen: <strong style={{ textTransform: 'capitalize' }}>{formatDateNl(pickedDate)}</strong> om <strong>{formatTime(pickedDate)}</strong> ({appointmentLabel(type)}, {duurTekst(nieuwMin)})</>
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
