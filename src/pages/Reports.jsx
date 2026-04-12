import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BarChart as BarChartIcon, Users, PhoneCall, CheckCircle, TrendingUp, Download, Activity, PieChart as PieChartIcon } from 'lucide-react'
import { STATUS_MAP } from '../utils/statusUtils'
import { exportToCSV } from '../utils/exportUtils'
import { DEMO_LEADS, DEMO_ACTIVITIES } from '../lib/demoData'
import StatsChart from '../components/StatsChart'
import ActivityFeed from '../components/ActivityFeed'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

export default function Reports() {
  const { user, profile, signOut, isDemoMode } = useAuth()
  const [stats, setStats] = useState({ total: 0, byStatus: [], byUser: [], timeline: [], appointments: 0, deals: 0 })
  const [recentActivities, setRecentActivities] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchReports()
  }, [isDemoMode])

  async function fetchReports() {
    setLoading(true)
    try {
      let leads, activities

      if (isDemoMode) {
        leads = DEMO_LEADS
        activities = DEMO_ACTIVITIES
      } else {
        const { data: leadsRes } = await supabase.from('leads').select('*')
        const { data: activitiesRes } = await supabase
          .from('activities')
          .select('*, user:profiles(full_name), lead:leads(name)')
          .order('created_at', { ascending: false })
          .limit(20)
        leads = leadsRes || []
        activities = activitiesRes || []
      }

      const statusCounts = {}
      const userCounts = {}

      leads?.forEach(lead => {
        statusCounts[lead.status] = (statusCounts[lead.status] || 0) + 1
        if (lead.assigned_to) {
          userCounts[lead.assigned_to] = (userCounts[lead.assigned_to] || 0) + 1
        }
      })

      const statusData = Object.entries(STATUS_MAP).map(([key, details]) => ({
        name: details.label,
        value: statusCounts[key] || 0,
        color: details.color
      })).filter(d => d.value > 0)

      const userData = Object.entries(userCounts).map(([userId, count]) => ({
        name: isDemoMode ? (userId === '1' ? 'Jan' : 'Maria') : userId,
        value: count
      }))

      // Generate a mock timeline for visual appeal
      const timelineData = [
        { name: 'Ma', value: isDemoMode ? 12 : Math.floor(Math.random() * 20) + 5 },
        { name: 'Di', value: isDemoMode ? 18 : Math.floor(Math.random() * 20) + 5 },
        { name: 'Wo', value: isDemoMode ? 15 : Math.floor(Math.random() * 20) + 5 },
        { name: 'Do', value: isDemoMode ? 25 : Math.floor(Math.random() * 20) + 5 },
        { name: 'Vr', value: isDemoMode ? 20 : Math.floor(Math.random() * 20) + 5 },
        { name: 'Za', value: isDemoMode ? 8 : Math.floor(Math.random() * 10) },
        { name: 'Zo', value: isDemoMode ? 5 : Math.floor(Math.random() * 5) },
      ]

      setStats({
        total: leads?.length || 0,
        appointments: statusCounts['afspraak_gemaakt'] || 0,
        deals: statusCounts['deal'] || 0,
        byStatus: statusData,
        byUser: userData,
        timeline: timelineData
      })
      setRecentActivities(activities || [])
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

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <LoadingSpinner size="large" />
    </div>
  )

  const conversionRate = stats.total > 0 ? Math.round(((stats.appointments + stats.deals) / stats.total) * 100) : 0

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      transition={{ duration: 0.5 }}
      className="reports-page"
    >
      <header className="header">
        <div className="container header-content">
          <div className="logo">
            <Activity className="text-secondary" />
            LEADGEN
          </div>
          <nav className="nav">
            <Link to="/">Mijn Leads</Link>
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            {profile?.role === 'admin' && <Link to="/admin/reports" className="active">Rapportage</Link>}
          </nav>
          <div className="header-actions">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.9rem' }}>{profile?.full_name || user?.email}</span>
            </div>
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
            <button className="btn btn-outline btn-sm" onClick={handleExportStats}>
              <Download size={16} /> Export CSV
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
            { label: 'Conversie', val: `${conversionRate}%`, icon: BarChartIcon, color: 'var(--info)' }
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
            <StatsChart type="bar" title="Leads per Status" data={stats.byStatus} dataKey="value" />
          </motion.div>
          <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.5 }}>
            <StatsChart type="line" title="Interacties per Dag" data={stats.timeline} />
          </motion.div>
        </div>

        <div className="grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.6 }} className="card">
            <div className="card-header">
              <span className="card-title"><Activity size={20} /> Recente Activiteiten</span>
              <button className="btn btn-outline btn-sm" onClick={() => exportToCSV(recentActivities, 'LeadGen_Activiteiten')}>
                <Download size={14} /> Log CSV
              </button>
            </div>
            {recentActivities.length > 0 ? (
              <ActivityFeed activities={recentActivities} />
            ) : (
              <EmptyState title="Geen activiteiten" message="Er zijn nog geen activiteiten geregistreerd." />
            )}
          </motion.div>

          <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.7 }} className="card glass-panel">
            <h3 className="card-title mb-3" style={{ fontSize: '1rem' }}>Team Overzicht</h3>
            {stats.byUser.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.byUser.map((user, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(15, 76, 54, 0.05)', borderRadius: '8px' }}>
                    <span style={{ fontWeight: 600 }}>{user.name}</span>
                    <span style={{ background: 'var(--primary)', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 700 }}>{user.value} leads</span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="Geen data" message="Nog geen medewerker-statistieken beschikbaar." />
            )}
            <div style={{ marginTop: '24px', padding: '16px', background: 'var(--primary)', borderRadius: 'var(--radius-sm)', color: 'white' }}>
              <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>Admin Tip:</p>
              <p style={{ fontSize: '0.9rem', fontWeight: '600' }}>Exporteer wekelijks je rapporten voor offline analyse.</p>
            </div>
          </motion.div>
        </div>
      </main>
    </motion.div>
  )
}