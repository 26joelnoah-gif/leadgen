import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'

// Horizontale funnel: per fase een balk waarvan de breedte de verhouding toont.
// Leesbaar bij elke verdeling (de oude verticale variant liep visueel vast).
export default function PipelineFunnel({ leads = [], isDemoMode = false }) {
  const count = statuses => leads.filter(l => l && statuses.includes(l.status)).length

  const stages = [
    { label: 'Nieuw', value: count(['new']), color: 'var(--primary)' },
    { label: 'In behandeling', value: count(['geen_gehoor', 'mailbox', 'later_bellen', 'onjuiste_timing']), color: 'var(--info)' },
    { label: 'Terugbelafspraak', value: count(['terugbelafspraak']), color: 'var(--secondary)' },
    { label: 'Afspraak gemaakt', value: count(['afspraak_gemaakt']), color: 'var(--success)' },
    { label: 'Deal', value: count(['deal']), color: 'var(--success)' }
  ]

  const total = leads.length
  const max = Math.max(1, ...stages.map(s => s.value))
  const deals = stages[4].value
  const conversie = total > 0 ? ((deals / total) * 100).toFixed(1) : '0.0'

  return (
    <div className="card glass-panel" style={{ padding: '24px' }}>
      <div className="card-header" style={{ marginBottom: '16px', paddingBottom: '12px' }}>
        <span className="card-title"><TrendingUp size={18} /> Conversie funnel</span>
        <span className="text-muted" style={{ fontSize: '0.8rem' }}>
          {total} leads · conversie naar deal: <strong style={{ color: 'var(--secondary)' }}>{conversie}%</strong>
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {stages.map((stage, i) => {
          const pct = total > 0 ? Math.round((stage.value / total) * 100) : 0
          const width = Math.max(stage.value > 0 ? 6 : 2, Math.round((stage.value / max) * 100))
          return (
            <div key={stage.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(72px, 150px) 1fr minmax(52px, 90px)', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>
                {stage.label}
              </span>
              <div style={{ background: 'var(--bg-elevated)', borderRadius: '6px', height: '26px', overflow: 'hidden' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                  style={{
                    height: '100%', borderRadius: '6px', background: stage.color,
                    opacity: stage.value > 0 ? 0.9 : 0.15,
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px'
                  }}
                >
                  {stage.value > 0 && width > 12 && (
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-on-accent)' }}>{stage.value}</span>
                  )}
                </motion.div>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {stage.value} <span className="text-muted" style={{ fontWeight: 500 }}>· {pct}%</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
