import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FileSignature, ExternalLink, RefreshCw, Presentation, Calculator, MapPin, Sun } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import { TOOLS } from '../lib/tools'
import { useToolAccess } from '../hooks/useToolAccess'
import { OfferteChip, OPEN_OFFERTE_STATUSSEN } from '../components/OfferteStatus'
import { OFFERTE_TOOL_KEYS, verduurzamingHrefForOfferte } from '../hooks/useProjectTools'

// v60: welke kaarten hier staan bepaalt campaign_tools (per project, via
// useToolAccess); het register van tools staat in src/lib/tools.js.
const ICONS = { FileSignature, Presentation, Calculator, MapPin, Sun }

// v59: Tools voor accountmanagers. De offerte-tool van het bestelplatform
// (ReachConnect) is een statische pagina in public/tools/; hij leest de
// LeadGen-sessie uit localStorage (zelfde origin) en slaat elke offerte op in
// public.offertes. Deze pagina is alleen de ingang + het overzicht.
const eur = (n) => '€' + Math.round(Number(n) || 0).toLocaleString('nl-NL')
// v65: statussen en chips komen uit OfferteStatus.jsx (één bron voor
// contactkaart, belscherm en dit overzicht).
const FILTERS = [
  { id: 'open', label: 'Wacht op klant', test: r => ['verzonden', 'geopend'].includes(r.status) },
  { id: 'getekend', label: 'Getekend', test: r => r.status === 'getekend' },
  { id: 'verloopt', label: 'Verloopt deze week', test: r => ['verzonden', 'geopend'].includes(r.status) && r.sign_token_expires_at && (new Date(r.sign_token_expires_at) - Date.now()) < 7 * 86400000 },
  { id: 'concept', label: 'Concept', test: r => r.status === 'concept' },
  { id: 'alle', label: 'Alle', test: () => true },
]
const dd = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' }) : '—'

export default function Tools() {
  const { user, profile, isDemoMode } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('alle')
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager'
  const { toolKeys } = useToolAccess()
  const myTools = TOOLS.filter(t => toolKeys.includes(t.key))
  // v76: het overzicht toont beide offerte-tools (kolom Soort); een verduurzaming-offerte is via het nummer te heropenen.
  const hasOfferte = OFFERTE_TOOL_KEYS.some(k => toolKeys.includes(k))

  async function load() {
    if (!user?.id || isDemoMode || !hasOfferte) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('offertes')
      .select('id, nummer, soort, status, zaak_naam, accountmanager, pakket, eenmalig_ex, maandbedrag_ex, getekend_op, verzonden_op, geopend_op, geopend_aantal, sign_token_expires_at, lead_id, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(200)
    if (!error) setRows(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [user?.id, hasOfferte])

  const getekend = rows.filter(r => r.status === 'getekend')
  const somEenmalig = getekend.reduce((a, r) => a + Number(r.eenmalig_ex || 0), 0)
  const somMaand = getekend.reduce((a, r) => a + Number(r.maandbedrag_ex || 0), 0)
  const openCount = rows.filter(r => OPEN_OFFERTE_STATUSSEN.includes(r.status)).length
  const shown = rows.filter((FILTERS.find(f => f.id === filter) || FILTERS[4]).test)

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

        {myTools.map(t => {
          const Icon = ICONS[t.icon] || FileSignature
          return (
            <div key={t.key} className="glass-panel mb-3" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: t.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.color }}>
                <Icon size={24} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{t.label}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t.description}</div>
              </div>
              <a
                className={`btn ${t.primary ? 'btn-primary' : 'btn-outline'}`}
                href={t.href}
                target={t.newTab ? '_blank' : undefined}
                rel={t.newTab ? 'noopener' : undefined}
                style={{ whiteSpace: 'nowrap' }}
              >
                {t.cta} <ExternalLink size={16} />
              </a>
            </div>
          )
        })}

        {hasOfferte && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div className="flex justify-between items-center mb-2" style={{ gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{isAdmin ? 'Alle offertes' : 'Mijn offertes'}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {getekend.length} getekend · {eur(somEenmalig)} eenmalig · {eur(somMaand)}/mnd · {openCount} wacht op klant
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={load}><RefreshCw size={14} /> Vernieuwen</button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {FILTERS.map(f => {
              const n = rows.filter(f.test).length
              return (
                <button key={f.id} className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter(f.id)}>
                  {f.label} <span style={{ opacity: 0.7 }}>{n}</span>
                </button>
              )
            })}
          </div>
          {loading ? (
            <p style={{ color: 'var(--text-muted)' }}>Laden…</p>
          ) : shown.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>{rows.length === 0 ? 'Nog geen offertes. Start er een met de knop hierboven.' : 'Geen offertes in dit filter.'}</p>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nummer</th><th>Soort</th><th>Klant</th>{isAdmin && <th>Accountmanager</th>}
                    <th style={{ textAlign: 'right' }}>Eenmalig</th><th style={{ textAlign: 'right' }}>Per maand</th><th>Status</th><th>Verstuurd</th><th>Geopend</th><th>Geldig tot</th><th>Getekend</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map(r => {
                    return (
                      <tr key={r.id}>
                        <td className="mono-num">{r.soort === 'verduurzaming' ? <a href={verduurzamingHrefForOfferte(r.id)} title="Offerte openen">{r.nummer}</a> : r.nummer}</td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.soort === 'verduurzaming' ? 'Verduurzaming' : 'Bestelplatform'}</td>
                        <td>{r.zaak_naam}</td>
                        {isAdmin && <td>{r.accountmanager || '—'}</td>}
                        <td style={{ textAlign: 'right' }}>{eur(r.eenmalig_ex)}</td>
                        <td style={{ textAlign: 'right' }}>{eur(r.maandbedrag_ex)}</td>
                        <td><OfferteChip status={r.status} /></td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dd(r.verzonden_op)}</td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{r.geopend_op ? `${dd(r.geopend_op)}${r.geopend_aantal > 1 ? ` (${r.geopend_aantal}×)` : ''}` : '—'}</td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{['verzonden', 'geopend'].includes(r.status) ? dd(r.sign_token_expires_at) : '—'}</td>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{dd(r.getekend_op)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 12 }}>
            Een offerte maak je het best vanuit de contactkaart van de lead ("Offerte maken"): dan zien bellers de status ook in het belscherm. Herinneren of intrekken doe je op diezelfde contactkaart.
          </p>
        </div>
        )}
      </main>
    </motion.div>
  )
}
