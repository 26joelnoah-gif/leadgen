// v144: blok "Vandaag opvolgen" op het dashboard. Laat zien hoeveel
// terugbelafspraken en opvolgingen vandaag gebeld moeten worden en hoeveel er
// te laat zijn. Admin en manager zien het per persoon, plus wat er vrij in de
// leadlijst ligt. Data uit RPC opvolg_overzicht().
// Een opvolging die 2 werkdagen te laat is gaat vanzelf terug naar de leadlijst
// (pg_cron opvolgingen_vrijgeven).
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { PhoneCall, AlertTriangle, CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

function dagenTeLaat(iso) {
  if (!iso) return null
  const d = new Date(iso); d.setHours(0, 0, 0, 0)
  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0)
  return Math.round((vandaag - d) / 86400000)
}

export default function OpvolgBlok() {
  const { user, isDemoMode } = useAuth()
  const [rijen, setRijen] = useState(null)

  useEffect(() => {
    if (!user?.id || isDemoMode) return
    let alive = true
    async function load() {
      const { data, error } = await supabase.rpc('opvolg_overzicht')
      if (!alive) return
      if (error) { console.warn('Opvolgen laden mislukt:', error.message); setRijen([]); return }
      setRijen(data || [])
    }
    load()
    const t = setInterval(() => { if (!document.hidden) load() }, 120000)
    return () => { alive = false; clearInterval(t) }
  }, [user?.id, isDemoMode])

  if (!rijen) return null
  const eigen = rijen.find(r => r.profile_id === user?.id) || { vandaag: 0, te_laat: 0 }
  const anderen = rijen.filter(r => r.profile_id !== user?.id)
  const alleenEigen = anderen.length === 0
  if (alleenEigen && eigen.vandaag === 0 && eigen.te_laat === 0) return null

  const items = [
    { label: 'Vandaag terugbellen', val: eigen.vandaag, sub: 'terugbelafspraken en opvolgingen', icon: CalendarClock, color: 'var(--warning)' },
    { label: 'Te laat', val: eigen.te_laat, sub: eigen.te_laat ? 'Na 2 werkdagen gaat hij terug naar de lijst' : 'Niets te laat, top', icon: AlertTriangle, color: eigen.te_laat ? 'var(--danger)' : 'var(--success, #10B981)' },
  ]

  return (
    <div className="card" style={{ marginTop: '24px' }}>
      <div className="card-header">
        <span className="card-title"><PhoneCall size={18} /> Vandaag opvolgen</span>
        <Link to="/leads" className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Naar leads</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {items.map(it => (
          <div key={it.label} style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-elevated)', borderLeft: `3px solid ${it.color}` }}>
            <div className="flex items-center gap-2" style={{ color: it.color, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              <it.icon size={14} /> {it.label}
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: '4px' }}>{it.val}</div>
            <div className="text-muted" style={{ fontSize: '0.72rem' }}>{it.sub}</div>
          </div>
        ))}
      </div>

      {anderen.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="text-muted" style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>Team</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr className="text-muted" style={{ textAlign: 'left', fontSize: '0.75rem' }}>
                  <th style={{ padding: '6px 8px' }}>Wie</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Vandaag</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Te laat</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Oudste</th>
                </tr>
              </thead>
              <tbody>
                {anderen.map(r => {
                  const d = dagenTeLaat(r.oudste)
                  return (
                    <tr key={r.profile_id || 'vrij'} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600, fontStyle: r.profile_id ? 'normal' : 'italic' }}>{r.naam}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{r.vandaag}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, color: r.te_laat ? 'var(--danger)' : 'var(--text-muted)' }}>{r.te_laat}</td>
                      <td className="text-muted" style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {r.te_laat && d > 0 ? `${d} dag${d === 1 ? '' : 'en'} te laat` : 'vandaag'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
