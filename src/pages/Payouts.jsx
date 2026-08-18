import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DollarSign, Zap, Users, CheckCircle, Clock, AlertCircle, Download, Edit2, X, Check, Calendar } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getSettings } from '../utils/settingsUtils'
import Logo from '../components/Logo'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Payouts() {
  const { profile, signOut, sessionCallCount } = useAuth()
  const [users, setUsers] = useState([])
  const [payouts, setPayouts] = useState({})
  const [leadCounts, setLeadCounts] = useState({}) // { userId: { deals, appointments, pendingAppointments } }
  const [pendingAppointments, setPendingAppointments] = useState([]) // afspraken die nog beoordeeld moeten worden
  const [rules, setRules] = useState(null) // payout_rules van de organisatie
  const [monthlyCalls, setMonthlyCalls] = useState({}) // { userId: calls deze maand }
  const [loading, setLoading] = useState(true)
  const [editingUser, setEditingUser] = useState(null)
  const [systemSettings] = useState(getSettings)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      const monthStartStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}-01`

      const [usersRes, payoutsRes, leadsRes, rulesRes, statsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('payouts').select('*').order('created_at', { ascending: false }),
        supabase.from('leads').select('id, name, assigned_to, status, appointment_approved'),
        supabase.from('payout_rules').select('*').limit(1),
        supabase.from('agent_daily_stats').select('agent_id, calls').gte('dag', monthStartStr)
      ])

      if (usersRes.data) setUsers(usersRes.data)

      if (payoutsRes.data) {
        const payoutsByUser = {}
        payoutsRes.data.forEach(p => {
          payoutsByUser[p.user_id] = p
        })
        setPayouts(payoutsByUser)
      }

      if (rulesRes.data?.[0]) setRules(rulesRes.data[0])

      // Calls per user deze maand (voor uitbetalings-target)
      if (statsRes.data) {
        const callTotals = {}
        statsRes.data.forEach(row => {
          callTotals[row.agent_id] = (callTotals[row.agent_id] || 0) + Number(row.calls || 0)
        })
        setMonthlyCalls(callTotals)
      }

      // Tel deals en NETTO afspraken per user; verzamel afspraken die beoordeling nodig hebben
      if (leadsRes.data) {
        const counts = {}
        const pending = []
        leadsRes.data.forEach(lead => {
          if (lead.status === 'afspraak_gemaakt' && (lead.appointment_approved === null || lead.appointment_approved === undefined)) {
            pending.push(lead)
          }
          if (!lead.assigned_to) return
          if (!counts[lead.assigned_to]) {
            counts[lead.assigned_to] = { deals: 0, appointments: 0, pendingAppointments: 0 }
          }
          if (lead.status === 'deal') counts[lead.assigned_to].deals++
          if (lead.status === 'afspraak_gemaakt') {
            if (lead.appointment_approved === true) counts[lead.assigned_to].appointments++
            else if (lead.appointment_approved === null || lead.appointment_approved === undefined) counts[lead.assigned_to].pendingAppointments++
          }
        })
        setLeadCounts(counts)
        setPendingAppointments(pending)
      }
    } catch (err) {
      console.error('Error fetching payouts data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Netto afspraak goedkeuren of afkeuren (no-show / niet gekwalificeerd)
  async function reviewAppointment(leadId, approved) {
    const { error } = await supabase
      .from('leads')
      .update({
        appointment_approved: approved,
        appointment_approved_at: new Date().toISOString(),
        appointment_approved_by: profile?.id
      })
      .eq('id', leadId)

    if (error) {
      console.error('Beoordeling opslaan mislukt:', error.message)
      return
    }
    const lead = pendingAppointments.find(l => l.id === leadId)
    setPendingAppointments(prev => prev.filter(l => l.id !== leadId))
    if (lead?.assigned_to) {
      setLeadCounts(prev => {
        const cur = prev[lead.assigned_to] || { deals: 0, appointments: 0, pendingAppointments: 0 }
        return {
          ...prev,
          [lead.assigned_to]: {
            ...cur,
            appointments: cur.appointments + (approved ? 1 : 0),
            pendingAppointments: Math.max(0, cur.pendingAppointments - 1)
          }
        }
      })
    }
  }

  // Vergoedingen: payout_rules van de owner is leidend, localStorage is fallback
  const defaultDealRate = rules ? Number(rules.rate_per_deal) : systemSettings.dealValue
  const defaultAppointmentRate = rules ? Number(rules.rate_per_appointment) : systemSettings.appointmentValue
  const minCallsForPayout = rules ? Number(rules.min_calls_for_payout) : 0

  function getUserLeads(userId) {
    // This would be fetched from leads in real implementation
    return []
  }

  function getStatusInfo(payout) {
    if (!payout) {
      return {
        label: 'Niet factureerbaar',
        color: 'var(--text-muted)',
        bgColor: 'rgba(255,255,255,0.05)',
        step: 0
      }
    }

    if (payout.payout_status === 'paid') {
      return {
        label: 'BETAALD',
        color: 'var(--success)',
        bgColor: 'rgba(16, 185, 129, 0.15)',
        step: 5
      }
    }

    if (payout.is_billable && payout.billable_approved_at) {
      return {
        label: `Factuur goedgekeurd - ${payout.payment_term_days} dagen termijn`,
        color: 'var(--info)',
        bgColor: 'rgba(59, 130, 246, 0.15)',
        step: 2
      }
    }

    if (payout.is_billable) {
      return {
        label: 'Wachten op goedkeuring',
        color: 'var(--warning)',
        bgColor: 'rgba(245, 158, 11, 0.15)',
        step: 1
      }
    }

    return {
      label: 'Niet factureerbaar',
      color: 'var(--text-muted)',
      bgColor: 'rgba(255,255,255,0.05)',
      step: 0
    }
  }

  async function toggleBillable(userId) {
    const existing = payouts[userId]
    const newIsBillable = !existing?.is_billable

    if (existing) {
      const { error } = await supabase
        .from('payouts')
        .update({
          is_billable: newIsBillable,
          billable_approved_at: newIsBillable ? new Date().toISOString() : null,
          payout_status: newIsBillable ? 'approved' : 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)

      if (!error) {
        setPayouts(prev => ({
          ...prev,
          [userId]: {
            ...prev[userId],
            is_billable: newIsBillable,
            billable_approved_at: newIsBillable ? new Date().toISOString() : null,
            payout_status: newIsBillable ? 'approved' : 'pending'
          }
        }))
      }
    } else {
      // Create new payout record
      const { data, error } = await supabase
        .from('payouts')
        .insert({
          user_id: userId,
          period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          period_end: new Date().toISOString().split('T')[0],
          organization_id: profile?.organization_id ?? null,
          deals_count: 0,
          appointments_count: 0,
          deal_payout: defaultDealRate,
          appointment_payout: defaultAppointmentRate,
          is_billable: newIsBillable,
          billable_approved_at: newIsBillable ? new Date().toISOString() : null,
          payout_status: 'pending',
          payment_term_days: systemSettings.paymentTermDays || 14
        })
        .select()
        .single()

      if (!error && data) {
        setPayouts(prev => ({ ...prev, [userId]: data }))
      }
    }
  }

  async function updatePayoutField(userId, field, value) {
    const existing = payouts[userId]
    if (!existing) return

    const { error } = await supabase
      .from('payouts')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', existing.id)

    if (!error) {
      setPayouts(prev => ({
        ...prev,
        [userId]: { ...prev[userId], [field]: value }
      }))
    }
  }

  async function markAsPaid(userId) {
    const existing = payouts[userId]
    if (!existing) return

    const { error } = await supabase
      .from('payouts')
      .update({
        payout_status: 'paid',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)

    if (!error) {
      setPayouts(prev => ({
        ...prev,
        [userId]: { ...prev[userId], payout_status: 'paid', paid_at: new Date().toISOString() }
      }))
    }
  }

  return (
    <div className="payouts-page" style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav" style={{ marginLeft: '40px', flex: 1 }}>
            <Link to="/">Dashboard</Link>
            <Link to="/tba">TBA's</Link>
            <Link to="/earnings">Verdiensten</Link>
            {profile?.role === 'admin' && <Link to="/admin/telemetry">Telemetrie</Link>}
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            {profile?.role === 'admin' && <Link to="/admin/reports">Rapportage</Link>}
            {profile?.role === 'admin' && <Link to="/admin/payouts" className="active">Payouts</Link>}
          </nav>
          <div className="header-actions">
            <div className="flex items-center gap-2 mr-3" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px' }}>
              <Zap size={14} style={{ color: 'var(--secondary)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{sessionCallCount} <span style={{ opacity: 0.6, fontWeight: 400 }}>calls</span></span>
            </div>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '60px', paddingBottom: '60px' }}>
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="page-header flex justify-between items-end mb-4"
        >
          <div>
            <h1>Payouts Beheer</h1>
            <p style={{ color: 'var(--text-muted)' }}>Beheer facturatie en betalingen per medewerker - April 2026</p>
          </div>
          <div className="flex gap-2 items-center">
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Deal: €{defaultDealRate} | Netto afspraak: €{defaultAppointmentRate}
              {minCallsForPayout > 0 && ` | Beltarget: ${minCallsForPayout} calls/maand`}
            </span>
            <Link to="/admin" style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>Tarieven aanpassen →</Link>
          </div>
        </motion.div>

        {/* TE BEOORDELEN AFSPRAKEN — netto of niet? */}
        {pendingAppointments.length > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="card glass-panel mb-4"
            style={{ padding: '20px', borderLeft: '4px solid var(--warning)' }}
          >
            <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: 'var(--warning)' }} />
              Te beoordelen afspraken ({pendingAppointments.length})
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Keur goed als de afspraak echt heeft plaatsgevonden (netto) — alleen netto afspraken tellen mee voor uitbetaling.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pendingAppointments.map(lead => {
                const setter = users.find(u => u.id === lead.assigned_to)
                return (
                  <div key={lead.id} className="flex justify-between items-center" style={{ background: 'var(--bg-dark)', padding: '10px 16px', borderRadius: '8px' }}>
                    <div>
                      <span style={{ fontWeight: 700 }}>{lead.name}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '10px' }}>
                        door {setter?.full_name || 'Onbekend'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => reviewAppointment(lead.id, true)} className="btn btn-sm" style={{ background: 'var(--success)', color: 'white', fontWeight: 700 }}>
                        <Check size={14} /> Netto
                      </button>
                      <button onClick={() => reviewAppointment(lead.id, false)} className="btn btn-sm btn-outline" style={{ color: 'var(--danger, #EF4444)' }}>
                        <X size={14} /> Afkeuren
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Status Legend */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex gap-4 mb-4 p-3 glass-panel"
          style={{ background: 'var(--bg-elevated)', borderRadius: '12px', flexWrap: 'wrap' }}
        >
          <div className="flex items-center gap-2">
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--success)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Factureerbaar</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--info)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Factuur goedgekeurd</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--warning)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Payout pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#eab308' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Termijn wachten</span>
          </div>
          <div className="flex items-center gap-2">
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--success)' }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>BETAALD</span>
          </div>
        </motion.div>

        {/* Per User Payout Cards */}
        {loading ? (
          <LoadingSpinner size="large" />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
            {users.map((user, index) => {
              const payout = payouts[user.id]
              const counts = leadCounts[user.id] || { deals: 0, appointments: 0, pendingAppointments: 0 }
              const statusInfo = getStatusInfo(payout)
              const totalAmount = (counts.deals || 0) * (payout?.deal_payout || defaultDealRate) +
                (counts.appointments || 0) * (payout?.appointment_payout || defaultAppointmentRate)
              const userCalls = monthlyCalls[user.id] || 0
              const belowCallTarget = minCallsForPayout > 0 && userCalls < minCallsForPayout

              return (
                <motion.div
                  key={user.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="card glass-panel"
                  style={{ padding: '20px', borderLeft: `4px solid ${statusInfo.color}` }}
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>{user.full_name}</h3>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: user.role === 'admin' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.1)',
                        color: user.role === 'admin' ? 'var(--secondary)' : 'var(--text-muted)'
                      }}>
                        {user.role}
                      </span>
                    </div>

                    {/* Status Badge */}
                    <div style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      background: statusInfo.bgColor,
                      color: statusInfo.color,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      {payout?.is_billable && (
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: 'var(--success)',
                          animation: 'pulse 2s infinite'
                        }} />
                      )}
                      {statusInfo.label}
                    </div>
                  </div>

                  {/* Status Progress Bar */}
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
                    {[1, 2, 3, 4, 5].map(step => (
                      <div
                        key={step}
                        style={{
                          flex: 1,
                          height: '6px',
                          borderRadius: '3px',
                          background: step <= statusInfo.step ? statusInfo.color : 'rgba(255,255,255,0.1)'
                        }}
                      />
                    ))}
                  </div>

                  {/* Auto-synced counts from leads table */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Deals
                      </label>
                      <div className="flex items-center gap-2">
                        <span style={{
                          width: '60px',
                          padding: '8px',
                          borderRadius: '6px',
                          background: 'var(--bg-dark)',
                          color: 'white',
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'inline-block'
                        }}>{counts.deals || 0}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>× €{payout?.deal_payout || defaultDealRate}</span>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Netto afspraken{counts.pendingAppointments > 0 && <span style={{ color: 'var(--warning)' }}> (+{counts.pendingAppointments} te beoordelen)</span>}
                      </label>
                      <div className="flex items-center gap-2">
                        <span style={{
                          width: '60px',
                          padding: '8px',
                          borderRadius: '6px',
                          background: 'var(--bg-dark)',
                          color: 'white',
                          fontWeight: 700,
                          textAlign: 'center',
                          display: 'inline-block'
                        }}>{counts.appointments || 0}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>× €{payout?.appointment_payout || defaultAppointmentRate}</span>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Per deal (€)
                      </label>
                      {profile?.role === 'admin' ? (
                        <input
                          type="number"
                          min="0"
                          value={payout?.deal_payout || defaultDealRate}
                          onChange={(e) => updatePayoutField(user.id, 'deal_payout', parseFloat(e.target.value) || 0)}
                          style={{
                            width: '80px',
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-dark)',
                            color: 'white'
                          }}
                        />
                      ) : (
                        <span style={{ color: 'white', fontWeight: 600 }}>€{payout?.deal_payout || defaultDealRate}</span>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                        Per afspraak (€)
                      </label>
                      {profile?.role === 'admin' ? (
                        <input
                          type="number"
                          min="0"
                          value={payout?.appointment_payout || defaultAppointmentRate}
                          onChange={(e) => updatePayoutField(user.id, 'appointment_payout', parseFloat(e.target.value) || 0)}
                          style={{
                            width: '80px',
                            padding: '8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-dark)',
                            color: 'white'
                          }}
                        />
                      ) : (
                        <span style={{ color: 'white', fontWeight: 600 }}>€{payout?.appointment_payout || defaultAppointmentRate}</span>
                      )}
                    </div>
                  </div>

                  {/* Beltarget check */}
                  {minCallsForPayout > 0 && (
                    <div className="flex items-center gap-2 p-2 mb-3" style={{
                      background: belowCallTarget ? 'rgba(245, 158, 11, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                      borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
                      color: belowCallTarget ? 'var(--warning)' : 'var(--success)'
                    }}>
                      {belowCallTarget ? <AlertCircle size={14} /> : <CheckCircle size={14} />}
                      {belowCallTarget
                        ? `Beltarget niet gehaald: ${userCalls}/${minCallsForPayout} calls deze maand`
                        : `Beltarget gehaald: ${userCalls}/${minCallsForPayout} calls`}
                    </div>
                  )}

                  {/* Total */}
                  <div className="flex justify-between items-center p-3" style={{ background: 'var(--bg-dark)', borderRadius: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Totaal</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--secondary)' }}>€{totalAmount}</span>
                  </div>

                  {/* Actions - Admin Only */}
                  {profile?.role === 'admin' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleBillable(user.id)}
                        className={`btn btn-sm ${payout?.is_billable ? 'btn-secondary' : 'btn-outline'}`}
                        style={{ flex: 1 }}
                      >
                        {payout?.is_billable ? (
                          <>
                            <CheckCircle size={14} /> Factureerbaar
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} /> Make Billable
                          </>
                        )}
                      </button>

                      {payout?.is_billable && payout?.billable_approved_at && (
                        <button
                          onClick={() => markAsPaid(user.id)}
                          className="btn btn-sm btn-outline"
                          style={{ flex: 1 }}
                          disabled={payout?.payout_status === 'paid'}
                        >
                          <DollarSign size={14} /> Uitbetalen
                        </button>
                      )}
                    </div>
                  )}

                  {/* Payment Term Setting */}
                  {payout?.is_billable && (
                    <div className="mt-3 flex items-center gap-2">
                      <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Termijn:</span>
                      <input
                        type="number"
                        min="1"
                        max="90"
                        value={payout?.payment_term_days || 14}
                        onChange={(e) => updatePayoutField(user.id, 'payment_term_days', parseInt(e.target.value) || 14)}
                        style={{
                          width: '50px',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-dark)',
                          color: 'white',
                          fontSize: '0.8rem'
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>dagen</span>
                    </div>
                  )}

                  {/* Admin Status Selector */}
                  {profile?.role === 'admin' && payout && (
                    <div className="mt-3 flex items-center gap-2">
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status:</span>
                      <select
                        value={payout.payout_status || 'pending'}
                        onChange={(e) => updatePayoutField(user.id, 'payout_status', e.target.value)}
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-dark)',
                          color: payout.payout_status === 'paid' ? 'var(--success)' : 'white',
                          fontSize: '0.8rem',
                          fontWeight: 600
                        }}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Goedgekeurd</option>
                        <option value="paid">Betaald</option>
                      </select>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}

        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .payouts-page { min-height: 100vh; background: var(--bg-dark); }
        `}</style>
      </main>
    </div>
  )
}