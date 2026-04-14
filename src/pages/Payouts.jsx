import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { DollarSign, Zap, Download, Users, TrendingUp, Award, Calendar } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { supabase } from '../lib/supabase'
import { getSettings } from '../utils/settingsUtils'
import Logo from '../components/Logo'
import LoadingSpinner from '../components/LoadingSpinner'

export default function Payouts() {
  const { profile, signOut, sessionCallCount } = useAuth()
  const { leads } = useLeads()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [settings] = useState(getSettings)

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    if (data) {
      setUsers(data)
      setLoading(false)
    }
  }

  function getUserStats(userId) {
    const userLeads = leads.filter(l => l.assigned_to === userId)
    const deals = userLeads.filter(l => l.status === 'deal').length
    const appointments = userLeads.filter(l => l.status === 'afspraak_gemaakt').length
    const dealAmount = deals * settings.dealValue
    const appointmentAmount = appointments * settings.appointmentValue
    return { deals, appointments, dealAmount, appointmentAmount, total: dealAmount + appointmentAmount }
  }

  const totalPayouts = users.reduce((sum, u) => sum + getUserStats(u.id).total, 0)
  const totalDeals = users.reduce((sum, u) => sum + getUserStats(u.id).deals, 0)
  const totalAppointments = users.reduce((sum, u) => sum + getUserStats(u.id).appointments, 0)

  return (
    <div className="payouts-page" style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav" style={{ marginLeft: '40px', flex: 1 }}>
            <Link to="/">Dashboard</Link>
            <Link to="/tba">TBA's</Link>
            <Link to="/earnings">Verdiensten</Link>
            <Link to="/admin/telemetry">Telemetrie</Link>
            <Link to="/admin" className="active">Admin</Link>
            <Link to="/admin/reports">Rapportage</Link>
            <Link to="/admin/payouts">Payouts</Link>
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
            <h1>Payouts Overzicht</h1>
            <p style={{ color: 'var(--text-muted)' }}>Maandelijkse verdiensten per medewerker - April 2026</p>
          </div>
          <div className="flex gap-2">
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
              Deal: €{settings.dealValue} | Afspraak: €{settings.appointmentValue}
            </span>
          </div>
        </motion.div>

        {/* Summary Cards */}
        <div className="stats-grid mb-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="stat-card glass-panel"
            style={{ padding: '24px', borderLeft: '4px solid var(--secondary)' }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--secondary)' }}>€{totalPayouts}</div>
                <div className="label">Totaal Uit te Betalen</div>
              </div>
              <DollarSign size={32} style={{ color: 'var(--secondary)', opacity: 0.5 }} />
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="stat-card glass-panel"
            style={{ padding: '24px', borderLeft: '4px solid var(--success)' }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--success)' }}>{totalDeals}</div>
                <div className="label">Totaal Deals</div>
              </div>
              <Award size={32} style={{ color: 'var(--success)', opacity: 0.5 }} />
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="stat-card glass-panel"
            style={{ padding: '24px', borderLeft: '4px solid var(--info)' }}
          >
            <div className="flex justify-between items-start">
              <div>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--info)' }}>{totalAppointments}</div>
                <div className="label">Totaal Afspraken</div>
              </div>
              <Calendar size={32} style={{ color: 'var(--info)', opacity: 0.5 }} />
            </div>
          </motion.div>
        </div>

        {/* Per User Breakdown */}
        {loading ? (
          <LoadingSpinner size="large" />
        ) : (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="card glass-panel"
            style={{ padding: '24px' }}
          >
            <div className="card-header mb-3">
              <span className="card-title"><Users size={20} /> Medewerker Verdiensten</span>
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>Medewerker</th>
                  <th>Rol</th>
                  <th className="text-right">Deals</th>
                  <th className="text-right">Afspraken</th>
                  <th className="text-right">Deal Bedrag</th>
                  <th className="text-right">Afspraak Bedrag</th>
                  <th className="text-right">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => {
                  const stats = getUserStats(u.id)
                  return (
                    <tr key={u.id}>
                      <td><strong>{u.full_name}</strong></td>
                      <td><span className={`status status-${u.role === 'admin' ? 'afspraak_gemaakt' : 'new'}`}>{u.role}</span></td>
                      <td className="text-right" style={{ fontWeight: 700, color: 'var(--success)' }}>{stats.deals}</td>
                      <td className="text-right" style={{ fontWeight: 700, color: 'var(--info)' }}>{stats.appointments}</td>
                      <td className="text-right">€{stats.dealAmount}</td>
                      <td className="text-right">€{stats.appointmentAmount}</td>
                      <td className="text-right" style={{ fontWeight: 900, color: 'var(--secondary)' }}>€{stats.total}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border)', fontWeight: 900 }}>
                  <td colSpan="2"><strong>TOTAAL</strong></td>
                  <td className="text-right" style={{ color: 'var(--success)' }}>{totalDeals}</td>
                  <td className="text-right" style={{ color: 'var(--info)' }}>{totalAppointments}</td>
                  <td className="text-right">€{totalDeals * settings.dealValue}</td>
                  <td className="text-right">€{totalAppointments * settings.appointmentValue}</td>
                  <td className="text-right" style={{ color: 'var(--secondary)' }}>€{totalPayouts}</td>
                </tr>
              </tfoot>
            </table>
          </motion.div>
        )}

        {/* Export Button */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex justify-end mt-4"
        >
          <button
            className="btn btn-secondary"
            onClick={() => {
              const csv = [
                ['Medewerker', 'Rol', 'Deals', 'Afspraken', 'Deal Bedrag', 'Afspraak Bedrag', 'Totaal'],
                ...users.map(u => {
                  const s = getUserStats(u.id)
                  return [u.full_name, u.role, s.deals, s.appointments, s.dealAmount, s.appointmentAmount, s.total]
                }),
                ['TOTAAL', '', totalDeals, totalAppointments, totalDeals * settings.dealValue, totalAppointments * settings.appointmentValue, totalPayouts]
              ].map(row => row.join(',')).join('\n')
              const blob = new Blob([csv], { type: 'text/csv' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `payouts_april_2026.csv`
              a.click()
            }}
          >
            <Download size={18} /> Export CSV
          </button>
        </motion.div>
      </main>

      <style>{`
        .payouts-page { min-height: 100vh; background: var(--bg-dark); }
        .text-right { text-align: right; }
      `}</style>
    </div>
  )
}