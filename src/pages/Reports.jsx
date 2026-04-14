import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart as BarChartIcon, Users, PhoneCall, CheckCircle, TrendingUp, Download, Activity, PieChart as PieChartIcon, Zap, Clock, Filter } from 'lucide-react'
import { STATUS_MAP } from '../utils/statusUtils'
import { exportToCSV } from '../utils/exportUtils'
import { DEMO_LEADS, DEMO_ACTIVITIES } from '../lib/demoData'
import StatsChart from '../components/StatsChart'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Logo from '../components/Logo'

export default function Reports() {
  const { user, profile, signOut, isDemoMode, sessionCallCount } = useAuth()
  const [stats, setStats] = useState({ total: 0, byStatus: [], byUser: [], timeline: [], appointments: 0, deals: 0 })
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState('all')
  const [users, setUsers] = useState([])

  useEffect(() => {
    fetchReports()
  }, [isDemoMode])

  async function fetchReports() {
    setLoading(true)
    try {
      let leads, activitiesData, usersData

      if (isDemoMode) {
        leads = DEMO_LEADS
        activitiesData = DEMO_ACTIVITIES
        usersData = [
          { id: '1', full_name: 'Jan de Vries' },
          { id: '2', full_name: 'Maria Admin' }
        ]
      } else {
        const [leadsRes, activitiesRes, usersRes] = await Promise.all([
          supabase.from('leads').select('*'),
          supabase.from('activities').select('*, user:profiles(full_name), lead:leads(name)').order('created_at', { ascending: false }),
          supabase.from('profiles').select('*')
        ])
        leads = leadsRes.data || []
        activitiesData = activitiesRes.data || []
        usersData = usersRes.data || []
      }

      setUsers(usersData)
      setActivities(activitiesData)

      // Calculate stats
      const statusCounts = {}
      const userCounts = {}
      const userStatusCounts = {}

      leads?.forEach(lead => {
        statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1
        if (lead.assigned_to) {
          userCounts[lead.assigned_to] = (userCounts[lead.assigned_to] || 0) + 1
          if (!userStatusCounts[lead.assigned_to]) userStatusCounts[lead.assigned_to] = {}
          userStatusCounts[lead.assigned_to][lead.status] = (userStatusCounts[lead.assigned_to][lead.status] || 0) + 1
        }
      })

      // Calculate calls per day from activities
      const callsPerDay = {}
      const today = new Date()
      for (let i = 6; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        const dateStr = date.toISOString().split('T')[0]
        const dayName = date.toLocaleDateString('nl-NL', { weekday: 'short' }).slice(0, 2)
        callsPerDay[dateStr] = { name: dayName, calls: 0 }
      }

      activitiesData?.forEach(a => {
        if (a.action === 'call') {
          const dateStr = a.created_at?.split('T')[0]
          if (callsPerDay[dateStr]) {
            callsPerDay[dateStr].calls++
          }
        }
      })

      const timelineData = Object.values(callsPerDay)

      const statusData = Object.entries(STATUS_MAP).map(([key, details]) => ({
        name: details.label,
        value: statusCounts[key] || 0,
        color: details.color
      })).filter(d => d.value > 0)

      const userData = Object.entries(userCounts).map(([userId, count]) => {
        const user = usersData.find(u => u.id === userId)
        return {
          id: userId,
          name: user?.full_name || userId,
          value: count
        }
      })

      setStats({
        total: leads?.length || 0,
        appointments: statusCounts['afspraak_gemaakt'] || 0,
        deals: statusCounts['deal'] || 0,
        byStatus: statusData,
        byUser: userData,
        timeline: timelineData,
        userStatusCounts
      })
    } catch (err) {
      console.error('Error fetching reports:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExportStats = () => {
    const data = stats.byStatus.map(s => ({ Status: s.name, Totaal: s.value }))
    exportToCSV(data, `LeadGen_Rapport_${new Date().toLocaleDateString()}`)
  }

  const handleExportActivities = () => {
    const data = filteredActivities.map(a => ({
      Datum: new Date(a.created_at).toLocaleString('nl-NL'),
      Medewerker: a.user?.full_name || 'Onbekend',
      Lead: a.lead?.name || 'Onbekend',
      Actie: a.action,
      Notities: a.notes || ''
    }))
    exportToCSV(data, `LeadGen_Activiteiten_${new Date().toLocaleDateString()}`)
  }

  const filteredActivities = selectedUser === 'all'
    ? activities
    : activities.filter(a => a.user_id === selectedUser)

  function formatDuration(isoDate) {
    const date = new Date(isoDate)
    return date.toLocaleString('nl-NL', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function getActionIcon(action) {
    switch (action) {
      case 'call': return '📞'
      case 'status_change': return '🔄'
      case 'note': return '📝'
      case 'snooze': return '⏰'
      case 'reason_lost': return '❌'
      default: return '📋'
    }
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <LoadingSpinner size="large" />
    </div>
  )

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="reports-page"
    >
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav" style={{ marginLeft: '40px', flex: 1 }}>
            <Link to="/">Dashboard</Link>
            <Link to="/tba">TBA's</Link>
            <Link to="/earnings">Verdiensten</Link>
            <Link to="/admin/telemetry">Telemetrie</Link>
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            {profile?.role === 'admin' && <Link to="/admin/reports" className="active">Rapportage</Link>}
          </nav>
          <div className="header-actions">
            <div className="flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px' }}>
              <Zap size={14} style={{ color: 'var(--secondary)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{sessionCallCount} <span style={{ opacity: 0.6, fontWeight: 400 }}>calls</span></span>
            </div>
            <span>{profile?.full_name || user?.email}</span>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

      <main className="container">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="page-header flex justify-between items-end"
        >
          <div>
            <h1>Rapportage Dashboard</h1>
            <p>Real-time inzichten in je sales funnel {isDemoMode ? '(Demo modus)' : ''}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={handleExportActivities}>
              <Download size={16} /> Export Activiteiten
            </button>
            <button className="btn btn-secondary btn-sm" onClick={fetchReports}>
              <TrendingUp size={16} /> Verversen
            </button>
          </div>
        </motion.div>

        <div className="stats-grid">
          {[
            { label: 'Totaal Leads', val: stats.total, icon: Users, color: 'var(--primary)' },
            { label: 'Afspraken', val: stats.appointments, icon: PhoneCall, color: 'var(--secondary)' },
            { label: 'Deals', val: stats.deals, icon: CheckCircle, color: 'var(--success)' },
            { label: 'Activiteiten', val: activities.length, icon: Activity, color: 'var(--info)' }
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="stat-card glass-panel"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="number">{item.val}</div>
                  <div className="label">{item.label}</div>
                </div>
                <item.icon size={24} style={{ color: item.color, opacity: 0.2 }} />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '40px' }}>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.4 }}>
            <StatsChart type="bar" title="Calls per Dag" data={stats.timeline} dataKey="calls" />
          </motion.div>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }}>
            <StatsChart type="pie" title="Leads per Status" data={stats.byStatus} dataKey="value" />
          </motion.div>
        </div>

        {/* Per Agent Dispositions */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="card mb-4">
          <div className="card-header">
            <span className="card-title"><Users size={20} /> Per Medewerker Statistieken</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Medewerker</th>
                  <th>Totaal Leads</th>
                  {Object.entries(STATUS_MAP).slice(0, 6).map(([key, val]) => (
                    <th key={key}>{val.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.byUser.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong></td>
                    <td>{u.value}</td>
                    {Object.entries(STATUS_MAP).slice(0, 6).map(([key, val]) => (
                      <td key={key}>{stats.userStatusCounts?.[u.id]?.[key] || 0}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Activity Log */}
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.7 }} className="card">
          <div className="card-header">
            <span className="card-title"><Clock size={20} /> Activiteiten Log</span>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-muted" />
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)' }}
              >
                <option value="all">Alle medewerkers</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
            </div>
          </div>
          {filteredActivities.length > 0 ? (
            <div className="activity-log">
              {filteredActivities.map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="activity-item"
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'flex-start'
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{getActionIcon(a.action)}</span>
                  <div style={{ flex: 1 }}>
                    <div className="flex justify-between items-start">
                      <div>
                        <strong>{a.user?.full_name || 'Onbekend'}</strong>
                        <span className="text-muted"> - </span>
                        <span>{a.lead?.name || 'Onbekend lead'}</span>
                      </div>
                      <small className="text-muted" style={{ whiteSpace: 'nowrap' }}>
                        {formatDuration(a.created_at)}
                      </small>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {a.action === 'call' && '📞 Belletje gevoerd'}
                      {a.action === 'status_change' && `🔄 ${a.notes}`}
                      {a.action === 'note' && `📝 ${a.notes}`}
                      {a.action === 'snooze' && `⏰ ${a.notes}`}
                      {a.action === 'reason_lost' && `❌ ${a.notes}`}
                      {!['call', 'status_change', 'note', 'snooze', 'reason_lost'].includes(a.action) && a.notes}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <EmptyState title="Geen activiteiten" message="Er zijn nog geen activiteiten geregistreerd." />
          )}
        </motion.div>
      </main>

      <style>{`
        .activity-log { max-height: 500px; overflow-y: auto; }
        .activity-item:last-child { border-bottom: none; }
      `}</style>
    </motion.div>
  )
}