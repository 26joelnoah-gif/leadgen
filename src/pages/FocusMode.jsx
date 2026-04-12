import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, PhoneOff, ArrowRight, Clock, MessageSquare, User, CheckCircle, AlertCircle, Zap, ArrowLeft, Timer, X } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { STATUS_MAP } from '../utils/statusUtils'
import { formatDateTime } from '../utils/dateUtils'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import MobileNav from '../components/MobileNav'

export default function FocusMode() {
  const { user, profile, signOut, callEnabled, toggleCallEnabled, sessionCallCount, logCall } = useAuth()
  const { leads, loading, updateLeadStatus, logActivity, callLead, fetchLeads } = useLeads()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [notes, setNotes] = useState('')
  const [isCallActive, setIsCallActive] = useState(false)
  const [callStartTime, setCallStartTime] = useState(null)
  const [callDuration, setCallDuration] = useState(0)
  const [showSnooze, setShowSnooze] = useState(false)
  const [snoozeDate, setSnoozeDate] = useState('')
  const [snoozeTime, setSnoozeTime] = useState('')
  const [showReasonLost, setShowReasonLost] = useState(false)
  const timerRef = useRef(null)

  // Filter leads die gebeld moeten worden (niet afgerond) en sorteer op score
  const activeLeads = leads
    .filter(l => !['deal', 'geen_interesse', 'verkeerd_nummer', 'cold'].includes(l.status))
    .sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0))

  const currentLead = activeLeads[currentIndex]

  async function handleCall() {
    if (!currentLead) return
    setIsCallActive(true)
    setCallStartTime(Date.now())
    setCallDuration(0)
    await callLead(currentLead.id)
    await logCall(currentLead.id, currentLead.name)
    // Start timer
    timerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)
    window.location.href = `tel:${currentLead.phone}`
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  async function handleStatusChange(newStatus) {
    if (!currentLead) return
    await updateLeadStatus(currentLead.id, newStatus)
    if (notes) {
      await logActivity(currentLead.id, 'note', notes)
    }
  }

  async function handleDoor() {
    if (!currentLead) return
    if (notes) {
      await logActivity(currentLead.id, 'note', notes)
    }
    setNotes('')
    setIsCallActive(false)
    setCallStartTime(null)
    setCallDuration(0)
    if (timerRef.current) clearInterval(timerRef.current)
    // Volgende lead
    if (currentIndex < activeLeads.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      // Terug naar begin of refresh
      setCurrentIndex(0)
    }
  }

  async function handleSnooze() {
    if (!currentLead || !snoozeDate || !snoozeTime) return
    const snoozeDateTime = `${snoozeDate}T${snoozeTime}`
    await logActivity(currentLead.id, 'snooze', `Gesnoozed tot: ${snoozeDateTime}`)
    await updateLeadStatus(currentLead.id, 'terugbelafspraak')
    setShowSnooze(false)
    setSnoozeDate('')
    setSnoozeTime('')
    handleDoor()
  }

  async function handleReasonLost(reason) {
    if (!currentLead) return
    await logActivity(currentLead.id, 'reason_lost', reason)
    await updateLeadStatus(currentLead.id, 'geen_interesse')
    setShowReasonLost(false)
    handleDoor()
  }

  function getDefaultSnoozeDate() {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    return tomorrow.toISOString().split('T')[0]
  }

  if (loading) return <LoadingSpinner size="large" />

  if (!currentLead) {
    return (
      <div className="focus-mode-page">
        <header className="header">
          <div className="container header-content">
            <div className="logo">📞 LEADGEN</div>
            <nav className="nav">
              <Link to="/">Overzicht</Link>
              <Link to="/focus">Focus Mode</Link>
              {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            </nav>
            <div className="header-actions">
              <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
            </div>
          </div>
        </header>
        <main className="container">
          <EmptyState
            icon="check-circle"
            title="Alles gebeld!"
            message="Je hebt alle actieve leads gebeld. Kom later terug of check de TBA's voor geplande callbacks."
          />
        </main>
      </div>
    )
  }

  return (
    <div className="focus-mode-page">
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <div className="logo">📞 LEADGEN</div>
          <nav className="nav">
            <Link to="/">Overzicht</Link>
            <Link to="/focus" className="active">Focus Mode</Link>
            <Link to="/tba">TBA's</Link>
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
          </nav>
          <MobileNav profile={profile} />
          <div className="header-actions">
            <div className="flex items-center gap-2 mr-3" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Zap size={14} style={{ color: 'var(--secondary)' }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{sessionCallCount} <span style={{ opacity: 0.6, fontWeight: 400 }}>calls</span></span>
            </div>
            <span style={{ fontSize: '0.85rem', marginRight: '12px' }}>{activeLeads.length} te bellen</span>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="focus-progress-bar">
          <div className="focus-progress-fill" style={{ width: `${((currentIndex) / activeLeads.length) * 100}%` }} />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="focus-lead-card"
        >
          <div className="focus-lead-header">
            <div className="flex items-center gap-3">
              <div className="focus-progress">
                {currentIndex + 1} / {activeLeads.length}
              </div>
              <div style={{ background: 'var(--secondary)', color: 'var(--primary-dark)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Zap size={12} fill="currentColor" />
                Score: {currentLead.lead_score || 0}
              </div>
              {currentLead.contact_attempts > 0 && (
                <div style={{ background: 'rgba(15, 76, 54, 0.1)', color: 'var(--primary)', padding: '4px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 600 }}>
                  Poging {currentLead.contact_attempts}
                </div>
              )}
            </div>
            <StatusSelector
              currentStatus={currentLead.status}
              onStatusChange={handleStatusChange}
            />
          </div>

          <div className="focus-lead-info">
            <h1>{currentLead.name}</h1>
            <a href={`tel:${currentLead.phone}`} className="focus-phone">
              <Phone size={24} />
              {currentLead.phone}
            </a>
            {currentLead.email && (
              <div className="focus-email">{currentLead.email}</div>
            )}
          </div>

          <div className="focus-notes-section">
            <label>
              <MessageSquare size={16} />
              Notities / Resultaat gesprek
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Type hier wat besproken is..."
              rows={4}
            />
          </div>

          {isCallActive && (
            <div className="focus-call-timer">
              <Timer size={18} />
              <span>{formatDuration(callDuration)}</span>
            </div>
          )}

          <div className="focus-notes-section">
            <label>
              <MessageSquare size={16} />
              Notities / Resultaat gesprek
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Type hier wat besproken is..."
              rows={3}
            />
          </div>

          <div className="focus-actions">
            <button
              onClick={() => setShowReasonLost(true)}
              className="btn btn-outline"
              style={{ flex: 1, color: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              <X size={18} />
              Geen Interesse
            </button>

            <button
              onClick={() => setShowSnooze(true)}
              className="btn btn-secondary"
              style={{ flex: 1 }}
            >
              <Clock size={18} />
              Snooze
            </button>

            <button
              onClick={handleCall}
              className="btn btn-success"
              disabled={!callEnabled}
              style={{ flex: 2, fontSize: '1.1rem', padding: '18px' }}
            >
              <Phone size={22} />
              {callEnabled ? 'BEL' : 'UIT'}
            </button>

            <button
              onClick={handleDoor}
              className="btn btn-primary"
              style={{ flex: 1 }}
            >
              DOOR
              <ArrowRight size={18} />
            </button>
          </div>

          {currentLead.notes && (
            <div className="focus-prev-notes">
              <strong>Vorige notities:</strong> {currentLead.notes}
            </div>
          )}
        </motion.div>

        {/* Snooze Modal */}
        <AnimatePresence>
          {showSnooze && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay"
              onClick={() => setShowSnooze(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="modal"
                onClick={e => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2><Clock size={18} /> Snooze Lead</h2>
                  <button className="modal-close" onClick={() => setShowSnooze(false)}><X size={18} /></button>
                </div>
                <p style={{ marginBottom: '20px', color: 'var(--text-muted)' }}>
                  Kies wanneer je deze lead weer wilt bellen
                </p>
                <div className="form-group">
                  <label>Datum</label>
                  <input
                    type="date"
                    value={snoozeDate || getDefaultSnoozeDate()}
                    onChange={e => setSnoozeDate(e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label>Tijd</label>
                  <input
                    type="time"
                    value={snoozeTime}
                    onChange={e => setSnoozeTime(e.target.value)}
                    className="form-control"
                  />
                </div>
                <div className="flex gap-2" style={{ marginTop: '24px' }}>
                  <button className="btn btn-outline" onClick={() => setShowSnooze(false)} style={{ flex: 1 }}>
                    Annuleren
                  </button>
                  <button className="btn btn-secondary" onClick={handleSnooze} disabled={!snoozeDate || !snoozeTime} style={{ flex: 1 }}>
                    <Clock size={16} /> Snooze
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reason Lost Modal */}
        <AnimatePresence>
          {showReasonLost && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay"
              onClick={() => setShowReasonLost(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="modal"
                onClick={e => e.stopPropagation()}
              >
                <div className="modal-header">
                  <h2><X size={18} /> Reden Geen Interesse</h2>
                  <button className="modal-close" onClick={() => setShowReasonLost(false)}><X size={18} /></button>
                </div>
                <p style={{ marginBottom: '20px', color: 'var(--text-muted)' }}>
                  Waarom heeft deze persoon geen interesse?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {[
                    { id: 'te_duur', label: 'Te duur', emoji: '💰' },
                    { id: 'geen_behoefte', label: 'Geen behoefte', emoji: '❌' },
                    { id: 'slechte_timing', label: 'Slechte timing', emoji: '⏰' },
                    { id: 'concurrent', label: 'Gaan met concurrent', emoji: '🏃' },
                    { id: 'niet_beslisser', label: 'Niet de beslisser', emoji: '👤' },
                    { id: 'anders', label: 'Anders', emoji: '📝' }
                  ].map(reason => (
                    <button
                      key={reason.id}
                      onClick={() => handleReasonLost(reason.label)}
                      className="btn btn-outline"
                      style={{ justifyContent: 'flex-start', padding: '16px' }}
                    >
                      <span style={{ marginRight: '12px' }}>{reason.emoji}</span>
                      {reason.label}
                    </button>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="focus-tba-section">
          <Link to="/tba" className="btn btn-outline">
            <AlertCircle size={16} />
            Bekijk TBA's ({leads.filter(l => l.status === 'terugbelafspraak').length})
          </Link>
        </div>
      </main>

      <style>{`
        .focus-mode-page { min-height: 100vh; background: var(--bg-light); }
        .focus-progress-bar {
          height: 4px;
          background: rgba(15, 76, 54, 0.1);
          margin: 0 auto;
          max-width: 600px;
          border-radius: 0 0 4px 4px;
          overflow: hidden;
        }
        .focus-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--primary) 0%, var(--secondary) 100%);
          transition: width 0.3s ease;
        }
        .focus-call-timer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px 24px;
          background: rgba(16, 185, 129, 0.1);
          border: 2px solid var(--success);
          border-radius: var(--radius-lg);
          margin-bottom: 20px;
          color: var(--success);
          font-weight: 700;
          font-size: 1.1rem;
        }
        .focus-lead-card {
          background: white;
          border-radius: var(--radius-lg);
          padding: 32px;
          margin: 24px auto;
          max-width: 600px;
          box-shadow: var(--shadow-lg);
        }
        .focus-lead-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .focus-progress {
          background: var(--primary);
          color: white;
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .focus-lead-info { text-align: center; margin-bottom: 32px; }
        .focus-lead-info h1 { font-size: 1.8rem; color: var(--primary); margin-bottom: 12px; }
        .focus-phone {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          font-size: 1.5rem;
          color: var(--primary);
          font-weight: 700;
          text-decoration: none;
          padding: 16px 32px;
          background: var(--bg-light);
          border-radius: var(--radius-md);
          margin-bottom: 8px;
          transition: all 0.2s;
        }
        .focus-phone:hover { background: var(--secondary); color: var(--primary-dark); }
        .focus-email { color: var(--text-muted); font-size: 0.95rem; }
        .focus-notes-section { margin-bottom: 24px; }
        .focus-notes-section label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          margin-bottom: 8px;
          color: var(--text-main);
        }
        .focus-notes-section textarea {
          width: 100%;
          padding: 16px;
          border: 2px solid var(--border);
          border-radius: var(--radius-md);
          font-size: 1rem;
          resize: none;
          font-family: inherit;
        }
        .focus-notes-section textarea:focus {
          outline: none;
          border-color: var(--primary);
        }
        .focus-actions { display: flex; gap: 12px; }
        .btn-lg { padding: 18px 32px; font-size: 1.1rem; }
        .focus-prev-notes {
          margin-top: 20px;
          padding: 16px;
          background: var(--bg-light);
          border-radius: var(--radius-md);
          font-size: 0.9rem;
          color: var(--text-muted);
          border-left: 4px solid var(--secondary);
        }
        .focus-tba-section { text-align: center; margin-top: 24px; }
      `}</style>
    </div>
  )
}

function StatusSelector({ currentStatus, onStatusChange }) {
  return (
    <select
      value={currentStatus}
      onChange={(e) => onStatusChange(e.target.value)}
      className="status-select"
      style={{
        background: STATUS_MAP[currentStatus]?.bg || '#fff',
        color: STATUS_MAP[currentStatus]?.color || '#000',
        fontWeight: 700,
        padding: '10px 16px',
        borderRadius: '8px',
        border: 'none',
        fontSize: '0.85rem',
        cursor: 'pointer'
      }}
    >
      {Object.entries(STATUS_MAP).map(([key, details]) => (
        <option key={key} value={key}>{details.label}</option>
      ))}
    </select>
  )
}