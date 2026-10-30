import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Plus, X, MapPin, Pencil, Building2, Headphones, Car, Briefcase, Download, History } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { FUNCTIE_LABELS } from '../lib/accounts'
import { formatDate } from '../utils/dateUtils'
import { exportToCSV } from '../utils/exportUtils'

// v153: weergave "Plaatsingen" op /recruitment. Waar werkt iedereen?
// Kolom per locatie (callcenter, opdrachtgever zoals Rocher, buitendienst-plek)
// plus "Nog niet geplaatst". Een persoon = een account (profile_id) of een
// aangenomen sollicitant zonder account (lead_id). Slepen = verplaatsen; de
// oude plaatsing krijgt een einddatum, zodat de geschiedenis blijft staan.
// Tabellen: plaatsing_locaties + plaatsingen (migration_v153_plaatsingen.sql).

export const SOORTEN = {
  callcenter: { label: 'Callcenter', icon: Headphones, color: 'var(--primary)', functie: 'Beller' },
  opdrachtgever: { label: 'Bij opdrachtgever', icon: Building2, color: 'var(--secondary)', functie: 'Appointment setter' },
  buitendienst: { label: 'Buitendienst', icon: Car, color: 'var(--info)', functie: 'Buitendienst' },
  anders: { label: 'Anders', icon: Briefcase, color: 'var(--text-muted)', functie: '' }
}
const SOORT_VOLGORDE = ['callcenter', 'opdrachtgever', 'buitendienst', 'anders']
// Rollen die geen "werkplek" hebben en dus niet in het overzicht horen
const NIET_IN_OVERZICHT = ['admin', 'aanbrenger', 'extern']
const POOL = '__pool__'

function vandaag() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

export default function Plaatsingen({ profiles, applicants, onOpenLead }) {
  const toast = useToast()
  const [locaties, setLocaties] = useState([])
  const [plaatsingen, setPlaatsingen] = useState([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState(null)
  const [search, setSearch] = useState('')
  const [dragKey, setDragKey] = useState(null)
  const [overCol, setOverCol] = useState(null)
  const [bewerkPersoon, setBewerkPersoon] = useState(null)
  const [bewerkLocatie, setBewerkLocatie] = useState(null) // {} = nieuw
  const [verbergPool, setVerbergPool] = useState(false)

  async function laad() {
    const [l, p] = await Promise.all([
      supabase.from('plaatsing_locaties').select('*').eq('actief', true).order('volgorde').order('naam'),
      supabase.from('plaatsingen').select('*').order('start_op', { ascending: false })
    ])
    if (l.error || p.error) {
      const e = l.error || p.error
      setFout(/does not exist|schema cache|relation/i.test(e.message || '')
        ? 'De tabellen voor plaatsingen staan nog niet in de database. Draai eerst migration_v153_plaatsingen.sql in de SQL-editor van Supabase.'
        : e.message)
    } else {
      setFout(null)
      setLocaties(l.data || [])
      setPlaatsingen(p.data || [])
    }
    setLaden(false)
  }
  useEffect(() => { laad() }, [])

  const gesorteerdeLocaties = useMemo(() => [...locaties].sort((a, b) =>
    (SOORT_VOLGORDE.indexOf(a.soort) - SOORT_VOLGORDE.indexOf(b.soort)) || (a.volgorde - b.volgorde) || a.naam.localeCompare(b.naam)
  ), [locaties])

  // Alle mensen: accounts + aangenomen sollicitanten zonder (gekoppeld) account
  // + iedereen die al een lopende plaatsing heeft maar hier verder niet staat.
  const personen = useMemo(() => {
    const m = new Map()
    const profielIds = new Set()
    for (const p of profiles || []) {
      if (p.is_active === false || NIET_IN_OVERZICHT.includes(p.role)) continue
      profielIds.add(p.id)
      m.set(`p:${p.id}`, { key: `p:${p.id}`, profile_id: p.id, lead_id: null, naam: p.full_name || p.email || 'Onbekend', sub: FUNCTIE_LABELS[p.role] || p.role, telefoon: null })
    }
    for (const l of applicants || []) {
      if (l.status !== 'deal') continue
      if (l.hired_profile_id && profielIds.has(l.hired_profile_id)) {
        const p = m.get(`p:${l.hired_profile_id}`)
        if (p) { p.lead_id = l.id; p.telefoon = p.telefoon || l.phone; p.functieSollicitant = l.function }
        continue
      }
      m.set(`l:${l.id}`, { key: `l:${l.id}`, profile_id: null, lead_id: l.id, naam: l.name || 'Onbekend', sub: 'Aangenomen, nog geen account', telefoon: l.phone, functieSollicitant: l.function, lead: l })
    }
    const lopend = new Map()
    for (const pl of plaatsingen) {
      if (pl.eind_op) continue
      const key = pl.profile_id ? `p:${pl.profile_id}` : `l:${pl.lead_id}`
      lopend.set(key, pl)
      if (!m.has(key)) m.set(key, { key, profile_id: pl.profile_id, lead_id: pl.lead_id, naam: pl.naam, sub: pl.profile_id ? 'Account niet actief' : 'Sollicitant', telefoon: null })
    }
    for (const [key, p] of m) p.plaatsing = lopend.get(key) || null
    return [...m.values()].sort((a, b) => a.naam.localeCompare(b.naam))
  }, [profiles, applicants, plaatsingen])

  const zichtbaar = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return personen
    return personen.filter(p => [p.naam, p.sub, p.plaatsing?.functie, p.telefoon].some(v => (v || '').toLowerCase().includes(q)))
  }, [personen, search])

  const perSoort = useMemo(() => {
    const locSoort = new Map(locaties.map(l => [l.id, l.soort]))
    const t = { callcenter: 0, opdrachtgever: 0, buitendienst: 0, anders: 0, pool: 0 }
    for (const p of personen) {
      if (!p.plaatsing) t.pool += 1
      else t[locSoort.get(p.plaatsing.locatie_id) || 'anders'] += 1
    }
    return t
  }, [personen, locaties])

  async function verplaats(persoon, locatieId, extra = {}) {
    const huidig = persoon.plaatsing
    if ((huidig?.locatie_id || null) === (locatieId || null) && !Object.keys(extra).length) return
    const loc = locaties.find(l => l.id === locatieId)
    try {
      if (huidig && huidig.locatie_id !== locatieId) {
        // Vandaag pas geplaatst? Dan was het een vergissing: gewoon aanpassen of weghalen.
        if (huidig.start_op === vandaag()) {
          const { error } = locatieId
            ? await supabase.from('plaatsingen').update({ locatie_id: locatieId, functie: extra.functie ?? huidig.functie ?? SOORTEN[loc?.soort]?.functie ?? null, ...extra }).eq('id', huidig.id)
            : await supabase.from('plaatsingen').delete().eq('id', huidig.id)
          if (error) throw error
          toast(locatieId ? `${persoon.naam} staat nu bij ${loc?.naam}` : `${persoon.naam} staat weer bij "Nog niet geplaatst"`, 'success')
          await laad(); return
        }
        const { error } = await supabase.from('plaatsingen').update({ eind_op: vandaag() }).eq('id', huidig.id)
        if (error) throw error
      }
      if (locatieId) {
        const { error } = await supabase.from('plaatsingen').insert({
          locatie_id: locatieId,
          profile_id: persoon.profile_id,
          lead_id: persoon.lead_id,
          naam: persoon.naam,
          functie: huidig?.functie || SOORTEN[loc?.soort]?.functie || persoon.functieSollicitant || null,
          ...extra
        })
        if (error) throw error
        toast(`${persoon.naam} staat nu bij ${loc?.naam}`, 'success')
      } else {
        toast(`Plaatsing van ${persoon.naam} beëindigd`, 'success')
      }
    } catch (err) {
      toast(err.message, 'error')
    }
    await laad()
  }

  function handleExport() {
    const locNaam = new Map(locaties.map(l => [l.id, l]))
    exportToCSV(personen.map(p => {
      const l = p.plaatsing ? locNaam.get(p.plaatsing.locatie_id) : null
      return {
        Naam: p.naam,
        Locatie: l?.naam || 'Nog niet geplaatst',
        Soort: l ? SOORTEN[l.soort]?.label : '',
        Plaats: l?.plaats || '',
        Functie: p.plaatsing?.functie || '',
        Sinds: p.plaatsing?.start_op || '',
        Account: p.sub,
        Telefoon: p.telefoon || ''
      }
    }), `ReachConnect_Plaatsingen_${vandaag()}`)
  }

  if (laden) return <div className="card" style={{ padding: '24px', textAlign: 'center' }}>Laden...</div>
  if (fout) return <div className="card" style={{ padding: '18px', color: 'var(--warning)' }}>{fout}</div>

  const kolommen = [
    ...(verbergPool ? [] : [{ id: POOL, naam: 'Nog niet geplaatst', soort: null }]),
    ...gesorteerdeLocaties
  ]

  return (
    <div>
      <div className="card mb-3" style={{ padding: '12px 16px' }}>
        <div className="flex items-center justify-between" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <div className="flex items-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
            {SOORT_VOLGORDE.filter(s => s !== 'anders' || perSoort.anders > 0).map(s => {
              const S = SOORTEN[s]
              return (
                <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '999px', background: 'var(--bg-elevated)', fontSize: '0.78rem', fontWeight: 700 }}>
                  <S.icon size={13} style={{ color: S.color }} /> {S.label} <span style={{ color: S.color }}>{perSoort[s]}</span>
                </span>
              )
            })}
            <span style={{ padding: '4px 10px', borderRadius: '999px', background: 'var(--bg-elevated)', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)' }}>
              Nog niet geplaatst {perSoort.pool}
            </span>
          </div>
          <div className="flex items-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input className="form-control" value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek persoon..." style={{ paddingLeft: '32px', width: '190px' }} />
            </div>
            <label className="flex items-center" style={{ gap: '5px', fontSize: '0.78rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={verbergPool} onChange={e => setVerbergPool(e.target.checked)} /> Alleen geplaatst
            </label>
            <button className="btn btn-outline btn-sm" onClick={handleExport}><Download size={14} /> CSV</button>
            <button className="btn btn-primary btn-sm" onClick={() => setBewerkLocatie({})}><Plus size={14} /> Locatie</button>
          </div>
        </div>
      </div>

      {gesorteerdeLocaties.length === 0 && (
        <div className="card mb-3" style={{ padding: '14px 16px', fontSize: '0.85rem' }}>
          Nog geen locaties. Klik op <strong>+ Locatie</strong> en maak bijvoorbeeld "Callcenter Arnhem" of "Rocher" aan.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kolommen.length}, minmax(180px, 1fr))`, gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
        {kolommen.map(col => {
          const S = col.soort ? SOORTEN[col.soort] : null
          const kleur = S?.color || 'var(--text-muted)'
          const items = zichtbaar.filter(p => col.id === POOL ? !p.plaatsing : p.plaatsing?.locatie_id === col.id)
          const isOver = overCol === col.id
          return (
            <div
              key={col.id}
              onDragOver={e => { e.preventDefault(); setOverCol(col.id) }}
              onDragLeave={() => setOverCol(prev => (prev === col.id ? null : prev))}
              onDrop={e => {
                e.preventDefault(); setOverCol(null)
                const p = personen.find(x => x.key === e.dataTransfer.getData('text/plain'))
                if (p) verplaats(p, col.id === POOL ? null : col.id)
              }}
              style={{
                minWidth: 0, background: isOver ? 'var(--accent-soft)' : 'var(--bg-card)',
                border: `1px solid ${isOver ? kleur : 'var(--border)'}`, borderRadius: '10px', padding: '7px',
                maxHeight: 'max(420px, calc(100vh - 240px))', minHeight: '160px', display: 'flex', flexDirection: 'column'
              }}
            >
              <div style={{ padding: '3px 4px 8px', borderBottom: `2px solid ${kleur}`, marginBottom: '6px' }}>
                <div className="flex items-center justify-between" style={{ gap: '4px' }}>
                  <span style={{ fontWeight: 800, fontSize: '0.78rem', color: kleur, display: 'inline-flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                    {S && <S.icon size={13} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.naam}</span>
                  </span>
                  <span className="flex items-center" style={{ gap: '4px', flexShrink: 0 }}>
                    <span style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 700 }}>{items.length}</span>
                    {col.id !== POOL && (
                      <button onClick={() => setBewerkLocatie(col)} title="Locatie bewerken" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '2px' }}><Pencil size={12} /></button>
                    )}
                  </span>
                </div>
                {col.id !== POOL && (
                  <div className="text-muted" style={{ fontSize: '0.64rem', marginTop: '2px' }}>
                    {S?.label}{col.plaats ? <> · <MapPin size={9} style={{ verticalAlign: '-1px' }} /> {col.plaats}</> : null}
                  </div>
                )}
                {col.id === POOL && <div className="text-muted" style={{ fontSize: '0.64rem', marginTop: '2px' }}>Sleep iemand naar een locatie</div>}
              </div>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                {items.map(p => (
                  <div
                    key={p.key}
                    draggable
                    onDragStart={e => { e.dataTransfer.setData('text/plain', p.key); setDragKey(p.key) }}
                    onDragEnd={() => setDragKey(null)}
                    onClick={() => setBewerkPersoon(p)}
                    title="Klik voor details of om te verplaatsen"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px', padding: '6px 8px', cursor: 'grab', opacity: dragKey === p.key ? 0.4 : 1 }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.76rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.naam}</div>
                    {p.plaatsing?.functie && <div style={{ fontSize: '0.66rem', marginTop: '1px', color: kleur, fontWeight: 600 }}>{p.plaatsing.functie}</div>}
                    <div className="text-muted" style={{ fontSize: '0.62rem', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.plaatsing ? `Sinds ${formatDate(p.plaatsing.start_op)}` : p.sub}
                    </div>
                  </div>
                ))}
                {items.length === 0 && (
                  <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)', textAlign: 'center', padding: '14px 4px', opacity: 0.6 }}>
                    {search ? 'Niemand gevonden' : 'Sleep hier iemand naartoe'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <AnimatePresence>
        {bewerkPersoon && (
          <PersoonModal
            persoon={personen.find(p => p.key === bewerkPersoon.key) || bewerkPersoon}
            locaties={gesorteerdeLocaties}
            geschiedenis={plaatsingen.filter(pl => pl.eind_op && (bewerkPersoon.profile_id ? pl.profile_id === bewerkPersoon.profile_id : pl.lead_id === bewerkPersoon.lead_id))}
            onClose={() => setBewerkPersoon(null)}
            onVerplaats={async (locId, extra) => { await verplaats(bewerkPersoon, locId, extra); setBewerkPersoon(null) }}
            onSave={async (velden) => {
              const { error } = await supabase.from('plaatsingen').update(velden).eq('id', bewerkPersoon.plaatsing.id)
              if (error) { toast(error.message, 'error'); return }
              toast('Opgeslagen', 'success'); await laad(); setBewerkPersoon(null)
            }}
            onOpenLead={onOpenLead}
          />
        )}
        {bewerkLocatie && (
          <LocatieModal
            locatie={bewerkLocatie}
            aantal={bewerkLocatie.id ? personen.filter(p => p.plaatsing?.locatie_id === bewerkLocatie.id).length : 0}
            onClose={() => setBewerkLocatie(null)}
            onSaved={async () => { setBewerkLocatie(null); await laad() }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Modal({ titel, onClose, children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="modal glass-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px', maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2>{titel}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

function PersoonModal({ persoon, locaties, geschiedenis, onClose, onVerplaats, onSave, onOpenLead }) {
  const pl = persoon.plaatsing
  const [locId, setLocId] = useState(pl?.locatie_id || '')
  const [functie, setFunctie] = useState(pl?.functie || '')
  const [start, setStart] = useState(pl?.start_op || vandaag())
  const [notitie, setNotitie] = useState(pl?.notitie || '')
  const [bezig, setBezig] = useState(false)
  const [eindigZeker, setEindigZeker] = useState(false)
  const locNaam = new Map(locaties.map(l => [l.id, l.naam]))

  async function opslaan(e) {
    e.preventDefault()
    setBezig(true)
    const velden = { functie: functie.trim() || null, start_op: start, notitie: notitie.trim() || null }
    if (!locId) { if (pl) await onVerplaats(null); else onClose() }
    else if (!pl || pl.locatie_id !== locId) await onVerplaats(locId, velden)
    else await onSave(velden)
    setBezig(false)
  }

  return (
    <Modal titel={persoon.naam} onClose={onClose}>
      <div className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '12px' }}>
        {persoon.sub}{persoon.telefoon ? ` · ${persoon.telefoon}` : ''}
        {persoon.lead && onOpenLead && (
          <> · <button type="button" onClick={() => { onClose(); onOpenLead(persoon.lead) }} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: '0.8rem' }}>sollicitant openen</button></>
        )}
      </div>
      <form onSubmit={opslaan}>
        <div className="form-group">
          <label>Waar werkt deze persoon?</label>
          <select value={locId} onChange={e => setLocId(e.target.value)}>
            <option value="">Nog niet geplaatst</option>
            {locaties.map(l => <option key={l.id} value={l.id}>{l.naam}{l.plaats ? ` (${l.plaats})` : ''}</option>)}
          </select>
        </div>
        {locId && (
          <>
            <div className="form-group">
              <label>Functie</label>
              <input value={functie} onChange={e => setFunctie(e.target.value)} placeholder="Bijv. Appointment setter" maxLength={80} />
            </div>
            <div className="form-group">
              <label>Begonnen op</label>
              <input type="date" value={start} onChange={e => setStart(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Notitie</label>
              <textarea value={notitie} onChange={e => setNotitie(e.target.value)} rows={2} maxLength={1000} placeholder="Bijv. werkt ma t/m wo" />
            </div>
          </>
        )}
        <div className="flex items-center justify-between" style={{ gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
          {pl ? (
            <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }}
              onClick={() => { if (!eindigZeker) { setEindigZeker(true); return } onVerplaats(null) }}>
              {eindigZeker ? 'Klik nogmaals om te beëindigen' : 'Plaatsing beëindigen'}
            </button>
          ) : <span />}
          <button type="submit" className="btn btn-primary" disabled={bezig}>{bezig ? 'Bezig...' : 'Opslaan'}</button>
        </div>
      </form>
      {geschiedenis.length > 0 && (
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}><History size={13} /> Eerder</div>
          {geschiedenis.map(g => (
            <div key={g.id} className="text-muted" style={{ fontSize: '0.76rem', padding: '2px 0' }}>
              {locNaam.get(g.locatie_id) || 'Locatie verwijderd'}{g.functie ? ` · ${g.functie}` : ''} · {formatDate(g.start_op)} t/m {formatDate(g.eind_op)}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function LocatieModal({ locatie, aantal, onClose, onSaved }) {
  const toast = useToast()
  const nieuw = !locatie.id
  const [naam, setNaam] = useState(locatie.naam || '')
  const [soort, setSoort] = useState(locatie.soort || 'opdrachtgever')
  const [plaats, setPlaats] = useState(locatie.plaats || '')
  const [notitie, setNotitie] = useState(locatie.notitie || '')
  const [bezig, setBezig] = useState(false)
  const [weg, setWeg] = useState(false)

  async function opslaan(e) {
    e.preventDefault()
    if (!naam.trim()) return
    setBezig(true)
    const velden = { naam: naam.trim(), soort, plaats: plaats.trim() || null, notitie: notitie.trim() || null }
    const { error } = nieuw
      ? await supabase.from('plaatsing_locaties').insert(velden)
      : await supabase.from('plaatsing_locaties').update(velden).eq('id', locatie.id)
    setBezig(false)
    if (error) { toast(error.message, 'error'); return }
    toast(nieuw ? 'Locatie toegevoegd' : 'Locatie opgeslagen', 'success')
    onSaved()
  }

  async function archiveer() {
    if (aantal > 0) { toast(`Er werken nog ${aantal} mensen op deze locatie. Verplaats ze eerst.`, 'error'); return }
    if (!weg) { setWeg(true); return }
    const { error } = await supabase.from('plaatsing_locaties').update({ actief: false }).eq('id', locatie.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Locatie verwijderd', 'success')
    onSaved()
  }

  return (
    <Modal titel={nieuw ? 'Nieuwe locatie' : 'Locatie bewerken'} onClose={onClose}>
      <form onSubmit={opslaan}>
        <div className="form-group">
          <label>Naam</label>
          <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="Bijv. Rocher" maxLength={80} required autoFocus />
        </div>
        <div className="form-group">
          <label>Soort</label>
          <select value={soort} onChange={e => setSoort(e.target.value)}>
            {SOORT_VOLGORDE.map(s => <option key={s} value={s}>{SOORTEN[s].label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Plaats (mag leeg)</label>
          <input value={plaats} onChange={e => setPlaats(e.target.value)} placeholder="Bijv. Arnhem" maxLength={80} />
        </div>
        <div className="form-group">
          <label>Notitie (mag leeg)</label>
          <textarea value={notitie} onChange={e => setNotitie(e.target.value)} rows={2} maxLength={500} />
        </div>
        <div className="flex items-center justify-between" style={{ gap: '8px', flexWrap: 'wrap' }}>
          {!nieuw ? (
            <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={archiveer}>
              {weg ? 'Klik nogmaals om te verwijderen' : 'Locatie verwijderen'}
            </button>
          ) : <span />}
          <button type="submit" className="btn btn-primary" disabled={bezig}>{bezig ? 'Bezig...' : 'Opslaan'}</button>
        </div>
      </form>
    </Modal>
  )
}
