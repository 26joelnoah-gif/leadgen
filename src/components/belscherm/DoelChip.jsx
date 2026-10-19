// v150: dagdoel in de kopbalk van het belscherm. Klik om je doel voor vandaag
// te zetten of aan te passen. Toont 38 / 80 met een balkje.
import { useState } from 'react'
import { Target, Check } from 'lucide-react'
import { useDagdoel } from '../../hooks/useDagdoel'
import { useToast } from '../Toast'

const SNEL = [40, 60, 80, 100]

export function DoelInvoer({ huidig, voorstel, onBewaar, compact = false }) {
  const [waarde, setWaarde] = useState(String(huidig || voorstel || 60))
  const [bezig, setBezig] = useState(false)
  async function bewaar(n) {
    setBezig(true)
    try { await onBewaar(n) } finally { setBezig(false) }
  }
  return (
    <div className="doel-invoer">
      <div className="doel-snel">
        {SNEL.map(n => (
          <button key={n} type="button" className={`doel-snelknop${Number(waarde) === n ? ' is-actief' : ''}`} onClick={() => { setWaarde(String(n)); bewaar(n) }} disabled={bezig}>{n}</button>
        ))}
      </div>
      <form className="doel-eigen" onSubmit={e => { e.preventDefault(); bewaar(waarde) }}>
        <label htmlFor={compact ? 'doel-c' : 'doel-d'} className="doel-label">Eigen aantal</label>
        <input id={compact ? 'doel-c' : 'doel-d'} type="number" min="1" max="1000" inputMode="numeric" value={waarde} onChange={e => setWaarde(e.target.value)} />
        <button type="submit" className="doel-ok" disabled={bezig} aria-label="Doel opslaan"><Check size={15} /></button>
      </form>
    </div>
  )
}

export default function DoelChip({ gedaan = 0, standaard = 0 }) {
  const { doel, voorstel, bewaar } = useDagdoel()
  const [open, setOpen] = useState(false)
  const toast = useToast()
  const actief = doel || standaard || 0
  const pct = actief ? Math.min(100, Math.round((gedaan / actief) * 100)) : 0
  const gehaald = actief > 0 && gedaan >= actief

  async function opslaan(n) {
    try {
      await bewaar(n)
      setOpen(false)
      toast(`Je doel voor vandaag: ${Math.round(Number(n))} gesprekken`, 'success')
    } catch (err) {
      toast(`Doel opslaan mislukt: ${err.message}`, 'error')
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className={`doel-chip${gehaald ? ' is-gehaald' : ''}${!actief ? ' is-leeg' : ''}`} onClick={() => setOpen(v => !v)} aria-expanded={open}
        title={doel ? 'Jouw dagdoel. Klik om aan te passen.' : 'Zet je eigen doel voor vandaag'}>
        <Target size={14} aria-hidden="true" />
        {actief ? (
          <>
            <span className="doel-getal">{gedaan} / {actief}</span>
            <span className="doel-balk" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
          </>
        ) : <span>Zet je dagdoel</span>}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
          <div className="doel-pop" role="dialog" aria-label="Dagdoel">
            <div className="doel-pop-titel">Hoeveel gesprekken wil je vandaag doen?</div>
            <DoelInvoer huidig={doel} voorstel={voorstel || standaard} onBewaar={opslaan} compact />
          </div>
        </>
      )}
    </div>
  )
}
