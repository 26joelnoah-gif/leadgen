import { motion } from 'framer-motion'
import { PartyPopper, X } from 'lucide-react'

// v44: verschijnt zodra een account een functie erbij krijgt t.o.v. de vorige
// keer dat de tutorial of deze melding is gezien - bijv. na het aanzetten van
// een extra manager-recht, of een nieuwe/heraangezette afboekreden. Werkt op
// dezelfde lijst als OnboardingTutorial (featureRegistry.js).
export default function NewFeatureNotice({ features, onClose, onOpenTutorial }) {
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
        style={{ maxWidth: '440px' }}
      >
        <div className="modal-header">
          <h2><PartyPopper size={18} /> Je hebt een nieuwe beschikbare functie</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-2" style={{ marginBottom: '16px' }}>
          {features.map(f => (
            <div key={f.key} className="rounded-xl border border-border p-3" style={{ background: 'var(--bg-elevated)' }}>
              <div className="font-bold text-body text-sm">{f.label}</div>
              <div className="text-[11px] text-muted leading-snug">{f.description}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onOpenTutorial}>Bekijk in tutorial</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Mooi, bedankt</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
