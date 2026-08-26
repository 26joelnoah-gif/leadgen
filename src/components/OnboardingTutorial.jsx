import { motion } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import { ROLE_LABELS } from '../utils/featureRegistry'

// v44: eerste-keer tutorial (en handmatig te heropenen via het "?"-icoon in
// de header) - toont per rol ALLEEN de functies die voor dit account ook
// echt aan staan. Bron van de lijst: featureRegistry.js, zodat dit nooit uit
// sync kan raken met de "nieuwe functie beschikbaar"-melding.
export default function OnboardingTutorial({ profile, features, onClose }) {
  const groups = []
  const byGroup = {}
  features.forEach(f => {
    if (!byGroup[f.group]) { byGroup[f.group] = []; groups.push(f.group) }
    byGroup[f.group].push(f)
  })

  const roleLabel = ROLE_LABELS[profile?.role] || profile?.role
  const firstName = (profile?.full_name || '').split(' ')[0]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      style={{ zIndex: 21000 }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="modal glass-panel"
        style={{ maxWidth: '560px', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <h2><Sparkles size={18} /> Welkom{firstName ? `, ${firstName}` : ''}!</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="text-muted text-sm" style={{ marginBottom: '18px' }}>
          Dit is een kort overzicht van wat je als <strong className="text-body">{roleLabel}</strong> kan doen in LeadGen -
          alleen de functies die voor jouw account aan staan. Rechten of afboekredenen die (nog) niet voor jou
          zijn aangezet, staan hier dus ook niet tussen.
        </p>

        {groups.map(group => (
          <div key={group} style={{ marginBottom: '18px' }}>
            <div className="text-[10px] font-black uppercase text-muted tracking-widest" style={{ marginBottom: '8px' }}>{group}</div>
            <div className="flex flex-col gap-2">
              {byGroup[group].map(f => (
                <div key={f.key} className="rounded-xl border border-border p-3" style={{ background: 'var(--bg-elevated)' }}>
                  <div className="font-bold text-body text-sm">{f.label}</div>
                  <div className="text-[11px] text-muted leading-snug">{f.description}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {features.length === 0 && (
          <p className="text-muted text-sm">Er staan nog geen functies voor je klaar - vraag je beheerder om je aan een project te koppelen.</p>
        )}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: '8px' }} onClick={onClose}>
          Snap ik, bedankt!
        </button>
      </motion.div>
    </motion.div>
  )
}
