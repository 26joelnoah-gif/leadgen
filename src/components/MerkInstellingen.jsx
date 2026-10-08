// v112 (30-09-2026), uitgebreid in v113: het MERK van een organisatie - hoe een
// offerte van deze organisatie eruitziet en van wie hij komt. Dit staat los van
// de tenant-kant van organizations (wie ziet wie); het gaat puur om wat de klant
// ziet: afzendernaam en -adres in de mail, logo, kleuren, geldigheid,
// bedrijfsgegevens onder de offerte, de akkoordtekst, de voorwaarden, de vaste
// regels die de accountmanager kan aanklikken en de manier van ondertekenen.
//
// Waar het terechtkomt:
//   - offerte-tool op maat  -> via public.offerte_merk()
//   - mail met de tekenlink -> Edge Function offerte-send
//   - ondertekenpagina      -> Edge Function offerte-sign
// Een project kiest zijn merk in de projectinstellingen (campaigns.offerte_org_id).
import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

const VELDEN = [
  { key: 'afzender_naam', label: 'Naam op de offerte', hint: 'Bijvoorbeeld ProSell Marketing. Leeg = de naam van de organisatie.' },
  { key: 'afzender_email', label: 'Afzender e-mail', hint: 'Het adres waarvandaan de offerte gemaild wordt. Dit domein moet in Resend geverifieerd zijn, anders weigert de mail.' },
  { key: 'logo_url', label: 'Logo (link)', hint: 'Volledige https-link naar een afbeelding. Komt in de mail, op de ondertekenpagina en op de pdf.' },
  { key: 'website', label: 'Website' },
  { key: 'telefoon', label: 'Telefoon' },
  { key: 'adres', label: 'Adres' },
  { key: 'kvk', label: 'KvK-nummer' },
  { key: 'btw_nummer', label: 'Btw-nummer' },
  { key: 'iban', label: 'IBAN' },
]

const GETALLEN = [
  { key: 'offerte_geldigheid_dagen', label: 'Offerte geldig (dagen)', def: 14 },
  { key: 'offerte_opvolg_dagen', label: 'Lead terugbellen na (dagen)', def: 3 },
  { key: 'btw_percentage', label: 'Btw-percentage', def: 21 },
  { key: 'betaaltermijn_dagen', label: 'Betaaltermijn (dagen)', def: 14 },
]

const LOOPTIJDEN = [
  { v: 0, label: 'Maandelijks opzegbaar' },
  { v: 3, label: '3 maanden' },
  { v: 12, label: '12 maanden' },
  { v: 24, label: '24 maanden' },
]

export default function MerkInstellingen({ orgId, orgNaam }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [laden, setLaden] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [v, setV] = useState({})
  const [voorwaarden, setVoorwaarden] = useState([])
  const [sjablonen, setSjablonen] = useState([])

  useEffect(() => {
    if (!open || !orgId) return
    setLaden(true)
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle()
      .then(({ data, error }) => {
        if (error) { toast(error.message, 'error'); setLaden(false); return }
        setV(data || {})
        setVoorwaarden(Array.isArray(data?.offerte_voorwaarden) ? data.offerte_voorwaarden : [])
        setSjablonen(Array.isArray(data?.offerte_sjablonen) ? data.offerte_sjablonen : [])
        setLaden(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgId])

  const zet = (k, val) => setV(prev => ({ ...prev, [k]: val }))

  async function opslaan() {
    setBezig(true)
    const patch = {}
    VELDEN.forEach(f => { patch[f.key] = (v[f.key] || '').trim() || null })
    GETALLEN.forEach(f => { patch[f.key] = Number(v[f.key]) >= 0 ? Number(v[f.key]) : f.def })
    patch.accent_kleur = (v.accent_kleur || '').trim() || null
    patch.accent_tekst_kleur = (v.accent_tekst_kleur || '').trim() || null
    patch.offerte_handtekening = v.offerte_handtekening === 'tekenen' ? 'tekenen' : 'knop'
    patch.offerte_akkoord_tekst = (v.offerte_akkoord_tekst || '').trim() || null
    patch.offerte_voorwaarden = voorwaarden
      .map(x => ({ titel: (x.titel || '').trim(), tekst: (x.tekst || '').trim() }))
      .filter(x => x.titel || x.tekst)
    patch.offerte_sjablonen = sjablonen
      .map(x => ({
        naam: (x.naam || '').trim(),
        sub: (x.sub || '').trim() || undefined,
        periode: x.periode === 'maand' ? 'maand' : 'eenmalig',
        looptijd: x.periode === 'maand' ? Number(x.looptijd || 0) : undefined,
        prijs: x.prijs === '' || x.prijs == null ? undefined : Number(x.prijs),
      }))
      .filter(x => x.naam)
    const { error } = await supabase.from('organizations').update(patch).eq('id', orgId)
    setBezig(false)
    if (error) { toast(error.message, 'error'); return }
    toast(`Merk van ${orgNaam} opgeslagen`, 'success')
  }

  if (!open) {
    return (
      <button className="btn btn-outline btn-sm" onClick={() => setOpen(true)} style={{ marginTop: 10, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
        <ChevronDown size={14} /> Offerte-instellingen
      </button>
    )
  }

  const accent = v.accent_kleur || '#15803D'
  const accentInkt = v.accent_tekst_kleur || '#FFFFFF'

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, marginBottom: 10 }}>
        <ChevronUp size={14} /> Inklappen
      </button>
      {laden ? <p className="text-muted text-sm">Laden…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="text-muted" style={{ fontSize: '0.72rem', margin: 0 }}>
            Dit is wat de klant ziet op een offerte van {orgNaam}: in de mail, op de ondertekenpagina en op de pdf.
            Een project gebruikt dit merk zodra je het kiest bij "Offertes gaan uit namens" in de projectinstellingen.
          </p>

          {VELDEN.map(f => (
            <div key={f.key}>
              <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">{f.label}</label>
              <input
                className="form-dark"
                style={{ width: '100%', padding: '9px 12px' }}
                value={v[f.key] || ''}
                onChange={e => zet(f.key, e.target.value)}
              />
              {f.hint && <p className="text-muted" style={{ fontSize: '0.7rem', margin: '4px 0 0' }}>{f.hint}</p>}
            </div>
          ))}

          {/* v113: kleuren van het merk */}
          <div>
            <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">Kleuren</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
              <div>
                <p className="text-muted" style={{ fontSize: '0.7rem', margin: '0 0 4px' }}>Accentkleur (knoppen, lijnen)</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#15803D'} onChange={e => zet('accent_kleur', e.target.value)} style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent' }} />
                  <input className="form-dark" style={{ flex: 1, padding: '9px 12px' }} value={v.accent_kleur || ''} placeholder="#15803D" onChange={e => zet('accent_kleur', e.target.value)} />
                </div>
              </div>
              <div>
                <p className="text-muted" style={{ fontSize: '0.7rem', margin: '0 0 4px' }}>Tekst op de accentkleur</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(accentInkt) ? accentInkt : '#FFFFFF'} onChange={e => zet('accent_tekst_kleur', e.target.value)} style={{ width: 44, height: 38, padding: 2, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent' }} />
                  <input className="form-dark" style={{ flex: 1, padding: '9px 12px' }} value={v.accent_tekst_kleur || ''} placeholder="#FFFFFF" onChange={e => zet('accent_tekst_kleur', e.target.value)} />
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 8, background: accent, color: accentInkt, padding: '9px 18px', borderRadius: 999, fontWeight: 600, fontSize: '0.85rem' }}>
              Zo ziet de knop eruit
            </div>
          </div>

          {/* v113: hoe de klant ondertekent */}
          <div>
            <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">Hoe ondertekent de klant?</label>
            <select
              value={v.offerte_handtekening === 'tekenen' ? 'tekenen' : 'knop'}
              onChange={e => zet('offerte_handtekening', e.target.value)}
              style={{ width: '100%' }}
            >
              <option value="knop">Met een akkoordknop (naam, vinkje en een bevestiging)</option>
              <option value="tekenen">Met een handtekening op het scherm</option>
            </select>
            <p className="text-muted" style={{ fontSize: '0.7rem', margin: '4px 0 0' }}>
              Bij de akkoordknop legt het systeem de naam, het tijdstip en het akkoord vast. Dat geldt als rechtsgeldige ondertekening en werkt makkelijker op een telefoon.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {GETALLEN.map(f => (
              <div key={f.key}>
                <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">{f.label}</label>
                <input
                  type="number" min="0" className="form-dark" style={{ width: '100%', padding: '9px 12px' }}
                  value={v[f.key] ?? f.def}
                  onChange={e => zet(f.key, e.target.value)}
                />
                {f.key === 'betaaltermijn_dagen' && (
                  <p className="text-muted" style={{ fontSize: '0.7rem', margin: '4px 0 0' }}>
                    Standaard voor nieuwe offertes. Zet 1 voor betalen binnen 24 uur. De accountmanager kan het per offerte nog wijzigen.
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* v113: vaste regels die de accountmanager kan aanklikken */}
          <div>
            <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">Vaste regels ({sjablonen.length})</label>
            <p className="text-muted" style={{ fontSize: '0.7rem', margin: '0 0 8px' }}>
              Snelknoppen in de offerte-tool. De accountmanager klikt er een aan en de regel staat er meteen. Vul je een standaardprijs in, dan staat die er ook al; laat je hem leeg, dan typt de accountmanager de prijs zelf.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sjablonen.map((x, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      className="form-dark" style={{ width: '100%', padding: '8px 12px' }}
                      placeholder="Naam, bijvoorbeeld: Hosting en onderhoud"
                      value={x.naam || ''}
                      onChange={e => setSjablonen(prev => prev.map((y, j) => j === i ? { ...y, naam: e.target.value } : y))}
                    />
                    <input
                      className="form-dark" style={{ width: '100%', padding: '8px 12px' }}
                      placeholder="Toelichting (optioneel)"
                      value={x.sub || ''}
                      onChange={e => setSjablonen(prev => prev.map((y, j) => j === i ? { ...y, sub: e.target.value } : y))}
                    />
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <input
                        type="number" min="0" step="1" className="form-dark" style={{ width: 130, padding: '8px 12px' }}
                        placeholder="Prijs (leeg)"
                        value={x.prijs ?? ''}
                        onChange={e => setSjablonen(prev => prev.map((y, j) => j === i ? { ...y, prijs: e.target.value === '' ? '' : Number(e.target.value) } : y))}
                      />
                      <select
                        value={x.periode === 'maand' ? 'maand' : 'eenmalig'}
                        onChange={e => setSjablonen(prev => prev.map((y, j) => j === i ? { ...y, periode: e.target.value } : y))}
                        style={{ flex: 1, minWidth: 130 }}
                      >
                        <option value="eenmalig">Eenmalig</option>
                        <option value="maand">Per maand</option>
                      </select>
                      {x.periode === 'maand' && (
                        <select
                          value={Number(x.looptijd || 0)}
                          onChange={e => setSjablonen(prev => prev.map((y, j) => j === i ? { ...y, looptijd: Number(e.target.value) } : y))}
                          style={{ flex: 1, minWidth: 160 }}
                        >
                          {LOOPTIJDEN.map(l => <option key={l.v} value={l.v}>{l.label}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                  <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setSjablonen(prev => prev.filter((_, j) => j !== i))} title="Regel verwijderen">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }} onClick={() => setSjablonen(prev => [...prev, { naam: '', sub: '', periode: 'eenmalig', looptijd: 0, prijs: '' }])}>
              <Plus size={14} /> Vaste regel toevoegen
            </button>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">Akkoordtekst</label>
            <textarea
              className="form-dark" style={{ width: '100%', padding: '9px 12px', minHeight: 110 }}
              value={v.offerte_akkoord_tekst || ''}
              onChange={e => zet('offerte_akkoord_tekst', e.target.value)}
              placeholder="Laat leeg voor de standaardtekst. Dit is waar de klant mee akkoord gaat als hij ondertekent."
            />
            <p className="text-muted" style={{ fontSize: '0.7rem', margin: '4px 0 0' }}>
              Leeg = een standaardtekst met de naam van dit merk. Laat een eigen tekst juridisch nakijken voordat je hem gebruikt.
            </p>
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">Voorwaarden ({voorwaarden.length})</label>
            <p className="text-muted" style={{ fontSize: '0.7rem', margin: '0 0 8px' }}>De kleine letters onder de offerte. Elk blokje krijgt vanzelf een nummer.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {voorwaarden.map((x, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      className="form-dark" style={{ width: '100%', padding: '8px 12px' }}
                      placeholder="Kop, bijvoorbeeld: Prijzen en betaling"
                      value={x.titel || ''}
                      onChange={e => setVoorwaarden(prev => prev.map((y, j) => j === i ? { ...y, titel: e.target.value } : y))}
                    />
                    <textarea
                      className="form-dark" style={{ width: '100%', padding: '8px 12px', minHeight: 70 }}
                      placeholder="De tekst van deze voorwaarde"
                      value={x.tekst || ''}
                      onChange={e => setVoorwaarden(prev => prev.map((y, j) => j === i ? { ...y, tekst: e.target.value } : y))}
                    />
                  </div>
                  <button className="btn btn-outline btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setVoorwaarden(prev => prev.filter((_, j) => j !== i))} title="Voorwaarde verwijderen">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button className="btn btn-outline btn-sm" style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }} onClick={() => setVoorwaarden(prev => [...prev, { titel: '', tekst: '' }])}>
              <Plus size={14} /> Voorwaarde toevoegen
            </button>
          </div>

          <button className="btn btn-primary" onClick={opslaan} disabled={bezig} style={{ alignSelf: 'flex-start' }}>
            <Save size={14} /> {bezig ? 'Opslaan…' : 'Merk opslaan'}
          </button>
        </div>
      )}
    </div>
  )
}
