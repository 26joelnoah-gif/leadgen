import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, PhoneOff, ArrowRight, Clock, MessageSquare, User, CheckCircle, AlertCircle, Zap, ArrowLeft, Timer, X, Play, Copy } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { STATUS_MAP } from '../utils/statusUtils'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Logo from '../components/Logo'
import MobileNav from '../components/MobileNav'

export default function FocusMode() {
  const { user, profile, signOut, callEnabled, toggleCallEnabled, sessionCallCount, logCall } = useAuth()
  const { leads, loading, updateLeadStatus, logActivity, callLead } = useLeads()
  const navigate = useNavigate()
  
  const [currentIndex, setCurrentIndex] = useState(0)
  const [notes, setNotes] = useState('')
  const [sessionStarted, setSessionStarted] = useState(false)
  const [isCallActive, setIsCallActive] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [showSnooze, setShowSnooze] = useState(false)
  const [snoozeDate, setSnoozeDate] = useState('')
  const [snoozeTime, setSnoozeTime] = useState('')
  const [showReasonLost, setShowReasonLost] = useState(false)
  const [copied, setCopied] = useState(false)
  const timerRef = useRef(null)

  // Redirect admin to dashboard - Focus Mode is for employees only
  useEffect(() => {
    if (profile?.role === 'admin') navigate('/')
  }, [profile, navigate])

  // Redirect admin if they shouldn't be here (optional, but keep for now)
  // useEffect(() => {
  //   if (profile?.role === 'admin') navigate('/admin')
  // }, [profile])

  const activeLeads = leads
    .filter(l => !['deal', 'geen_interesse', 'verkeerd_nummer', 'cold'].includes(l.status))
    .sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0))

  const currentLead = activeLeads[currentIndex]

  async function handleCall() {
    if (!currentLead) return
    setIsCallActive(true)
    setCallDuration(0)
    await callLead(currentLead.id)
    await logCall(currentLead.id, currentLead.name)
    timerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)
    window.location.href = `tel:${currentLead.phone}`
  }

  function copyPhoneNumber() {
    if (!currentLead) return
    navigator.clipboard.writeText(currentLead.phone)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  async function handleStatusChange(newStatus) {
    if (!currentLead) return
    await updateLeadStatus(currentLead.id, newStatus)
  }

  async function handleDoor() {
    if (!currentLead) return
    if (notes) {
      await logActivity(currentLead.id, 'note', notes)
    }
    setNotes('')
    setIsCallActive(false)
    setCallDuration(0)
    if (timerRef.current) clearInterval(timerRef.current)
    
    if (currentIndex < activeLeads.length - 1) {
      setCurrentIndex(prev => prev + 1)
    } else {
      setSessionStarted(false) // Finish session
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

  if (loading) return <LoadingSpinner size="large" />

  // Splash screen
  if (!sessionStarted && activeLeads.length > 0) {
    return (
      <div className="focus-mode-page splash flex items-center justify-center">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card glass-panel text-center"
          style={{ maxWidth: '450px', padding: '60px 40px' }}
        >
          <Logo size="large" />
          <h1 className="mt-4 mb-2">Ready to Dial?</h1>
          <p className="text-muted mb-4">Er staan <strong>{activeLeads.length}</strong> leads op je te wachten. Zet je headset op en Smile & Dial!</p>
          <button 
            onClick={() => setSessionStarted(true)}
            className="btn btn-primary btn-block btn-lg glow-hover"
            style={{ fontSize: '1.4rem', padding: '24px', borderRadius: '16px' }}
          >
            <Play size={24} fill="currentColor" /> START SESSIE
          </button>
          <Link to="/" className="btn btn-link mt-3">Terug naar Dashboard</Link>
        </motion.div>
      </div>
    )
  }

  if (activeLeads.length === 0) {
     return (
      <div className="focus-mode-page">
        <header className="header"><div className="container header-content"><Logo /></div></header>
        <main className="container">
          <EmptyState icon="check-circle" title="Lijst is leeg!" message="Alle leads zijn gebeld. Lekker gewerkt!" />
          <center><Link to="/" className="btn btn-outline mt-3">Terug naar Dashboard</Link></center>
        </main>
      </div>
    )
  }

  return (
    <div className="focus-mode-page">
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <div className="header-actions">
            <div className="flex items-center gap-2 mr-3" style={{ background: 'rgba(232, 185, 35, 0.2)', padding: '12px 20px', borderRadius: '24px', border: '2px solid var(--secondary)' }}>
              <Zap size={22} style={{ color: 'var(--secondary)' }} />
              <span style={{ fontSize: '1.4rem', fontWeight: 900, color: 'white' }}>{sessionCallCount}</span>
              <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>calls</span>
            </div>
            <button onClick={() => setSessionStarted(false)} className="btn btn-sm btn-outline">Stop</button>
          </div>
        </div>
      </header>

      <main className="container">
        <div className="focus-progress-bar">
          <div className="focus-progress-fill" style={{ width: `${((currentIndex) / activeLeads.length) * 100}%` }} />
        </div>

        <motion.div
          key={currentLead.id}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          className="focus-lead-card"
        >
          <div className="focus-lead-header">
            <div className="focus-progress">{currentIndex + 1} / {activeLeads.length}</div>
            <div className="flex items-center gap-2">
               <div className="score-badge">
                  <Zap size={12} fill="currentColor" /> Score: {currentLead.lead_score || 0}
               </div>
               {currentLead.contact_attempts > 0 && <span className="attempt-badge">Poging {currentLead.contact_attempts}</span>}
            </div>
          </div>

          <div className="focus-lead-info">
            <h1 style={{ fontSize: '2.4rem', letterSpacing: '-0.02em' }}>{currentLead.name}</h1>
            <div className="flex justify-center gap-4 mt-2">
                <span className="text-muted">{currentLead.lead_source}</span>
                {currentLead.company_size && <span className="text-muted">• {currentLead.company_size} medewerkers</span>}
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 my-4">
            <button
              onClick={handleCall}
              className={`btn ${callEnabled ? 'btn-success' : 'btn-outline'} btn-lg glow-hover`}
              style={{ padding: '24px 60px', borderRadius: '40px', fontSize: '1.5rem', gap: '16px' }}
              disabled={!callEnabled}
            >
              <Phone size={28} /> {currentLead.phone}
            </button>
            <button
              onClick={copyPhoneNumber}
              className="btn btn-lg"
              style={{
                padding: '24px 30px',
                borderRadius: '40px',
                gap: '8px',
                background: copied ? 'var(--success)' : 'var(--bg-light)',
                border: `2px solid ${copied ? 'var(--success)' : 'var(--border)'}`,
                color: copied ? 'white' : 'var(--text-main)'
              }}
              title="Kopieer nummer"
            >
              {copied ? <CheckCircle size={24} /> : <Copy size={24} />}
              <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>{copied ? 'GEKOPIEERD' : 'KOPIEER'}</span>
            </button>
          </div>

          {isCallActive && (
            <div className="focus-call-timer">
              <Timer size={18} />
              <span>Gesprek bezig: {formatDuration(callDuration)}</span>
            </div>
          )}

          <div className="focus-notes-section">
            <label><MessageSquare size={16} /> Resultaat & Notities</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Wat is er besproken?"
              rows={3}
            />
          </div>

          <div className="status-grid-options">
             <button onClick={() => handleStatusChange('voicemail')} className={`btn btn-sm ${currentLead.status === 'voicemail' ? 'btn-secondary' : 'btn-outline'}`}>Voicemail</button>
             <button onClick={() => handleStatusChange('geen_gehoor')} className={`btn btn-sm ${currentLead.status === 'geen_gehoor' ? 'btn-secondary' : 'btn-outline'}`}>Geen Gehoor</button>
             <button onClick={() => setShowSnooze(true)} className={`btn btn-sm ${currentLead.status === 'terugbelafspraak' ? 'btn-secondary' : 'btn-outline'}`}>Snooze / TBA</button>
             <button onClick={() => handleStatusChange('afspraak_gemaakt')} className={`btn btn-sm ${currentLead.status === 'afspraak_gemaakt' ? 'btn-success' : 'btn-outline'}`}>Afspraak!</button>
          </div>

          <div className="focus-actions mt-4">
            <button onClick={() => setShowReasonLost(true)} className="btn btn-outline text-danger" style={{ flex: 1 }}>
              <X size={18} /> AFBOEKEN
            </button>
            <button onClick={handleDoor} className="btn btn-primary" style={{ flex: 2, fontSize: '1.2rem' }}>
              VOLGENDE LEAD <ArrowRight size={20} />
            </button>
          </div>

          {currentLead.notes && (
            <div className="focus-prev-notes">
              <strong>Info:</strong> {currentLead.notes}
            </div>
          )}
        </motion.div>
      </main>

      <AnimatePresence>
        {showSnooze && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowSnooze(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="modal glass-panel" onClick={e => e.stopPropagation()}>
              <h2><Clock size={18} /> Terugbelafspraak plannen</h2>
              <div className="form-group mt-3">
                 <label>Datum</label>
                 <input type="date" value={snoozeDate} onChange={e => setSnoozeDate(e.target.value)} className="form-control" />
              </div>
              <div className="form-group">
                 <label>Tijd</label>
                 <input type="time" value={snoozeTime} onChange={e => setSnoozeTime(e.target.value)} className="form-control" />
              </div>
              <button className="btn btn-secondary btn-block mt-3" onClick={handleSnooze}>Bevestigen</button>
            </motion.div>
          </motion.div>
        )}
        
        {showReasonLost && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowReasonLost(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="modal glass-panel" onClick={e => e.stopPropagation()}>
              <h2>Waarom geen interesse?</h2>
              <div className="reason-grid mt-3">
                 {['Te duur', 'Geen behoefte', 'Slechte timing', 'Concurrent', 'Niet beslisser', 'Anders'].map(reason => (
                   <button key={reason} onClick={() => handleReasonLost(reason)} className="btn btn-outline btn-block mb-2">{reason}</button>
                 ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .focus-mode-page { min-height: 100vh; background: var(--bg-light); padding-bottom: 40px; }
        .focus-mode-page.splash { background: radial-gradient(circle at top right, var(--primary-dark), #000); }
        .focus-lead-card { background: white; border-radius: 24px; padding: 40px; margin: 30px auto; max-width: 650px; box-shadow: var(--shadow-xl); border: 1px solid var(--border); }
        .focus-progress-bar { height: 6px; background: rgba(0,0,0,0.05); margin-bottom: 20px; border-radius: 3px; overflow: hidden; }
        .focus-progress-fill { height: 100%; background: var(--secondary); transition: width 0.5s ease; }
        .score-badge { background: var(--secondary); color: var(--primary-dark); padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 800; display: flex; items-center gap: 4px; }
        .attempt-badge { background: rgba(15, 76, 54, 0.1); color: var(--primary); padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
        .focus-lead-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
        .focus-progress { font-weight: 700; color: var(--text-muted); }
        .focus-call-timer { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--success); font-weight: 700; margin-bottom: 20px; }
        .status-grid-options { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 20px; }
        .focus-prev-notes { margin-top: 20px; padding: 15px; background: #f8f9fa; border-left: 4px solid var(--secondary); border-radius: 8px; font-size: 0.9rem; }
        .focus-notes-section label { display: flex; items-center gap: 8px; font-weight: 700; margin-bottom: 8px; }
        .focus-notes-section textarea { width: 100%; border: 2px solid var(--border); border-radius: 12px; padding: 12px; font-family: inherit; }
      `}</style>
    </div>
  )
}