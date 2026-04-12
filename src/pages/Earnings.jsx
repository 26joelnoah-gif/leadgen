import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, DollarSign, Target, Trophy, Zap, Calendar, Star, Phone, PhoneOff, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import LoadingSpinner from '../components/LoadingSpinner'
import Logo from '../components/Logo'
import MobileNav from '../components/MobileNav'

export default function Earnings() {
  const { user, profile, signOut, sessionCallCount, callEnabled, toggleCallEnabled, isDemoMode } = useAuth()
  const { leads, loading } = useLeads()

  // Calculate earnings based on deals and appointments
  const deals = leads.filter(l => l.status === 'deal')
  const appointments = leads.filter(l => l.status === 'afspraak_gemaakt')

  // Commission rates (example)
  const DEAL_VALUE = 50 // €50 per deal
  const APPOINTMENT_VALUE = 15 // €15 per appointment

  const totalEarnings = (deals.length * DEAL_VALUE) + (appointments.length * APPOINTMENT_VALUE)

  // Monthly breakdown (demo data)
  const monthlyData = isDemoMode ? [
    { month: 'Jan', deals: 8, appointments: 12, earnings: 280 },
    { month: 'Feb', deals: 12, appointments: 18, earnings: 510 },
    { month: 'Mrt', deals: 15, appointments: 22, earnings: 705 },
    { month: 'Apr', deals: 10, appointments: 15, earnings: 435 },
  ] : [
    { month: 'Jan', deals: 5, appointments: 8, earnings: 295 },
    { month: 'Feb', deals: 7, appointments: 12, earnings: 425 },
    { month: 'Mrt', deals: 9, appointments: 14, earnings: 555 },
    { month: 'Apr', deals: deals.length, appointments: appointments.length, earnings: totalEarnings },
  ]

  const topEarner = [...monthlyData].sort((a, b) => b.earnings - a.earnings)[0]

  if (loading) return <LoadingSpinner size="large" />

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="earnings-page"
    >
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav" style={{ marginLeft: '40px', flex: 1 }}>
            <Link to="/">Dashboard</Link>
            <Link to="/focus">Focus Mode</Link>
            <Link to="/tba">TBA's</Link>
            <Link to="/earnings" className="active">Verdiensten</Link>
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
          </nav>
          <MobileNav profile={profile} />
          <div className="header-actions">
            <div className="flex items-center gap-2 mr-3" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Zap size={14} style={{ color: 'var(--secondary)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{sessionCallCount} <span style={{ opacity: 0.6, fontWeight: 400 }}>calls</span></span>
            </div>
             <button
              onClick={toggleCallEnabled}
              className={`btn btn-sm ${callEnabled ? 'btn-secondary' : 'btn-outline'}`}
              style={{ gap: '6px', minWidth: '80px' }}
            >
              {callEnabled ? <Phone size={14} /> : <PhoneOff size={14} />}
              <span>{callEnabled ? 'Aan' : 'Uit'}</span>
            </button>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="page-header">
          <h1>Jouw Verdiensten</h1>
          <p>Overzicht van je commissies en prestaties</p>
        </div>

        <div className="stats-grid">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="stat-card glass-panel glow-hover"
            style={{ borderLeft: '4px solid var(--secondary)' }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="number" style={{ color: 'var(--secondary)', fontSize: '2.5rem' }}>€{totalEarnings}</div>
                <div className="label">Totaal Deze Maand</div>
              </div>
              <div style={{ background: 'rgba(212, 175, 55, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <DollarSign size={24} style={{ color: 'var(--secondary)' }} />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="stat-card glass-panel glow-hover"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="number">{deals.length}</div>
                <div className="label">Deals Gesloten</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>Waarde: €{deals.length * DEAL_VALUE}</div>
              </div>
              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <Trophy size={24} style={{ color: 'var(--success)' }} />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="stat-card glass-panel glow-hover"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="number">{appointments.length}</div>
                <div className="label">Afspraken Gemaakt</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>Waarde: €{appointments.length * APPOINTMENT_VALUE}</div>
              </div>
              <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <Target size={24} style={{ color: 'var(--info)' }} />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="stat-card glass-panel glow-hover"
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="number">{sessionCallCount}</div>
                <div className="label">Calls Vandaag</div>
                <div style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '4px' }}>Blijf bellen!</div>
              </div>
              <div style={{ background: 'rgba(212, 175, 55, 0.1)', padding: '12px', borderRadius: '12px' }}>
                <Zap size={24} style={{ color: 'var(--secondary)' }} />
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px' }}>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="card glass-panel"
          >
            <div className="card-header">
              <span className="card-title text-primary"><TrendingUp size={20} /> Maandelijkse Ontwikkeling</span>
            </div>
            <div className="earnings-chart">
              {monthlyData.map((m, i) => (
                <div key={m.month} className="earnings-bar-container">
                  <div className="earnings-bar-label">{m.month}</div>
                  <div className="earnings-bar-wrapper">
                    <motion.div
                      className="earnings-bar"
                      initial={{ height: 0 }}
                      animate={{ height: `${(m.earnings / (topEarner?.earnings || 1)) * 100}%` }}
                      transition={{ delay: i * 0.1, duration: 0.5 }}
                      style={{
                        background: i === monthlyData.length - 1 ? 'var(--secondary)' : 'var(--primary)',
                        boxShadow: i === monthlyData.length - 1 ? '0 0 15px var(--secondary-glow)' : 'none'
                      }}
                    />
                  </div>
                  <div className="earnings-bar-value">€{m.earnings}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="card glass-panel"
          >
            <div className="card-header">
              <span className="card-title text-primary"><Star size={20} /> Prestatie Badge</span>
            </div>
            <div className="earnings-badge">
              <motion.div 
                animate={{ scale: [1, 1.1, 1] }} 
                transition={{ duration: 2, repeat: Infinity }}
                style={{ fontSize: '4.5rem', marginBottom: '16px', filter: 'drop-shadow(0 0 10px rgba(212, 175, 55, 0.3))' }}
              >
                {deals.length >= 10 ? '🏆' : deals.length >= 5 ? '🥈' : deals.length >= 1 ? '🥉' : '⭐'}
              </motion.div>
              <h3 style={{ marginBottom: '8px', color: 'var(--primary)', fontWeight: 800 }}>
                {deals.length >= 10 ? 'TOP PERFORMER' : deals.length >= 5 ? 'HARD WORKER' : deals.length >= 1 ? 'SALES STARTER' : 'SMILE & DIAL!'}
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                {deals.length >= 10
                  ? 'Je bent een absolute sales machine deze maand.'
                  : deals.length >= 5
                  ? 'Uitstekende voortgang. De top is in zicht!'
                  : deals.length >= 1
                  ? 'Lekker bezig, de eerste deals zijn binnen.'
                  : 'Start vandaag nog je eerste call sessie!'}
              </p>
              <div style={{ marginTop: '24px', padding: '20px', background: 'rgba(15, 76, 54, 0.03)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>MAANDELIJKSE TARGET</p>
                <div className="flex justify-between items-center mt-2">
                  <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{deals.length} / 10 DEALS</span>
                  <span style={{ fontWeight: 800, color: 'var(--secondary)' }}>{deals.length * 10}%</span>
                </div>
                <div style={{ height: '10px', background: 'var(--border)', borderRadius: '5px', marginTop: '10px', overflow: 'hidden' }}>
                  <motion.div
                    className="earnings-progress"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(deals.length * 10, 100)}%` }}
                    transition={{ delay: 0.6, duration: 1 }}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="card glass-panel mt-3"
        >
          <div className="card-header">
            <span className="card-title text-primary"><Calendar size={20} /> Gedetailleerd Overzicht</span>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Resultaat</th>
                  <th>Aantal</th>
                  <th>Commissie</th>
                  <th>Totaal</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight: 700 }}>
                    <div className="flex items-center gap-2">
                      <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '6px', borderRadius: '8px' }}>🏆</div>
                      Deals Gesloten
                    </div>
                  </td>
                  <td>{deals.length}</td>
                  <td>€{DEAL_VALUE}</td>
                  <td style={{ fontWeight: 800, color: 'var(--success)' }}>€{deals.length * DEAL_VALUE}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 700 }}>
                    <div className="flex items-center gap-2">
                      <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '6px', borderRadius: '8px' }}>📅</div>
                      Afspraken Gemaakt
                    </div>
                  </td>
                  <td>{appointments.length}</td>
                  <td>€{APPOINTMENT_VALUE}</td>
                  <td style={{ fontWeight: 800, color: 'var(--info)' }}>€{appointments.length * APPOINTMENT_VALUE}</td>
                </tr>
                <tr style={{ background: 'rgba(15, 76, 54, 0.05)' }}>
                  <td colSpan="3"><strong>TOTAAL VERDIEND</strong></td>
                  <td style={{ fontWeight: 900, fontSize: '1.25rem', color: 'var(--secondary)' }}>€{totalEarnings}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>
      </main>

      <style>{`
        .earnings-page { min-height: 100vh; background: var(--bg-light); padding-bottom: 40px; }
        .earnings-chart {
          display: flex;
          align-items: flex-end;
          justify-content: space-around;
          height: 220px;
          padding: 24px 0;
          gap: 16px;
        }
        .earnings-bar-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          flex: 1;
          max-width: 60px;
          height: 100%;
        }
        .earnings-bar-label {
          font-size: 0.8rem;
          font-weight: 700;
          color: var(--text-muted);
          margin-bottom: 8px;
        }
        .earnings-bar-wrapper {
          flex: 1;
          width: 100%;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          background: rgba(15, 76, 54, 0.03);
          border-radius: 6px;
        }
        .earnings-bar {
          width: 70%;
          min-height: 4px;
          border-radius: 6px 6px 2px 2px;
          background: var(--primary);
        }
        .earnings-bar-value {
          font-size: 0.8rem;
          font-weight: 800;
          color: var(--primary);
          margin-top: 8px;
        }
        .earnings-badge {
          text-align: center;
          padding: 32px 24px;
        }
        .earnings-progress {
          height: 100%;
          background: linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%);
          border-radius: 5px;
          box-shadow: 0 0 10px var(--secondary-glow);
        }
      `}</style>
    </motion.div>
  )
}