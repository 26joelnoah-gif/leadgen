import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Send, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mailSourceLabel } from '../lib/mailSources'

// v69: Mailingservice vanuit het belscherm. De beller checkt e-mail en
// contactpersoon, de Edge Function 'mailingservice' laat de bron van het
// project de mail sturen. Afboeken op 'mail_verstuurd' doet de aanroeper
// (WorkInterface -> handleLeadDisposition) pas NA een gelukte verzending.
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i

export default function MailingserviceModal({ lead, defaults, mailService, onClose, onSent }) {
  const [email, setEmail] = useState((defaults?.email || '').trim())
  const [contactpersoon, setContactpersoon] = useState((defaults?.contactpersoon || '').trim())
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const bron = mailSourceLabel(mailService?.source)
  const dagen = mailService?.follow_up_days || 5
  const emailOk = EMAIL_RE.test(email.trim())

  async function handleSend() {
    if (sending || !emailOk) return
    setSending(true)
    setError('')
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mailingservice', {
        body: { lead_id: lead.id, email: email.trim(), contactpersoon: contactpersoon.trim() || undefined }
      })
      if (fnError) {
        // supabase-js geeft bij een foutstatus de body in fnError.context
        let msg = 'Versturen mislukt'
        try { msg = (await fnError.context?.json())?.error || msg } catch { /* geen json */ }
        throw new Error(msg)
      }
      if (!data?.ok) throw new Error(data?.error || 'Versturen mislukt')
      await onSent({ email: data.email, contactpersoon: contactpersoon.trim(), followUpDays: data.follow_up_days || dagen, source: data.source })
    } catch (e) {
      setError(e.message || 'Versturen mislukt')
      setSending(false)
    }
  }

  const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '16px' }
  const labelStyle = { display: 'block', color: 'var(--text-muted)', marginBottom: '6px', fontSize: '0.85rem' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', width: '100%', maxWidth: '460px', padding: '28px', position: 'relative' }}>
        <button onClick={onClose} disabled={sending} aria-label="Sluiten" style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>

        <h2 style={{ color: 'var(--text-primary)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
          <Mail size={20} /> MAILINGSERVICE
        </h2>
        <p className="text-muted" style={{ margin: '0 0 18px', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {bron} stuurt de mail naar <strong style={{ color: 'var(--text-primary)' }}>{lead?.name}</strong>. Daarna staat de lead op Mail verstuurd en komt hij over {dagen} dagen terug om op te volgen.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>E-mailadres (verplicht)</label>
            <input type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@bedrijf.nl" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Contactpersoon (voor de aanhef)</label>
            <input type="text" autoComplete="off" value={contactpersoon} onChange={e => setContactpersoon(e.target.value)} placeholder="Voornaam" style={inputStyle} />
          </div>

          {error && (
            <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '10px 12px', fontSize: '0.85rem' }}>{error}</div>
          )}

          <button
            onClick={handleSend}
            disabled={sending || !emailOk}
            style={{ background: 'var(--info, #0EA5E9)', color: 'var(--text-on-accent)', padding: '14px', borderRadius: '8px', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: sending || !emailOk ? 'not-allowed' : 'pointer', opacity: sending || !emailOk ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <Send size={16} /> {sending ? 'VERSTUREN...' : 'MAIL VERSTUREN & VOLGENDE'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
