import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Send, Bell } from 'lucide-react'

export default function BriefingModal({ isOpen, onClose, onSend, userName }) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('normal')

  function handleSend() {
    if (!title || !message) return
    onSend({ title, message, priority, sentBy: userName })
    setTitle('')
    setMessage('')
    setPriority('normal')
    onClose()
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="modal"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2><Bell size={18} /> Briefing Versturen</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="form-group">
          <label>Titel</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Bijv. Nieuwe campagne Q2"
          />
        </div>

        <div className="form-group">
          <label>Bericht</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Typ je briefing hier..."
            rows={5}
            style={{ resize: 'none' }}
          />
        </div>

        <div className="form-group">
          <label>Prioriteit</label>
          <div className="flex gap-2">
            {['low', 'normal', 'high'].map(p => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`btn ${priority === p ? (p === 'high' ? 'btn-primary' : 'btn-secondary') : 'btn-outline'}`}
                style={{ flex: 1, fontSize: '0.85rem' }}
              >
                {p === 'low' ? 'Laag' : p === 'normal' ? 'Normaal' : 'Hoog'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2" style={{ marginTop: '24px' }}>
          <button className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
            Annuleren
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleSend}
            disabled={!title || !message}
            style={{ flex: 1 }}
          >
            <Send size={16} /> Versturen
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function BriefingCard({ briefing }) {
  const priorityColors = {
    low: { bg: '#E5E7EB', color: '#6B7280' },
    normal: { bg: '#DBEAFE', color: '#2563EB' },
    high: { bg: '#FEE2E2', color: '#DC2626' }
  }
  const colors = priorityColors[briefing.priority] || priorityColors.normal

  return (
    <div className="card" style={{
      borderLeft: `4px solid ${colors.color}`,
      background: colors.bg
    }}>
      <div className="flex justify-between items-start mb-2">
        <strong style={{ color: colors.color }}>{briefing.title}</strong>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {new Date(briefing.created_at).toLocaleDateString('nl-NL')}
        </span>
      </div>
      <p style={{ fontSize: '0.9rem', marginBottom: '8px' }}>{briefing.message}</p>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        Van: {briefing.sentBy}
      </div>
    </div>
  )
}