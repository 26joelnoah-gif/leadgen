import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { motion } from 'framer-motion'
import {
  Users, PhoneCall, CheckCircle, Download, Clock, Filter, Calendar,
  TrendingUp, Phone, UserPlus, Layers, Upload, Zap, Euro, BarChart3, FastForward
} from 'lucide-react'
import { getStatusDetails } from '../utils/statusUtils'
import { exportToCSV } from '../utils/exportUtils'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import EmployeeModal from '../components/EmployeeModal'
import ImportLeadsModal from '../components/ImportLeadsModal'
import FlowSettingsEditor from '../components/FlowSettingsEditor'
import { useToast } from '../components/Toast'

// Seconden -> "1u 11m 22s"
function fmtDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}u ${m}m ${sec}s`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function fmtEuro(n) {
  return '\u20ac ' + (n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function todayStr(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

function ResultBadge({ status }) {
  const d = getStatusDetails(status)
  return (
    <span style={{ background: d.bg, color: d.color, padding: '3px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
      {d.label}
    </span>
  )
}

export default function Manager() {
  const { user, profile, isDemoMode } = useAuth()
  const toast = useToast()

  const [managedLists, setManagedLists] = useState([])
  const [callLogs, setCallLogs] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overzicht') // 'overzicht' | 'gesprekken' | 'team'
  const [showEmployee, setShowEmployee] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [rules, setRules] = useState(null) // payout_rules (standaardtarieven)
  const [granularity, setGranularity] = useState('dag') // trends: 'uur' | 'dag' | 'week' | 'maand'
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterResult, setFilterResult] = useState('all')
  const [filterList, setFilterList] = useState('all')
  const [startDate, setStartDate] = useState(() => todayStr())
  const [endDate, setEndDate] = useState(() => todayStr())

  const listIdsRef = useRef([])

  const isAdmin = profile?.role === 'admin'
  // Rechten per manager (instelbaar door de admin, migration v20). Admin mag alles.
  const canManageLeads = isAdmin || !!profile?.can_manage_leads
  const canViewRates = isAdmin || !!profile?.can_view_rates
  const canManageTeam = isAdmin || profile?.can_manage_team !== false
  const canExport = isAdmin || profile?.can_export_data !== false
  const canEditFlows = isAdmin || !!profile?.can_edit_flows
  const kpiOnly = !isAdmin && !!profile?.kpi_only

  // ===== Projectlijsten van deze manager laden =====
  async function fetchManagedLists() {
    if (isDemoMode) { setManagedLists([]); return [] }
    try {
      let lists = []
      if (isAdmin) {
        const { data, error } = await supabase
          .from('lead_lists')
          .select('id, name, assigned_to, deleted_at, rate_per_appointment, rate_per_deal, rate_per_hour')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
        if (error) throw error
        lists = data || []
      } else {
        const { data, error } = await supabase
          .from('project_managers')
          .select('lead_list_id, list:lead_lists(id, name, assigned_to, deleted_at, rate_per_appointment, rate_per_deal, rate_per_hour)')
          .eq('manager_id', user.id)
        if (error) throw error
        lists = (data || []).map(r => r.list).filter(l => l && !l.deleted_at)
      }
      setManagedLists(lists)
      listIdsRef.current = lists.map(l => l.id)
      return lists
    } catch (err) {
      console.error('Projecten laden mislukt:', err)
      setManagedLists([])
      return []
    }
  }

  async function fetchRules() {
    if (isDemoMode || !canViewRates) { setRules(null); return }
    const { data } = await supabase.from('payout_rules').select('*').limit(1)
    setRules(data?.[0] || null)
  }

  async function fetchEmployees() {
    if (isDemoMode) { setEmployees([]); return }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['employee'])
      .order('full_name')
    if (!error) setEmployees(data || [])
  }

  async function fetchCallLogs(listIds) {
    const ids = listIds ?? listIdsRef.current
    if (isDemoMode || !ids.length) { setCallLogs([]); setLoading(false); return }
    try {
      const start = new Date(`${startDate}T00:00:00`)
      const end = new Date(`${endDate}T23:59:59.999`)

      const { data, error } = await supabase
        .from('call_logs')
        .select('*, lead:leads(name, phone, status), agent:profiles!agent_id(full_name), list:lead_lists(name)')
        .in('lead_list_id', ids)
        .gte('disposed_at', start.toISOString())
        .lte('disposed_at', end.toISOString())
        .order('disposed_at', { ascending: false })
        .limit(1000)

      if (error) throw error
      setCallLogs(data || [])
    } catch (err) {
      console.error('Gesprekken laden mislukt:', err)
      setCallLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true)
      const lists = await fetchManagedLists()
      await fetchEmployees()
      await fetchRules()
      await fetchCallLogs(lists.map(l => l.id))
    }
    init()
  }, [isDemoMode, user?.id])

  useEffect(() => {
    setLoading(true)
    fetchCallLogs()
  }, [startDate, endDate])

  // Live: nieuw gesprek in één van mijn projecten -> meteen verversen
  useEffect(() => {
    if (isDemoMode) return
    const channel = supabase
      .channel('manager-call-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_logs' }, payload => {
        if (payload.new?.lead_list_id && listIdsRef.current.includes(payload.new.lead_list_id)) {
          fetchCallLogs()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isDemoMode])

  // ===== Nieuwe beller aanmaken (zelfde flow als admin) =====
  async function handleAddEmployee(employeeData) {
    if (isDemoMode) { toast('Niet beschikbaar in demo-modus', 'error'); return }
    try {
      // Aparte client zonder sessie-opslag, anders vervangt signUp de sessie van de manager
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      )
      const { error } = await tempClient.auth.signUp({
        email: employeeData.email,
        password: employeeData.password,
        options: { data: { full_name: employeeData.name } }
      })
      if (error) throw error
      toast('Beller aangemaakt! Wijs hem hieronder toe aan een projectlijst.', 'success')
      fetchEmployees()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function assignAgentToList(listId, agentId) {
    try {
      const { error } = await supabase
        .from('lead_lists')
        .update({ assigned_to: agentId || null })
        .eq('id', listId)
      if (error) throw error
      setManagedLists(prev => prev.map(l => l.id === listId ? { ...l, assigned_to: agentId || null } : l))
      toast(agentId ? 'Beller toegewezen aan project' : 'Toewijzing verwijderd', 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // Tarief per project met fallback op de standaardtarieven (payout_rules)
  const rateFor = (listId) => {
    const l = managedLists.find(x => x.id === listId)
    return {
      appointment: Number(l?.rate_per_appointment ?? rules?.rate_per_appointment ?? 0),
      deal: Number(l?.rate_per_deal ?? rules?.rate_per_deal ?? 0),
      hour: Number(l?.rate_per_hour ?? rules?.rate_per_hour ?? 0)
    }
  }

  // ===== Statistieken per beller =====
  const agentStats = useMemo(() => {
    const byAgent = {}
    callLogs.forEach(log => {
      const id = log.agent_id
      if (!byAgent[id]) {
        byAgent[id] = {
          id,
          name: log.agent?.full_name || 'Onbekend',
          calls: 0, seconds: 0, deals: 0, afspraken: 0, tba: 0,
          geenInteresse: 0, geenGehoor: 0, cost: 0
        }
      }
      const a = byAgent[id]
      a.calls++
      a.seconds += log.duration_seconds || 0
      if (log.disposition === 'deal') a.deals++
      if (log.disposition === 'afspraak_gemaakt') a.afspraken++
      if (log.disposition === 'terugbelafspraak') a.tba++
      if (log.disposition === 'geen_interesse') a.geenInteresse++
      if (log.disposition === 'geen_gehoor') a.geenGehoor++
      if (canViewRates) {
        const r = rateFor(log.lead_list_id)
        a.cost += (log.disposition === 'deal' ? r.deal : 0)
          + (log.disposition === 'afspraak_gemaakt' ? r.appointment : 0)
          + ((log.duration_seconds || 0) / 3600) * r.hour
      }
    })
    return Object.values(byAgent).map(a => ({
      ...a,
      avgSeconds: a.calls ? a.seconds / a.calls : 0,
      callsPerHour: a.seconds > 0 ? a.calls / (a.seconds / 3600) : 0,
      successRate: a.calls ? ((a.deals + a.afspraken) / a.calls) * 100 : 0
    })).sort((x, y) => y.calls - x.calls)
  }, [callLogs, managedLists, rules, canViewRates])

  const totals = useMemo(() => {
    const t = { calls: 0, seconds: 0, deals: 0, afspraken: 0, cost: 0 }
    agentStats.forEach(a => { t.calls += a.calls; t.seconds += a.seconds; t.deals += a.deals; t.afspraken += a.afspraken; t.cost += a.cost })
    return t
  }, [agentStats])

  // ===== Trends: resultaten per uur / dag / week / maand =====
  const trendRows = useMemo(() => {
    const buckets = {}
    const pad = (n) => String(n).padStart(2, '0')
    callLogs.forEach(log => {
      const d = new Date(log.disposed_at)
      let key, label
      if (granularity === 'uur') {
        key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}`
        label = `${d.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })} ${pad(d.getHours())}:00\u2013${pad((d.getHours() + 1) % 24)}:00`
      } else if (granularity === 'dag') {
        key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
        label = d.toLocaleDateString('nl-NL', { weekday: 'short', day: '2-digit', month: '2-digit' })
      } else if (granularity === 'week') {
        const monday = new Date(d)
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        key = `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
        label = `Week van ${monday.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })}`
      } else {
        key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
        label = d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
      }
      if (!buckets[key]) buckets[key] = { key, label, calls: 0, seconds: 0, deals: 0, afspraken: 0, tba: 0 }
      const b = buckets[key]
      b.calls++
      b.seconds += log.duration_seconds || 0
      if (log.disposition === 'deal') b.deals++
      if (log.disposition === 'afspraak_gemaakt') b.afspraken++
      if (log.disposition === 'terugbelafspraak') b.tba++
    })
    return Object.values(buckets).sort((a, b) => b.key.localeCompare(a.key))
  }, [callLogs, granularity])

  const uniqueResults = useMemo(() => {
    const r = new Set()
    callLogs.forEach(l => r.add(l.disposition))
    return [...r].sort()
  }, [callLogs])

  const filteredLogs = callLogs.filter(l =>
    (filterAgent === 'all' || l.agent_id === filterAgent) &&
    (filterResult === 'all' || l.disposition === filterResult) &&
    (filterList === 'all' || l.lead_list_id === filterList)
  )

  const handleExport = () => {
    exportToCSV(agentStats.map(a => ({
      Beller: a.name, Gesprekken: a.calls, Beltijd: fmtDuration(a.seconds),
      'Gem. per gesprek': fmtDuration(a.avgSeconds),
      'Pogingen per uur': a.callsPerHour.toFixed(1),
      Deals: a.deals, Afspraken: a.afspraken, "TBA's": a.tba,
      'Slagingspercentage': `${a.successRate.toFixed(1)}%`,
      ...(canViewRates ? { 'Kosten (EUR)': a.cost.toFixed(2) } : {})
    })), `LeadGen_Manager_${startDate}_${endDate}`)
  }

  const setRange = (days) => {
    setStartDate(todayStr(-days))
    setEndDate(todayStr())
  }

  const totalCallsPerHour = totals.seconds > 0 ? (totals.calls / (totals.seconds / 3600)).toFixed(1) : '0.0'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Header />

      <main className="container">
        <div className="page-header flex justify-between items-end" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1>Mijn Projecten</h1>
            <p>
              {managedLists.length
                ? `Live overzicht van ${managedLists.length} project${managedLists.length === 1 ? '' : 'en'}${managedLists.length <= 3 ? `: ${managedLists.map(l => l.name).join(', ')}` : ` - o.a. ${managedLists.slice(0, 3).map(l => l.name).join(', ')}`}`
                : 'Er zijn nog geen projecten aan jou gekoppeld. Vraag de admin om je te koppelen.'}
            </p>
            <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
              <span className="text-muted">tot</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
              <button className="btn btn-sm btn-outline" onClick={() => setRange(0)}>Vandaag</button>
              <button className="btn btn-sm btn-outline" onClick={() => setRange(7)}>7 dagen</button>
              <button className="btn btn-sm btn-outline" onClick={() => setRange(30)}>30 dagen</button>
            </div>
          </div>
          <div className="flex gap-2">
            {canManageLeads && !kpiOnly && (
              <button className="btn btn-primary btn-sm" onClick={() => setShowImport(true)}><Upload size={16} /> Leads importeren</button>
            )}
            {canExport && (
              <button className="btn btn-outline btn-sm" onClick={handleExport}><Download size={16} /> Export CSV</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => fetchCallLogs()}><TrendingUp size={16} /> Verversen</button>
          </div>
        </div>

        {/* Totalen */}
        <div className="stats-grid">
          {[
            { label: 'Gesprekken', val: totals.calls, icon: PhoneCall, color: 'var(--primary)' },
            { label: 'Effectieve beltijd', val: fmtDuration(totals.seconds), icon: Clock, color: 'var(--secondary)' },
            { label: 'Pogingen per uur (gem.)', val: totalCallsPerHour, icon: Zap, color: 'var(--info)' },
            { label: 'Afspraken + Deals', val: totals.afspraken + totals.deals, icon: CheckCircle, color: 'var(--success)' },
            ...(canViewRates ? [{ label: 'Kosten (indicatie)', val: fmtEuro(totals.cost), icon: Euro, color: 'var(--secondary)' }] : [])
          ].map((item, i) => (
            <motion.div key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className="stat-card glass-panel">
              <div className="flex justify-between items-start">
                <div>
                  <div className="number">{item.val}</div>
                  <div className="label">{item.label}</div>
                </div>
                <item.icon size={24} style={{ color: item.color, opacity: 0.25 }} />
              </div>
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="tab-bar mb-4">
          {[
            { id: 'overzicht', label: 'Statistieken per beller', icon: <Users size={15} /> },
            { id: 'trends', label: 'Trends', icon: <BarChart3 size={15} /> },
            ...(!kpiOnly ? [
              { id: 'gesprekken', label: 'Alle gesprekken', icon: <Phone size={15} /> },
              { id: 'team', label: 'Team & projecten', icon: <Layers size={15} /> }
            ] : []),
            ...(canEditFlows && !kpiOnly ? [{ id: 'flows', label: 'Flows', icon: <FastForward size={15} /> }] : [])
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></div>
        ) : activeTab === 'overzicht' ? (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Users size={20} /> Statistieken per beller</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>Pogingen per uur = gesprekken gedeeld door effectieve beltijd</span>
            </div>
            {agentStats.length === 0 ? (
              <EmptyState title="Nog geen gesprekken" message="In deze periode is er in jouw projecten niet gebeld." />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Beller</th>
                      <th>Gesprekken</th>
                      <th>Beltijd</th>
                      <th>Gem. per gesprek</th>
                      <th>Pogingen p/u</th>
                      <th>Deals</th>
                      <th>Afspraken</th>
                      <th>TBA's</th>
                      <th>Slagings­percentage</th>
                      {canViewRates && <th>Kosten</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {agentStats.map(a => (
                      <tr key={a.id}>
                        <td><strong>{a.name}</strong></td>
                        <td>{a.calls}</td>
                        <td style={{ fontWeight: 700, color: 'var(--secondary)' }}>{fmtDuration(a.seconds)}</td>
                        <td>{fmtDuration(a.avgSeconds)}</td>
                        <td style={{ fontWeight: 800, color: 'var(--info)' }}>{a.callsPerHour.toFixed(1)}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 700 }}>{a.deals}</td>
                        <td>{a.afspraken}</td>
                        <td>{a.tba}</td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontWeight: 800, fontSize: '0.8rem',
                            background: a.successRate >= 4 ? 'var(--success-bg)' : 'var(--danger-bg)',
                            color: a.successRate >= 4 ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {a.successRate.toFixed(1)} %
                          </span>
                        </td>
                        {canViewRates && <td style={{ fontWeight: 800, color: 'var(--secondary)' }}>{fmtEuro(a.cost)}</td>}
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(59,130,246,0.12)', fontWeight: 800 }}>
                      <td>TOTAAL</td>
                      <td>{totals.calls}</td>
                      <td style={{ color: 'var(--secondary)' }}>{fmtDuration(totals.seconds)}</td>
                      <td>{fmtDuration(totals.calls ? totals.seconds / totals.calls : 0)}</td>
                      <td style={{ color: 'var(--info)' }}>{totalCallsPerHour}</td>
                      <td style={{ color: 'var(--success)' }}>{totals.deals}</td>
                      <td>{totals.afspraken}</td>
                      <td></td>
                      <td>{totals.calls ? (((totals.deals + totals.afspraken) / totals.calls) * 100).toFixed(1) : '0.0'} %</td>
                      {canViewRates && <td style={{ color: 'var(--secondary)' }}>{fmtEuro(totals.cost)}</td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'trends' ? (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <span className="card-title"><BarChart3 size={20} /> Trends per periode</span>
              <div className="tab-bar" style={{ padding: '4px' }}>
                {[['uur', 'Per uur'], ['dag', 'Per dag'], ['week', 'Per week'], ['maand', 'Per maand']].map(([id, label]) => (
                  <button key={id} className={`tab-btn ${granularity === id ? 'active' : ''}`}
                    style={{ padding: '6px 14px', fontSize: '0.78rem' }}
                    onClick={() => setGranularity(id)}>{label}</button>
                ))}
              </div>
            </div>
            {trendRows.length === 0 ? (
              <EmptyState title="Nog geen gesprekken" message="In deze periode is er in jouw projecten niet gebeld. Pas eventueel de datums bovenaan aan." />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Periode</th>
                      <th>Belletjes</th>
                      <th>Beltijd</th>
                      <th>Pogingen p/u</th>
                      <th>Afspraken</th>
                      <th>Deals</th>
                      <th>TBA's</th>
                      <th style={{ width: '30%' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {trendRows.map(row => {
                      const maxCalls = Math.max(...trendRows.map(r => r.calls), 1)
                      return (
                        <tr key={row.key}>
                          <td style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>{row.label}</td>
                          <td style={{ fontWeight: 800 }}>{row.calls}</td>
                          <td style={{ color: 'var(--secondary)', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtDuration(row.seconds)}</td>
                          <td style={{ color: 'var(--info)', fontWeight: 800 }}>{row.seconds > 0 ? (row.calls / (row.seconds / 3600)).toFixed(1) : '-'}</td>
                          <td style={{ fontWeight: 700 }}>{row.afspraken}</td>
                          <td style={{ color: 'var(--success)', fontWeight: 700 }}>{row.deals}</td>
                          <td>{row.tba}</td>
                          <td>
                            <div style={{ background: 'var(--bg-elevated)', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                              <div style={{ width: `${(row.calls / maxCalls) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px' }} />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="text-muted" style={{ fontSize: '0.8rem', padding: '12px 16px' }}>
                  De balk toont het aantal belletjes ten opzichte van de drukste periode. Kies de periode met de datums bovenaan de pagina.
                </p>
              </div>
            )}
          </div>
        ) : activeTab === 'gesprekken' ? (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <span className="card-title"><Phone size={20} /> Alle gesprekken ({filteredLogs.length})</span>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <Filter size={16} className="text-muted" />
                <select value={filterAgent} onChange={e => setFilterAgent(e.target.value)}
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                  <option value="all">Alle bellers</option>
                  {agentStats.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={filterList} onChange={e => setFilterList(e.target.value)}
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                  <option value="all">Alle projecten</option>
                  {managedLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={filterResult} onChange={e => setFilterResult(e.target.value)}
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                  <option value="all">Alle resultaten</option>
                  {uniqueResults.map(r => <option key={r} value={r}>{getStatusDetails(r).label}</option>)}
                </select>
              </div>
            </div>
            {filteredLogs.length === 0 ? (
              <EmptyState title="Geen gesprekken" message="Geen gesprekken gevonden in deze periode met deze filters." />
            ) : (
              <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="table">
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 5 }}>
                    <tr>
                      <th>Datum en tijd</th>
                      <th>Beller</th>
                      <th>Lead</th>
                      <th>Nummer</th>
                      <th>Project</th>
                      <th>Duur</th>
                      <th>Resultaat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map(log => (
                      <tr key={log.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {new Date(log.disposed_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td><strong>{log.agent?.full_name || 'Onbekend'}</strong></td>
                        <td>{log.lead?.name || '- verwijderd -'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{log.lead?.phone || ''}</td>
                        <td className="text-muted" style={{ fontSize: '0.85rem' }}>{log.list?.name || '-'}</td>
                        <td style={{ fontWeight: 700 }}>{fmtDuration(log.duration_seconds)}</td>
                        <td><ResultBadge status={log.disposition} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'flows' ? (
          <FlowSettingsEditor />
        ) : (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Layers size={20} /> Mijn projecten & bellers</span>
              {canManageTeam && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowEmployee(true)}><UserPlus size={16} /> Nieuwe beller</button>
              )}
            </div>
            {managedLists.length === 0 ? (
              <EmptyState title="Geen projecten" message="Er zijn nog geen projecten aan jou gekoppeld. Vraag de admin om je aan een project te koppelen." />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Project (leadlijst)</th>
                      <th>Toegewezen beller</th>
                      {canViewRates && <th>Tarieven</th>}
                      {canManageTeam && <th style={{ width: '260px' }}>Beller toewijzen</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {managedLists.map(list => {
                      const assigned = employees.find(e => e.id === list.assigned_to)
                      return (
                        <tr key={list.id}>
                          <td><strong>{list.name}</strong></td>
                          <td>
                            {assigned
                              ? <span style={{ fontWeight: 700 }}>{assigned.full_name}</span>
                              : <span className="text-muted">Niet toegewezen</span>}
                          </td>
                          {canViewRates && (() => {
                            const r = rateFor(list.id)
                            return (
                              <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                <span style={{ fontWeight: 700 }}>{fmtEuro(r.appointment)}</span><span className="text-muted"> /afspraak</span><br />
                                <span style={{ fontWeight: 700 }}>{fmtEuro(r.deal)}</span><span className="text-muted"> /deal</span>
                                {r.hour > 0 && <><br /><span style={{ fontWeight: 700 }}>{fmtEuro(r.hour)}</span><span className="text-muted"> /uur beltijd</span></>}
                              </td>
                            )
                          })()}
                          {canManageTeam && (
                            <td>
                              <select
                                value={list.assigned_to || ''}
                                onChange={e => assignAgentToList(list.id, e.target.value || null)}
                                style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', width: '100%' }}>
                                <option value="">- Geen beller -</option>
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.email})</option>)}
                              </select>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="text-muted" style={{ fontSize: '0.8rem', padding: '12px 16px' }}>
                  Een nieuwe beller verschijnt in de lijst zodra het account is aangemaakt. Wijs hem daarna toe aan een projectlijst - pas dan ziet hij de leads en kan hij bellen.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      <EmployeeModal isOpen={showEmployee} onClose={() => setShowEmployee(false)} onAdd={handleAddEmployee} fixedRole="employee" title="Nieuwe Beller" />
      <ImportLeadsModal isOpen={showImport} onClose={() => setShowImport(false)} onImported={() => fetchCallLogs()} />
    </motion.div>
  )
}
