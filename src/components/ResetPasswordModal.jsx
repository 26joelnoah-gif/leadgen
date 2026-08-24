import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, KeyRound, Shuffle, Pencil, Eye, EyeOff, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import CopyButton from './CopyButton'

// v35: admin/manager reset het wachtwoord van iemand anders via de Edge
// Function "manage-password" (service-role - de enige toegestane manier
// om auth.users te wijzigen). Twee modi: automatisch genereren (en tonen
// om door te geven) of zelf een wachtwoord intypen.
export default function ResetPasswordModal({ isOpen, onClose, targetUser, onDone }) {
  const toast = useToast()
  const [mode, setMode] = useState('generate')
  const [manualPassword, setManualPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null) // { password } na genereren

  useEffect(() => {
    if (isOpen) {
      setMode('generate')
      setManualPassword('')
      setShowPassword(false)
      setResult(null)
    }
  }, [isOpen, targetUser?.id])

  if (!isOpen || !targetUser) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'manual' && manualPassword.trim().length < 6) {
      toast('Wachtwoord moet minimaal 6 tekens zijn', 'error')
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('manage-password', {
        body: mode === 'generate'
          ? { targetUserId: targetUser.id, generate: true }
          : { targetUserId: targetUser.id, newPassword: manualPassword.trim() }
      })
      if (error) {
        let msg = error.message
        try {
          const body = await error.context?.json?.()
          if (body?.error) msg = body.error
        } catch { /* geen json */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)

      if (mode === 'generate') {
        setResult({ password: data.password })
      } else {
        toast(`Wachtwoord van ${targetUser.full_name} is gewijzigd`, 'success')
        onDone?.()
        onClose()
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleClose() {
    if (result) onDone?.()
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={handleClose}
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
          <h2><KeyRound size={18} /> Wachtwoord resetten</h2>
          <button className="modal-close" onClick={handleClose}><X size={18} /></button>
        </div>

        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          Voor <strong>{targetUser.full_name}</strong> ({targetUser.email})
        </p>

        {result ? (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px',
              color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem'
            }}>
              <CheckCircle2 size={18} /> Nieuw wachtwoord ingesteld
            </div>
            <div className="form-group">
              <label>Nieuw wachtwoord</label>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <input
                  className="form-dark"
                  readOnly
                  value={result.password}
                  style={{ flex: 1, fontFamily: 'monospace', letterSpacing: '0.5px' }}
                  onFocus={e => e.target.select()}
                />
                <CopyButton text={result.password} label="Kopieer wachtwoord" />
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.5, marginTop: '4px' }}>
              Geef dit wachtwoord door aan {targetUser.full_name.split(' ')[0]}. Het wordt hierna nergens
              meer getoond - noteer het nu of kopieer het.
            </p>
            <button type="button" className="btn btn-primary mt-4" onClick={handleClose} style={{ width: '100%' }}>
              Klaar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="flex gap-2 mb-4">
              <button
                type="button"
                className={`btn btn-sm ${mode === 'generate' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setMode('generate')}
                style={{ flex: 1 }}
              >
                <Shuffle size={14} /> Genereren
              </button>
              <button
                type="button"
                className={`btn btn-sm ${mode === 'manual' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setMode('manual')}
                style={{ flex: 1 }}
              >
                <Pencil size={14} /> Zelf intypen
              </button>
            </div>

            {mode === 'generate' ? (
              <p className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                Er wordt een willekeurig, veilig wachtwoord aangemaakt. Na het opslaan zie je het
                eenmalig om door te geven.
              </p>
            ) : (
              <div className="form-group">
                <label>Nieuw wachtwoord</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    name="reset-wachtwoord"
                    autoComplete="new-password"
                    className="form-dark"
                    value={manualPassword}
                    onChange={e => setManualPassword(e.target.value)}
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
            )}

            <div className="flex gap-2 mt-4">
              <button type="button" className="btn btn-outline" onClick={handleClose} style={{ flex: 1 }}>
                Annuleren
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
                {loading ? 'Bezig...' : 'Wachtwoord instellen'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}
