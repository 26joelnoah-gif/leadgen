import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, UserCog, Mail, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

// v126: admin wijzigt de naam en/of het e-mailadres (= inlognaam) van een
// ander account. Loopt via de Edge Function "manage-password" met
// action "account" (service role), want het e-mailadres staat in auth.users
// en dat kan de app niet rechtstreeks aanpassen. Alleen een admin mag dit;
// de functie controleert dat zelf ook.
export default function EditAccountModal({ isOpen, onClose, targetUser, onDone }) {
  const toast = useToast()
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [klaar, setKlaar] = useState(null) // { email, naam } na opslaan

  useEffect(() => {
    if (isOpen && targetUser) {
      setNaam(targetUser.full_name || '')
      setEmail(targetUser.email || '')
      setKlaar(null)
    }
  }, [isOpen, targetUser?.id])

  if (!isOpen || !targetUser) return null

  const naamGewijzigd = naam.trim() && naam.trim() !== (targetUser.full_name || '')
  const emailGewijzigd = email.trim() && email.trim().toLowerCase() !== (targetUser.email || '').toLowerCase()
  const ietsGewijzigd = naamGewijzigd || emailGewijzigd

  async function handleSubmit(e) {
    e.preventDefault()
    if (!ietsGewijzigd) { onClose(); return }
    if (emailGewijzigd && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast('Dat is geen geldig e-mailadres', 'error')
      return
    }
    setLoading(true)
    try {
      const body = { targetUserId: targetUser.id, action: 'account' }
      if (naamGewijzigd) body.newName = naam.trim()
      if (emailGewijzigd) body.newEmail = email.trim()
      const { data, error } = await supabase.functions.invoke('manage-password', { body })
      if (error) {
        let msg = error.message
        try {
          const b = await error.context?.json?.()
          if (b?.error) msg = b.error
        } catch { /* geen json */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      setKlaar({ email: data?.email || email.trim(), naam: data?.full_name || naam.trim(), emailGewijzigd })
      onDone?.()
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
          <h2><UserCog size={18} /> Accountgegevens</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {klaar ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: 'var(--success)', fontWeight: 700, fontSize: '0.9rem' }}>
              <CheckCircle2 size={18} /> Opgeslagen
            </div>
            <p className="text-muted" style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>
              <strong>{klaar.naam}</strong> heeft nu het e-mailadres <strong>{klaar.email}</strong>.
              {klaar.emailGewijzigd && ' Daarmee logt hij of zij voortaan in; het wachtwoord blijft hetzelfde. Geef het nieuwe adres even door.'}
            </p>
            <button type="button" className="btn btn-primary mt-4" onClick={onClose} style={{ width: '100%' }}>
              Klaar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} autoComplete="off">
            <div className="form-group">
              <label>Naam</label>
              <input
                className="form-dark"
                name="account-naam"
                autoComplete="off"
                value={naam}
                onChange={e => setNaam(e.target.value)}
                placeholder="Voor- en achternaam"
                maxLength={120}
                style={{ width: '100%' }}
                required
              />
            </div>
            <div className="form-group">
              <label><Mail size={13} style={{ verticalAlign: '-2px' }} /> E-mailadres (inlognaam)</label>
              <input
                className="form-dark"
                type="email"
                name="account-email"
                autoComplete="off"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="naam@bedrijf.nl"
                style={{ width: '100%' }}
                required
              />
            </div>
            {emailGewijzigd && (
              <p className="text-muted" style={{ fontSize: '0.78rem', lineHeight: 1.5, marginTop: '-4px' }}>
                Het nieuwe adres werkt meteen, zonder bevestigingsmail. Het oude adres werkt daarna niet meer om in te loggen.
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
                Annuleren
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading || !ietsGewijzigd} style={{ flex: 1 }}>
                {loading ? 'Bezig...' : 'Opslaan'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}
