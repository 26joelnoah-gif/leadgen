import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { X, CalendarCheck, RefreshCw, ExternalLink, Copy, ChevronLeft, ChevronRight } from 'lucide-react'
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

export default function BronAfspraakModal({ lead, bron, notitie, onClose, onGeboekt }) {
  const [week, setWeek] = useState(0) // 0 = vandaag t/m 13 dagen, 1 = de 14 dagen daarna
  const [laden, setLaden] = useState(true)
  const [slots, setSlots] = useState({})
  const [link, setLink] = useState(null)
  const [fout, setFout] = useState(null)
  const [gekozen, setGekozen] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [gekopieerd, setGekopieerd] = useState(false)

  const haalTijden = async () => {
    setLaden(true)
    setFout(null)
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
      setFout(b.error || 'Tijden ophalen mislukt')
      if (b.boekingslink) setLink(b.boekingslink)
      setSlots({})
    } else {
      setSlots(data?.slots || {})
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
    const { data, error } = await supabase.functions.invoke('bron-afspraken', {
      body: { lead_id: lead.id, actie: 'boeken', start: gekozen, notitie: notitie || undefined },
    })
    if (error) {
      const b = await foutUit(error)
      setFout(b.error || 'Inplannen mislukt')
      if (b.boekingslink) setLink(b.boekingslink)
      setBezig(false)
      // Bezet geraakt: verse tijden laten zien.
      if (b.bron_status === 409) haalTijden()
      return
    }
    setBezig(false)
    onGeboekt?.(data)
  }

  const kopieer = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setGekopieerd(true)
      setTimeout(() => setGekopieerd(false), 2000)
    } catch { /* geen klembord */ }
  }

  const naam = mailSourceLabel(bron)

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', width: '100%', maxWidth: '560px', padding: '28px', position: 'relative', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <button onClick={onClose} disabled={bezig} aria-label="Sluiten" style={{ position: 'absolute', top: 15, right: 15, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>

        <h2 style={{ color: 'var(--text-primary)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.2rem' }}>
          <CalendarCheck size={20} /> Kennismakingsgesprek
        </h2>
        <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.85rem', lineHeight: 1.5 }}>
          Kies een tijd met de closer van {naam} voor <strong style={{ color: 'var(--text-primary)' }}>{lead?.name}</strong>.
          De klant krijgt zelf een bevestiging per mail. De lead staat daarna op Afspraak gemaakt, op jouw naam.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button type="button" className="btn btn-secondary" disabled={week === 0 || laden} onClick={() => setWeek(w => w - 1)} style={{ padding: '6px 10px' }}><ChevronLeft size={16} /></button>
          <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{week === 0 ? 'Komende 2 weken' : `Over ${week * 2} weken`}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn btn-secondary" disabled={laden} onClick={haalTijden} title="Opnieuw ophalen" style={{ padding: '6px 10px' }}><RefreshCw size={16} /></button>
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

        <button type="button" className="btn btn-primary" disabled={!gekozen || bezig} onClick={boek} style={{ width: '100%', marginTop: 18, padding: '12px', fontWeight: 800 }}>
          {bezig ? 'Inplannen...' : gekozen ? `Inplannen op ${lang(gekozen)}` : 'Kies eerst een tijd'}
        </button>
      </motion.div>
    </div>
  )
}
