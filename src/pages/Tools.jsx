import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FileSignature, ExternalLink, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'

// v59: Tools voor accountmanagers. De offerte-tool van het bestelplatform
// (ReachConnect) is een statische pagina in public/tools/; hij leest de
// LeadGen-sessie uit localStorage (zelfde origin) en slaat elke offerte op in
// public.offertes. Deze pagina is alleen de ingang + het overzicht.
const eur = (n) => '€' + Math.round(Number(n) || 0).toLocaleString('nl-NL')
const STATUS = {
  concept: { label: 'Concept', color: 'var(--text-muted)' },
  getekend: { label: 'Getekend', color: '#22c55e' },
  verzonden: { label: 'Verzonden', color: 'var(--primary)' },
  geannuleerd: { label: 'Geannuleerd', color: '#ef4444' },
}

export default function Tools() {
  const { user, profile, isDemoMode } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager'

  async function load() {
    if (!user?.id || isDemoMode) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('offertes')
      .select('id, nummer, status, zaak_naam, accountmanager, pakket, eenmalig_ex, maandbedrag_ex, getekend_op, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200)
    if (!error) setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [user?.id])

  const getekend = rows.filter(r => r.status === 'getekend' || r.status === 'verzonden')
  const somEenmalig = getekend.reduce((a, r) => a + Number(r.eenmalig_ex || 0), 0)
  const somMaand = getekend.reduce((a, r) => a + Number(r.maandbedrag_ex || 0), 0)

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Header />
      <main className="container">
        <div className="page-header flex justify-between items-end">
          <div>
            <h1>Tools</h1>
            <p>Hulpmiddelen voor accountmanagers. Offertes worden automatisch in LeadGen bewaard.</p>
          </div>
        </div>

        <div className="glass-panel mb-3" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,255,149,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00ff95' }}>
            <FileSignature size={24} />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>Offerte-tool bestelplatform</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Pakket en modules kiezen, ROI laten zien, klant tekent op het scherm. Werkt het best op telefoon of tablet.
              Na tekenen: "Print / PDF" en de PDF mailen naar de klant en naar Noah.
            </div>
          </div>
          <a className="btn btn-primary" href="/tools/offerte-tool.html" style={{ whiteSpace: 'nowrap' }}>
            Nieuwe offerte <ExternalLink size={16} />
          </a>
        </div>

        <div className="glass-panel" style={{ padding: '20px' }}>
          <div className="flex justify-between items-center mb-2" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{isAdmin ? 'Alle offertes' : 'Mijn offertes'}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {getekend.length} getekend · {eur(somEenmalig)} eenmalig · {eur(somMaand)}/mnd
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={14} /> Vernieuwen</button>
          </div>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Laden…</p>
          ) : rows.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Nog geen offertes. Start er een met de knop hierboven.</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nummer</th><th>Zaak</th>{isAdmin && <th>Accountmanager</th>}<th>Pakket</th>
                    <th style={{ textAlign: 'right' }}>Eenmalig</th><th style={{ textAlign: 'right' }}>Per maand</th><th>Status</th><th>Laatst</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const st = STATUS[r.status] || STATUS.concept
                    return (
                      <tr key={r.id}>
                        <td className="mono-num">{r.nummer}</td>
                        <td>{r.zaak_naam}</td>
                        {isAdmin && <td>{r.accountmanager || '—'}</td>}
                        <td style={{ textTransform: 'capitalize' }}>{r.pakket}</td>
                        <td style={{ textAlign: 'right' }}>{eur(r.eenmalig_ex)}</td>
                        <td style={{ textAlign: 'right' }}>{eur(r.maandbedrag_ex)}</td>
                        <td><span style={{ color: st.color, fontWeight: 600 }}>{st.label}</span></td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {new Date(r.getekend_op || r.updated_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 12 }}>
            De tool bewaart de lopende offerte ook op het apparaat zelf; een nieuwe offerte start je in de tool met "Nieuwe offerte" (accountmanager-weergave).
          </p>
        </div>
      </main>
    </motion.div>
  )
}
