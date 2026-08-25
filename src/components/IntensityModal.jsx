import { useState, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import { X, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase'

// Seconden -> "1u 11m" / "11m" / "42s"
function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}u ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

function localDateInput(d) {
  const tzOffset = d.getTimezoneOffset() * 60000
  return new Date(d - tzOffset).toISOString().slice(0, 10)
}

// v43: bucket alle pings van de dag in vaste blokken van `windowMin` minuten
// (aangesloten op middernacht), en markeer een blok als "actief" zodra de
// som van clicks in dat blok >= minActions is. Aaneengesloten actieve
// blokken worden samengevoegd tot 1 werkblok. "Idle" = de rest van de
// spanne tussen eerste en laatste actie die dag.
function computeIntensity(pings, windowMin, minActions) {
  const windowMs = windowMin * 60000
  const buckets = new Map() // bucketStartMs -> clicks

  for (const p of pings) {
    const t = new Date(p.created_at).getTime()
    const bucketStart = Math.floor(t / windowMs) * windowMs
    buckets.set(bucketStart, (buckets.get(bucketStart) || 0) + (p.click_count || 0))
  }

  const sortedBuckets = [...buckets.entries()].sort((a, b) => a[0] - b[0])
  const totalClicks = sortedBuckets.reduce((sum, [, c]) => sum + c, 0)

  const blocks = []
  let current = null
  for (const [start, clicks] of sortedBuckets) {
    const active = clicks >= minActions
    if (active) {
      if (current && current.end === start) {
        current.end = start + windowMs
        current.clicks += clicks
      } else {
        current = { start, end: start + windowMs, clicks }
        blocks.push(current)
      }
    } else {
      current = null
    }
  }

  const activeMs = blocks.reduce((sum, b) => sum + (b.end - b.start), 0)
  const first = sortedBuckets.length ? sortedBuckets[0][0] : null
  const last = sortedBuckets.length ? sortedBuckets[sortedBuckets.length - 1][0] + windowMs : null
  const spanMs = first != null ? last - first : 0

  return {
    totalClicks,
    pingCount: pings.length,
    blocks,
    activeMs,
    idleMs: Math.max(0, spanMs - activeMs),
    spanMs,
    firstTs: first,
    lastTs: last
  }
}

// v43: intensiteit/ingelogde-tijd per medewerker, op basis van activity_pings
// (klik-heartbeats, zie AuthContext). Admin stelt zelf de drempel in:
// "minimaal X acties per Y minuten" telt als werkend blok.
export default function IntensityModal({ isOpen, onClose, targetUser, users = [] }) {
  const [selectedUserId, setSelectedUserId] = useState(targetUser?.id || '')
  const [date, setDate] = useState(() => localDateInput(new Date()))
  const [windowMin, setWindowMin] = useState(5)
  const [minActions, setMinActions] = useState(3)
  const [pings, setPings] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) setSelectedUserId(targetUser?.id || '')
  }, [isOpen, targetUser?.id])

  useEffect(() => {
    if (!isOpen || !selectedUserId) return
    let cancelled = false
    async function fetchPings() {
      setLoading(true)
      try {
        const dayStart = new Date(`${date}T00:00:00`)
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60000)
        const { data, error } = await supabase
          .from('activity_pings')
          .select('created_at, click_count')
          .eq('user_id', selectedUserId)
          .gte('created_at', dayStart.toISOString())
          .lt('created_at', dayEnd.toISOString())
          .order('created_at')
        if (error) throw error
        if (!cancelled) setPings(data || [])
      } catch (err) {
        console.error('Kon activity_pings niet laden:', err)
        if (!cancelled) setPings([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchPings()
    return () => { cancelled = true }
  }, [isOpen, selectedUserId, date])

  const result = useMemo(() => computeIntensity(pings, windowMin, minActions), [pings, windowMin, minActions])
  const selectedUser = users.find(u => u.id === selectedUserId) || targetUser
  const isToday = date === localDateInput(new Date())

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="modal-overlay" onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
        className="modal glass-panel" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '100%' }}
      >
        <div className="modal-header">
          <h2><Zap size={18} /> Intensiteit &amp; ingelogde tijd</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
          {users.length > 0 && (
            <div className="form-group" style={{ flex: '1 1 200px', marginBottom: 0 }}>
              <label>Medewerker</label>
              <select className="form-dark" value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group" style={{ flex: '1 1 140px', marginBottom: 0 }}>
            <label>Datum</label>
            <input type="date" className="form-dark" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: '1 1 100px', marginBottom: 0 }}>
            <label>Min. acties</label>
            <input type="number" min="1" className="form-dark" value={minActions} onChange={e => setMinActions(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="form-group" style={{ flex: '1 1 100px', marginBottom: 0 }}>
            <label>Per (min)</label>
            <input type="number" min="1" className="form-dark" value={windowMin} onChange={e => setWindowMin(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>

        {loading ? (
          <p className="text-muted text-sm">Laden...</p>
        ) : pings.length === 0 ? (
          <p className="text-muted text-sm italic">
            Geen klik-data voor {selectedUser?.full_name || 'deze medewerker'} op deze dag.
            {isToday ? '' : ' Deze registratie is nieuw (sinds 25-08-2026) - oudere dagen hebben geen klik-data.'}
          </p>
        ) : (
          <>
            <div className="stats-grid mb-4">
              <div className="stat-card glass-panel">
                <div className="number">{result.totalClicks}</div>
                <div className="label">Acties (clicks)</div>
              </div>
              <div className="stat-card glass-panel">
                <div className="number" style={{ color: 'var(--success)' }}>{fmtDuration(result.activeMs / 1000)}</div>
                <div className="label">Ingelogde tijd (actief)</div>
              </div>
              <div className="stat-card glass-panel">
                <div className="number" style={{ color: 'var(--text-muted)' }}>{fmtDuration(result.idleMs / 1000)}</div>
                <div className="label">Idle (binnen spanne)</div>
              </div>
            </div>

            <p className="text-muted" style={{ fontSize: '0.78rem', marginBottom: '10px' }}>
              Eerste actie {new Date(result.firstTs).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} - laatste
              actie {new Date(result.lastTs).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} (spanne {fmtDuration(result.spanMs / 1000)}).
              Een blok van {windowMin} min telt als "werkend" bij {minActions}+ acties.
            </p>

            <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
              {result.blocks.length === 0 ? (
                <p className="text-muted text-sm italic">Geen enkel {windowMin}-minutenblok haalde de drempel van {minActions} acties.</p>
              ) : (
                <table className="table">
                  <thead><tr><th>Werkblok</th><th>Duur</th><th className="text-right">Acties</th></tr></thead>
                  <tbody>
                    {result.blocks.map((b, i) => (
                      <tr key={i}>
                        <td>{new Date(b.start).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} - {new Date(b.end).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>{fmtDuration((b.end - b.start) / 1000)}</td>
                        <td className="text-right">{b.clicks}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  )
}
