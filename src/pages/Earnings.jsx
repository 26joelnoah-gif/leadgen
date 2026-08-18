import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { DollarSign, Zap, Copy, CheckCircle, Phone, PhoneOff, Calendar, Target, Trophy, Clock } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { getSettings } from '../utils/settingsUtils'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import MobileNav from '../components/MobileNav'

// Startmoment van een prijs-periode (dag/week/maand)
function periodStart(period) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  if (period === 'week') {
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1 // maandag = start
    d.setDate(d.getDate() - day)
  } else if (period === 'month') {
    d.setDate(1)
  }
  return d
}

export default function Earnings() {
  const { user, profile, signOut, sessionCallCount, isDemoMode } = useAuth()
  const { leads } = useLeads()
  const [copied, setCopied] = useState(false)
  const [settings] = useState(getSettings)
  const [rules, setRules] = useState(null)
  const [todayCalls, setTodayCalls] = useState(0)
  const [prizes, setPrizes] = useState([])
  const [callCounts, setCallCounts] = useState({ day: 0, week: 0, month: 0 })

  useEffect(() => {
    if (!user?.id || isDemoMode) return
    let cancelled = false
    async function fetchStats() {
      try {
        const { data: ruleRows } = await supabase.from('payout_rules').select('*').limit(1)
        if (!cancelled && ruleRows?.[0]) setRules(ruleRows[0])

        // Calls per periode uit call_logs
        const counts = {}
        for (const period of ['day', 'week', 'month']) {
          const { count } = await supabase
            .from('call_logs')
            .select('id', { count: 'exact', head: true })
            .eq('agent_id', user.id)
            .gte('disposed_at', periodStart(period).toISOString())
          counts[period] = count || 0
        }
        if (!cancelled) {
          setCallCounts(counts)
          setTodayCalls(counts.day)
        }

        const { data: prizeRows } = await supabase.from('prizes').select('*').eq('active', true).order('created_at', { ascending: false })
        if (!cancelled) setPrizes(prizeRows || [])
      } catch (err) {
        console.error('Stats laden mislukt:', err)
      }
    }
    fetchStats()
    return () => { cancelled = true }
  }, [user?.id, isDemoMode])

  // Date range state - default to current month
  const now = new Date()
  const [startDate, setStartDate] = useState(() => {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  })

  // Filter leads by date range — afspraken gesplitst in netto (goedgekeurd) en pending
  const { deals, appointments, pendingAppointments } = useMemo(() => {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)

    const inRange = (l) => {
      const created = new Date(l.created_at)
      return created >= start && created <= end
    }

    const filteredDeals = leads.filter(l => l.status === 'deal' && inRange(l))
    const allAppointments = leads.filter(l => l.status === 'afspraak_gemaakt' && inRange(l))
    const netto = allAppointments.filter(l => l.appointment_approved === true)
    const pending = allAppointments.filter(l => l.appointment_approved === null || l.appointment_approved === undefined)

    return { deals: filteredDeals, appointments: netto, pendingAppointments: pending }
  }, [leads, startDate, endDate])

  const showDeals = profile?.role === 'admin' || profile?.show_deals_in_earnings !== false
  const showAppointments = profile?.role === 'admin' || profile?.show_appointments_in_earnings !== false

  // Vergoedingen van de product owner (payout_rules); localStorage als fallback
  const dealRate = rules ? Number(rules.rate_per_deal) : settings.dealValue
  const appointmentRate = rules ? Number(rules.rate_per_appointment) : settings.appointmentValue
  const dailyTarget = rules ? Number(rules.min_calls_per_day) : 0

  const dealAmount = showDeals ? deals.length * dealRate : 0
  const appointmentAmount = showAppointments ? appointments.length * appointmentRate : 0
  const totalAmount = dealAmount + appointmentAmount

  // Voortgang per prijs voor deze beller
  function prizeProgress(prize) {
    if (prize.metric === 'calls') return callCounts[prize.period] || 0
    const start = periodStart(prize.period)
    if (prize.metric === 'appointments') {
      return leads.filter(l => l.status === 'afspraak_gemaakt' && l.appointment_approved === true && new Date(l.updated_at || l.created_at) >= start).length
    }
    if (prize.metric === 'deals') {
      return leads.filter(l => l.status === 'deal' && new Date(l.updated_at || l.created_at) >= start).length
    }
    return 0
  }

  // Format period for display
  const startFormatted = new Date(startDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  const endFormatted = new Date(endDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  const periodLabel = startFormatted === endFormatted ? startFormatted : `${startFormatted} - ${endFormatted}`

  const invoiceText = `${profile?.full_name || 'Medewerker'}\nPeriode: ${periodLabel}\n\nDeals: ${deals.length} x €${dealRate} = €${dealAmount}\nNetto afspraken: ${appointments.length} x €${appointmentRate} = €${appointmentAmount}\n\nTotaal te factureren: €${totalAmount}`

  function copyInvoice() {
    navigator.clipboard.writeText(invoiceText)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="earnings-page" style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav" style={{ marginLeft: '40px', flex: 1 }}>
            <Link to="/">Dashboard</Link>
            <Link to="/tba">TBA's</Link>
            <Link to="/earnings" className="active">Verdiensten</Link>
            {profile?.role === 'admin' && <Link to="/admin/telemetry">Telemetrie</Link>}
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            {profile?.role === 'admin' && <Link to="/admin/reports">Rapportage</Link>}
          </nav>
          <MobileNav profile={profile} />
          <div className="header-actions">
            <div className="flex items-center gap-2 mr-3" style={{ background: 'rgba(232, 185, 35, 0.15)', padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--secondary)' }}>
              <Zap size={18} style={{ color: 'var(--secondary)' }} />
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'white' }}>{sessionCallCount}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>calls</span>
            </div>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '60px', paddingBottom: '60px' }}>
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-5"
        >
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
            Facturatie Overzicht
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            {profile?.full_name || 'Medewerker'} - {periodLabel}
          </p>
          <div className="flex gap-2 justify-center mt-3" style={{ flexWrap: 'wrap' }}>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-muted" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'white',
                  fontSize: '0.85rem'
                }}
              />
              <span className="text-muted">tot</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'white',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>
        </motion.div>

        {/* Dagtarget voortgang */}
        {dailyTarget > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="card glass-panel"
            style={{ maxWidth: '500px', margin: '0 auto 20px auto', padding: '20px' }}
          >
            <div className="flex justify-between items-center" style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Target size={16} style={{ color: 'var(--secondary)' }} /> DAGTARGET
              </span>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: todayCalls >= dailyTarget ? 'var(--success)' : 'white' }}>
                {todayCalls}/{dailyTarget} calls {todayCalls >= dailyTarget && '✅'}
              </span>
            </div>
            <div style={{ height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: '4px',
                width: `${Math.min(100, Math.round((todayCalls / dailyTarget) * 100))}%`,
                background: todayCalls >= dailyTarget ? 'var(--success)' : 'var(--secondary)',
                transition: 'width 0.5s ease'
              }} />
            </div>
          </motion.div>
        )}

        {/* Actieve prijzen */}
        {prizes.length > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="card glass-panel"
            style={{ maxWidth: '500px', margin: '0 auto 20px auto', padding: '20px' }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '14px' }}>
              <Trophy size={16} style={{ color: 'var(--secondary)' }} /> TE WINNEN PRIJZEN
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {prizes.map(p => {
                const progress = prizeProgress(p)
                const done = progress >= p.target_value
                const periodLabels = { day: 'vandaag', week: 'deze week', month: 'deze maand' }
                const metricLabels = { calls: 'calls', appointments: 'netto afspraken', deals: 'deals' }
                return (
                  <div key={p.id}>
                    <div className="flex justify-between items-center" style={{ marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                        🏆 {p.name}{p.reward_label && <span style={{ color: 'var(--secondary)' }}> — {p.reward_label}</span>}
                      </span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: done ? 'var(--success)' : 'var(--text-muted)' }}>
                        {progress}/{p.target_value} {done && '🎉'}
                      </span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: '3px',
                        width: `${Math.min(100, Math.round((progress / Math.max(1, p.target_value)) * 100))}%`,
                        background: done ? 'var(--success)' : 'var(--primary)',
                        transition: 'width 0.5s ease'
                      }} />
                    </div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                      {p.target_value} {metricLabels[p.metric] || p.metric} {periodLabels[p.period] || p.period}
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card glass-panel"
          style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center', padding: '40px' }}
        >
          <div style={{ marginBottom: '32px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>TOTAAL TE FACTUREREN</p>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--secondary)', lineHeight: 1 }}>
              €{totalAmount}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>{deals.length}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>DEALS</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '4px' }}>€{dealAmount}</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--info)' }}>{appointments.length}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>NETTO AFSPRAKEN</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '4px' }}>€{appointmentAmount}</div>
              {pendingAppointments.length > 0 && (
                <div style={{ fontSize: '0.7rem', color: 'var(--warning)', marginTop: '4px', fontWeight: 600 }}>
                  <Clock size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> +{pendingAppointments.length} wacht op goedkeuring
                </div>
              )}
            </div>
          </div>

          <button
            onClick={copyInvoice}
            className="btn btn-lg btn-block"
            style={{
              padding: '20px',
              borderRadius: '16px',
              fontSize: '1.1rem',
              fontWeight: 700,
              background: copied ? 'var(--success)' : 'var(--secondary)',
              color: 'var(--primary-dark)',
              border: 'none',
              gap: '12px'
            }}
          >
            {copied ? <CheckCircle size={24} /> : <Copy size={24} />}
            {copied ? 'GEKOPIEERD!' : 'KOPIEER VOOR FACTUUR'}
          </button>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '16px' }}>
            Plak dit in je factuur software
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="card glass-panel mt-4"
          style={{ maxWidth: '500px', margin: '0 auto', padding: '24px' }}
        >
          <pre style={{
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            color: 'var(--text-main)',
            whiteSpace: 'pre-wrap',
            margin: 0,
            lineHeight: 1.6
          }}>
{`${profile?.full_name || 'Medewerker'}
Periode: April 2026

Deals: ${deals.length} x €${dealRate} = €${dealAmount}
Netto afspraken: ${appointments.length} x €${appointmentRate} = €${appointmentAmount}

Totaal te factureren: €${totalAmount}`}
          </pre>
        </motion.div>
      </main>
    </div>
  )
}