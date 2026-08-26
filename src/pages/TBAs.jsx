import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, Clock, ArrowRight, CheckCircle, AlertCircle, PhoneOff, Zap, Search, Filter } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { useAuth } from '../context/AuthContext'
import { formatDateTime } from '../utils/dateUtils'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Header from '../components/Header'

export default function TBAs() {
  const { user, toggleWorkingMode, logCall } = useAuth()
  const { leads, loading, logActivity } = useLeads()
  const [filter, setFilter] = useState('upcoming')
  const [searchTerm, setSearchTerm] = useState('')

  const tbaLeads = leads.filter(l => l.status === 'terugbelafspraak')

  // v27: een terugbelafspraak is PRIVE voor de beller die hem maakte.
  // Wordt hij 24 uur na het terugbelmoment niet nagekomen, dan wordt hij
  // openbaar: zichtbaar (en belbaar) voor manager en alle teamleden.
  const OVERDUE_MS = 24 * 60 * 60 * 1000
  const now = new Date()
  const isPublicOverdue = (l) => l.next_contact_date && (now - new Date(l.next_contact_date)) > OVERDUE_MS
  // Een niet-verlopen TBA is en blijft prive van de beller die hem maakte -
  // ook admin/manager zien elkaars (of de recruiter's) nog-niet-verlopen
  // afspraken hier niet. Pas na 24 uur zonder opvolging wordt hij openbaar
  // (pastTBAs hieronder, ongewijzigd) en dus voor iedereen zichtbaar.
  const upcomingTBAs = tbaLeads.filter(l =>
    !isPublicOverdue(l) && l.assigned_to === user?.id
  )
  const pastTBAs = tbaLeads.filter(isPublicOverdue)

  let displayLeads = filter === 'upcoming' ? upcomingTBAs : pastTBAs
  
  if (searchTerm) {
    displayLeads = displayLeads.filter(l => 
      l.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
      l.phone.includes(searchTerm)
    )
  }

  async function handleCall(lead) {
    await logCall(lead.id, lead.name)
    toggleWorkingMode(lead)
  }

  if (loading) return <LoadingSpinner size="large" />

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="tba-page"
    >
      <Header />

      <main className="container">
        <div className="page-header flex justify-between items-end">
          <div>
            <h1>Terugbelafspraken</h1>
            <p>Jouw terugbelafspraken zijn privé. Niet nagekomen? Dan worden ze na 24 uur openbaar voor het hele team.</p>
          </div>
          <div className="flex gap-2">
            <button
              className={`btn btn-sm ${filter === 'upcoming' ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => setFilter('upcoming')}
              style={{ borderRadius: '20px' }}
            >
              <Clock size={16} /> Mijn TBA's ({upcomingTBAs.length})
            </button>
            <button
              className={`btn btn-sm ${filter === 'past' ? 'btn-secondary' : 'btn-outline'}`}
              onClick={() => setFilter('past')}
              style={{ borderRadius: '20px' }}
            >
              <AlertCircle size={16} /> Openbaar - niet nagekomen ({pastTBAs.length})
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
            title={filter === 'upcoming' ? 'Geen geplande callbacks' : 'Geen openbare callbacks'}
            message={filter === 'upcoming'
              ? 'Er zijn geen geplande terugbelafspraken.'
              : 'Top - alle terugbelafspraken worden op tijd nagekomen.'}
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
                    >
                      <Phone size={18} /> BEL NU
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