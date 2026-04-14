import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Send, Bell, Users } from 'lucide-react'

export default function BriefingModal({ isOpen, onClose, onSend, userName, users = [] }) {
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [priority, setPriority] = useState('normal')
  const [selectedUsers, setSelectedUsers] = useState([])
  const [sendToAll, setSendToAll] = useState(true)

  function toggleUser(userId) {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  function handleSend() {
    if (!title || !message) return
    onSend({
      title,
      message,
      priority,
      sentBy: userName,
      sendToAll,
      recipients: sendToAll ? [] : selectedUsers
    })
    setTitle('')
    setMessage('')
    setPriority('normal')
    setSelectedUsers([])
    setSendToAll(true)
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
        style={{ maxWidth: '500px' }}
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
            rows={4}
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

        {users.length > 0 && (
          <div className="form-group">
            <label className="flex items-center gap-2">
              <Users size={14} /> Ontvangers
            </label>
            <div style={{ marginBottom: '12px' }}>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', marginBottom: '8px' }}>
                <input
                  type="checkbox"
                  checked={sendToAll}
                  onChange={() => setSendToAll(true)}
                />
                <span>Alle medewerkers ({users.length})</span>
              </label>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!sendToAll}
                  onChange={() => setSendToAll(false)}
                />
                <span>Selecteer medewerkers</span>
              </label>
            </div>
            {!sendToAll && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className={`btn btn-sm ${selectedUsers.includes(u.id) ? 'btn-primary' : 'btn-outline'}`}
                    style={{ fontSize: '0.8rem' }}
                  >
                    {u.full_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2" style={{ marginTop: '24px' }}>
          <button className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
            Annuleren
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleSend}
            disabled={!title || !message || (!sendToAll && selectedUsers.length === 0)}
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
    low: { bg: 'var(--bg-elevated)', color: 'var(--text-muted)' },
    normal: { bg: 'var(--info-bg)', color: 'var(--info)' },
    high: { bg: 'var(--danger-bg)', color: 'var(--danger)' }
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
        {!briefing.sendToAll && briefing.recipients?.length > 0 && ` • ${briefing.recipients.length} ontvangers`}
      </div>
    </div>
  )
}