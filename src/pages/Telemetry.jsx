import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Users, TrendingUp, Award, Zap, Activity, ChevronRight } from 'lucide-react'
import Logo from '../components/Logo'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Telemetry() {
  const { user, profile, signOut, sessionCallCount, isDemoMode } = useAuth()
  const [teamStats, setTeamStats] = useState([])
  const [totalTeamCalls, setTotalTeamCalls] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchTeamStats()
    const interval = setInterval(fetchTeamStats, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  async function fetchTeamStats() {
    try {
      if (isDemoMode) {
        const mockStats = [
          { full_name: 'Jan de Vries', count: 42 },
          { full_name: 'Maria Admin', count: 38 },
          { full_name: 'Pieter Post', count: 25 }
        ]
        setTeamStats(mockStats)
        setTotalTeamCalls(105)
      } else {
        const { data, error } = await supabase
          .from('activities')
          .select('user_id, profiles(full_name)')
          .eq('type', 'call')
        
        if (data) {
          const counts = {}
          data.forEach(item => {
            const name = item.profiles?.full_name || 'Onbekend'
            counts[name] = (counts[name] || 0) + 1
          })
          
          const sortedStats = Object.entries(counts)
            .map(([name, count]) => ({ full_name: name, count }))
            .sort((a, b) => b.count - a.count)
          
          setTeamStats(sortedStats)
          setTotalTeamCalls(data.length)
        }
      }
    } catch (err) {
      console.error('Error fetching telemetry:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="telemetry-page"
    >
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav">
            <Link to="/">Dashboard</Link>
            <Link to="/admin/telemetry" className="active">Telemetrie</Link>
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
          </nav>
          <div className="header-actions">
            <div className="flex items-center gap-2">
              <span style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)' }}>Sessie:</span>
              <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>{sessionCallCount} calls</span>
            </div>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-header">
          <h1>Live Telemetrie</h1>
          <p>Real-time prestaties en team motivatie.</p>
        </div>

        <div className="stats-grid">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="stat-card glass-panel"
            style={{ borderLeft: '4px solid var(--secondary)' }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="number" style={{ color: 'var(--secondary)' }}>{sessionCallCount}</div>
                <div className="label">Jouw Sessie Calls</div>
              </div>
              <Zap size={32} className="text-secondary" style={{ opacity: 0.2 }} />
            </div>
            <div className="mt-2" style={{ fontSize: '0.8rem', opacity: 0.6 }}>
              Smile & Dial! Je bent lekker bezig.
            </div>
          </motion.div>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="stat-card glass-panel"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="number">{totalTeamCalls}</div>
                <div className="label">Totaal Team Calls</div>
              </div>
              <Activity size={32} className="text-primary" style={{ opacity: 0.2 }} />
            </div>
          </motion.div>

          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="stat-card glass-panel"
            style={{ background: 'var(--primary)', color: 'white' }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="number" style={{ color: 'var(--secondary)' }}>#{teamStats.findIndex(s => s.full_name === profile?.full_name) + 1 || '?'}</div>
                <div className="label" style={{ color: 'rgba(255,255,255,0.7)' }}>Jouw Positie</div>
              </div>
              <Award size={32} style={{ color: 'var(--secondary)', opacity: 0.3 }} />
            </div>
          </motion.div>
        </div>

        <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="card"
          >
            <div className="card-header">
              <span className="card-title"><TrendingUp size={18} /> Call Leaderboard</span>
            </div>
            {loading ? <LoadingSpinner /> : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Positie</th>
                      <th>Medewerker</th>
                      <th className="text-right">Calls</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamStats.map((stat, i) => (
                      <tr key={i} style={stat.full_name === profile?.full_name ? { background: 'rgba(212, 175, 55, 0.05)' } : {}}>
                        <td>
                          <div style={{ 
                            width: '24px', height: '24px', borderRadius: '50%', 
                            background: i === 0 ? 'var(--secondary)' : 'var(--bg-light)',
                            color: i === 0 ? 'var(--primary-dark)' : 'var(--text-main)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 800, fontSize: '0.8rem'
                          }}>
                            {i + 1}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <strong>{stat.full_name}</strong>
                            {stat.full_name === profile?.full_name && <span className="status status-new" style={{ fontSize: '0.6rem', padding: '2px 6px' }}>JIJ</span>}
                          </div>
                        </td>
                        <td className="text-right">
                          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{stat.count}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>

          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="card glass-panel"
            style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '48px' }}
          >
            <div style={{ 
              width: '80px', height: '80px', borderRadius: '50%', 
              background: 'rgba(212, 175, 55, 0.1)', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '24px'
            }}>
              <Phone size={40} className="text-secondary" />
            </div>
            <h2 style={{ color: 'var(--primary)', marginBottom: '16px' }}>Klaar voor de volgende call?</h2>
            <p className="text-muted mb-3">Elke call brengt ons dichter bij de doelstellingen van vandaag.</p>
            <Link to="/" className="btn btn-primary" style={{ width: '100%' }}>
              Ga naar Dashboard <ChevronRight size={18} />
            </Link>
          </motion.div>
        </div>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .text-right { text-align: right; }
      `}} />
    </motion.div>
  )
}
