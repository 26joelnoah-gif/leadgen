import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Users, TrendingUp, Award, Zap, Activity, ChevronRight, Clock, Calendar } from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from 'recharts'
import Logo from '../components/Logo'
import LoadingSpinner from '../components/LoadingSpinner'
import Header from '../components/Header'

export default function Telemetry() {
  const { user, profile, signOut, sessionCallCount, isDemoMode } = useAuth()
  const [teamStats, setTeamStats] = useState([])
  const [hourlyData, setHourlyData] = useState([])
  const [dailyData, setDailyData] = useState([])
  const [activities, setActivities] = useState([])
  const [totalTeamCalls, setTotalTeamCalls] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [])

  async function fetchData() {
    try {
      if (isDemoMode) {
        setTeamStats([
          { full_name: 'Jan de Vries', count: 42 },
          { full_name: 'Maria Admin', count: 38 },
          { full_name: 'Pieter Post', count: 25 }
        ])
        setHourlyData([
          { hour: '09:00', calls: 5 }, { hour: '10:00', calls: 12 }, { hour: '11:00', calls: 18 },
          { hour: '12:00', calls: 8 }, { hour: '13:00', calls: 15 }, { hour: '14:00', calls: 22 },
          { hour: '15:00', calls: 19 }, { hour: '16:00', calls: 6 }
        ])
        setDailyData([
          { day: 'Ma', calls: 85 }, { day: 'Di', calls: 92 }, { day: 'Wo', calls: 78 },
          { day: 'Do', calls: 110 }, { day: 'Vr', calls: 95 }
        ])
        setActivities([
          { id: 1, user_name: 'Jan de Vries', action: 'call', notes: 'Gebeld naar Tech Solutions', created_at: new Date().toISOString() },
          { id: 2, user_name: 'Maria Admin', action: 'call', notes: 'Gebeld naar Jansen BV', created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
          { id: 3, user_name: 'Pieter Post', action: 'deal', notes: 'Deal gesloten met Bakkerij An', created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString() }
        ])
        setTotalTeamCalls(105)
      } else {
        const [statsRes, allCallsRes, activityRes] = await Promise.all([
           supabase.from('activities').select('user_id, profiles:profiles!user_id(full_name)').eq('action', 'call'),
           supabase.from('activities').select('created_at').eq('action', 'call'),
           supabase.from('activities').select('*, profiles:profiles!user_id(full_name)').order('created_at', { ascending: false }).limit(20)
        ])

        // Process Stats
        if (statsRes.data) {
           const counts = {}
           statsRes.data.forEach(item => {
             const name = item.profiles?.full_name || 'Onbekend'
             counts[name] = (counts[name] || 0) + 1
           })
           setTeamStats(Object.entries(counts).map(([name, count]) => ({ full_name: name, count })).sort((a,b) => b.count - a.count))
           setTotalTeamCalls(statsRes.data.length)
        }

        // Process Hourly from today
        const now = new Date()
        const today = now.toISOString().split('T')[0]
        const hourlyCounts = {}
        const dayNames = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']
        const dailyCounts = {}

        allCallsRes.data?.forEach(call => {
          if (call.created_at) {
            const callDate = new Date(call.created_at)
            const hour = callDate.getHours().toString().padStart(2, '0') + ':00'
            const dayName = dayNames[callDate.getDay()]

            if (callDate.toISOString().startsWith(today)) {
              hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1
            }
            dailyCounts[dayName] = (dailyCounts[dayName] || 0) + 1
          }
        })

        // Fill in missing hours with 0
        const hours = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
        setHourlyData(hours.map(h => ({ hour: h, calls: hourlyCounts[h] || 0 })))

        // Fill in missing days with 0
        const days = ['Ma', 'Di', 'Wo', 'Do', 'Vr']
        setDailyData(days.map(d => ({ day: d, calls: dailyCounts[d] || 0 })))

        setActivities(activityRes.data?.map(a => ({ ...a, user_name: a.profiles?.full_name })) || [])
      }
    } catch (err) {
      console.error('Error fetching telemetry:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="telemetry-page">
      <Header />

      <main className="container">
        <div className="page-header">
           <h1>VIBE CHECK & Live Insights</h1>
           <p className="text-secondary" style={{ fontWeight: 700 }}>"Smile & Dial" - De motor van LeadGen.</p>
        </div>

        <div className="stats-grid mb-4">
           <div className="stat-card glass-panel glow-hover">
              <div className="flex justify-between items-start">
                 <div>
                    <div className="number">{sessionCallCount}</div>
                    <div className="label">Jouw Sessie</div>
                 </div>
                 <Zap size={24} className="text-secondary" />
              </div>
           </div>
           <div className="stat-card glass-panel glow-hover">
              <div className="flex justify-between items-start">
                 <div>
                    <div className="number">{totalTeamCalls}</div>
                    <div className="label">Team Totaal</div>
                 </div>
                 <Activity size={24} className="text-primary" />
              </div>
           </div>
           <div className="stat-card glass-panel glow-hover" style={{ background: 'var(--primary)', color: 'white' }}>
              <div className="flex justify-between items-start">
                 <div>
                    <div className="number" style={{ color: 'var(--secondary)' }}>#{teamStats.findIndex(s => s.full_name === profile?.full_name) + 1 || '?'}</div>
                    <div className="label" style={{ color: 'rgba(255,255,255,0.7)' }}>Jouw Positie</div>
                 </div>
                 <Award size={24} style={{ color: 'var(--secondary)' }} />
              </div>
           </div>
        </div>

        <div className="grid-telemetry">
           <div className="card glass-panel">
              <div className="card-header"><span className="card-title"><Clock size={18} /> Calls per uur (Vandaag)</span></div>
              <div style={{ height: '250px', marginTop: '20px' }}>
                 <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourlyData}>
                       <defs>
                          <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="var(--secondary)" stopOpacity={0.8}/>
                             <stop offset="95%" stopColor="var(--secondary)" stopOpacity={0}/>
                          </linearGradient>
                       </defs>
                       <XAxis dataKey="hour" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                       <Tooltip contentStyle={{ background: 'var(--primary-dark)', border: 'none', borderRadius: '8px', color: '#fff' }} />
                       <Area type="monotone" dataKey="calls" stroke="var(--secondary)" strokeWidth={3} fillOpacity={1} fill="url(#colorCalls)" />
                    </AreaChart>
                 </ResponsiveContainer>
              </div>
           </div>

           <div className="card glass-panel">
              <div className="card-header"><span className="card-title"><Calendar size={18} /> Calls per dag (Deze week)</span></div>
              <div style={{ height: '250px', marginTop: '20px' }}>
                 <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyData}>
                       <XAxis dataKey="day" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                       <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{ background: 'var(--primary-dark)', border: 'none', borderRadius: '8px', color: '#fff' }} />
                       <Bar dataKey="calls" radius={[4, 4, 0, 0]}>
                          {dailyData.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={index === dailyData.length -1 ? 'var(--secondary)' : 'var(--primary)'} />
                          ))}
                       </Bar>
                    </BarChart>
                 </ResponsiveContainer>
              </div>
           </div>
        </div>

        <div className="grid-telemetry mt-4">
           <div className="card">
              <div className="card-header"><span className="card-title"><Activity size={18} /> Live Activiteiten</span></div>
              <div className="activity-timeline mt-3">
                 {activities.map((a, i) => (
                    <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.05 }} key={a.id} className="activity-item">
                       <div className={`activity-icon ${a.action}`}>{a.action === 'deal' ? '🏆' : a.action === 'afspraak_gemaakt' ? '📅' : '📞'}</div>
                       <div className="activity-content">
                          <p><strong>{a.user_name}</strong> {a.notes || a.action}</p>
                          <small>{new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
                       </div>
                    </motion.div>
                 ))}
              </div>
           </div>

           <div className="card">
              <div className="card-header"><span className="card-title"><Users size={18} /> Top Bellers</span></div>
              <table className="table mt-2">
                 <thead><tr><th>#</th><th>Naam</th><th className="text-right">Calls</th></tr></thead>
                 <tbody>
                    {teamStats.map((s, i) => (
                       <tr key={i}>
                          <td><span className="rank-badge">{i+1}</span></td>
                          <td><strong>{s.full_name}</strong></td>
                          <td className="text-right" style={{ fontWeight: 800, color: 'var(--primary)' }}>{s.count}</td>
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </div>
      </main>

      <style>{`
        .telemetry-page { min-height: 100vh; background: var(--bg-light); padding-bottom: 50px; }
        .session-pill { background: rgba(212, 175, 55, 0.1); color: var(--secondary); padding: 6px 14px; border-radius: 20px; font-weight: 800; font-size: 0.85rem; display: flex; items-center gap: 6px; }
        .grid-telemetry { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
        .activity-timeline { display: flex; flex-direction: column; gap: 16px; }
        .activity-item { display: flex; gap: 12px; align-items: flex-start; padding: 10px; border-radius: 8px; transition: background 0.2s; }
        .activity-item:hover { background: rgba(0,0,0,0.02); }
        .activity-icon { width: 32px; height: 32px; border-radius: 50%; display: flex; items-center justify-content: center; font-size: 1.2rem; background: var(--bg-light); }
        .activity-icon.deal { background: rgba(15, 76, 54, 0.1); }
        .activity-content p { font-size: 0.9rem; margin: 0; }
        .activity-content small { color: var(--text-muted); font-size: 0.75rem; }
        .rank-badge { width: 22px; height: 22px; background: var(--bg-light); display: flex; items-center justify-content: center; border-radius: 50%; font-size: 0.75rem; font-weight: 800; }
        @media (max-width: 900px) { .grid-telemetry { grid-template-columns: 1fr; } }
      `}</style>
    </motion.div>
  )
}
