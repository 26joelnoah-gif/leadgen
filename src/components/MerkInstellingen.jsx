// v112 (30-09-2026): het MERK van een organisatie - hoe een offerte van deze
// organisatie eruitziet en van wie hij komt. Dit staat los van de tenant-kant
// van organizations (wie ziet wie); het gaat puur om wat de klant ziet:
// afzendernaam en -adres in de mail, logo, geldigheid, bedrijfsgegevens onder
// de offerte, de akkoordtekst en de voorwaarden.
//
// Waar het terechtkomt:
//   - offerte-tool op maat  -> via public.offerte_merk()
//   - mail met de tekenlink -> Edge Function offerte-send
//   - tekenpagina           -> Edge Function offerte-sign
// Een project kiest zijn merk in de projectinstellingen (campaigns.offerte_org_id).
import { useEffect, useState } from 'react'
import { Save, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

const VELDEN = [
  { key: 'afzender_naam', label: 'Naam op de offerte', hint: 'Bijvoorbeeld ProSell Marketing. Leeg = de naam van de organisatie.' },
  { key: 'afzender_email', label: 'Afzender e-mail', hint: 'Het adres waarvandaan de offerte gemaild wordt. Dit domein moet in Resend geverifieerd zijn, anders weigert de mail.' },
  { key: 'logo_url', label: 'Logo (link)', hint: 'Volledige https-link naar een afbeelding. Komt in de mail, op de tekenpagina en op de pdf.' },
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
]

export default function MerkInstellingen({ orgId, orgNaam }) {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [laden, setLaden] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [v, setV] = useState({})
  const [voorwaarden, setVoorwaarden] = useState([])

  useEffect(() => {
    if (!open || !orgId) return
    setLaden(true)
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle()
      .then(({ data, error }) => {
        if (error) { toast(error.message, 'error'); setLaden(false); return }
        setV(data || {})
        setVoorwaarden(Array.isArray(data?.offerte_voorwaarden) ? data.offerte_voorwaarden : [])
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
    patch.offerte_akkoord_tekst = (v.offerte_akkoord_tekst || '').trim() || null
    patch.offerte_voorwaarden = voorwaarden
      .map(x => ({ titel: (x.titel || '').trim(), tekst: (x.tekst || '').trim() }))
      .filter(x => x.titel || x.tekst)
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

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <button className="btn btn-outline btn-sm" onClick={() => setOpen(false)} style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600, marginBottom: 10 }}>
        <ChevronUp size={14} /> Inklappen
      </button>
      {laden ? <p className="text-muted text-sm">Laden…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="text-muted" style={{ fontSize: '0.72rem', margin: 0 }}>
            Dit is wat de klant ziet op een offerte van {orgNaam}: in de mail, op de tekenpagina en op de pdf.
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            {GETALLEN.map(f => (
              <div key={f.key}>
                <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">{f.label}</label>
                <input
                  type="number" min="0" className="form-dark" style={{ width: '100%', padding: '9px 12px' }}
                  value={v[f.key] ?? f.def}
                  onChange={e => zet(f.key, e.target.value)}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-1 block">Akkoordtekst</label>
            <textarea
              className="form-dark" style={{ width: '100%', padding: '9px 12px', minHeight: 110 }}
              value={v.offerte_akkoord_tekst || ''}
              onChange={e => zet('offerte_akkoord_tekst', e.target.value)}
              placeholder="Laat leeg voor de standaardtekst. Dit is waar de klant mee akkoord gaat als hij tekent."
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
