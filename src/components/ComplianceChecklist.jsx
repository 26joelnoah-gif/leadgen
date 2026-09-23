// LEADGEN v98 - compliance-checklist per project (AVG + art. 11.7 Tw).
// Zelfde onderdeel in de wizard voor een nieuw project (NewProjectWizard) en in
// de projectinstellingen van een bestaand project (ProjectSettingsModal).
// Gecontroleerd: de ouder bewaart { doelgroep, rechtsvorm_modus, checklist } en
// schrijft het weg naar campaigns (compliance_ok_at = alle stappen gedaan).
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DOELGROEPEN } from '../lib/compliance'

const VINKJES = [
  { key: 'script_noemt_naam', label: 'Het belscript noemt je naam, de bedrijfsnaam en waarom je belt.' },
  { key: 'bezwaar_instructie', label: 'Bellers weten: zegt iemand "bel me niet meer", dan boeken ze af op Niet meer benaderen. Dat stopt ook de mails.' },
  { key: 'kvk_instructie', label: 'Bellers weten: staat er "Eerst KvK checken", dan zoeken ze het bedrijf op bij kvk.nl en kiezen de rechtsvorm voordat ze bellen.', alleen: 'zakelijk' },
  { key: 'toestemming_instructie', label: 'Toestemming wordt vastgelegd door een admin of manager, met wie, wanneer en hoe.', alleen: 'particulier' },
  { key: 'mail_afmeldlink', label: 'De mails hebben een afmeldlink die terugmeldt aan LEADGEN (MarketingKiezer: /mailvoorkeur).', alleenMail: true },
]

/** Welke stappen gelden voor deze instellingen, en welke zijn gedaan? */
export function checklistStappen(value, mailEnabled) {
  const d = value?.doelgroep || null
  const c = value?.checklist || {}
  const stappen = [
    { key: 'doelgroep', label: 'Doelgroep gekozen', klaar: !!d },
    { key: 'bron', label: 'Herkomst van de leads beschreven', klaar: (c.bron_leads || '').trim().length >= 5 },
  ]
  if (d === 'particulier') stappen.push({ key: 'toestemming_proces', label: 'Beschreven hoe toestemming wordt vastgelegd', klaar: (c.toestemming_proces || '').trim().length >= 5 })
  VINKJES.forEach(v => {
    if (v.alleen && v.alleen !== d) return
    if (v.alleenMail && !mailEnabled) return
    if (d === 'geen_telemarketing' && v.key !== 'bezwaar_instructie') return
    stappen.push({ key: v.key, label: v.label, klaar: c[v.key] === true })
  })
  return stappen
}
export const checklistCompleet = (value, mailEnabled) => checklistStappen(value, mailEnabled).every(s => s.klaar)

export default function ComplianceChecklist({ value, onChange, campaignId, mailEnabled = false }) {
  const [stats, setStats] = useState(null)
  const d = value?.doelgroep || null
  const c = value?.checklist || {}
  const set = (patch) => onChange({ ...value, ...patch })
  const setC = (patch) => onChange({ ...value, checklist: { ...c, ...patch } })

  useEffect(() => {
    let alive = true
    if (!campaignId) { setStats(null); return }
    supabase.rpc('project_compliance_stats', { p_campaign_id: campaignId })
      .then(({ data }) => { if (alive) setStats(Array.isArray(data) ? data[0] : data) })
    return () => { alive = false }
  }, [campaignId, d, value?.rechtsvorm_modus])

  const stappen = checklistStappen(value, mailEnabled)
  const gedaan = stappen.filter(s => s.klaar).length
  const label = 'text-[10px] font-black uppercase text-muted tracking-widest mb-2 block'
  const vink = (key, tekst) => (
    <label key={key} className="flex gap-2" style={{ cursor: 'pointer', fontSize: '0.82rem', alignItems: 'flex-start' }}>
      <input type="checkbox" checked={c[key] === true} onChange={e => setC({ [key]: e.target.checked })} style={{ marginTop: 3 }} />
      <span>{tekst}</span>
    </label>
  )

  return (
    <div className="p-3 rounded-xl border border-border bg-elevated" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ShieldCheck size={16} color={gedaan === stappen.length ? 'var(--success)' : 'var(--warning)'} />
        <strong style={{ fontSize: '0.9rem' }}>Compliance-checklist (AVG / bellen)</strong>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 800, color: gedaan === stappen.length ? 'var(--success)' : 'var(--warning)' }}>{gedaan}/{stappen.length}</span>
      </div>

      <div>
        <label className={label}>1. Wie bel je in dit project?</label>
        <div style={{ display: 'grid', gap: 6 }}>
          {DOELGROEPEN.map(g => (
            <label key={g.key} className="flex gap-2" style={{ cursor: 'pointer', fontSize: '0.82rem', alignItems: 'flex-start', padding: '6px 8px', borderRadius: 8, border: `1px solid ${d === g.key ? 'var(--primary)' : 'var(--border)'}` }}>
              <input type="radio" name="doelgroep" checked={d === g.key} onChange={() => set({ doelgroep: g.key })} style={{ marginTop: 3 }} />
              <span><strong>{g.label}</strong><br /><span className="text-muted">{g.uitleg}</span></span>
            </label>
          ))}
        </div>
      </div>

      {d === 'zakelijk' && (
        <div>
          <label className={label}>2. Leads zonder bekende rechtsvorm</label>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button type="button" onClick={() => set({ rechtsvorm_modus: 'waarschuwen' })} className={`btn btn-sm ${(value?.rechtsvorm_modus || 'waarschuwen') === 'waarschuwen' ? 'btn-primary' : 'btn-outline'}`}>Beller checkt KvK eerst</button>
            <button type="button" onClick={() => set({ rechtsvorm_modus: 'streng' })} className={`btn btn-sm ${value?.rechtsvorm_modus === 'streng' ? 'btn-primary' : 'btn-outline'}`}>Streng: niet in de wachtrij</button>
          </div>
          <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>
            "Beller checkt KvK eerst": de lead komt in de wachtrij, maar het nummer blijft verborgen tot de beller de rechtsvorm heeft gekozen.
            "Streng": zo'n lead komt pas in de wachtrij als de rechtsvorm bekend is (bijvoorbeeld via een import met een kolom Rechtsvorm).
          </p>
          {stats && Number(stats.totaal) > 0 && (
            <p style={{ fontSize: '0.78rem', margin: '8px 0 0' }}>
              Van de {stats.totaal} leads: <strong style={{ color: 'var(--success)' }}>{stats.ok} mogen gebeld worden</strong>
              {Number(stats.kvk_check) > 0 && <>, <strong style={{ color: 'var(--warning)' }}>{stats.kvk_check} eerst KvK checken</strong></>}
              {Number(stats.toestemming_nodig) > 0 && <>, <strong style={{ color: 'var(--danger)' }}>{stats.toestemming_nodig} alleen met toestemming</strong></>}
              {Number(stats.afgemeld) > 0 && <>, {stats.afgemeld} afgemeld</>}.
              {Number(stats.rechtsvorm_uit_naam) > 0 && <span className="text-muted"> ({stats.rechtsvorm_uit_naam} keer is de rechtsvorm uit de bedrijfsnaam gehaald, bijv. "B.V.")</span>}
              {' '}Tip: importeer een KvK-export met een kolom Rechtsvorm via "Verrijken" om ze in een keer aan te vullen.
            </p>
          )}
        </div>
      )}

      <div>
        <label className={label}>{d === 'zakelijk' ? '3' : '2'}. Waar komen de leads vandaan?</label>
        <textarea className="form-dark w-full" rows={2} value={c.bron_leads || ''} onChange={e => setC({ bron_leads: e.target.value })}
          placeholder="Bijv. KvK-export marketingbureaus, eigen netwerk, websiteformulier" />
      </div>

      {d === 'particulier' && (
        <div>
          <label className={label}>3. Hoe leg je toestemming vast?</label>
          <textarea className="form-dark w-full" rows={2} value={c.toestemming_proces || ''} onChange={e => setC({ toestemming_proces: e.target.value })}
            placeholder="Bijv. klant vult formulier in op de site, of gaf aan de deur toestemming (Outside)" />
        </div>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        <label className={label} style={{ marginBottom: 0 }}>Afspraken met het team</label>
        {VINKJES.filter(v => stappen.some(s => s.key === v.key)).map(v => vink(v.key, v.label))}
      </div>

      <div>
        <label className={label}>Staat automatisch aan</label>
        <div style={{ display: 'grid', gap: 4, fontSize: '0.8rem' }}>
          {[
            'Afmeldlijst: wie zich afmeldt (mail of telefoon) wordt overal geblokkeerd, ook bij een nieuwe import.',
            'Afgemelde leads worden na 48 uur verwijderd (of eerder via Leads > Afgemeld).',
            'Leads waar 12 maanden niets mee gebeurd is, worden elke nacht verwijderd.',
            'Klachten en AVG-verzoeken leg je vast met de knop "Compliance-melding" bij een lead.',
          ].map(t => <div key={t} className="flex gap-2" style={{ alignItems: 'flex-start' }}><CheckCircle2 size={14} color="var(--success)" style={{ flexShrink: 0, marginTop: 2 }} /> {t}</div>)}
        </div>
      </div>

      {gedaan < stappen.length && (
        <div style={{ fontSize: '0.75rem', color: 'var(--warning)' }}>
          Nog te doen: {stappen.filter(s => !s.klaar).map(s => s.label.split('.')[0].split(':')[0]).join(' · ')}
        </div>
      )}
      {gedaan === stappen.length && (
        <div style={{ fontSize: '0.78rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Circle size={10} fill="var(--success)" /> Alles ingesteld. Sla op om het vast te leggen.
        </div>
      )}
    </div>
  )
}
