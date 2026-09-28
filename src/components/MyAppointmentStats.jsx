// v110: blok "Mijn afspraken" op het beller-dashboard. Toont zichzelf pas zodra
// iemand een afspraak heeft ingepland (leads.appointment_by), zodat bellers in
// projecten zonder afspraken geen lege kaart zien.
// De hele lijst met uitkomsten staat op /mijn-afspraken.
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CalendarCheck, Clock, Trophy, Euro } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { afspraakStand, euro } from '../lib/appointments'

export default function MyAppointmentStats() {
  const { user, isDemoMode } = useAuth()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!user?.id || isDemoMode) return
    let alive = true
    async function load() {
      const { data } = await supabase
        .from('leads')
        .select('id, appointment_at, appointment_outcome, appointment_commission')
        .eq('appointment_by', user.id)
        .not('appointment_at', 'is', null)
        .is('deleted_at', null)
        .order('appointment_at', { ascending: false })
        .limit(500)
      if (!alive) return
      if (!data || data.length === 0) { setStats(null); return }
      let wacht = 0, deals = 0, bedrag = 0, gepland = 0
      data.forEach(l => {
        const stand = afspraakStand(l)
        if (stand.key === 'wacht') wacht++
        if (stand.key === 'gepland') gepland++
        if (stand.deal) deals++
        if (l.appointment_commission != null) bedrag += Number(l.appointment_commission)
      })
      setStats({ totaal: data.length, wacht, deals, gepland, bedrag: Math.round(bedrag * 100) / 100 })
    }
    load().catch(err => console.warn('Afsprakenteller laden mislukt:', err))
    return () => { alive = false }
  }, [user?.id, isDemoMode])

  if (!stats) return null

  const items = [
    { label: 'Ingepland', val: stats.gepland, sub: `${stats.totaal} in totaal`, icon: CalendarCheck, color: 'var(--primary)' },
    { label: 'Wacht op uitkomst', val: stats.wacht, sub: stats.wacht ? 'De accountmanager moet nog afboeken' : 'Alles is afgeboekt', icon: Clock, color: 'var(--secondary)' },
    { label: 'Deal of betaald', val: stats.deals, sub: 'uit jouw afspraken', icon: Trophy, color: 'var(--success, #10B981)' },
    { label: 'Uitbetaling', val: euro(stats.bedrag) || '€ 0,00', icon: Euro, color: 'var(--text-muted)', sub: 'wat er tot nu toe vaststaat' },
  ]

  return (
    <div className="card" style={{ marginTop: '24px' }}>
      <div className="card-header">
        <span className="card-title"><CalendarCheck size={18} /> Mijn afspraken</span>
        <Link to="/mijn-afspraken" className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Bekijk alles</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {items.map(it => (
          <Link key={it.label} to="/mijn-afspraken" style={{ textDecoration: 'none' }}>
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-elevated)', borderLeft: `3px solid ${it.color}`, height: '100%' }}>
              <div className="flex items-center gap-2" style={{ color: it.color, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <it.icon size={14} /> {it.label}
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.2, marginTop: '4px' }}>{it.val}</div>
              <div className="text-muted" style={{ fontSize: '0.72rem' }}>{it.sub}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
