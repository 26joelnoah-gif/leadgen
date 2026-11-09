import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X, CalendarCheck, RefreshCw, ExternalLink, Copy, ChevronLeft, ChevronRight, Video, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mailSourceLabel } from '../lib/mailSources'

// v154: kennismakingsgesprek inplannen bij de closer van de mailbron
// (BeautyInfo, agenda via cal.com). De Edge Function 'bron-afspraken' haalt de
// vrije tijden op en boekt; de sleutel van de bron komt nooit in de browser.
// Na een gelukte boeking staat de lead al op 'afspraak_gemaakt' op naam van
// deze beller (dat doet de database). De aanroeper gaat dan door naar de
// volgende lead via onGeboekt.
// Lukt inplannen niet (503), dan is er de boekingslink van de bron: die is al
// ingevuld met naam en e-mail van de lead. Plant de klant daar zelf, dan komt
// de afspraak via de statusupdate afspraak_gepland alsnog op naam van de beller
// die de mail stuurde.
//
// v156 (spec BeautyInfo 09-11):
// - Loopt er al een gesprek (ook als de klant het zelf plande), dan zie je
//   datum, tijd, closer en videolink met een knop Annuleren. Inplannen is dan
//   verborgen. Verzetten = annuleren en daarna een nieuwe tijd kiezen.
// - kan_boeken false of slots null: geen tijden, alleen de boekingslink.
// - slot_unavailable: tijden worden vanzelf ververst.

const dagKop = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
const tijd = (iso) => new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
const lang = (iso) => new Date(iso).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' })
const ymd = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

async function foutUit(fnError) {
  try {
    const body = await fnError.context?.json()
    return body || {}
  } catch {
    return {}
  }
}

// Een afspraak die de bron als geannuleerd meldt telt niet als lopend.
const isLopend = (a) => !!a?.starts_at && !/cancel|annul/i.test(a?.status || '')

export default function BronAfspraakModal({ lead, bron, notitie, onClose, onGeboekt, onGeannuleerd }) {
  const [week, setWeek] = useState(0) // 0 = vandaag t/m 13 dagen, 1 = de 14 dagen daarna
  const [laden, setLaden] = useState(true)
  const [slots, setSlots] = useState({})
  const [geenSlots, setGeenSlots] = useState(false) // bron gaf slots: null
  const [kanBoeken, setKanBoeken] = useState(true)
  const [afspraak, setAfspraak] = useState(null)
  const [link, setLink] = useState(null)
  const [fout, setFout] = useState(null)
  const [melding, setMelding] = useState(null)
  const [gekozen, setGekozen] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)
  const [annuleerStap, setAnnuleerStap] = useState(0) // 0 = knop, 1 = bevestigen
  const [reden, setReden] = useState('')

  const haalTijden = async (naFout = null) => {
    setLaden(true)
    setFout(naFout)
    setGekozen(null)
    const van = new Date()
    van.setDate(van.getDate() + week * 14)
    const tot = new Date(van)
    tot.setDate(tot.getDate() + 13)
    const { data, error } = await supabase.functions.invoke('bron-afspraken', {
      body: { lead_id: lead.id, actie: 'tijden', from: ymd(van), to: ymd(tot) },
    })
    if (error) {
      const b = await foutUit(error)
      setFout(naFout || b.error || 'Tijden ophalen mislukt')
      if (b.boekingslink) setLink(b.boekingslink)
      if (b.code === 'lead_closed') setKanBoeken(false)
      setSlots({})
    } else {
      setSlots(data?.slots || {})
      setGeenSlots(data?.slots === null)
      setKanBoeken(data?.kan_boeken !== false)
      setAfspraak(isLopend(data?.afspraak) ? data.afspraak : null)
      if (data?.boekingslink) setLink(data.boekingslink)
    }
    setLaden(false)
  }

  useEffect(() => { haalTijden() }, [week]) // eslint-disable-line react-hooks/exhaustive-deps

  const dagen = useMemo(() => Object.keys(slots).sort().filter(d => (slots[d] || []).length), [slots])

  const boek = async () => {
    if (!gekozen || bezig) return
    setBezig(true)
    setFout(null)
    setMelding(null)
    const { data, error } = await supabase.functions.invoke('bron-afspraken', {
      body: { lead_id: lead.id, actie: 'boeken', start: gekozen, notitie: notitie || undefined },
    })
    if (error) {
      const b = await foutUit(error)
      const tekst = b.error || 'Inplannen mislukt'
      if (b.boekingslink) setLink(b.boekingslink)
      setBezig(false)
      if (b.code === 'already_booked') {
        if (b.afspraak) { setAfspraak(b.afspraak); setFout(tekst) } else haalTijden(tekst)
      } else if (b.code === 'lead_closed') {
        setKanBoeken(false)
        setFout(tekst)
      } else if (b.code === 'slot_unavailable' || b.bron_status === 409) {
        haalTijden(tekst) // net bezet: verse tijden laten zien
      } else {
        setFout(tekst)
      }
      return
    }
    setBezig(false)
    onGeboekt?.(data)
  }

  const annuleer = async () => {
    if (bezig) return
    if (annuleerStap === 0) { setAnnuleerStap(1); return }
    setBezig(true)
    setFout(null)
    const { data, error } = await supabase.functions.invoke('bron-afspraken', {
      body: { lead_id: lead.id, actie: 'annuleren', reden: reden.trim() || undefined },
    })
    setBezig(false)
    setAnnuleerStap(0)
    if (error) {
      const b = await foutUit(error)
      if (b.bron_status === 404) { haalTijden(b.error); return }
      setFout(b.error || 'Annuleren mislukt')
      return
    }
    setAfspraak(null)
    setReden('')
    setMelding('Gesprek geannuleerd. De klant krijgt bericht van de bron. Kies hieronder een nieuwe tijd, of sluit af.')
    onGeannuleerd?.(data)
    haalTijden()
  }

  const kopieer = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setGekopieerd(true)
      setTimeout(() => setGekopieerd(false), 2000)
    } catch { /* geen klembord */ }
  }

  const naam = mailSourceLabel(bron)
  const toonTijden = !afspraak && kanBoeken && !geenSlots

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', width: '100%', maxWidth: '560px', padding: '28px', position: 'relative', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <button onClick={onClose} disabled={bezig} aria-label="Sluiten" style={{ position: 'absolute', top: 15, right: 15, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>

        <h2 style={{ color: 'var(--text-primary)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.2rem' }}>
          <CalendarCheck size={20} /> Kennismakingsgesprek
        </h2>
        <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {afspraak
            ? <>Er staat al een gesprek voor <strong style={{ color: 'var(--text-primary)' }}>{lead?.name}</strong>.</>
            : <>Kies een tijd met de closer van {naam} voor <strong style={{ color: 'var(--text-primary)' }}>{lead?.name}</strong>.
              De klant krijgt zelf een uitnodiging per mail. De lead staat daarna op Afspraak gemaakt, op jouw naam.</>}
        </p>

        {afspraak && (
          <div style={{ padding: '14px', borderRadius: 12, border: '1px solid var(--accent)', background: 'var(--bg-elevated)', marginBottom: 14 }}>
            <div style={{ fontWeight: 800, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{lang(afspraak.starts_at)}</div>
            <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
              {afspraak.closer ? `Met ${afspraak.closer}` : 'Met de closer'}
              {afspraak.source === 'klant' ? ' · klant plande zelf' : afspraak.source === 'setter' ? ' · ingepland door een beller' : ''}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
              {afspraak.meeting_url && (
                <a className="btn btn-secondary" href={afspraak.meeting_url} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 10px', fontSize: '0.8rem' }}><Video size={14} /> Videolink</a>
              )}
              <button type="button" className="btn btn-secondary" disabled={bezig} onClick={annuleer}
                style={{ padding: '6px 10px', fontSize: '0.8rem', color: 'var(--danger)', borderColor: annuleerStap ? 'var(--danger)' : undefined }}>
                <XCircle size={14} /> {bezig ? 'Annuleren...' : annuleerStap ? 'Klik nogmaals om te annuleren' : 'Annuleren'}
              </button>
            </div>
            {annuleerStap === 1 && (
              <input type="text" value={reden} onChange={e => setReden(e.target.value)} maxLength={200}
                placeholder="Reden (optioneel), bv. klant kan niet"
                style={{ width: '100%', marginTop: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
            )}
            <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 8 }}>Andere tijd nodig? Annuleer eerst, kies daarna een nieuwe tijd.</div>
          </div>
        )}

        {melding && (
          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{melding}</div>
        )}

        {toonTijden && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button type="button" className="btn btn-secondary" disabled={week === 0 || laden} onClick={() => setWeek(w => w - 1)} style={{ padding: '6px 10px' }}><ChevronLeft size={16} /></button>
              <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{week === 0 ? 'Komende 2 weken' : `Over ${week * 2} weken`}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-secondary" disabled={laden} onClick={() => haalTijden()} title="Opnieuw ophalen" style={{ padding: '6px 10px' }}><RefreshCw size={16} /></button>
                <button type="button" className="btn btn-secondary" disabled={week >= 1 || laden} onClick={() => setWeek(w => w + 1)} style={{ padding: '6px 10px' }}><ChevronRight size={16} /></button>
              </div>
            </div>

            {laden ? (
              <p className="text-muted" style={{ fontSize: '0.85rem', padding: '20px 0', textAlign: 'center' }}>Vrije tijden ophalen...</p>
            ) : dagen.length === 0 ? (
              !fout && <p className="text-muted" style={{ fontSize: '0.85rem', padding: '20px 0', textAlign: 'center' }}>Geen vrije tijden in deze periode.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dagen.map(dag => (
                  <div key={dag}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, textTransform: 'capitalize' }}>{dagKop(dag)}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {slots[dag].map(s => {
                        const actief = gekozen === s.start
                        return (
                          <button key={s.start} type="button" onClick={() => setGekozen(s.start)} style={{
                            padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem',
                            border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
                            background: actief ? 'var(--accent)' : 'var(--bg-dark)',
                            color: actief ? 'white' : 'var(--text-primary)', fontWeight: actief ? 800 : 600,
                          }}>{tijd(s.start)}</button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {!afspraak && !laden && (!kanBoeken || geenSlots) && (
          <p className="text-muted" style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>
            {!kanBoeken
              ? 'Inplannen vanuit ReachConnect kan nu niet voor deze klant.'
              : 'De agenda geeft nu geen tijden door. Laat de klant zelf kiezen via de boekingslink.'}
          </p>
        )}

        {fout && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--danger-bg)', color: 'var(--danger)', fontSize: '0.85rem' }}>{fout}</div>
        )}

        {link && (
          <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="text-muted" style={{ flex: '1 1 200px' }}>Of laat de klant zelf kiezen via de boekingslink (telt ook als jouw afspraak).</span>
            <button type="button" className="btn btn-secondary" onClick={kopieer} style={{ padding: '6px 10px', fontSize: '0.8rem' }}><Copy size={14} /> {gekopieerd ? 'Gekopieerd' : 'Kopieer link'}</button>
            <a className="btn btn-secondary" href={link} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 10px', fontSize: '0.8rem' }}><ExternalLink size={14} /> Openen</a>
          </div>
        )}

        {toonTijden ? (
          <button type="button" className="btn btn-primary" disabled={!gekozen || bezig} onClick={boek} style={{ width: '100%', marginTop: 18, padding: '12px', fontWeight: 800 }}>
            {bezig ? 'Inplannen...' : gekozen ? `Inplannen op ${lang(gekozen)}` : 'Kies eerst een tijd'}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary" disabled={bezig} onClick={onClose} style={{ width: '100%', marginTop: 18, padding: '12px', fontWeight: 700 }}>Sluiten</button>
        )}
      </motion.div>
    </div>
  )
}
