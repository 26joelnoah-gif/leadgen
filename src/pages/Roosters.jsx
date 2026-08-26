import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Home, MessageSquare, Users as UsersIcon, CalendarDays, Send, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import Header from '../components/Header'

// v44: Roosters - wekelijkse beschikbaarheid. Elke medewerker vult voor
// zichzelf per dag aan/uit + van/tot + notitie in en dient de week in.
// Admin en managers met can_manage_team zien daarnaast een teamoverzicht.

const DAYS = [
  { key: 0, label: 'Maandag' },
  { key: 1, label: 'Dinsdag' },
  { key: 2, label: 'Woensdag' },
  { key: 3, label: 'Donderdag' },
  { key: 4, label: 'Vrijdag' },
  { key: 5, label: 'Zaterdag' },
  { key: 6, label: 'Zondag' },
]

function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const isoDay = d.getDay() === 0 ? 7 : d.getDay() // maandag=1 ... zondag=7
  d.setDate(d.getDate() - (isoDay - 1))
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toISODate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function weekLabel(monday) {
  const sunday = addDays(monday, 6)
  const fmt = (d) => d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return `${fmt(monday)} - ${fmt(sunday)} ${sunday.getFullYear()}`
}

function emptyRows() {
  return DAYS.map(d => ({
    day_of_week: d.key,
    available: false,
    start_time: '',
    end_time: '',
    note: '',
    noteOpen: false
  }))
}

export default function Roosters() {
  const { user, profile, isDemoMode } = useAuth()
  const toast = useToast()

  const [weekMonday, setWeekMonday] = useState(() => mondayOf(new Date()))
  const weekStartISO = useMemo(() => toISODate(weekMonday), [weekMonday])

  const [rows, setRows] = useState(emptyRows)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [submittedAt, setSubmittedAt] = useState(null)

  const isAdmin = profile?.role === 'admin'
  const isManagerRole = profile?.role === 'manager'
  const isRecruiterRole = profile?.role === 'recruiter'
  // v46: iedereen ziet alleen zijn eigen rooster; admin, elke manager en
  // recruitment zien het rooster van iedereen binnen de eigen organisatie
  // (RLS op public.availability dwingt dit ook af, dit is alleen de UI-gate).
  const canSeeTeam = isAdmin || isManagerRole || isRecruiterRole

  const [view, setView] = useState('mine') // 'mine' | 'team'
  const [teamProfiles, setTeamProfiles] = useState([])
  const [teamAvailability, setTeamAvailability] = useState([])
  const [teamLoading, setTeamLoading] = useState(false)

  const fetchMine = useCallback(async () => {
    if (!user?.id || isDemoMode) { setLoading(false); return }
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('availability')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', weekStartISO)
      if (error) throw error
      const base = emptyRows()
      let latestSubmit = null
      for (const row of (data || [])) {
        const idx = base.findIndex(r => r.day_of_week === row.day_of_week)
        if (idx >= 0) {
          base[idx] = {
            day_of_week: row.day_of_week,
            available: !!row.available,
            start_time: row.start_time ? row.start_time.slice(0, 5) : '',
            end_time: row.end_time ? row.end_time.slice(0, 5) : '',
            note: row.note || '',
            noteOpen: !!row.note
          }
        }
        if (row.submitted_at && (!latestSubmit || row.submitted_at > latestSubmit)) latestSubmit = row.submitted_at
      }
      setRows(base)
      setSubmittedAt(latestSubmit)
    } catch (err) {
      console.error('Beschikbaarheid ophalen mislukt:', err)
      toast('Beschikbaarheid ophalen mislukt', 'error')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, weekStartISO, isDemoMode])

  useEffect(() => { fetchMine() }, [fetchMine])

  const fetchTeam = useCallback(async () => {
    if (!canSeeTeam || isDemoMode) return
    setTeamLoading(true)
    try {
      const { data: profs, error: profErr } = await supabase
        .from('profiles')
        .select('id, full_name, role, is_active')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
      if (profErr) throw profErr
      setTeamProfiles((profs || []).filter(p => p.id !== user?.id))

      const { data: avail, error: availErr } = await supabase
        .from('availability')
        .select('*')
        .eq('week_start', weekStartISO)
      if (availErr) throw availErr
      setTeamAvailability(avail || [])
    } catch (err) {
      console.error('Teamoverzicht ophalen mislukt:', err)
      toast('Teamoverzicht ophalen mislukt', 'error')
    } finally {
      setTeamLoading(false)
    }
  }, [canSeeTeam, weekStartISO, isDemoMode, user?.id])

  useEffect(() => { if (view === 'team') fetchTeam() }, [view, fetchTeam])

  function updateRow(dayOfWeek, patch) {
    setRows(prev => prev.map(r => (r.day_of_week === dayOfWeek ? { ...r, ...patch } : r)))
  }

  async function handleSubmit() {
    if (!user?.id) return
    if (isDemoMode) { toast('Beschikbaarheid indienen werkt niet in demo-modus', 'error'); return }
    setSaving(true)
    try {
      const now = new Date().toISOString()
      const payload = rows.map(r => ({
        user_id: user.id,
        organization_id: profile?.organization_id ?? null,
        week_start: weekStartISO,
        day_of_week: r.day_of_week,
        available: r.available,
        start_time: r.available && r.start_time ? r.start_time : null,
        end_time: r.available && r.end_time ? r.end_time : null,
        note: r.note && r.note.trim() ? r.note.trim() : null,
        submitted_at: now
      }))
      const { error } = await supabase
        .from('availability')
        .upsert(payload, { onConflict: 'user_id,week_start,day_of_week' })
      if (error) throw error
      setSubmittedAt(now)
      toast('Beschikbaarheid ingediend', 'success')
    } catch (err) {
      console.error('Beschikbaarheid indienen mislukt:', err)
      toast('Indienen mislukt: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function teamCell(userId, dayOfWeek) {
    return teamAvailability.find(a => a.user_id === userId && a.day_of_week === dayOfWeek)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <Header />

      <main className="container" style={{ paddingTop: '40px', paddingBottom: '60px', maxWidth: '900px' }}>
        <motion.div initial={{ y: -12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mb-4">
          <h1 className="page-title">Roosters</h1>
          <p className="page-subtitle">Vul per week aan wanneer je beschikbaar bent om te werken.</p>
        </motion.div>

        {canSeeTeam && (
          <div className="tab-bar mb-4">
            <button className={`tab-btn ${view === 'mine' ? 'active' : ''}`} onClick={() => setView('mine')}>
              <CalendarDays size={14} /> Mijn beschikbaarheid
            </button>
            <button className={`tab-btn ${view === 'team' ? 'active' : ''}`} onClick={() => setView('team')}>
              <UsersIcon size={14} /> Teamoverzicht
            </button>
          </div>
        )}

        {/* Weeknavigatie */}
        <div className="glass-panel card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <button className="btn btn-sm btn-outline" style={{ padding: '8px', minWidth: 'auto' }} onClick={() => setWeekMonday(w => addDays(w, -7))} title="Vorige week">
            <ChevronLeft size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{weekLabel(weekMonday)}</span>
            <button className="btn btn-sm btn-outline" style={{ padding: '6px', minWidth: 'auto' }} onClick={() => setWeekMonday(mondayOf(new Date()))} title="Deze week">
              <Home size={14} />
            </button>
          </div>
          <button className="btn btn-sm btn-outline" style={{ padding: '8px', minWidth: 'auto' }} onClick={() => setWeekMonday(w => addDays(w, 7))} title="Volgende week">
            <ChevronRight size={16} />
          </button>
        </div>

        {view === 'mine' && (
          <>
            {loading ? (
              <div className="card glass-panel" style={{ padding: '30px', textAlign: 'center', color: 'var(--text-muted)' }}>Laden...</div>
            ) : (
              <div className="card glass-panel" style={{ padding: '6px 0' }}>
                {rows.map((row, idx) => {
                  const day = DAYS.find(d => d.key === row.day_of_week)
                  return (
                    <div
                      key={row.day_of_week}
                      style={{
                        padding: '16px 20px',
                        borderBottom: idx < rows.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <label className="rooster-switch" style={{ flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={row.available}
                            onChange={e => updateRow(row.day_of_week, { available: e.target.checked })}
                          />
                          <span className="rooster-switch-track"><span className="rooster-switch-thumb" /></span>
                        </label>

                        <div style={{ minWidth: '90px', fontWeight: 600, color: 'var(--text-primary)' }}>{day.label}</div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: row.available ? 1 : 0.4 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Van</span>
                          <input
                            type="time"
                            className="form-dark"
                            disabled={!row.available}
                            value={row.start_time}
                            onChange={e => updateRow(row.day_of_week, { start_time: e.target.value })}
                            style={{ padding: '6px 8px', width: '110px' }}
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tot</span>
                          <input
                            type="time"
                            className="form-dark"
                            disabled={!row.available}
                            value={row.end_time}
                            onChange={e => updateRow(row.day_of_week, { end_time: e.target.value })}
                            style={{ padding: '6px 8px', width: '110px' }}
                          />
                        </div>

                        <button
                          type="button"
                          className="btn btn-sm btn-outline"
                          style={{ padding: '7px', minWidth: 'auto', marginLeft: 'auto', color: row.note ? 'var(--primary)' : undefined }}
                          onClick={() => updateRow(row.day_of_week, { noteOpen: !row.noteOpen })}
                          title="Notitie"
                        >
                          <MessageSquare size={14} />
                        </button>
                      </div>

                      {row.noteOpen && (
                        <div style={{ marginTop: '10px', marginLeft: '54px' }}>
                          <input
                            type="text"
                            className="form-dark"
                            placeholder="Notitie voor deze dag (optioneel)"
                            value={row.note}
                            onChange={e => updateRow(row.day_of_week, { note: e.target.value })}
                            style={{ width: '100%', maxWidth: '420px', padding: '8px 10px' }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ marginTop: '18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <button className="btn btn-primary btn-block" style={{ maxWidth: '420px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={handleSubmit} disabled={saving || loading}>
                {saving ? 'Bezig...' : (<><Send size={15} /> Beschikbaarheid indienen</>)}
              </button>
              {submittedAt && (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={12} /> Laatst ingediend {new Date(submittedAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </>
        )}

        {view === 'team' && canSeeTeam && (
          <div className="card glass-panel" style={{ padding: '16px', overflowX: 'auto' }}>
            {teamLoading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Laden...</div>
            ) : teamProfiles.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Geen teamleden gevonden.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase' }}>Naam</th>
                    {DAYS.map(d => (
                      <th key={d.key} style={{ textAlign: 'center', padding: '8px 6px', color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                        {d.label.slice(0, 2)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamProfiles.map(p => (
                    <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{p.full_name || '-'}</td>
                      {DAYS.map(d => {
                        const cell = teamCell(p.id, d.key)
                        const available = cell?.available
                        return (
                          <td key={d.key} style={{ padding: '6px', textAlign: 'center' }}>
                            {available ? (
                              <div title={cell?.note || ''} style={{
                                display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                                background: 'var(--accent-soft, rgba(59,130,246,0.12))', color: 'var(--accent, #3B82F6)',
                                borderRadius: '8px', padding: '4px 6px', fontSize: '0.7rem', fontWeight: 700, minWidth: '58px'
                              }}>
                                <span>{cell.start_time ? cell.start_time.slice(0, 5) : '?'}</span>
                                <span style={{ opacity: 0.7 }}>{cell.end_time ? cell.end_time.slice(0, 5) : '?'}</span>
                              </div>
                            ) : (
                              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      <style>{`
        .rooster-switch { position: relative; display: inline-block; width: 42px; height: 24px; cursor: pointer; }
        .rooster-switch input { position: absolute; opacity: 0; width: 100%; height: 100%; margin: 0; cursor: pointer; }
        .rooster-switch-track {
          position: absolute; inset: 0; background: var(--bg-elevated); border: 1px solid var(--border);
          border-radius: 999px; transition: background 0.15s, border-color 0.15s;
        }
        .rooster-switch-thumb {
          position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
          background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); transition: transform 0.15s;
        }
        .rooster-switch input:checked + .rooster-switch-track { background: var(--accent, #3B82F6); border-color: var(--accent, #3B82F6); }
        .rooster-switch input:checked + .rooster-switch-track .rooster-switch-thumb { transform: translateX(18px); }
        .rooster-switch input:focus-visible + .rooster-switch-track { outline: 2px solid var(--primary); outline-offset: 2px; }
      `}</style>
    </div>
  )
}
