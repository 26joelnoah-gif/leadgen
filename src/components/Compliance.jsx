// LEADGEN v98 - compliance per lead: mag deze lead gebeld worden, KvK-check,
// toestemming vastleggen, afmelden en het klachtenlog.
//   <ComplianceLeadBlok lead project onChanged />  belscherm + contactkaart
//   <ComplianceMeldingModal lead onClose onSaved />  klacht / bezwaar / AVG / ACM
//   <ComplianceMeldingenLijst leadId />              meldingen bij een lead
import { useEffect, useState } from 'react'
import { ShieldAlert, ShieldCheck, ExternalLink, FileWarning, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import {
  RECHTSVORMEN, rechtsvormLabel, leadBelstatus, BELSTATUS, MELDING_SOORTEN, meldingSoortLabel,
  kvkZoekUrl, urenTotWissen,
} from '../lib/compliance'

const dag = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const BRON_LABEL = { naam: 'uit bedrijfsnaam', import: 'uit import', kvk_beller: 'KvK gecheckt', handmatig: 'handmatig' }
const OPT_IN_BRONNEN = [
  { key: 'phone', label: 'Zelf gebeld / gevraagd om teruggebeld te worden' },
  { key: 'web', label: 'Formulier op de website' },
  { key: 'email', label: 'Per e-mail' },
  { key: 'schriftelijk', label: 'Schriftelijk / contract' },
]

// v103: losseKnop=false -> geen aparte regel met alleen de knop Compliance-melding
// (het belscherm heeft die knop nu in de kopregel).
export function ComplianceLeadBlok({ lead, project, onChanged, compact = false, losseKnop = true }) {
  const { user, profile } = useAuth()
  const toast = useToast()
  const isStaff = profile?.role === 'admin' || profile?.role === 'manager'
  const [bezig, setBezig] = useState(false)
  const [toestemmingOpen, setToestemmingOpen] = useState(false)
  const [optBron, setOptBron] = useState('phone')
  const [optBewijs, setOptBewijs] = useState('')
  const [meldingOpen, setMeldingOpen] = useState(false)
  const [wijzigRv, setWijzigRv] = useState(false)

  if (!lead) return null
  const status = leadBelstatus(lead, project)
  const info = BELSTATUS[status]
  const zakelijk = project?.doelgroep === 'zakelijk'
  // Een beller vult een lege/onbekende rechtsvorm in (of een die uit de naam
  // kwam). Een bevestigde rechtsvorm omzetten mag alleen admin/manager (DB-trigger).
  const magRvKiezen = isStaff || !lead.rechtsvorm || lead.rechtsvorm === 'onbekend' || lead.rechtsvorm_bron === 'naam'

  async function zetRechtsvorm(key) {
    setBezig(true)
    const patch = { rechtsvorm: key, rechtsvorm_bron: 'kvk_beller', rechtsvorm_at: new Date().toISOString(), rechtsvorm_by: user?.id || null }
    const { data, error } = await supabase.from('leads').update(patch).eq('id', lead.id).select('*').maybeSingle()
    setBezig(false)
    if (error) { toast(error.message || 'Opslaan mislukt', 'error'); return }
    await supabase.from('activities').insert({ lead_id: lead.id, user_id: user?.id, action: 'note', notes: `Rechtsvorm: ${rechtsvormLabel(key)} (KvK gecheckt)` })
    setWijzigRv(false)
    toast(RECHTSVORMEN.find(r => r.key === key)?.mag ? 'Rechtsvorm opgeslagen. Je mag bellen.' : 'Opgeslagen. Deze lead mag je alleen met toestemming bellen.', 'success')
    onChanged?.(data || { ...lead, ...patch })
  }

  async function legToestemmingVast() {
    if (optBewijs.trim().length < 10) { toast('Schrijf kort op hoe en wanneer de toestemming is gegeven', 'error'); return }
    setBezig(true)
    const patch = { opt_in_at: new Date().toISOString(), opt_in_by: user?.id || null, opt_in_source: optBron, opt_in_bewijs: optBewijs.trim() }
    const { data, error } = await supabase.from('leads').update(patch).eq('id', lead.id).select('*').maybeSingle()
    setBezig(false)
    if (error) { toast(error.message || 'Opslaan mislukt', 'error'); return }
    await supabase.from('activities').insert({ lead_id: lead.id, user_id: user?.id, action: 'note', notes: `Toestemming vastgelegd (${optBron}): ${optBewijs.trim()}` })
    setToestemmingOpen(false)
    setOptBewijs('')
    toast('Toestemming vastgelegd', 'success')
    onChanged?.(data || { ...lead, ...patch })
  }

  const kaart = { borderRadius: 10, padding: compact ? '8px 10px' : '10px 14px', fontSize: '0.85rem', lineHeight: 1.45 }
  const meldingKnop = (
    <button type="button" className="btn btn-sm btn-outline" onClick={() => setMeldingOpen(true)}
      title="Klacht, bezwaar, AVG-verzoek of ACM-melding bij deze lead vastleggen"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <FileWarning size={13} /> Compliance-melding
    </button>
  )
  const modal = meldingOpen && (
    <ComplianceMeldingModal lead={lead} onClose={() => setMeldingOpen(false)}
      onSaved={(nieuw) => { setMeldingOpen(false); onChanged?.(nieuw || lead) }} />
  )

  const rvKnoppen = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {RECHTSVORMEN.map(r => (
        <button key={r.key} type="button" disabled={bezig} onClick={() => zetRechtsvorm(r.key)}
          className="btn btn-sm btn-outline"
          style={{ borderColor: r.mag ? 'var(--success)' : 'var(--danger)', color: r.mag ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
          {r.label}
        </button>
      ))}
    </div>
  )

  const pauze = lead.mail_pauze_tot && new Date(lead.mail_pauze_tot) > new Date()
    ? (
      <div style={{ ...kaart, marginBottom: 8, background: 'var(--info-bg)', border: '1px solid var(--info)', fontSize: '0.82rem' }}>
        <strong style={{ color: 'var(--info)' }}>Later mailen.</strong> Dit bureau wil pas weer mail na {new Date(lead.mail_pauze_tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}. Bellen mag wel.
      </div>
    ) : null

  if (status === 'ok') {
    // Rustige regel: waarom mag dit?
    let reden = null
    if (lead.opt_in_at) reden = `Toestemming ${dag(lead.opt_in_at)}${lead.opt_in_bewijs ? ': ' + lead.opt_in_bewijs : ''}`
    else if (zakelijk && lead.rechtsvorm) reden = `${rechtsvormLabel(lead.rechtsvorm)} (${BRON_LABEL[lead.rechtsvorm_bron] || 'bekend'})`
    if (!reden && !compact && losseKnop) return <>{pauze}<div style={{ display: 'flex', justifyContent: 'flex-end' }}>{meldingKnop}{modal}</div></>
    if (!reden) return <>{pauze}{modal}</>
    return (
      <>{pauze}
      <div style={{ ...kaart, background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <ShieldCheck size={15} color="var(--success)" />
        <span className="text-muted" style={{ flex: 1, minWidth: 160 }}>{reden}</span>
        {zakelijk && magRvKiezen && !lead.opt_in_at && (
          <button type="button" className="btn btn-sm btn-outline" onClick={() => setWijzigRv(v => !v)}>Rechtsvorm wijzigen</button>
        )}
        {losseKnop && meldingKnop}
        {wijzigRv && <div style={{ width: '100%' }}>{rvKnoppen}</div>}
        {modal}
      </div>
      </>
    )
  }

  return (
    <>{pauze}
    <div style={{ ...kaart, background: info.bg, border: `1px solid ${info.color}`, color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: info.color }}>
        <ShieldAlert size={16} /> {status === 'kvk_check' ? 'Eerst KvK checken, dan pas bellen' : status === 'afgemeld' ? 'Afgemeld: niet bellen, niet mailen' : 'Niet bellen: alleen na toestemming'}
      </div>

      {status === 'kvk_check' && (
        <>
          <p style={{ margin: '6px 0 0' }}>
            We weten nog niet wat voor bedrijf dit is. Zoek het op bij de KvK en kies de rechtsvorm.
            Bv, nv, stichting en vereniging mag je bellen. Eenmanszaak, vof, cv en maatschap niet.
          </p>
          <a href={kvkZoekUrl(lead.name)} target="_blank" rel="noopener noreferrer" className="btn btn-sm btn-outline"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 8, textDecoration: 'none' }}>
            <ExternalLink size={13} /> Zoek "{(lead.name || '').replace(/^\s*\d+\.\s*/, '')}" op kvk.nl
          </a>
          {rvKnoppen}
        </>
      )}

      {status === 'toestemming_nodig' && (
        <>
          <p style={{ margin: '6px 0 0' }}>
            {project?.doelgroep === 'particulier'
              ? 'In dit project bel je particulieren. Dat mag alleen als er vooraf toestemming is vastgelegd.'
              : lead.rechtsvorm && lead.rechtsvorm !== 'onbekend'
                ? `${rechtsvormLabel(lead.rechtsvorm)} valt sinds 1 juli 2026 onder dezelfde regels als consumenten. Bellen mag alleen met vooraf vastgelegde toestemming.`
                : 'De rechtsvorm is nog niet bevestigd. In dit project bel je zo\'n lead pas als de rechtsvorm bekend is.'}
          </p>
          {zakelijk && magRvKiezen && (
            <>
              <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => setWijzigRv(v => !v)}>
                {lead.rechtsvorm && lead.rechtsvorm !== 'onbekend' ? 'Rechtsvorm klopt niet?' : 'Rechtsvorm invullen'}
              </button>
              {wijzigRv && (
                <>
                  <a href={kvkZoekUrl(lead.name)} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 10, fontSize: '0.8rem' }}>
                    <ExternalLink size={12} /> kvk.nl
                  </a>
                  {rvKnoppen}
                </>
              )}
            </>
          )}
          {isStaff && !toestemmingOpen && (
            <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: 8, marginLeft: 6 }} onClick={() => setToestemmingOpen(true)}>
              Toestemming vastleggen
            </button>
          )}
          {isStaff && toestemmingOpen && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <select className="form-control" value={optBron} onChange={e => setOptBron(e.target.value)}>
                {OPT_IN_BRONNEN.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
              <textarea className="form-control" rows={2} value={optBewijs} onChange={e => setOptBewijs(e.target.value)}
                placeholder="Wie gaf toestemming, wanneer en hoe? Bijv. 'Jan belde zelf op 23-9 en vroeg om een offerte.'" />
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn btn-sm btn-primary" disabled={bezig} onClick={legToestemmingVast}>Opslaan</button>
                <button type="button" className="btn btn-sm btn-outline" onClick={() => setToestemmingOpen(false)}>Annuleren</button>
              </div>
            </div>
          )}
        </>
      )}

      {status === 'afgemeld' && (
        <p style={{ margin: '6px 0 0' }}>
          Afgemeld op {dag(lead.afgemeld_at)}{lead.afgemeld_bron === 'mail' ? ' via de mail' : lead.afgemeld_bron === 'beller' ? ' tijdens een gesprek' : lead.afgemeld_bron === 'import' ? ' (stond al op de afmeldlijst)' : ''}.
          {' '}Deze lead wordt over {urenTotWissen(lead)} uur automatisch verwijderd.
        </p>
      )}

      {losseKnop && <div style={{ marginTop: 8 }}>{meldingKnop}</div>}
      {modal}
    </div>
    </>
  )
}

export function ComplianceMeldingModal({ lead, onClose, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const [soort, setSoort] = useState('klacht')
  const [tekst, setTekst] = useState('')
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10))
  const [ookAfmelden, setOokAfmelden] = useState(false)
  const [bezig, setBezig] = useState(false)

  useEffect(() => { if (soort === 'bezwaar') setOokAfmelden(true) }, [soort])

  async function opslaan() {
    if (tekst.trim().length < 5) { toast('Schrijf kort op wat er gemeld is', 'error'); return }
    setBezig(true)
    let campaignId = null
    if (lead?.lead_list_id) {
      const { data } = await supabase.from('lead_lists').select('campaign_id').eq('id', lead.lead_list_id).maybeSingle()
      campaignId = data?.campaign_id || null
    }
    const { error } = await supabase.from('compliance_meldingen').insert({
      lead_id: lead?.id || null, lead_naam: lead?.name || null, campaign_id: campaignId,
      soort, tekst: tekst.trim(), melding_op: datum, created_by: user?.id,
    })
    if (error) { setBezig(false); toast(error.message || 'Opslaan mislukt', 'error'); return }
    let nieuw = null
    if (ookAfmelden && lead?.id) {
      const { error: bErr } = await supabase.rpc('blokkeer_lead', { p_lead_id: lead.id, p_bron: 'melding', p_reden: `${meldingSoortLabel(soort)}: ${tekst.trim().slice(0, 200)}` })
      if (bErr) toast('Melding opgeslagen, maar afmelden mislukt: ' + bErr.message, 'error')
      else {
        const { data } = await supabase.from('leads').select('*').eq('id', lead.id).maybeSingle()
        nieuw = data
      }
    }
    setBezig(false)
    toast(ookAfmelden ? 'Melding opgeslagen en lead afgemeld' : 'Melding opgeslagen', 'success')
    onSaved?.(nieuw)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 460, padding: 20, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        <button type="button" onClick={onClose} aria-label="Sluiten" style={{ position: 'absolute', top: 12, right: 12, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button>
        <h2 style={{ margin: '0 0 4px', fontSize: '1.05rem' }}>Compliance-melding</h2>
        <p className="text-muted" style={{ margin: '0 0 14px', fontSize: '0.8rem' }}>{lead?.name}. Zo raakt een klacht of verzoek niet kwijt in een losse mail.</p>
        <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Soort</label>
        <select className="form-control" value={soort} onChange={e => setSoort(e.target.value)} style={{ marginBottom: 10 }}>
          {MELDING_SOORTEN.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Datum van de melding</label>
        <input type="date" className="form-control" value={datum} onChange={e => setDatum(e.target.value)} style={{ marginBottom: 10 }} />
        <label style={{ fontSize: '0.75rem', fontWeight: 700 }}>Wat is er gemeld?</label>
        <textarea className="form-control" rows={4} value={tekst} onChange={e => setTekst(e.target.value)} placeholder="Wie, wat en via welk kanaal" style={{ marginBottom: 10 }} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '0.82rem', marginBottom: 14 }}>
          <input type="checkbox" checked={ookAfmelden} onChange={e => setOokAfmelden(e.target.checked)} style={{ marginTop: 3 }} />
          <span>Ook afmelden: niet meer bellen en mailen (e-mail, telefoon en website gaan op de afmeldlijst)</span>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary" disabled={bezig} onClick={opslaan}>{bezig ? 'Bezig...' : 'Opslaan'}</button>
          <button type="button" className="btn btn-outline" onClick={onClose}>Annuleren</button>
        </div>
      </div>
    </div>
  )
}

export function ComplianceMeldingenLijst({ leadId }) {
  const [rijen, setRijen] = useState([])
  useEffect(() => {
    let alive = true
    if (!leadId) { setRijen([]); return }
    supabase.from('compliance_meldingen').select('id, soort, tekst, melding_op, afgehandeld_at, afhandeling')
      .eq('lead_id', leadId).order('melding_op', { ascending: false })
      .then(({ data }) => { if (alive) setRijen(data || []) })
    return () => { alive = false }
  }, [leadId])
  if (!rijen.length) return null
  return (
    <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
      {rijen.map(m => (
        <div key={m.id} style={{ border: '1px solid var(--danger)', background: 'var(--danger-bg)', borderRadius: 8, padding: '6px 10px', fontSize: '0.8rem' }}>
          <strong>{meldingSoortLabel(m.soort)}</strong> <span className="text-muted">{new Date(m.melding_op).toLocaleDateString('nl-NL')}</span>
          {m.afgehandeld_at ? <span style={{ color: 'var(--success)', fontWeight: 700 }}> - afgehandeld</span> : <span style={{ color: 'var(--danger)', fontWeight: 700 }}> - open</span>}
          <div style={{ whiteSpace: 'pre-wrap' }}>{m.tekst}</div>
          {m.afhandeling && <div className="text-muted" style={{ marginTop: 2 }}>Afhandeling: {m.afhandeling}</div>}
        </div>
      ))}
    </div>
  )
}

// Admin > Compliance: alle meldingen op een plek, plus wat er automatisch gewist is.
export function ComplianceOverzicht() {
  const { user } = useAuth()
  const toast = useToast()
  const [meldingen, setMeldingen] = useState([])
  const [wislog, setWislog] = useState([])
  const [afmeldingen, setAfmeldingen] = useState([])
  const [laterMailen, setLaterMailen] = useState([])
  const [blokkades, setBlokkades] = useState(0)
  const [filter, setFilter] = useState('open')
  const [afhandelId, setAfhandelId] = useState(null)
  const [afhandelTekst, setAfhandelTekst] = useState('')

  async function laad() {
    const [m, w, b, af, lm] = await Promise.all([
      supabase.from('compliance_meldingen').select('id, lead_id, lead_naam, soort, tekst, melding_op, created_at, afgehandeld_at, afhandeling, campaign:campaigns(name), door:profiles!compliance_meldingen_created_by_fkey(full_name)').order('melding_op', { ascending: false }).limit(500),
      supabase.from('lead_wis_log').select('id, created_at, aantal, reden').order('created_at', { ascending: false }).limit(30),
      supabase.from('contact_blokkades').select('id', { count: 'exact', head: true }),
      supabase.from('afmeldingen').select('id, created_at, bedrijfsnaam, bron, reden, campaign:campaigns(name)').order('created_at', { ascending: false }).limit(300),
      supabase.from('leads').select('id, name, mail_pauze_tot, status').gt('mail_pauze_tot', new Date().toISOString()).is('deleted_at', null).order('mail_pauze_tot').limit(300),
    ])
    setAfmeldingen(af.data || [])
    setLaterMailen(lm.data || [])
    if (m.error) console.error('compliance_meldingen', m.error)
    setMeldingen(m.data || [])
    setWislog(w.data || [])
    setBlokkades(b.count || 0)
  }
  useEffect(() => { laad() }, [])

  async function handelAf(id) {
    const { error } = await supabase.from('compliance_meldingen').update({
      afgehandeld_at: new Date().toISOString(), afgehandeld_by: user?.id, afhandeling: afhandelTekst.trim() || null,
    }).eq('id', id)
    if (error) { toast(error.message, 'error'); return }
    setAfhandelId(null); setAfhandelTekst('')
    toast('Afgehandeld', 'success')
    laad()
  }

  const zichtbaar = meldingen.filter(m => filter === 'alle' || (filter === 'open' ? !m.afgehandeld_at : !!m.afgehandeld_at))
  const open = meldingen.filter(m => !m.afgehandeld_at).length
  const REDEN = { afgemeld_handmatig: 'Afgemeld, handmatig verwijderd', afgemeld_48u: 'Afgemeld, na 48 uur verwijderd', bewaartermijn: 'Bewaartermijn (12 maanden niets mee gebeurd)' }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div>
        <h1 className="page-title">Compliance</h1>
        <p className="text-muted text-sm mt-1">Klachten, bezwaren en AVG-verzoeken bij leads. Nieuwe melding: open een lead en klik op "Compliance-melding".</p>
      </div>
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        {[['open', `Open (${open})`], ['klaar', 'Afgehandeld'], ['alle', `Alles (${meldingen.length})`]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 20 }}>{l}</button>
        ))}
      </div>
      {zichtbaar.length === 0 ? (
        <p className="text-muted" style={{ fontStyle: 'italic' }}>Geen meldingen.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {zichtbaar.map(m => (
            <div key={m.id} className="card" style={{ padding: 14, margin: 0, borderLeft: `4px solid ${m.afgehandeld_at ? 'var(--success)' : 'var(--danger)'}` }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong>{meldingSoortLabel(m.soort)}</strong>
                <span>{m.lead_naam || 'Lead verwijderd'}</span>
                {m.campaign?.name && <span className="text-muted" style={{ fontSize: '0.8rem' }}>{m.campaign.name}</span>}
                <span className="text-muted" style={{ fontSize: '0.8rem', marginLeft: 'auto' }}>
                  {new Date(m.melding_op).toLocaleDateString('nl-NL')}{m.door?.full_name ? ` · ${m.door.full_name}` : ''}
                </span>
              </div>
              <div style={{ whiteSpace: 'pre-wrap', marginTop: 6, fontSize: '0.9rem' }}>{m.tekst}</div>
              {m.afgehandeld_at ? (
                <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--success)' }}>
                  Afgehandeld {new Date(m.afgehandeld_at).toLocaleDateString('nl-NL')}{m.afhandeling ? `: ${m.afhandeling}` : ''}
                </div>
              ) : afhandelId === m.id ? (
                <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                  <textarea className="form-dark w-full" rows={2} value={afhandelTekst} onChange={e => setAfhandelTekst(e.target.value)} placeholder="Wat is ermee gedaan? (optioneel)" />
                  <div className="flex gap-2">
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => handelAf(m.id)}>Afgehandeld</button>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setAfhandelId(null)}>Annuleren</button>
                  </div>
                </div>
              ) : (
                <button type="button" className="btn btn-sm btn-outline" style={{ marginTop: 8 }} onClick={() => { setAfhandelId(m.id); setAfhandelTekst('') }}>Markeer als afgehandeld</button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ padding: 14, margin: 0 }}>
        <strong>Afmeldingen ({afmeldingen.length})</strong>
        <p className="text-muted" style={{ fontSize: '0.85rem', margin: '4px 0 8px' }}>Wie zich afmeldde, via de mail of aan de telefoon. Blijft hier staan, ook als de lead zelf na 48 uur is verwijderd.</p>
        {afmeldingen.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>Nog geen afmeldingen.</p>
        ) : (
          <div style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
            {afmeldingen.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span className="text-muted" style={{ minWidth: 110 }}>{new Date(a.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <strong>{a.bedrijfsnaam || 'Onbekend'}</strong>
                <span className="text-muted">{a.bron === 'mail' ? 'via de mail' : a.bron === 'beller' ? 'aan de telefoon' : a.bron === 'melding' ? 'via een melding' : a.bron}{a.campaign?.name ? ` · ${a.campaign.name}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ padding: 14, margin: 0 }}>
        <strong>Later mailen ({laterMailen.length})</strong>
        <p className="text-muted" style={{ fontSize: '0.85rem', margin: '4px 0 8px' }}>Deze bureaus willen nu geen mail. Mailen kan pas weer na de datum. Bellen mag wel.</p>
        {laterMailen.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>Niemand.</p>
        ) : (
          <div style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
            {laterMailen.map(l => (
              <div key={l.id}><strong>{l.name}</strong> <span className="text-muted">tot {new Date(l.mail_pauze_tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
            ))}
          </div>
        )}
      </div>
      <div className="card" style={{ padding: 14, margin: 0 }}>
        <strong>Afmeldlijst en automatisch wissen</strong>
        <p className="text-muted" style={{ fontSize: '0.85rem', margin: '4px 0 8px' }}>
          {blokkades} e-mailadressen, nummers en websites staan op de afmeldlijst (versleuteld opgeslagen). Wie daarop staat, kan niet meer gebeld of gemaild worden.
        </p>
        {wislog.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic', margin: 0 }}>Nog niets gewist.</p>
        ) : (
          <div style={{ display: 'grid', gap: 4, fontSize: '0.85rem' }}>
            {wislog.map(w => (
              <div key={w.id}>{new Date(w.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}: {w.aantal} lead{w.aantal === 1 ? '' : 's'} verwijderd ({REDEN[w.reden] || w.reden})</div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
