import { motion } from 'framer-motion'
import { X, Sparkles, CheckCircle2, MinusCircle, AlertTriangle } from 'lucide-react'

// v33: resultaten-overzicht na AI-verrijken - per lead precies zien wat er
// gevonden en toegevoegd is, in plaats van alleen een samenvattings-toast.
const FIELD_LABELS = {
  contact_person: 'Contactpersoon',
  function: 'Functie',
  email: 'E-mail',
  website: 'Website',
  extra_info1: 'Branche/extra',
  decision_maker: 'Beslisser',
  notes: 'Notitie'
}

export default function EnrichResultsModal({ results, onClose }) {
  if (!results) return null
  const ok = results.filter(r => r.status === 'ok')
  const nodata = results.filter(r => r.status === 'no_data')
  const errs = results.filter(r => r.status === 'error')

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={onClose} style={{ zIndex: 10001 }}>
      <motion.div
        initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }}
        className="modal glass-panel" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
      >
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
            <Sparkles size={18} style={{ color: 'var(--secondary)' }} /> AI-verrijking klaar
          </h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
        </div>

        <div style={{ padding: '14px 22px', display: 'flex', gap: '10px', flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--success)' }}>{ok.length} aangevuld</span>
          {nodata.length > 0 && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>{nodata.length} niets gevonden</span>}
          {errs.length > 0 && <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--warning)' }}>{errs.length} fout(en)</span>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 22px 18px' }}>
          {results.map((r, i) => (
            <div key={r.leadId || i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              {r.status === 'ok'
                ? <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0, marginTop: '2px' }} />
                : r.status === 'no_data'
                ? <MinusCircle size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />
                : <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{r.name || 'Lead'}</div>
                {r.status === 'ok' && r.added && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {Object.entries(r.added).map(([f, v]) => (
                      <span key={f} style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: 'var(--success)', padding: '3px 8px', borderRadius: '8px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        + {FIELD_LABELS[f] || f}: {f === 'decision_maker' ? 'ja' : String(v)}
                      </span>
                    ))}
                  </div>
                )}
                {r.status === 'no_data' && (
                  <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>Geen (nieuwe) openbare info gevonden</div>
                )}
                {r.status === 'error' && (
                  <div style={{ fontSize: '0.75rem', marginTop: '2px', color: 'var(--warning)', overflowWrap: 'break-word' }}>{r.detail || 'Onbekende fout'}</div>
                )}
              </div>
            </div>
          ))}
          {results.length === 0 && <p className="text-muted" style={{ padding: '16px 0' }}>Geen resultaten.</p>}
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-primary btn-block" onClick={onClose} style={{ fontWeight: 800 }}>Sluiten</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
