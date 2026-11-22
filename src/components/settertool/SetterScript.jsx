import { useMemo, useState } from 'react'
import { BookOpen, ChevronLeft, ChevronRight, ChevronDown, MessageCircleQuestion, ExternalLink } from 'lucide-react'
import { vulScript } from '../../content/settertool'

// v159: settertool in het belscherm. Script per stap met ingevulde [placeholders],
// keuze van de haak, bezwaren met 1 klik en een "Wat viel op"-veld.
// De kaart (state) leeft in WorkInterface, zodat hij bij het afboeken mee kan.
// Teksten komen uit src/content/settertool.js.
export default function SetterScript({ tool, kaart, setKaart, lead, setterNaam, isMobile }) {
  const [open, setOpen] = useState(true)
  const [stap, setStap] = useState(0)
  const [bezwaarOpen, setBezwaarOpen] = useState(null)

  const zet = (k, v) => setKaart(prev => ({ ...prev, [k]: v }))
  const wissel = (k, id) => setKaart(prev => ({
    ...prev, [k]: prev[k].includes(id) ? prev[k].filter(x => x !== id) : [...prev[k], id]
  }))

  const waarden = useMemo(() => ({
    'naam': (lead?.contact_person || '').split(' ')[0],
    'naam setter': (setterNaam || '').split(' ')[0],
    'bedrijf': lead?.name,
    'branche': kaart.branche,
    'wat viel op': kaart.watVielOp,
    'kanaal': kaart.kanaal,
    'moment 1': kaart.moment1,
    'moment 2': kaart.moment2,
  }), [lead?.contact_person, lead?.name, setterNaam, kaart.branche, kaart.watVielOp, kaart.kanaal, kaart.moment1, kaart.moment2])

  const huidige = tool.stappen[stap]
  const haak = tool.haken.find(h => h.id === kaart.haak) || tool.haken[0]
  const regels = huidige.haakStap ? haak.tekst : (huidige.tekst || [])

  const veld = { width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.85rem' }
  const chip = (actief) => ({
    padding: '5px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
    border: `1px solid ${actief ? 'var(--primary)' : 'var(--border)'}`,
    background: actief ? 'var(--accent-soft)' : 'var(--bg-elevated)',
    color: actief ? 'var(--primary)' : 'var(--text-primary)',
  })
  const kop = { fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', marginBottom: 6 }

  return (
    <div className="st-panel" style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: isMobile ? '8px 12px' : '8px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={{ ...chip(open), display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '6px 14px' }}>
          <BookOpen size={14} /> Belscript {tool.naam}
          <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </button>
        {open && tool.stappen.map((s, i) => (
          <button key={s.id} type="button" onClick={() => setStap(i)} style={chip(i === stap)} title={s.duur || undefined}>
            {i + 1}. {s.titel.split(' (')[0]}
          </button>
        ))}
        <a href="/settertool" target="_blank" rel="noopener noreferrer"
          style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textDecoration: 'none' }}>
          <ExternalLink size={13} /> Onboarding
        </a>
      </div>

      {open && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 12, marginTop: 10 }}>
          {/* Links: voorbereiding + script */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 8 }}>
              <div>
                <div style={kop}>Wat viel op (30 seconden check)</div>
                <input style={veld} value={kaart.watVielOp} maxLength={500}
                  onChange={e => zet('watVielOp', e.target.value)}
                  placeholder="Bijv. laatste post 8 maanden oud, geen reviews" />
              </div>
              <div>
                <div style={kop}>Branche</div>
                <input style={veld} value={kaart.branche} maxLength={60}
                  onChange={e => zet('branche', e.target.value)} placeholder="Bijv. dakdekkers" />
              </div>
            </div>

            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <strong style={{ fontSize: '0.92rem' }}>Stap {stap + 1}: {huidige.titel}</strong>
                {huidige.duur && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({huidige.duur})</span>}
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button type="button" className="btn btn-sm btn-outline" disabled={stap === 0} onClick={() => setStap(s => s - 1)} aria-label="Vorige stap"><ChevronLeft size={14} /></button>
                  <button type="button" className="btn btn-sm btn-outline" disabled={stap === tool.stappen.length - 1} onClick={() => setStap(s => s + 1)} aria-label="Volgende stap"><ChevronRight size={14} /></button>
                </span>
              </div>

              {huidige.haakStap && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                  {tool.haken.map(h => (
                    <button key={h.id} type="button" title={h.wanneer} onClick={() => zet('haak', h.id)} style={chip(kaart.haak === h.id)}>{h.label}</button>
                  ))}
                </div>
              )}
              {huidige.haakStap && haak.id === 'een_kanaal' && (
                <input style={{ ...veld, marginBottom: 8 }} value={kaart.kanaal} maxLength={40} onChange={e => zet('kanaal', e.target.value)} placeholder="Welk kanaal? Bijv. Facebook" />
              )}
              {huidige.haakStap && haak.wanneer && haak.id !== 'standaard' && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 6 }}>Wanneer: {haak.wanneer}</div>
              )}

              {regels.map((r, i) => (
                <p key={i} style={{ margin: '0 0 8px', fontSize: '0.95rem', lineHeight: 1.55 }}>{vulScript(r, waarden)}</p>
              ))}

              {huidige.id === 'afspraak' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <input style={veld} value={kaart.moment1} maxLength={40} onChange={e => zet('moment1', e.target.value)} placeholder="Moment 1, bijv. dinsdag 10:00" />
                  <input style={veld} value={kaart.moment2} maxLength={40} onChange={e => zet('moment2', e.target.value)} placeholder="Moment 2, bijv. donderdag 14:00" />
                </div>
              )}

              {(huidige.varianten || []).map(v => (
                <div key={v.label} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 10, margin: '6px 0' }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-muted)' }}>{v.label}</div>
                  <div style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{vulScript(v.tekst, waarden)}</div>
                </div>
              ))}

              {huidige.eisenStap && (
                <div style={{ marginTop: 8 }}>
                  <div style={kop}>4 eisen voor een afspraak (alle 4 moeten kloppen)</div>
                  {tool.eisen.map(e => (
                    <label key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.83rem', marginBottom: 4, cursor: 'pointer' }}>
                      <input type="checkbox" checked={kaart.eisen.includes(e.id)} onChange={() => wissel('eisen', e.id)} style={{ marginTop: 3 }} />
                      <span><strong>{e.label}:</strong> {e.door}</span>
                    </label>
                  ))}
                </div>
              )}

              {(huidige.tips || []).map((t, i) => (
                <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>{t}</div>
              ))}
            </div>
          </div>

          {/* Rechts: bezwaren, altijd in beeld */}
          <div style={{ minWidth: 0 }}>
            <div style={{ ...kop, display: 'flex', alignItems: 'center', gap: 6 }}><MessageCircleQuestion size={13} /> Bezwaren</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.4 }}>{tool.bezwarenUitleg}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tool.bezwaren.map(b => (
                <button key={b.id} type="button" style={chip(bezwaarOpen === b.id || kaart.bezwaren.includes(b.id))}
                  onClick={() => {
                    setBezwaarOpen(o => o === b.id ? null : b.id)
                    if (!kaart.bezwaren.includes(b.id)) wissel('bezwaren', b.id)
                    if (b.actie === 'referentie') zet('referentie', true)
                  }}>
                  {b.label}
                </button>
              ))}
            </div>
            {bezwaarOpen && (() => {
              const b = tool.bezwaren.find(x => x.id === bezwaarOpen)
              return (
                <div style={{ marginTop: 8, background: 'var(--bg-elevated)', border: '1px solid var(--primary)', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', marginBottom: 4 }}>{b.label}</div>
                  <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{vulScript(b.antwoord, waarden)}</div>
                  {b.actie === 'referentie' && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>Het verzoek wordt bij de lead vastgelegd.</div>}
                  {b.actie === 'terugbellen' && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 6 }}>Leg het moment vast met de knop TBA (Terugbel).</div>}
                </div>
              )
            })()}
            {kaart.bezwaren.length > 0 && (
              <button type="button" onClick={() => { zet('bezwaren', []); zet('referentie', false); setBezwaarOpen(null) }}
                style={{ marginTop: 8, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Gekozen bezwaren wissen
              </button>
            )}

            <div style={{ marginTop: 14 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.83rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={kaart.nietEigenaar} onChange={e => zet('nietEigenaar', e.target.checked)} />
                Niet de eigenaar aan de lijn
              </label>
              {kaart.nietEigenaar && (
                <div style={{ marginTop: 6 }}>
                  <input style={veld} value={kaart.besteTijd} maxLength={80} onChange={e => zet('besteTijd', e.target.value)} placeholder="Beste tijd om de eigenaar te bellen" />
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Boek af met TBA (Terugbel) en zet de naam van de eigenaar bij contactpersoon.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
