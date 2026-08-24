import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, UserCircle2, Lock, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

// v35: eigen account-instellingen - vooral "wachtwoord wijzigen" (aanpassen
// van je eigen wachtwoord). Dit gaat rechtstreeks via supabase.auth.updateUser:
// je bent al ingelogd met een geldige sessie, dus dat mag altijd en heeft
// geen Edge Function/service-role nodig (dat is alleen nodig om IEMAND ANDERS
// z'n wachtwoord te zetten - zie ResetPasswordModal).
export default function AccountSettingsModal({ isOpen, onClose, profile }) {
  const toast = useToast()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setNewPassword('')
      setConfirmPassword('')
      setShowPassword(false)
    }
  }, [isOpen])

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (newPassword.trim().length < 6) {
      toast('Wachtwoord moet minimaal 6 tekens zijn', 'error')
      return
    }
    if (newPassword !== confirmPassword) {
      toast('De twee wachtwoorden komen niet overeen', 'error')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword.trim() })
      if (error) throw error
      toast('Je wachtwoord is gewijzigd', 'success')
      setNewPassword('')
      setConfirmPassword('')
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

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
        className="modal glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <div className="modal-header">
          <h2><UserCircle2 size={18} /> Mijn account</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 700 }}>{profile?.full_name}</div>
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>{profile?.email}</div>
        </div>

        <div className="text-[10px] font-black uppercase text-muted tracking-widest" style={{ marginBottom: '10px' }}>
          Wachtwoord wijzigen
        </div>
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label><Lock size={14} /> Nieuw wachtwoord</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                name="account-nieuw-wachtwoord"
                autoComplete="new-password"
                className="form-dark"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimaal 6 tekens"
                minLength={6}
                style={{ width: '100%', paddingRight: '40px' }}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label><Lock size={14} /> Herhaal nieuw wachtwoord</label>
            <input
              type={showPassword ? 'text' : 'password'}
              name="account-herhaal-wachtwoord"
              autoComplete="new-password"
              className="form-dark"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Nogmaals hetzelfde wachtwoord"
              minLength={6}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div className="flex gap-2 mt-4">
            <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
              Annuleren
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Bezig...' : 'Wachtwoord opslaan'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
