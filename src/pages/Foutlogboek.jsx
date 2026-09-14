// Foutlogboek (betrouwbaarheid v71)
//
// Hier zie je wat er bij je mensen misgaat zonder dat iemand hoeft te bellen.
// Fouten worden gebundeld: dezelfde fout tien keer is één regel met het
// aantal erbij, zodat je meteen ziet wat het meeste pijn doet.
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion } from 'framer-motion'
import { AlertTriangle, RefreshCw, Trash2, ChevronDown, ChevronRight, ShieldCheck } from 'lucide-react'
import Header from '../components/Header'
import { useToast } from '../components/Toast'
import { foutTekst } from '../lib/retry'

const PERIODES = [
  { key: '24u', label: 'Laatste 24 uur', uren: 24 },
  { key: '7d', label: 'Laatste 7 dagen', uren: 24 * 7 },
  { key: '30d', label: 'Laatste 30 dagen', uren: 24 * 30 }
]

export default function Foutlogboek() {
  const toast = useToast()
  const [rijen, setRijen] = useState([])
  const [laden, setLaden] = useState(true)
  const [periode, setPeriode] = useState('7d')
  const [open, setOpen] = useState({})

  useEffect(() => { haalOp() }, [periode])

  async function haalOp() {
    setLaden(true)
    const uren = PERIODES.find(p => p.key === periode)?.uren || 168
    const vanaf = new Date(Date.now() - uren * 3600 * 1000).toISOString()
    const { data, error } = await supabase
      .from('app_errors')
      .select('*, profiles:profiles!user_id(full_name)')
      .gte('created_at', vanaf)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) toast(`Laden mislukt: ${foutTekst(error)}`, 'error', 7000)
    setRijen(data || [])
    setLaden(false)
  }

  async function opruimen() {
    const { data, error } = await supabase.rpc('purge_app_errors', { p_days: 30 })
    if (error) return toast(`Opruimen mislukt: ${foutTekst(error)}`, 'error', 7000)
    toast(`${data ?? 0} oude meldingen opgeruimd`, 'success')
    haalOp()
  }

  // bundelen op context + boodschap
  const groepen = Object.values(rijen.reduce((acc, r) => {
    const sleutel = `${r.context}::${r.message}`
    if (!acc[sleutel]) acc[sleutel] = { sleutel, context: r.context, message: r.message, aantal: 0, laatste: r.created_at, mensen: new Set(), voorbeelden: [] }
    acc[sleutel].aantal += 1
    acc[sleutel].mensen.add(r.profiles?.full_name || 'Onbekend')
    if (acc[sleutel].voorbeelden.length < 5) acc[sleutel].voorbeelden.push(r)
    if (r.created_at > acc[sleutel].laatste) acc[sleutel].laatste = r.created_at
    return acc
  }, {})).sort((a, b) => b.aantal - a.aantal)

  const tijd = (t) => new Date(t).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <Header />
      <main style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '18px' }}>
          <div>
            <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.4rem' }}>
              <AlertTriangle size={22} /> Foutlogboek
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
              Wat er bij je team is misgegaan in de app. Dezelfde fout staat gebundeld op één regel.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <select className="input" value={periode} onChange={e => setPeriode(e.target.value)} style={{ minWidth: '160px' }}>
              {PERIODES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" onClick={haalOp} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={14} /> Verversen
            </button>
            <button className="btn btn-secondary btn-sm" onClick={opruimen} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Trash2 size={14} /> Ouder dan 30 dagen wissen
            </button>
          </div>
        </div>

        {laden && <p style={{ color: 'var(--text-secondary)' }}>Laden...</p>}

        {!laden && groepen.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            <ShieldCheck size={34} style={{ color: '#10B981' }} />
            <strong style={{ color: 'var(--text-primary)' }}>Geen fouten in deze periode</strong>
            <span style={{ fontSize: '0.88rem' }}>Zo hoort het.</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {groepen.map(g => (
            <div key={g.sleutel} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <button
                onClick={() => setOpen(o => ({ ...o, [g.sleutel]: !o[g.sleutel] }))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left',
                  background: 'none', border: 'none', color: 'var(--text-primary)', padding: '12px 14px', cursor: 'pointer'
                }}
              >
                {open[g.sleutel] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span style={{
                  background: g.aantal >= 5 ? '#B91C1C' : 'var(--bg-elevated)',
                  color: g.aantal >= 5 ? '#fff' : 'var(--text-primary)',
                  borderRadius: '999px', padding: '2px 10px', fontWeight: 800, fontSize: '0.8rem', flexShrink: 0
                }}>
                  {g.aantal}x
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: '0.92rem' }}>{g.context}</strong>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', wordBreak: 'break-word' }}>{g.message}</span>
                </span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{tijd(g.laatste)}</span>
              </button>

              {open[g.sleutel] && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  <p style={{ margin: '0 0 8px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Wie:</strong> {[...g.mensen].join(', ')}
                  </p>
                  {g.voorbeelden.map(v => (
                    <div key={v.id} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid var(--border)' }}>
                      <div>{tijd(v.created_at)} op <code>{v.path || '-'}</code> (versie {v.app_build || '?'})</div>
                      {v.extra && <div style={{ marginTop: '4px' }}><code style={{ wordBreak: 'break-all' }}>{JSON.stringify(v.extra)}</code></div>}
                      {v.stack && (
                        <details style={{ marginTop: '6px' }}>
                          <summary style={{ cursor: 'pointer' }}>Technische details</summary>
                          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.75rem', marginTop: '6px' }}>{v.stack}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>
    </motion.div>
  )
}
