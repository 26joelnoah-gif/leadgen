// v150: blok "Mijn dag" op het dashboard: je eigen dagdoel (zelf te zetten),
// hoe ver je bent, of je het op dit tempo haalt, en wanneer mensen het best
// opnemen (bereik per uur uit jullie eigen gesprekken).
import { useEffect, useState } from 'react'
import { Target, Signal } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useDagdoel, telGesprekkenVandaag, tempoVoorspelling } from '../hooks/useDagdoel'
import { useBereik } from '../hooks/useBereik'
import { DoelInvoer } from './belscherm/DoelChip'
import { useToast } from './Toast'

const UREN = [9, 10, 11, 12, 13, 14, 15, 16, 17]
const tijd = (d) => d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })

export default function MijnDag() {
  const { user, isDemoMode } = useAuth()
  const { doel, voorstel, geladen, bewaar } = useDagdoel()
  const bereik = useBereik()
  const toast = useToast()
  const [gedaan, setGedaan] = useState(0)
  const [aanpassen, setAanpassen] = useState(false)

  useEffect(() => {
    if (!user?.id || isDemoMode) return
    let alive = true
    const tel = () => telGesprekkenVandaag(user.id).then(n => { if (alive) setGedaan(n) }).catch(() => {})
    tel()
    const t = setInterval(() => { if (!document.hidden) tel() }, 120000)
    return () => { alive = false; clearInterval(t) }
  }, [user?.id, isDemoMode])

  if (!geladen) return null

  async function opslaan(n) {
    try { await bewaar(n); setAanpassen(false); toast('Dagdoel opgeslagen. Succes!', 'success') }
    catch (err) { toast(`Opslaan mislukt: ${err.message}`, 'error') }
  }

  const pct = doel ? Math.min(100, Math.round((gedaan / doel) * 100)) : 0
  const klaar = doel ? tempoVoorspelling(gedaan, doel) : null
  const nuUur = new Date().getHours()
  const kansVan = Object.fromEntries(bereik.perUur.map(r => [r.uur, r.kans]))
  const max = Math.max(0.01, ...bereik.perUur.map(r => r.kans))
  const min = Math.min(...bereik.perUur.map(r => r.kans), max)

  return (
    <div className="card" style={{ marginTop: '24px' }}>
      <div className="card-header">
        <span className="card-title"><Target size={18} /> Mijn dag</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>

        <div>
          {!doel || aanpassen ? (
            <>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Hoeveel gesprekken wil je vandaag doen?</div>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: 10 }}>Je ziet het daarna ook bovenin het belscherm.</div>
              <DoelInvoer huidig={doel} voorstel={voorstel} onBewaar={opslaan} />
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: '2rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{gedaan}</span>
                <span className="text-muted" style={{ fontWeight: 700 }}>van {doel} gesprekken</span>
                <button type="button" onClick={() => setAanpassen(true)} className="text-muted" style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, textDecoration: 'underline' }}>Aanpassen</button>
              </div>
              <div style={{ height: 10, borderRadius: 999, background: 'var(--bg-elevated)', overflow: 'hidden', marginTop: 8 }}>
                <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: 'var(--success)', transition: 'width .3s ease' }} />
              </div>
              <div style={{ marginTop: 8, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                {gedaan >= doel ? <strong style={{ color: 'var(--success)' }}>Doel gehaald. Sterk werk!</strong>
                  : <>Nog <strong style={{ color: 'var(--text-primary)' }}>{doel - gedaan}</strong> te gaan.{klaar ? <> Op dit tempo ben je om <strong style={{ color: 'var(--text-primary)' }}>{tijd(klaar)}</strong> klaar.</> : ''}</>}
              </div>
            </>
          )}
        </div>

        {bereik.perUur.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <Signal size={16} style={{ color: bereik.nu?.oordeel?.kleur || 'var(--text-secondary)' }} />
              <span style={{ fontWeight: 700 }}>
                {bereik.nu?.oordeel ? <>Nu: <span style={{ color: bereik.nu.oordeel.kleur }}>{bereik.nu.oordeel.label.toLowerCase()}</span> ({Math.round(bereik.nu.kans * 100)}% neemt op)</> : 'Wanneer nemen mensen op?'}
              </span>
            </div>
            <div className="uur-balken" style={{ gridTemplateColumns: `repeat(${UREN.length}, minmax(0, 1fr))` }}
              role="img" aria-label={`Opneemkans per uur: ${UREN.map(u => `${u} uur ${kansVan[u] != null ? Math.round(kansVan[u] * 100) + ' procent' : 'onbekend'}`).join(', ')}`}>
              {UREN.map(u => {
                const k = kansVan[u]
                const h = k == null ? 4 : 25 + ((k - min) / Math.max(0.01, max - min)) * 75
                return <div key={u} className={`uur-balk${bereik.besteUren.includes(u) ? ' is-goed' : ''}${u === nuUur ? ' is-nu' : ''}`} style={{ height: `${h}%`, opacity: k == null ? 0.3 : 1 }} title={k == null ? 'te weinig gesprekken' : `${Math.round(k * 100)}% neemt op`} />
              })}
            </div>
            <div className="uur-labels" style={{ gridTemplateColumns: `repeat(${UREN.length}, minmax(0, 1fr))` }}>
              {UREN.map(u => <span key={u}>{u}</span>)}
            </div>
            {bereik.besteUren.length > 0 && (
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
                Beste uren: {bereik.besteUren.map(u => `${u}:00`).join(' en ')}. Bel dan je terugbelafspraken en beste leads.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
