import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MousePointerClick, Flame, ListChecks } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// v82: mailteller voor de beller op zijn dashboard. Alleen zichtbaar als hij
// ooit een mail via de Mailingservice stuurde (anders zien energie-bellers
// een lege kaart). Leest mailservice_logs (eigen rijen via RLS), de
// terugkoppeling van de bron (lead_mail_status) en de eigen mailinglijst
// (mail_queue). Live via realtime op lead_mail_status.
const DONE_STATUSES = ['deal', 'bruto_deal', 'afspraak_gemaakt', 'geen_interesse', 'verkeerd_nummer', 'cold', 'blacklist', 'monteur_ingepland', 'wil_annuleren']

function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d }
function startOfWeek() {
  const d = startOfToday()
  const day = (d.getDay() + 6) % 7 // maandag = 0
  d.setDate(d.getDate() - day)
  return d
}

export default function MyMailStats() {
  const { user, isDemoMode } = useAuth()
  const [stats, setStats] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user?.id || isDemoMode) return
    const ch = supabase.channel(`my-mail-stats-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_mail_status' }, () => setTick(t => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mail_queue' }, () => setTick(t => t + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user?.id, isDemoMode])

  useEffect(() => {
    if (!user?.id || isDemoMode) return
    let alive = true
    async function load() {
      const { data: logs } = await supabase
        .from('mailservice_logs')
        .select('id, created_at, lead_id, mail_type, ok')
        .eq('agent_id', user.id).eq('ok', true)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (!alive) return
      if (!logs || logs.length === 0) { setStats(null); return }
      const today = startOfToday().toISOString()
      const week = startOfWeek().toISOString()
      const vandaag = logs.filter(l => l.created_at >= today).length
      const dezeWeek = logs.filter(l => l.created_at >= week).length
      const leadIds = [...new Set(logs.map(l => l.lead_id).filter(Boolean))]

      let geklikt = 0, warm = 0, getekend = 0
      for (let i = 0; i < leadIds.length; i += 200) {
        const slice = leadIds.slice(i, i + 200)
        const [{ data: st }, { data: ld }] = await Promise.all([
          supabase.from('lead_mail_status').select('lead_id, status_rank').in('lead_id', slice),
          supabase.from('leads').select('id, status').in('id', slice)
        ])
        const statusOf = Object.fromEntries((ld || []).map(l => [l.id, l.status]))
        const best = {}
        ;(st || []).forEach(r => { best[r.lead_id] = Math.max(best[r.lead_id] || 0, r.status_rank || 0) })
        Object.entries(best).forEach(([id, r]) => {
          if (r >= 2) geklikt++
          // v88: warm = de offerte staat OPEN (rang 3), niet alleen geklikt (rang 2)
          if (r === 3 && !DONE_STATUSES.includes(statusOf[id])) warm++
          if (r >= 4) getekend++
        })
      }
      const { count: gepland } = await supabase
        .from('mail_queue').select('id', { count: 'exact', head: true })
        .eq('agent_id', user.id).eq('status', 'open')
      if (!alive) return
      setStats({ totaal: logs.length, vandaag, dezeWeek, leads: leadIds.length, geklikt, warm, getekend, gepland: gepland || 0 })
    }
    load().catch(err => console.warn('Mailteller laden mislukt:', err))
    return () => { alive = false }
  }, [user?.id, isDemoMode, tick])

  if (!stats) return null

  const items = [
    { label: 'Mails vandaag', val: stats.vandaag, sub: `${stats.dezeWeek} deze week, ${stats.totaal} totaal`, icon: Mail, color: 'var(--primary)' },
    { label: 'Link geklikt', val: stats.geklikt, sub: `van ${stats.leads} gemailde leads${stats.getekend ? `, ${stats.getekend} getekend` : ''}`, icon: MousePointerClick, color: 'var(--info)' },
    { label: 'Warme leads', val: stats.warm, sub: stats.warm ? 'Bel die eerst' : 'Nog niemand bij de offerte', icon: Flame, color: 'var(--secondary)', to: '/leads' },
    { label: 'Nog te versturen', val: stats.gepland, sub: 'in je mailinglijst', icon: ListChecks, color: 'var(--text-muted)', to: '/leads' }
  ]

  return (
    <div className="card" style={{ marginTop: '24px' }}>
      <div className="card-header">
        <span className="card-title"><Mail size={18} /> Mijn mails</span>
        <Link to="/leads" className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 700 }}>Naar de leads</Link>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {items.map(it => {
          const inner = (
            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-elevated)', borderLeft: `3px solid ${it.color}`, height: '100%' }}>
              <div className="flex items-center gap-2" style={{ color: it.color, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <it.icon size={14} /> {it.label}
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: it.val > 0 && it.label === 'Warme leads' ? 'var(--secondary)' : 'var(--text-primary)', lineHeight: 1.2, marginTop: '4px' }}>{it.val}</div>
              <div className="text-muted" style={{ fontSize: '0.72rem' }}>{it.sub}</div>
            </div>
          )
          return it.to ? <Link key={it.label} to={it.to} style={{ textDecoration: 'none' }}>{inner}</Link> : <div key={it.label}>{inner}</div>
        })}
      </div>
    </div>
  )
}
