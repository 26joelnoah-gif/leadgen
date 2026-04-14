import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Clock, ArrowRight, CheckCircle, AlertCircle, PhoneOff, Zap, Search, Filter } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { useAuth } from '../context/AuthContext'
import { formatDateTime } from '../utils/dateUtils'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Logo from '../components/Logo'
import MobileNav from '../components/MobileNav'

export default function TBAs() {
  const { user, profile, signOut, callEnabled, toggleCallEnabled, sessionCallCount, logCall } = useAuth()
  const { leads, loading, updateLeadStatus, logActivity } = useLeads()
  const [filter, setFilter] = useState('upcoming')
  const [searchTerm, setSearchTerm] = useState('')

  const tbaLeads = leads.filter(l => l.status === 'terugbelafspraak')

  const now = new Date()
  const upcomingTBAs = tbaLeads.filter(l => {
    const tbaTime = new Date(l.next_contact_date || l.updated_at)
    return tbaTime >= now || !l.next_contact_date
  })
  const pastTBAs = tbaLeads.filter(l => {
    const tbaTime = new Date(l.next_contact_date || l.updated_at)
    return tbaTime < now
  })

  let displayLeads = filter === 'upcoming' ? upcomingTBAs : pastTBAs
  
  if (searchTerm) {
    displayLeads = displayLeads.filter(l => 
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      l.phone.includes(searchTerm)
    )
  }

  async function handleCall(lead) {
    window.location.href = `tel:${lead.phone}`
    await logActivity(lead.id, 'call', 'Gebeld op TBA-tijd')
    await logCall(lead.id, lead.name)
  }

  async function handleComplete(leadId) {
    const status = prompt('Wat is het resultaat?\n1: Afspraak gemaakt\n2: Deal\n3: Geen interesse\n4: Anders (terugbelafspraak)')
    let newStatus = 'terugbelafspraak'
    if (status === '1') newStatus = 'afspraak_gemaakt'
    else if (status === '2') newStatus = 'deal'
    else if (status === '3') newStatus = 'geen_interesse'

    await updateLeadStatus(leadId, newStatus)
  }

  if (loading) return <LoadingSpinner size="large" />

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="tba-page"
    >
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav" style={{ marginLeft: '40px', flex: 1 }}>
            <Link to="/">Dashboard</Link>
            <Link to="/tba" className="active">TBA's</Link>
            <Link to="/earnings">Verdiensten</Link>
            {profile?.role === 'admin' && <Link to="/admin/telemetry">Telemetrie</Link>}
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            {profile?.role === 'admin' && <Link to="/admin/reports">Rapportage</Link>}
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
        <div className="page-header flex justify-between items-end">
          <div>
            <h1>Terugbelafspraken</h1>
            <p>Alle geplande callbacks - bel op het juiste moment!</p>
          </div>
          <div className="flex gap-2">
            <button
              className={`btn btn-sm ${filter === 'upcoming' ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => setFilter('upcoming')}
              style={{ borderRadius: '20px' }}
            >
              <Clock size={16} /> Te bellen ({upcomingTBAs.length})
            </button>
            <button
              className={`btn btn-sm ${filter === 'past' ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => setFilter('past')}
              style={{ borderRadius: '20px' }}
            >
              <AlertCircle size={16} /> Gemist ({pastTBAs.length})
            </button>
          </div>
        </div>

        <div className="filter-bar glass-panel flex justify-between items-center mb-3" style={{ gap: '20px' }}>
          <div className="search-input" style={{ flex: 1, position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Zoek in afspraken..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '40px', width: '100%' }}
            />
          </div>
        </div>

        {displayLeads.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={filter === 'upcoming' ? 'Geen geplande callbacks' : 'Geen gemiste callbacks'}
            message={filter === 'upcoming'
              ? 'Er zijn geen geplande terugbelafspraken.'
              : 'Alle callbacks zijn op tijd gebeld.'}
          />
        ) : (
          <div className="tba-list">
            <AnimatePresence>
              {displayLeads.map((lead, i) => (
                <motion.div
                  key={lead.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.05 }}
                  className="tba-card card glow-hover"
                >
                  <div className="tba-time-badge">
                    <Clock size={14} />
                    {lead.next_contact_date ? formatDateTime(lead.next_contact_date) : 'Zodra mogelijk'}
                  </div>
                  <div className="tba-info">
                    <h3>{lead.name}</h3>
                    <div className="flex items-center gap-4 mt-1">
                      <a href={`tel:${lead.phone}`} className="tba-phone-link">
                        <Phone size={14} /> {lead.phone}
                      </a>
                      {lead.lead_score > 0 && (
                        <span className="flex items-center gap-1" style={{ color: 'var(--secondary)', fontWeight: 700, fontSize: '0.8rem' }}>
                          <Zap size={12} fill="currentColor" /> {lead.lead_score} pts
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="tba-actions">
                    <button 
                      onClick={() => handleCall(lead)} 
                      className="btn btn-success"
                      disabled={!callEnabled}
                    >
                      <Phone size={18} /> BEL NU
                    </button>
                    <button onClick={() => handleComplete(lead.id)} className="btn btn-outline btn-sm">
                      <CheckCircle size={14} /> Voltooid
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </main>

      <style>{`
        .tba-page { min-height: 100vh; background: var(--bg-light); padding-bottom: 40px; }
        .tba-list { display: flex; flex-direction: column; gap: 16px; }
        .tba-card {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 24px;
          border-left: 4px solid var(--secondary);
        }
        .tba-time-badge {
          background: rgba(15, 76, 54, 0.05);
          color: var(--primary);
          padding: 12px 20px;
          border-radius: var(--radius-md);
          font-size: 0.9rem;
          font-weight: 700;
          min-width: 180px;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: 1px solid var(--border);
        }
        .tba-info { flex: 1; }
        .tba-info h3 { font-size: 1.2rem; color: var(--primary); margin-bottom: 2px; }
        .tba-phone-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--text-muted);
          font-weight: 500;
          text-decoration: none;
          font-size: 0.9rem;
        }
        .tba-phone-link:hover { color: var(--primary); }
        .tba-actions { display: flex; gap: 12px; items-center; }
        
        @media (max-width: 768px) {
          .tba-card { flex-direction: column; align-items: stretch; gap: 16px; }
          .tba-time-badge { width: 100%; }
          .tba-actions { flex-direction: column; }
        }
      `}</style>
    </motion.div>
  )
}