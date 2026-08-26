import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { DollarSign, Zap, Users, CheckCircle, Clock, AlertCircle, Download, Edit2, X, Check, Calendar } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getSettings } from '../utils/settingsUtils'
import { effectiveSeconds } from '../utils/callTimeUtils'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'

// Seconden -> "1u 11m"
function fmtHours(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}u ${m}m`
  return `${m}m`
}

export default function Payouts() {
  const { profile } = useAuth()
  const [users, setUsers] = useState([])
  const [payouts, setPayouts] = useState({})
  const [leadCounts, setLeadCounts] = useState({}) // { userId: { [listId]: { deals, appointments, pendingAppointments } } }
  const [callSeconds, setCallSeconds] = useState({}) // { userId: { [listId]: seconds } }
  const [lists, setLists] = useState([]) // projecten incl. eigen tarieven
  const [pendingAppointments, setPendingAppointments] = useState([]) // afspraken die nog beoordeeld moeten worden
  const [rules, setRules] = useState(null) // payout_rules van de organisatie
  const [monthlyCalls, setMonthlyCalls] = useState({}) // { userId: calls in de periode }
  const [loading, setLoading] = useState(true)
  const [systemSettings] = useState(getSettings)

  // Periode: standaard de huidige maand (lokale datum, geen UTC-verschuiving)
  const toLocalDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const now = new Date()
  const [startDate, setStartDate] = useState(() => toLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [endDate, setEndDate] = useState(() => toLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)))

  useEffect(() => {
    fetchData()
  }, [startDate, endDate])

  async function fetchData() {
    setLoading(true)
    try {
      const start = new Date(`${startDate}T00:00:00`)
      const end = new Date(`${endDate}T23:59:59.999`)

      const [usersRes, payoutsRes, leadsRes, rulesRes, statsRes, listsRes, logsRes] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('payouts').select('*').order('created_at', { ascending: false }),
        supabase.from('leads').select('id, name, assigned_to, status, appointment_approved, lead_list_id, created_at'),
        supabase.from('payout_rules').select('*').limit(1),
        supabase.from('agent_daily_stats').select('agent_id, calls').gte('dag', startDate).lte('dag', endDate),
        supabase.from('lead_lists').select('id, name, rate_per_appointment, rate_per_deal, rate_per_hour'),
        supabase.from('call_logs')
          .select('agent_id, lead_list_id, duration_seconds, disposition')
          .gte('disposed_at', start.toISOString())
          .lte('disposed_at', end.toISOString())
          .limit(10000)
      ])

      if (usersRes.data) setUsers(usersRes.data)
      if (listsRes.data) setLists(listsRes.data)

      if (payoutsRes.data) {
        const payoutsByUser = {}
        payoutsRes.data.forEach(p => {
          payoutsByUser[p.user_id] = p
        })
        setPayouts(payoutsByUser)
      }

      if (rulesRes.data?.[0]) setRules(rulesRes.data[0])

      // Calls per user in de periode (voor uitbetalings-target)
      if (statsRes.data) {
        const callTotals = {}
        statsRes.data.forEach(row => {
          callTotals[row.agent_id] = (callTotals[row.agent_id] || 0) + Number(row.calls || 0)
        })
        setMonthlyCalls(callTotals)
      }

      // Beluren per user per project in de periode.
      // v24: EFFECTIEVE beltijd - per afboeking geldt een maximum
      // (zie callTimeUtils), zodat te lange gesprekken niet vol uitbetalen
      if (logsRes.data) {
        const secs = {}
        logsRes.data.forEach(log => {
          if (!log.agent_id) return
          const listKey = log.lead_list_id || 'none'
          if (!secs[log.agent_id]) secs[log.agent_id] = {}
          secs[log.agent_id][listKey] = (secs[log.agent_id][listKey] || 0) + effectiveSeconds(log.disposition, log.duration_seconds)
        })
        setCallSeconds(secs)
      }

      // Deals en NETTO afspraken per user per project (binnen de periode);
      // te beoordelen afspraken worden ALTIJD getoond, ook buiten de periode
      if (leadsRes.data) {
        const counts = {}
        const pending = []
        leadsRes.data.forEach(lead => {
          if (lead.status === 'afspraak_gemaakt' && (lead.appointment_approved === null || lead.appointment_approved === undefined)) {
            pending.push(lead)
          }
          if (!lead.assigned_to) return
          const created = new Date(lead.created_at)
          if (created < start || created > end) return
          const listKey = lead.lead_list_id || 'none'
          if (!counts[lead.assigned_to]) counts[lead.assigned_to] = {}
          if (!counts[lead.assigned_to][listKey]) {
            counts[lead.assigned_to][listKey] = { deals: 0, appointments: 0, pendingAppointments: 0 }
          }
          const c = counts[lead.assigned_to][listKey]
          if (lead.status === 'deal') c.deals++
          if (lead.status === 'afspraak_gemaakt') {
            if (lead.appointment_approved === true) c.appointments++
            else if (lead.appointment_approved === null || lead.appointment_approved === undefined) c.pendingAppointments++
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
      const listKey = lead.lead_list_id || 'none'
      setLeadCounts(prev => {
        const userCounts = { ...(prev[lead.assigned_to] || {}) }
        const cur = userCounts[listKey] || { deals: 0, appointments: 0, pendingAppointments: 0 }
        userCounts[listKey] = {
          ...cur,
          appointments: cur.appointments + (approved ? 1 : 0),
          pendingAppointments: Math.max(0, cur.pendingAppointments - 1)
        }
        return { ...prev, [lead.assigned_to]: userCounts }
      })
    }
  }

  // Vergoedingen: payout_rules van de owner is leidend, localStorage is fallback
  const defaultDealRate = rules ? Number(rules.rate_per_deal) : systemSettings.dealValue
  const defaultAppointmentRate = rules ? Number(rules.rate_per_appointment) : systemSettings.appointmentValue
  const defaultHourRate = rules ? Number(rules.rate_per_hour ?? 0) : 0
  const minCallsForPayout = rules ? Number(rules.min_calls_for_payout) : 0

  // Tarief per project; NULL-veld = standaardtarief
  const listById = {}
  lists.forEach(l => { listById[l.id] = l })
  function ratesFor(listKey) {
    const l = listById[listKey]
    return {
      appointment: l?.rate_per_appointment ?? defaultAppointmentRate,
      deal: l?.rate_per_deal ?? defaultDealRate,
      hour: l?.rate_per_hour ?? defaultHourRate
    }
  }

  // Per beller: uitsplitsing per project + totaal
  function userBreakdown(userId) {
    const countsByList = leadCounts[userId] || {}
    const secsByList = callSeconds[userId] || {}
    const listKeys = [...new Set([...Object.keys(countsByList), ...Object.keys(secsByList)])]
    const rows = listKeys.map(key => {
      const c = countsByList[key] || { deals: 0, appointments: 0, pendingAppointments: 0 }
      const seconds = secsByList[key] || 0
      const r = ratesFor(key)
      const amount = c.deals * Number(r.deal) + c.appointments * Number(r.appointment) + (seconds / 3600) * Number(r.hour)
      return {
        key,
        name: listById[key]?.name || (key === 'none' ? 'Zonder project' : 'Verwijderd project'),
        ...c, seconds, rates: r,
        amount
      }
    }).filter(row => row.deals || row.appointments || row.pendingAppointments || row.seconds)
      .sort((a, b) => b.amount - a.amount)
    const totals = rows.reduce((t, r) => ({
      deals: t.deals + r.deals,
      appointments: t.appointments + r.appointments,
      pendingAppointments: t.pendingAppointments + r.pendingAppointments,
      seconds: t.seconds + r.seconds,
      amount: t.amount + r.amount
    }), { deals: 0, appointments: 0, pendingAppointments: 0, seconds: 0, amount: 0 })
    return { rows, totals }
  }

  function getStatusInfo(payout) {
    if (!payout) {
      return {
        label: 'Niet factureerbaar',
        color: 'var(--text-muted)',
        bgColor: 'var(--bg-elevated)',
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
      bgColor: 'var(--bg-elevated)',
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
      <Header />

      <main className="container" style={{ paddingTop: '60px', paddingBottom: '60px' }}>
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="page-header flex justify-between items-end mb-4"
        >
          <div>
            <h1>Payouts Beheer</h1>
            <p style={{ color: 'var(--text-muted)' }}>Facturatie en betalingen per medewerker, uitgesplitst per project</p>
            <div className="flex gap-2 mt-2 items-center" style={{ flexWrap: 'wrap' }}>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
              <span className="text-muted">tot</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Standaard: €{defaultAppointmentRate}/afspraak · €{defaultDealRate}/deal{defaultHourRate > 0 && ` · €${defaultHourRate}/uur`}
              {minCallsForPayout > 0 && ` · beltarget ${minCallsForPayout} calls`}
            </span>
            <Link to="/admin" style={{ fontSize: '0.8rem', color: 'var(--primary)', fontWeight: 700 }}>Tarieven aanpassen →</Link>
          </div>
        </motion.div>

        {/* TE BEOORDELEN AFSPRAKEN - netto of niet? */}
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
              Keur goed als de afspraak echt heeft plaatsgevonden (netto) - alleen netto afspraken tellen mee voor uitbetaling.
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
                      <button onClick={() => reviewAppointment(lead.id, true)} className="btn btn-sm" style={{ background: 'var(--success)', color: 'var(--text-on-accent)', fontWeight: 700 }}>
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
            {users.filter(u => u.role === 'employee' && u.is_active !== false).map((user, index) => {
              const payout = payouts[user.id]
              const { rows, totals } = userBreakdown(user.id)
              const statusInfo = getStatusInfo(payout)
              const totalAmount = Math.round(totals.amount * 100) / 100
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
                        background: user.role === 'admin' ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-elevated)',
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
                          background: step <= statusInfo.step ? statusInfo.color : 'var(--bg-elevated)'
                        }}
                      />
                    ))}
                  </div>

                  {/* Uitsplitsing per project (tarieven per project, fallback = standaard) */}
                  {rows.length === 0 ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                      Geen resultaten in deze periode.
                    </p>
                  ) : (
                    <div style={{ marginBottom: '16px', borderRadius: '8px', border: '1px solid var(--border)', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-dark)', color: 'var(--text-muted)', textAlign: 'left' }}>
                            <th style={{ padding: '8px 10px', fontWeight: 700 }}>Project</th>
                            <th style={{ padding: '8px 10px', fontWeight: 700 }}>Deals</th>
                            <th style={{ padding: '8px 10px', fontWeight: 700 }}>Afspr.</th>
                            <th style={{ padding: '8px 10px', fontWeight: 700 }}>Beltijd</th>
                            <th style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right' }}>€</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(row => (
                            <tr key={row.key} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '8px 10px', fontWeight: 700 }} title={`€${row.rates.appointment}/afspraak · €${row.rates.deal}/deal · €${row.rates.hour}/uur`}>
                                {row.name}
                              </td>
                              <td style={{ padding: '8px 10px' }}>{row.deals} <span style={{ color: 'var(--text-muted)' }}>× €{row.rates.deal}</span></td>
                              <td style={{ padding: '8px 10px' }}>
                                {row.appointments} <span style={{ color: 'var(--text-muted)' }}>× €{row.rates.appointment}</span>
                                {row.pendingAppointments > 0 && <span style={{ color: 'var(--warning)' }}> (+{row.pendingAppointments})</span>}
                              </td>
                              <td style={{ padding: '8px 10px' }}>
                                {Number(row.rates.hour) > 0
                                  ? <>{fmtHours(row.seconds)} <span style={{ color: 'var(--text-muted)' }}>× €{row.rates.hour}/u</span></>
                                  : <span style={{ color: 'var(--text-muted)' }}>{fmtHours(row.seconds)}</span>}
                              </td>
                              <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: 'var(--secondary)' }}>
                                €{(Math.round(row.amount * 100) / 100).toLocaleString('nl-NL')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

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
                            <AlertCircle size={14} /> Factureerbaar maken
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
                          color: 'var(--text-primary)',
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
                          color: payout.payout_status === 'paid' ? 'var(--success)' : 'var(--text-primary)',
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