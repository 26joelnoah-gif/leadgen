import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Calendar, Clock, AlertCircle, Check, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

function pad(n) { return String(n).padStart(2, '0') }

function toDateInput(d) {
  const date = d instanceof Date ? d : new Date()
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export default function BlockTimeModal({
  isOpen,
  onClose,
  onSaved,
  initialDate = null,
  accountmanagers = [],
  defaultUserId = null
}) {
  const { user, profile } = useAuth()
  const toast = useToast()

  const [date, setDate] = useState(() => toDateInput(initialDate))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('10:00')
  const [title, setTitle] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(defaultUserId || user?.id)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (isOpen) {
      setDate(toDateInput(initialDate))
      setStartTime('09:00')
      setEndTime('10:00')
      setTitle('')
      setSelectedUserId(defaultUserId || user?.id)
      setErrorMsg('')
    }
  }, [isOpen, initialDate, defaultUserId, user?.id])

  if (!isOpen) return null

  const isAdmin = profile?.role === 'admin'

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    if (!date || !startTime || !endTime) {
      setErrorMsg('Vul alle verplichte velden in.')
      return
    }

    const startIso = new Date(`${date}T${startTime}:00`).toISOString()
    const endIso = new Date(`${date}T${endTime}:00`).toISOString()

    if (new Date(endIso) <= new Date(startIso)) {
      setErrorMsg('Eindtijd moet na de begintijd liggen.')
      return
    }

    setSaving(true)
    try {
      const { error } = await supabase.from('agenda_blocks').insert({
        user_id: selectedUserId || user.id,
        organization_id: profile?.organization_id || null,
        start_at: startIso,
        end_at: endIso,
        title: (title || '').trim() || 'Geblokkeerd'
      })

      if (error) throw error

      toast('Tijdvak succesvol geblokkeerd', 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      console.error('Blokkeren mislukt:', err)
      setErrorMsg(err.message || 'Kon tijdvak niet blokkeren.')
      toast(err.message || 'Fout bij opslaan van blokkade', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
      style={{ zIndex: 11000 }}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="modal glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '440px', width: '92%' }}
      >
        <div className="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Lock size={18} className="text-secondary" /> Tijdvak blokkeren
          </h2>
          <button onClick={onClose} className="modal-close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        <p className="text-muted text-xs mb-4">
          Tijdens een geblokkeerd tijdvak kunnen bellers geen afspraken inplannen voor deze accountmanager.
        </p>

        {errorMsg && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.12)', border: '1px solid var(--error, #EF4444)',
            color: 'var(--error, #EF4444)', borderRadius: '8px', padding: '10px 14px',
            fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px'
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isAdmin && accountmanagers.length > 1 && (
            <div className="form-group mb-3">
              <label className="text-xs text-muted font-bold block mb-1">Accountmanager</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                className="form-control w-full"
                required
              >
                {accountmanagers.map(am => (
                  <option key={am.id} value={am.id}>{am.full_name} ({am.email})</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group mb-3">
            <label className="text-xs text-muted font-bold block mb-1">
              <Calendar size={13} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} /> Datum
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="form-control w-full"
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div className="form-group">
              <label className="text-xs text-muted font-bold block mb-1">
                <Clock size={13} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} /> Begintijd
              </label>
              <input
                type="time"
                step="900"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="form-control w-full"
                required
              />
            </div>
            <div className="form-group">
              <label className="text-xs text-muted font-bold block mb-1">
                <Clock size={13} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} /> Eindtijd
              </label>
              <input
                type="time"
                step="900"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="form-control w-full"
                required
              />
            </div>
          </div>

          <div className="form-group mb-4">
            <label className="text-xs text-muted font-bold block mb-1">
              Reden of titel (optioneel)
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Bijv. Intern overleg, Tandarts, Niet beschikbaar"
              className="form-control w-full"
            />
          </div>

          <div className="flex gap-2" style={{ marginTop: '20px' }}>
            <button type="button" onClick={onClose} className="btn btn-outline" style={{ flex: 1 }}>
              Annuleren
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {saving ? 'Opslaan...' : <><Check size={16} /> Blokkade opslaan</>}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
