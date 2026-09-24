import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { motion } from 'framer-motion'
import { Users, PhoneCall, CheckCircle, Download, Clock, Filter, Calendar, TrendingUp, Phone, Briefcase, Mail, MousePointerClick, FileText, BarChart3 } from 'lucide-react'
import { mailTypeLabel } from '../lib/mailSources'
import { getStatusDetails } from '../utils/statusUtils'
import { effectiveSeconds, isCapped } from '../utils/callTimeUtils'
import { exportToCSV } from '../utils/exportUtils'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Header from '../components/Header'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import PersonSelect from '../components/PersonSelect' // v102

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

export default function Reports() {
  const { isDemoMode, profile } = useAuth()
  // v25: ook managers mogen hierheen - de admin bepaalt per manager wat
  // hij ziet (v20-rechten) en RLS beperkt de data tot zijn eigen projecten
  const isManager = profile?.role === 'manager'
  const kpiOnly = isManager && !!profile?.kpi_only
  const canExport = !isManager || profile?.can_export_data !== false
  const [callLogs, setCallLogs] = useState([])
  // v82: mails via de Mailingservice (mailservice_logs) + wat de bron
  // terugmeldt (lead_mail_status) + wat nog klaarstaat (mail_queue)
  const [mailLogs, setMailLogs] = useState([])
  const [mailStatusRows, setMailStatusRows] = useState([])
  const [mailQueue, setMailQueue] = useState([])
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('bellers') // 'bellers' | 'projecten' | 'gesprekken' | 'mails'
  useEffect(() => {
    if (kpiOnly && activeTab === 'gesprekken') setActiveTab('bellers')
  }, [kpiOnly, activeTab])
  const [filterAgent, setFilterAgent] = useState('all')
  const [filterResult, setFilterResult] = useState('all')
  const [filterProject, setFilterProject] = useState('all') // campagne-id of 'all'
  const [filterTeam, setFilterTeam] = useState('all') // team-id of 'all'
  const [selectedAgents, setSelectedAgents] = useState(() => new Set()) // leeg = alle bellers
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  const [agentSearch, setAgentSearch] = useState('')
  const [teams, setTeams] = useState([])

  const [startDate, setStartDate] = useState(() => todayStr())
  const [endDate, setEndDate] = useState(() => todayStr())

  useEffect(() => {
    fetchCallLogs()
    fetchMails()
  }, [startDate, endDate, isDemoMode])

  // v21: projecten = campagnes; lijsten hangen onder een project
  const [listsMeta, setListsMeta] = useState([])
  useEffect(() => {
    if (isDemoMode) return
    supabase
      .from('campaigns')
      .select('id, name')
      .is('deleted_at', null)
      .order('name')
      .then(({ data }) => setProjects(data || []))
    supabase
      .from('lead_lists')
      .select('id, campaign_id')
      .then(({ data }) => setListsMeta(data || []))
    supabase
      .from('teams')
      .select('id, name, team_members(profile_id)')
      .order('name')
      .then(({ data }) => setTeams(data || []))
  }, [isDemoMode])

  const listToCampaign = useMemo(() => {
    const m = {}
    listsMeta.forEach(l => { m[l.id] = l.campaign_id })
    return m
  }, [listsMeta])

  const teamMemberIds = useMemo(() => {
    const m = {}
    teams.forEach(t => { m[t.id] = new Set((t.team_members || []).map(tm => tm.profile_id)) })
    return m
  }, [teams])

  // Alle bellers die in de gekozen periode voorkomen (voor de multi-select)
  const uniqueAgents = useMemo(() => {
    const m = new Map()
    callLogs.forEach(l => { if (l.agent_id && !m.has(l.agent_id)) m.set(l.agent_id, l.agent?.full_name || 'Onbekend') })
    mailLogs.forEach(l => { if (l.agent_id && !m.has(l.agent_id)) m.set(l.agent_id, l.agent?.full_name || 'Onbekend') })
    return [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [callLogs, mailLogs])

  // v82: mails in de periode + de terugkoppeling van de bron per lead
  async function fetchMails() {
    if (isDemoMode) { setMailLogs([]); setMailStatusRows([]); setMailQueue([]); return }
    try {
      const start = new Date(`${startDate}T00:00:00`)
      const end = new Date(`${endDate}T23:59:59.999`)
      const { data: logs, error } = await supabase
        .from('mailservice_logs')
        .select('id, created_at, agent_id, lead_id, campaign_id, source, mail_type, email, ok, agent:profiles!agent_id(full_name), lead:leads(name)')
        .eq('ok', true)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false })
        .limit(2000)
      if (error) throw error
      setMailLogs(logs || [])

      const leadIds = [...new Set((logs || []).map(l => l.lead_id).filter(Boolean))]
      const rows = []
      for (let i = 0; i < leadIds.length; i += 200) {
        const { data } = await supabase
          .from('lead_mail_status')
          .select('lead_id, source, mail_soort, status, status_rank, geklikt_op, offerte_open_op, getekend_op, betaald_op')
          .in('lead_id', leadIds.slice(i, i + 200))
        rows.push(...(data || []))
      }
      setMailStatusRows(rows)

      const { data: queue } = await supabase
        .from('mail_queue')
        .select('id, agent_id, campaign_id, mail_type, status, created_at, agent:profiles!agent_id(full_name)')
        .eq('status', 'open')
      setMailQueue(queue || [])
    } catch (err) {
      console.error('Mailrapportage laden mislukt:', err)
      setMailLogs([]); setMailStatusRows([]); setMailQueue([])
    }
  }

  async function fetchCallLogs() {
    setLoading(true)
    try {
      if (isDemoMode) { setCallLogs([]); return }

      const start = new Date(`${startDate}T00:00:00`)
      const end = new Date(`${endDate}T23:59:59.999`)

      const { data, error } = await supabase
        .from('call_logs')
        .select('*, lead:leads(name, phone, status, notes), agent:profiles!agent_id(full_name), list:lead_lists(name)')
        .gte('disposed_at', start.toISOString())
        .lte('disposed_at', end.toISOString())
        .order('disposed_at', { ascending: false })
        .limit(1000)

      if (error) throw error
      setCallLogs(data || [])
    } catch (err) {
      console.error('Rapportage laden mislukt:', err)
      setCallLogs([])
    } finally {
      setLoading(false)
    }
  }

  // Globale filters (project, team, geselecteerde bellers):
  // alle KPI's, tabbladen en de export rekenen op projectLogs
  const projectLogs = useMemo(() => (
    callLogs.filter(l => {
      if (filterProject !== 'all' && listToCampaign[l.lead_list_id] !== filterProject) return false
      if (filterTeam !== 'all' && !teamMemberIds[filterTeam]?.has(l.agent_id)) return false
      if (selectedAgents.size > 0 && !selectedAgents.has(l.agent_id)) return false
      return true
    })
  ), [callLogs, filterProject, listToCampaign, filterTeam, teamMemberIds, selectedAgents])

  // ===== Statistieken per beller =====
  const agentStats = useMemo(() => {
    const byAgent = {}
    projectLogs.forEach(log => {
      const id = log.agent_id
      if (!byAgent[id]) {
        byAgent[id] = {
          id,
          name: log.agent?.full_name || 'Onbekend',
          calls: 0, seconds: 0, deals: 0, afspraken: 0, tba: 0,
          geenInteresse: 0, geenGehoor: 0,
          firstCall: log.disposed_at, lastCall: log.disposed_at
        }
      }
      const a = byAgent[id]
      a.calls++
      // v24: effectieve beltijd (gemaximeerd per afboeking) is leidend
      a.seconds += effectiveSeconds(log.disposition, log.duration_seconds)
      a.rawSeconds = (a.rawSeconds || 0) + (log.duration_seconds || 0)
      if (log.disposition === 'deal' || log.disposition === 'bruto_deal') a.deals++
      if (log.disposition === 'afspraak_gemaakt') a.afspraken++
      if (log.disposition === 'terugbelafspraak') a.tba++
      if (log.disposition === 'geen_interesse') a.geenInteresse++
      if (log.disposition === 'geen_gehoor') a.geenGehoor++
      if (log.disposed_at < a.firstCall) a.firstCall = log.disposed_at
      if (log.disposed_at > a.lastCall) a.lastCall = log.disposed_at
    })
    return Object.values(byAgent).map(a => ({
      ...a,
      avgSeconds: a.calls ? a.seconds / a.calls : 0,
      callsPerHour: a.seconds > 0 ? a.calls / (a.seconds / 3600) : 0,
      successRate: a.calls ? ((a.deals + a.afspraken) / a.calls) * 100 : 0,
      dealsPerHour: a.seconds > 0 ? a.deals / (a.seconds / 3600) : 0
    })).sort((x, y) => y.calls - x.calls)
  }, [projectLogs])

  // ===== Statistieken per project (campagne) =====
  const projectStats = useMemo(() => {
    const byList = {}
    projectLogs.forEach(log => {
      const id = (log.lead_list_id && listToCampaign[log.lead_list_id]) || 'geen'
      if (!byList[id]) {
        byList[id] = {
          id,
          name: projects.find(p => p.id === id)?.name || 'Zonder project',
          agents: new Set(),
          calls: 0, seconds: 0, deals: 0, afspraken: 0, tba: 0, geenInteresse: 0
        }
      }
      const p = byList[id]
      p.calls++
      p.seconds += effectiveSeconds(log.disposition, log.duration_seconds)
      p.agents.add(log.agent_id)
      if (log.disposition === 'deal' || log.disposition === 'bruto_deal') p.deals++
      if (log.disposition === 'afspraak_gemaakt') p.afspraken++
      if (log.disposition === 'terugbelafspraak') p.tba++
      if (log.disposition === 'geen_interesse') p.geenInteresse++
    })
    return Object.values(byList).map(p => ({
      ...p,
      agentCount: p.agents.size,
      avgSeconds: p.calls ? p.seconds / p.calls : 0,
      callsPerHour: p.seconds > 0 ? p.calls / (p.seconds / 3600) : 0,
      successRate: p.calls ? ((p.deals + p.afspraken) / p.calls) * 100 : 0
    })).sort((x, y) => y.calls - x.calls)
  }, [projectLogs, listToCampaign, projects])

  const totals = useMemo(() => {
    const t = { calls: 0, seconds: 0, deals: 0, afspraken: 0 }
    agentStats.forEach(a => { t.calls += a.calls; t.seconds += a.seconds; t.deals += a.deals; t.afspraken += a.afspraken })
    return t
  }, [agentStats])

  // ===== v82: Mails per beller =====
  const mailFilterOk = (row) => {
    if (filterProject !== 'all' && row.campaign_id !== filterProject) return false
    if (filterTeam !== 'all' && !teamMemberIds[filterTeam]?.has(row.agent_id)) return false
    if (selectedAgents.size > 0 && !selectedAgents.has(row.agent_id)) return false
    return true
  }
  const projectMailLogs = useMemo(() => mailLogs.filter(mailFilterOk), [mailLogs, filterProject, filterTeam, teamMemberIds, selectedAgents])
  const projectQueue = useMemo(() => mailQueue.filter(mailFilterOk), [mailQueue, filterProject, filterTeam, teamMemberIds, selectedAgents])

  // Hoogste stap per lead + mailsoort (de bron meldt gemaild -> geklikt ->
  // offerte open -> getekend -> betaald; status_rank is die volgorde)
  const mailRankByKey = useMemo(() => {
    const m = {}
    mailStatusRows.forEach(r => {
      const k = `${r.lead_id}|${r.mail_soort}`
      if (!m[k] || (r.status_rank || 0) > m[k]) m[k] = r.status_rank || 0
    })
    return m
  }, [mailStatusRows])

  const mailStats = useMemo(() => {
    const byAgent = {}
    const mk = (id, name) => {
      if (!byAgent[id]) byAgent[id] = { id, name, mails: 0, perType: {}, leads: new Set(), geklikt: new Set(), offerte: new Set(), getekend: new Set(), betaald: new Set(), gepland: 0 }
      return byAgent[id]
    }
    projectMailLogs.forEach(log => {
      const a = mk(log.agent_id || 'geen', log.agent?.full_name || 'Onbekend')
      a.mails++
      a.perType[log.mail_type] = (a.perType[log.mail_type] || 0) + 1
      if (log.lead_id) {
        a.leads.add(log.lead_id)
        const rank = mailRankByKey[`${log.lead_id}|${log.mail_type}`] || 0
        if (rank >= 2) a.geklikt.add(log.lead_id)
        if (rank >= 3) a.offerte.add(log.lead_id)
        if (rank >= 4) a.getekend.add(log.lead_id)
        if (rank >= 5) a.betaald.add(log.lead_id)
      }
    })
    projectQueue.forEach(q => { mk(q.agent_id || 'geen', q.agent?.full_name || 'Onbekend').gepland++ })
    return Object.values(byAgent).map(a => ({
      ...a,
      leadCount: a.leads.size,
      geklikt: a.geklikt.size, offerte: a.offerte.size, getekend: a.getekend.size, betaald: a.betaald.size,
      klikRate: a.leads.size ? (a.geklikt.size / a.leads.size) * 100 : 0
    })).sort((x, y) => y.mails - x.mails)
  }, [projectMailLogs, projectQueue, mailRankByKey])

  const mailTotals = useMemo(() => {
    const t = { mails: 0, leads: 0, geklikt: 0, offerte: 0, getekend: 0, betaald: 0, gepland: 0, perType: {} }
    mailStats.forEach(a => {
      t.mails += a.mails; t.leads += a.leadCount; t.geklikt += a.geklikt; t.offerte += a.offerte
      t.getekend += a.getekend; t.betaald += a.betaald; t.gepland += a.gepland
      Object.entries(a.perType).forEach(([k, v]) => { t.perType[k] = (t.perType[k] || 0) + v })
    })
    return t
  }, [mailStats])
  const mailTypes = useMemo(() => Object.keys(mailTotals.perType).sort(), [mailTotals])

  // ===== Grafiek: gesprekken, resultaten en mails per beller in één oogopslag =====
  // Zelfde project-/team-/beller-filters als de rest van de pagina. Kleuren volgen
  // de betekenis die de Totalen-kaarten hierboven al gebruiken (primary=gesprekken/
  // mails, info=afspraken/geklikt, success=deals) - twee metrieken met een heel
  // verschillende schaal (bv. gesprekken vs deals) komen bewust in aparte grafieken.
  const chartCallsData = useMemo(() => (
    [...agentStats]
      .sort((a, b) => b.calls - a.calls)
      .map(a => ({ name: a.name, Gesprekken: a.calls }))
  ), [agentStats])

  const chartResultsData = useMemo(() => (
    [...agentStats]
      .sort((a, b) => (b.afspraken + b.deals) - (a.afspraken + a.deals))
      .map(a => ({ name: a.name, Afspraken: a.afspraken, Deals: a.deals }))
  ), [agentStats])

  const chartMailsData = useMemo(() => (
    [...mailStats]
      .sort((a, b) => b.mails - a.mails)
      .map(a => ({ name: a.name, 'Mails verstuurd': a.mails, 'Link geklikt': a.geklikt }))
  ), [mailStats])

  const chartHeight = (rows) => Math.max(160, rows.length * 42 + 40)

  // ===== Gesprekkenlijst met filters =====
  const uniqueResults = useMemo(() => {
    const r = new Set()
    projectLogs.forEach(l => r.add(l.disposition))
    return [...r].sort()
  }, [projectLogs])

  const filteredLogs = projectLogs.filter(l =>
    (filterAgent === 'all' || l.agent_id === filterAgent) &&
    (filterResult === 'all' || l.disposition === filterResult)
  )

  const projectSuffix = filterProject === 'all'
    ? ''
    : `_${(projects.find(p => p.id === filterProject)?.name || 'project').replace(/[^\w-]+/g, '_')}`

  const handleExport = () => {
    if (activeTab === 'bellers') {
      exportToCSV(agentStats.map(a => ({
        Beller: a.name, Gesprekken: a.calls, Beltijd: fmtDuration(a.seconds),
        'Gem. per gesprek': fmtDuration(a.avgSeconds), 'Pogingen per uur': a.callsPerHour.toFixed(1),
        Deals: a.deals, Afspraken: a.afspraken,
        "TBA's": a.tba, 'Geen interesse': a.geenInteresse, 'Slagingspercentage': `${a.successRate.toFixed(1)}%`
      })), `LeadGen_Bellers_${startDate}_${endDate}${projectSuffix}`)
    } else if (activeTab === 'mails') {
      exportToCSV(mailStats.map(a => ({
        Beller: a.name, 'Mails verstuurd': a.mails,
        ...Object.fromEntries(mailTypes.map(t => [mailTypeLabel(t), a.perType[t] || 0])),
        'Leads gemaild': a.leadCount, 'Link geklikt': a.geklikt, 'Offerte geopend': a.offerte,
        Getekend: a.getekend, Betaald: a.betaald, 'Nog gepland': a.gepland,
        'Klikpercentage': `${a.klikRate.toFixed(1)}%`
      })), `LeadGen_Mails_${startDate}_${endDate}${projectSuffix}`)
    } else if (activeTab === 'projecten') {
      exportToCSV(projectStats.map(p => ({
        Project: p.name, Bellers: p.agentCount, Gesprekken: p.calls, Beltijd: fmtDuration(p.seconds),
        'Gem. per gesprek': fmtDuration(p.avgSeconds), 'Pogingen per uur': p.callsPerHour.toFixed(1),
        Deals: p.deals, Afspraken: p.afspraken,
        "TBA's": p.tba, 'Geen interesse': p.geenInteresse, 'Slagingspercentage': `${p.successRate.toFixed(1)}%`
      })), `LeadGen_Projecten_${startDate}_${endDate}${projectSuffix}`)
    } else {
      exportToCSV(filteredLogs.map(l => ({
        'Datum en tijd': new Date(l.disposed_at).toLocaleString('nl-NL'),
        Beller: l.agent?.full_name || '', Lead: l.lead?.name || '', Telefoon: l.lead?.phone || '',
        Lijst: l.list?.name || '', Duur: fmtDuration(l.duration_seconds),
        'Effectief (telt mee)': fmtDuration(effectiveSeconds(l.disposition, l.duration_seconds)),
        Resultaat: getStatusDetails(l.disposition).label
      })), `LeadGen_Gesprekken_${startDate}_${endDate}${projectSuffix}`)
    }
  }

  const setRange = (days) => {
    setStartDate(todayStr(-days))
    setEndDate(todayStr())
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="reports-page">
      <Header />

      <main className="container">
        <div className="page-header flex justify-between items-end" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1>Rapportage</h1>
            <p>{isManager ? 'Beltijd en resultaten van de bellers op jouw projecten' : 'Beltijd per beller en de uitkomst van elk gesprek'}</p>
            <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
              <span className="text-muted">tot</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
              <button className="btn btn-sm btn-outline" onClick={() => setRange(0)}>Vandaag</button>
              <button className="btn btn-sm btn-outline" onClick={() => setRange(7)}>7 dagen</button>
              <button className="btn btn-sm btn-outline" onClick={() => setRange(30)}>30 dagen</button>
              <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                title="Bekijk de rapportage voor één project"
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem', maxWidth: '240px' }}>
                <option value="all">Alle projecten</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
                title="Alleen de bellers van dit team tonen"
                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem', maxWidth: '180px' }}>
                <option value="all">Alle teams</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <div style={{ position: 'relative' }}>
                <button
                  className={`btn btn-sm ${selectedAgents.size > 0 ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setShowAgentPicker(v => !v)}
                  title="Selecteer één of meer bellers"
                >
                  <Users size={14} /> {selectedAgents.size === 0 ? 'Alle bellers' : `${selectedAgents.size} beller${selectedAgents.size === 1 ? '' : 's'}`}
                </button>
                {showAgentPicker && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, width: '280px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
                    padding: '10px', boxShadow: '0 12px 32px rgba(0,0,0,0.35)'
                  }}>
                    <input
                      value={agentSearch}
                      onChange={e => setAgentSearch(e.target.value)}
                      placeholder="Zoek beller..."
                      autoFocus
                      style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.8rem', marginBottom: '8px' }}
                    />
                    <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {uniqueAgents.filter(a => a.name.toLowerCase().includes(agentSearch.toLowerCase())).map(a => (
                        <label key={a.id} className="flex items-center gap-2" style={{ padding: '7px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, background: selectedAgents.has(a.id) ? 'rgba(59,130,246,0.12)' : 'transparent' }}>
                          <input
                            type="checkbox"
                            checked={selectedAgents.has(a.id)}
                            onChange={() => setSelectedAgents(prev => {
                              const next = new Set(prev)
                              next.has(a.id) ? next.delete(a.id) : next.add(a.id)
                              return next
                            })}
                            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                          />
                          {a.name}
                        </label>
                      ))}
                      {uniqueAgents.length === 0 && (
                        <p className="text-muted" style={{ fontSize: '0.8rem', padding: '8px' }}>Geen bellers met gesprekken in deze periode.</p>
                      )}
                    </div>
                    <div className="flex justify-between items-center" style={{ marginTop: '8px', gap: '8px' }}>
                      <button className="btn btn-sm btn-outline" onClick={() => setSelectedAgents(new Set())} disabled={selectedAgents.size === 0} style={{ opacity: selectedAgents.size === 0 ? 0.4 : 1 }}>
                        Wis selectie
                      </button>
                      <button className="btn btn-sm btn-primary" onClick={() => setShowAgentPicker(false)}>Klaar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {canExport && activeTab !== 'grafiek' && (
              <button className="btn btn-outline btn-sm" onClick={handleExport}><Download size={16} /> Export CSV</button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => { fetchCallLogs(); fetchMails() }}><TrendingUp size={16} /> Verversen</button>
          </div>
        </div>

        {/* Totalen */}
        <div className="stats-grid">
          {(activeTab === 'mails' ? [
            { label: 'Mails verstuurd', val: mailTotals.mails, icon: Mail, color: 'var(--primary)' },
            { label: 'Link geklikt', val: mailTotals.geklikt, icon: MousePointerClick, color: 'var(--info)' },
            { label: 'Offerte geopend', val: mailTotals.offerte, icon: FileText, color: 'var(--secondary)' },
            { label: 'Getekend / betaald', val: `${mailTotals.getekend} / ${mailTotals.betaald}`, icon: CheckCircle, color: 'var(--success)' }
          ] : [
            { label: 'Gesprekken', val: totals.calls, icon: PhoneCall, color: 'var(--primary)' },
            { label: 'Effectieve beltijd', val: fmtDuration(totals.seconds), icon: Clock, color: 'var(--secondary)' },
            { label: 'Afspraken', val: totals.afspraken, icon: Calendar, color: 'var(--info)' },
            { label: 'Deals', val: totals.deals, icon: CheckCircle, color: 'var(--success)' }
          ]).map((item, i) => (
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
            { id: 'bellers', label: 'Statistieken per beller', icon: <Users size={15} /> },
            { id: 'projecten', label: 'Per project', icon: <Briefcase size={15} /> },
            { id: 'mails', label: 'Mails', icon: <Mail size={15} /> },
            { id: 'grafiek', label: 'Grafiek', icon: <BarChart3 size={15} /> },
            // KPI-only managers zien geen individuele gesprekken of leadgegevens
            ...(kpiOnly ? [] : [{ id: 'gesprekken', label: 'Alle gesprekken', icon: <Phone size={15} /> }])
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '80px 0', display: 'flex', justifyContent: 'center' }}><LoadingSpinner /></div>
        ) : activeTab === 'bellers' ? (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Users size={20} /> Statistieken per beller</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>Beltijd = tijd van openen lead tot afboeking, opgeteld per gesprek</span>
            </div>
            {agentStats.length === 0 ? (
              <EmptyState title="Nog geen gesprekken" message="In deze periode zijn er geen afboekingen geregistreerd." />
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
                      <th>Geen interesse</th>
                      <th>Slagings­percentage</th>
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
                        <td>{a.geenInteresse}</td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontWeight: 800, fontSize: '0.8rem',
                            background: a.successRate >= 4 ? 'var(--success-bg)' : 'var(--danger-bg)',
                            color: a.successRate >= 4 ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {a.successRate.toFixed(1)} %
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(59,130,246,0.12)', fontWeight: 800 }}>
                      <td>TOTAAL</td>
                      <td>{totals.calls}</td>
                      <td style={{ color: 'var(--secondary)' }}>{fmtDuration(totals.seconds)}</td>
                      <td>{fmtDuration(totals.calls ? totals.seconds / totals.calls : 0)}</td>
                      <td style={{ color: 'var(--info)' }}>{totals.seconds > 0 ? (totals.calls / (totals.seconds / 3600)).toFixed(1) : '0.0'}</td>
                      <td style={{ color: 'var(--success)' }}>{totals.deals}</td>
                      <td>{totals.afspraken}</td>
                      <td colSpan={2}></td>
                      <td>{totals.calls ? (((totals.deals + totals.afspraken) / totals.calls) * 100).toFixed(1) : '0.0'} %</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'projecten' ? (
          <div className="card">
            <div className="card-header">
              <span className="card-title"><Briefcase size={20} /> Statistieken per project</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>Alle gesprekken in de gekozen periode, opgeteld per project</span>
            </div>
            {projectStats.length === 0 ? (
              <EmptyState title="Nog geen gesprekken" message="In deze periode zijn er geen afboekingen geregistreerd." />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Bellers</th>
                      <th>Gesprekken</th>
                      <th>Beltijd</th>
                      <th>Gem. per gesprek</th>
                      <th>Pogingen p/u</th>
                      <th>Deals</th>
                      <th>Afspraken</th>
                      <th>TBA's</th>
                      <th>Geen interesse</th>
                      <th>Slagings­percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectStats.map(p => (
                      <tr key={p.id}>
                        <td><strong className="break-words">{p.name}</strong></td>
                        <td>{p.agentCount}</td>
                        <td>{p.calls}</td>
                        <td style={{ fontWeight: 700, color: 'var(--secondary)' }}>{fmtDuration(p.seconds)}</td>
                        <td>{fmtDuration(p.avgSeconds)}</td>
                        <td style={{ fontWeight: 800, color: 'var(--info)' }}>{p.callsPerHour.toFixed(1)}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 700 }}>{p.deals}</td>
                        <td>{p.afspraken}</td>
                        <td>{p.tba}</td>
                        <td>{p.geenInteresse}</td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontWeight: 800, fontSize: '0.8rem',
                            background: p.successRate >= 4 ? 'var(--success-bg)' : 'var(--danger-bg)',
                            color: p.successRate >= 4 ? 'var(--success)' : 'var(--danger)'
                          }}>
                            {p.successRate.toFixed(1)} %
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(59,130,246,0.12)', fontWeight: 800 }}>
                      <td>TOTAAL</td>
                      <td></td>
                      <td>{totals.calls}</td>
                      <td style={{ color: 'var(--secondary)' }}>{fmtDuration(totals.seconds)}</td>
                      <td>{fmtDuration(totals.calls ? totals.seconds / totals.calls : 0)}</td>
                      <td style={{ color: 'var(--info)' }}>{totals.seconds > 0 ? (totals.calls / (totals.seconds / 3600)).toFixed(1) : '0.0'}</td>
                      <td style={{ color: 'var(--success)' }}>{totals.deals}</td>
                      <td>{totals.afspraken}</td>
                      <td colSpan={2}></td>
                      <td>{totals.calls ? (((totals.deals + totals.afspraken) / totals.calls) * 100).toFixed(1) : '0.0'} %</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : activeTab === 'mails' ? (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <span className="card-title"><Mail size={20} /> Mails per beller</span>
              <span className="text-muted" style={{ fontSize: '0.8rem' }}>Verstuurd via de Mailingservice in de gekozen periode. Geklikt, offerte, getekend en betaald komen van de bron (bijv. MarketingKiezer) en tellen per lead. "Nog gepland" = staat nu in de mailinglijst.</span>
            </div>
            {mailStats.length === 0 ? (
              <EmptyState title="Nog geen mails" message="In deze periode zijn er geen mails verstuurd via de Mailingservice." />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Beller</th>
                      <th>Mails</th>
                      {mailTypes.map(t => <th key={t}>{mailTypeLabel(t)}</th>)}
                      <th>Leads gemaild</th>
                      <th>Link geklikt</th>
                      <th>Offerte open</th>
                      <th>Getekend</th>
                      <th>Betaald</th>
                      <th>Nog gepland</th>
                      <th>Klik­percentage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mailStats.map(a => (
                      <tr key={a.id}>
                        <td><strong>{a.name}</strong></td>
                        <td style={{ fontWeight: 800, color: 'var(--primary)' }}>{a.mails}</td>
                        {mailTypes.map(t => <td key={t}>{a.perType[t] || 0}</td>)}
                        <td>{a.leadCount}</td>
                        <td style={{ color: 'var(--info)', fontWeight: 700 }}>{a.geklikt}</td>
                        <td style={{ color: 'var(--secondary)', fontWeight: 700 }}>{a.offerte}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 700 }}>{a.getekend}</td>
                        <td style={{ color: 'var(--success)', fontWeight: 700 }}>{a.betaald}</td>
                        <td className="text-muted">{a.gepland}</td>
                        <td>
                          <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontWeight: 800, fontSize: '0.8rem',
                            background: a.klikRate >= 10 ? 'var(--success-bg)' : 'var(--bg-elevated)',
                            color: a.klikRate >= 10 ? 'var(--success)' : 'var(--text-muted)'
                          }}>
                            {a.klikRate.toFixed(1)} %
                          </span>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ background: 'rgba(59,130,246,0.12)', fontWeight: 800 }}>
                      <td>TOTAAL</td>
                      <td style={{ color: 'var(--primary)' }}>{mailTotals.mails}</td>
                      {mailTypes.map(t => <td key={t}>{mailTotals.perType[t] || 0}</td>)}
                      <td>{mailTotals.leads}</td>
                      <td style={{ color: 'var(--info)' }}>{mailTotals.geklikt}</td>
                      <td style={{ color: 'var(--secondary)' }}>{mailTotals.offerte}</td>
                      <td style={{ color: 'var(--success)' }}>{mailTotals.getekend}</td>
                      <td style={{ color: 'var(--success)' }}>{mailTotals.betaald}</td>
                      <td>{mailTotals.gepland}</td>
                      <td>{mailTotals.leads ? ((mailTotals.geklikt / mailTotals.leads) * 100).toFixed(1) : '0.0'} %</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {!kpiOnly && projectMailLogs.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div className="text-muted" style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>Laatste mails ({Math.min(projectMailLogs.length, 200)} van {projectMailLogs.length})</div>
                <div className="table-container" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  <table className="table">
                    <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 5 }}>
                      <tr><th>Datum en tijd</th><th>Beller</th><th>Lead</th><th>E-mail</th><th>Soort</th><th>Stand bij de bron</th></tr>
                    </thead>
                    <tbody>
                      {projectMailLogs.slice(0, 200).map(l => {
                        const rank = l.lead_id ? (mailRankByKey[`${l.lead_id}|${l.mail_type}`] || 0) : 0
                        const stand = rank >= 5 ? 'Betaald' : rank >= 4 ? 'Getekend' : rank >= 3 ? 'Offerte open' : rank >= 2 ? 'Link geklikt' : 'Gemaild'
                        return (
                          <tr key={l.id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            <td><strong>{l.agent?.full_name || 'Onbekend'}</strong></td>
                            <td>{l.lead?.name || '- verwijderd -'}</td>
                            <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{l.email}</td>
                            <td>{mailTypeLabel(l.mail_type)}</td>
                            <td style={{ fontWeight: 700, color: rank >= 4 ? 'var(--success)' : rank >= 2 ? 'var(--info)' : 'var(--text-muted)' }}>{stand}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'grafiek' ? (
          <div className="grid gap-4">
            <div className="card">
              <div className="card-header">
                <span className="card-title"><PhoneCall size={20} /> Gesprekken per beller</span>
              </div>
              {chartCallsData.length === 0 ? (
                <EmptyState title="Nog geen gesprekken" message="In deze periode zijn er geen afboekingen geregistreerd." />
              ) : (
                <ResponsiveContainer width="100%" height={chartHeight(chartCallsData)}>
                  <BarChart data={chartCallsData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fill: 'var(--text-primary)', fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }} />
                    <Bar dataKey="Gesprekken" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={26} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="card">
              <div className="card-header">
                <span className="card-title"><Calendar size={20} /> Afspraken en deals per beller</span>
              </div>
              {chartResultsData.length === 0 ? (
                <EmptyState title="Nog geen resultaten" message="In deze periode zijn er geen afspraken of deals geregistreerd." />
              ) : (
                <ResponsiveContainer width="100%" height={chartHeight(chartResultsData)}>
                  <BarChart data={chartResultsData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={140} tick={{ fill: 'var(--text-primary)', fontSize: 12 }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }} />
                    <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                    <Bar dataKey="Afspraken" fill="var(--info)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                    <Bar dataKey="Deals" fill="var(--success)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {!kpiOnly && (
              <div className="card">
                <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
                  <span className="card-title"><Mail size={20} /> Mails per beller</span>
                  <span className="text-muted" style={{ fontSize: '0.8rem' }}>Verstuurd via de Mailingservice, en hoeveel daarvan een link hebben geklikt (bron bijv. MarketingKiezer)</span>
                </div>
                {chartMailsData.length === 0 ? (
                  <EmptyState title="Nog geen mails" message="In deze periode zijn er geen mails verstuurd via de Mailingservice." />
                ) : (
                  <ResponsiveContainer width="100%" height={chartHeight(chartMailsData)}>
                    <BarChart data={chartMailsData} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                      <YAxis type="category" dataKey="name" width={140} tick={{ fill: 'var(--text-primary)', fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)' }} />
                      <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                      <Bar dataKey="Mails verstuurd" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                      <Bar dataKey="Link geklikt" fill="var(--success)" radius={[0, 4, 4, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="card">
            <div className="card-header" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <span className="card-title"><Phone size={20} /> Alle gesprekken ({filteredLogs.length})</span>
              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <Filter size={16} className="text-muted" />
                <PersonSelect people={agentStats} value={filterAgent} onChange={id => setFilterAgent(id)} extraOptions={[{ value: 'all', label: 'Alle bellers' }]} showEmail={false} className=""
                  style={{ padding: '6px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', minWidth: 160 }} />
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
                      <th>Lijst</th>
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
                        <td style={{ fontWeight: 700 }}>
                          {fmtDuration(effectiveSeconds(log.disposition, log.duration_seconds))}
                          {isCapped(log.disposition, log.duration_seconds) && (
                            <span className="text-muted" style={{ fontWeight: 400, fontSize: '0.75rem' }} title="Kloktijd lag boven het maximum voor deze afboeking; alleen de effectieve tijd telt mee voor uren en uitbetaling">
                              {' '}(klok {fmtDuration(log.duration_seconds)})
                            </span>
                          )}
                        </td>
                        <td><ResultBadge status={log.disposition} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </motion.div>
  )
}
