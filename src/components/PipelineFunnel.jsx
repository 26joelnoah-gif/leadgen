import { motion } from 'framer-motion'
import { TrendingUp, Users, ChevronRight, AlertTriangle } from 'lucide-react'
import { DEMO_LEADS } from '../lib/demoData'

export default function PipelineFunnel({ leads = [], isDemoMode = false }) {
  const funnelLeads = isDemoMode ? DEMO_LEADS : leads

  const statuses = [
    { key: 'new', label: 'Nieuwe Leads', color: 'var(--primary)' },
    { key: 'contacted', label: 'In Contact', keys: ['mailen', 'voicemail', 'later_bellen', 'geen_gehoor'], color: 'var(--warning)' },
    { key: 'terugbelafspraak', label: 'Terugbelafspraak', color: 'var(--success)' },
    { key: 'afspraak_gemaakt', label: 'Afspraak Gemaakt', color: 'var(--secondary)' },
    { key: 'deal', label: 'Deals Gesloten', color: 'var(--success)' }
  ]

  const getCount = (statusObj) => {
    if (statusObj.keys) {
      return funnelLeads.filter(l => statusObj.keys.includes(l.status)).length
    }
    return funnelLeads.filter(l => l.status === statusObj.key).length
  }

  const data = statuses.map(s => ({
    ...s,
    count: getCount(s)
  }))

  const maxCount = Math.max(...data.map(d => d.count), 1)

  return (
    <div className="card glass-panel mb-3">
      <div className="card-header">
        <span className="card-title"><TrendingUp size={18} /> Conversie Funnel</span>
      </div>

      <div className="funnel-container flex items-end justify-between gap-2 mt-4" style={{ height: '320px', paddingBottom: '50px' }}>
        {data.map((step, i) => {
          const height = (step.count / maxCount) * 100
          const prevStep = data[i - 1]
          const conversion = prevStep && prevStep.count > 0 ? Math.round((step.count / prevStep.count) * 100) : null

          return (
            <div key={step.key} className="funnel-step flex-1 flex flex-column items-center relative h-full justify-end">
              {conversion !== null && (
                <div className="conversion-rate" style={{ position: 'absolute', left: '50%', bottom: '0', transform: 'translateX(-50%)', background: 'var(--bg-light)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, zIndex: 2, border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {conversion}%
                </div>
              )}

              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                className="step-bar"
                style={{
                  width: '100%',
                  background: step.color,
                  borderRadius: '8px 8px 4px 4px',
                  opacity: 0.85 + (i * 0.03),
                  boxShadow: `0 4px 20px ${step.color}44`,
                  position: 'relative',
                  minHeight: '8px'
                }}
              >
                {step.count === 0 && height === 0 && (
                   <div style={{ position: 'absolute', top: '-20px', left: '50%', transform: 'translateX(-50%)' }}>
                     <AlertTriangle size={14} className="text-muted" style={{ opacity: 0.4 }} />
                   </div>
                )}
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: 'white', fontWeight: 800, fontSize: '1.1rem', textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                  {step.count}
                </div>
              </motion.div>

              <div className="step-name mt-3 text-center" style={{ fontSize: '0.75rem', fontWeight: 700, width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {step.label}
              </div>
            </div>
          )
        })}
      </div>

      <div className="funnel-meta flex justify-between mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
         <div className="text-muted" style={{ fontSize: '0.85rem' }}>
           Totaal Leads: <strong>{funnelLeads.length}</strong>
         </div>
         <div className="text-secondary" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
           Conversie: {funnelLeads.length > 0 ? Math.round((data[data.length - 1].count / funnelLeads.length) * 100) : 0}%
         </div>
      </div>

      <style>{`
        .funnel-step { position: relative; }
        .step-bar { transition: height 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  )
}
