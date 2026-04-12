import { motion } from 'framer-motion'
import { TrendingUp, Users, ChevronRight, AlertTriangle } from 'lucide-react'

export default function PipelineFunnel({ leads = [] }) {
  const statuses = [
    { key: 'new', label: 'Nieuwe Leads', color: '#3B82F6' },
    { key: 'contacted', label: 'In Contact', keys: ['mailen', 'voicemail', 'later_bellen', 'geen_gehoor'], color: '#F59E0B' },
    { key: 'terugbelafspraak', label: 'Terugbelafspraak', color: '#10B981' },
    { key: 'afspraak_gemaakt', label: 'Afspraak Gemaakt', color: '#D4AF37' },
    { key: 'deal', label: 'Deals Gesloten', color: '#0F4C36' }
  ]

  const getCount = (statusObj) => {
    if (statusObj.keys) {
      return leads.filter(l => statusObj.keys.includes(l.status)).length
    }
    return leads.filter(l => l.status === statusObj.key).length
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
      
      <div className="funnel-container flex items-end justify-between gap-1 mt-3" style={{ height: '240px', paddingBottom: '40px' }}>
        {data.map((step, i) => {
          const height = (step.count / maxCount) * 100
          const prevStep = data[i - 1]
          const conversion = prevStep && prevStep.count > 0 ? Math.round((step.count / prevStep.count) * 100) : null

          return (
            <div key={step.key} className="funnel-step flex-1 flex flex-column items-center relative h-full justify-end">
              {conversion !== null && (
                <div className="conversion-rate" style={{ position: 'absolute', left: '-15%', top: '50%', transform: 'translateY(-50%)', background: 'var(--bg-light)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, z-index: 2, border: '1px solid var(--border)' }}>
                  {conversion}%
                </div>
              )}
              
              <div className="step-label text-muted mb-2 text-center" style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                {step.count}
              </div>
              
              <motion.div 
                initial={{ height: 0 }}
                animate={{ height: `${height}%` }}
                className="step-bar"
                style={{ 
                  width: '80%', 
                  background: step.color,
                  borderRadius: '6px 6px 2px 2px',
                  opacity: 0.8 + (i * 0.05),
                  boxShadow: `0 4px 15px ${step.color}33`,
                  position: 'relative'
                }}
              >
                {step.count === 0 && height === 0 && (
                   <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '4px' }}>
                     <AlertTriangle size={12} className="text-muted" opacity={0.3} />
                   </div>
                )}
              </motion.div>
              
              <div className="step-name mt-2 text-center" style={{ fontSize: '0.7rem', fontWeight: 700, width: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {step.label}
              </div>
            </div>
          )
        })}
      </div>

      <div className="funnel-meta flex justify-between mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
         <div className="text-muted" style={{ fontSize: '0.8rem' }}>
           Totaal Leads: <strong>{leads.length}</strong>
         </div>
         <div className="text-secondary" style={{ fontSize: '0.8rem', fontWeight: 700 }}>
           Conversie: {leads.length > 0 ? Math.round((data[data.length - 1].count / leads.length) * 100) : 0}%
         </div>
      </div>

      <style>{`
        .funnel-step { position: relative; }
        .step-bar { transition: height 0.6s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>
    </div>
  )
}
