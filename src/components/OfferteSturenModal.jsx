import { useState } from 'react'
import { X, Send, Copy, Check, AlertTriangle, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getProduct, nieuwOfferteNummer } from '../lib/products'

// v68: "Offerte sturen" vanuit een lead (BRIEF-leadgen 6a).
// Popup met contactpersoon, e-mailadres, plan en bedrijfsnaam, voorgevuld uit de
// lead maar altijd aanpasbaar (de accountmanager hoort aan de telefoon naar welk
// adres het moet). E-mail verplicht. Na bevestigen:
//   1. contactpersoon + e-mail terug op de lead (staat de volgende keer klaar)
//   2. offerte-rij aanmaken in public.offertes (zelfde tabel als de horeca-tool)
//   3. Edge Function offerte-send: mail met tekenlink, lead -> offerte_verzonden
//   4. accept-link tonen met kopieerknop (voor WhatsApp)
// De acceptatiepagina met Mollie-incasso (brief punt 2) komt hierna; tot die
// tijd is de tekenlink (/tekenen/:token) de digitale acceptatie.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function euro(n) { return '€ ' + Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function OfferteSturenModal({ lead, productCode, onClose, onSent }) {
  const { profile } = useAuth()
  const product = getProduct(productCode)
  const [form, setForm] = useState({
    zaak: lead?.name || '',
    contact: lead?.contact_person || '',
    email: lead?.email || '',
    planId: product.plans[0].id,
    notitie: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { url, geldigTot, mailError }
  const [copied, setCopied] = useState(false)

  const plan = product.plans.find(p => p.id === form.planId) || product.plans[0]
  const emailOk = EMAIL_RE.test(form.email.trim())
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  async function versturen(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    const email = form.email.trim().toLowerCase()
    const zaak = form.zaak.trim()
    const contact = form.contact.trim()
    if (!zaak) return setError('Vul de bedrijfsnaam in')
    if (!EMAIL_RE.test(email)) return setError('Vul een geldig e-mailadres in - hier gaat de offerte naartoe')
    setBusy(true)
    try {
      // 1. lead bijwerken zodat contactpersoon/e-mail de volgende keer klaarstaan
      const now = new Date().toISOString()
      const { error: leadErr } = await supabase.from('leads')
        .update({ contact_person: contact || null, email, name: zaak, last_activity_at: now, updated_at: now })
        .eq('id', lead.id)
      if (leadErr) throw new Error('Lead bijwerken mislukt: ' + leadErr.message)

      // 2. offerte-rij (bij een nummer-botsing opnieuw met een nieuw nummer)
      const btw = Math.round(plan.eenmalig * 21) / 100
      const akkoordTekst = product.akkoordTekst(plan)
      const base = {
        user_id: profile.id,
        lead_id: lead.id,
        status: 'concept',
        prijsmodel_versie: product.prijsmodelVersie,
        accountmanager: profile.full_name || null,
        zaak_naam: zaak,
        contact_naam: contact || null,
        email,
        telefoon: lead.phone || null,
        adres: [lead.address, lead.house_number, lead.postal_code, lead.city].filter(Boolean).join(' ') || null,
        pakket: `${product.naam} - ${plan.label}`,
        regels: [{ naam: plan.regelNaam, aantal: 1, prijs: plan.eenmalig, totaal: plan.eenmalig, mnd: plan.maand }],
        upsell: [],
        korting: 0,
        eenmalig_ex: plan.eenmalig,
        btw,
        eenmalig_incl: Math.round((plan.eenmalig + btw) * 100) / 100,
        maandbedrag_ex: plan.maand,
        roi: null,
        speclijst: null,
        notitie: form.notitie.trim() || null,
        akkoord_tekst: akkoordTekst,
      }
      if (profile.organization_id) base.organization_id = profile.organization_id
      let offerteId = null
      for (let i = 0; i < 4 && !offerteId; i++) {
        const { data, error: insErr } = await supabase.from('offertes')
          .insert({ ...base, nummer: nieuwOfferteNummer(product) })
          .select('id').single()
        if (!insErr) { offerteId = data.id; break }
        if (insErr.code !== '23505') throw new Error('Offerte aanmaken mislukt: ' + insErr.message)
      }
      if (!offerteId) throw new Error('Kon geen uniek offertenummer maken, probeer opnieuw')

      // 3. versturen (mail + tekenlink; zet de lead op "offerte gestuurd")
      const { data, error: fnErr } = await supabase.functions.invoke('offerte-send', {
        body: { offerteId, email, akkoordTekst, actie: 'versturen' },
      })
      if (fnErr) {
        let msg = fnErr.message || 'Versturen mislukt'
        try { const body = await fnErr.context?.json?.(); if (body?.error) msg = body.error } catch { /* geen json */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      setResult({ url: data.url, geldigTot: data.geldigTot, mailError: data.mailError })
      onSent?.({ offerteId, url: data.url, email, contact })
    } catch (err) {
      setError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function kopieer() {
    try { await navigator.clipboard.writeText(result.url); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* oud toestel */ }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Send size={18} /> Offerte sturen</h2>
          <button className="modal-close" onClick={onClose} aria-label="Sluiten"><X size={18} /></button>
        </div>

        {result ? (
          <div style={{ padding: '4px 0 8px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: 12, borderRadius: 10, background: 'var(--success-bg)', color: 'var(--success)', marginBottom: 14 }}>
              <Check size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: '0.9rem' }}>
                <strong>Offerte verstuurd naar {form.email.trim()}</strong>
                <div className="text-muted" style={{ marginTop: 2 }}>Geldig tot {result.geldigTot}. De lead staat nu op "Offerte gestuurd" met een opvolgdatum.</div>
              </div>
            </div>
            {result.mailError && (
              <div style={{ display: 'flex', gap: 10, padding: 12, borderRadius: 10, background: 'var(--warning-bg)', color: 'var(--warning)', marginBottom: 14, fontSize: '0.85rem' }}>
                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                <div>De mail kon niet verstuurd worden ({result.mailError}). De link hieronder werkt wel: stuur hem zelf via WhatsApp of mail.</div>
              </div>
            )}
            <label className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Accept-link voor de klant</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <input className="form-control" readOnly value={result.url} onFocus={e => e.target.select()} style={{ fontSize: '0.8rem' }} />
              <button type="button" className="btn btn-primary" onClick={kopieer} style={{ whiteSpace: 'nowrap' }}>
                {copied ? <><Check size={16} /> Gekopieerd</> : <><Copy size={16} /> Kopieer</>}
              </button>
            </div>
            <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 10 }}>
              Zodra de klant accepteert springt de lead automatisch op "Geaccepteerd". Herinneren of intrekken kan via de offerte op de lead.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>Sluiten</button>
            </div>
          </div>
        ) : (
          <form onSubmit={versturen}>
            <div className="form-group">
              <label>Bedrijfsnaam</label>
              <input className="form-control" value={form.zaak} onChange={set('zaak')} required autoComplete="off" />
            </div>
            <div className="form-group">
              <label>Contactpersoon</label>
              <input className="form-control" value={form.contact} onChange={set('contact')} placeholder="Naam van degene die tekent" autoComplete="off" />
            </div>
            <div className="form-group">
              <label>E-mailadres voor de offerte <span style={{ color: 'var(--danger)' }}>*</span></label>
              <div style={{ position: 'relative' }}>
                <Mail size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input className="form-control" type="email" value={form.email} onChange={set('email')} required autoComplete="off" inputMode="email"
                  placeholder="naam@bureau.nl" style={{ paddingLeft: 36, borderColor: form.email && !emailOk ? 'var(--danger)' : undefined }} />
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>Vraag dit na aan de telefoon - de offerte gaat direct naar dit adres.</div>
            </div>
            <div className="form-group">
              <label>Plan ({product.naam})</label>
              <div style={{ display: 'grid', gap: 8 }}>
                {product.plans.map(p => (
                  <label key={p.id} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${form.planId === p.id ? 'var(--primary)' : 'var(--border)'}`, background: form.planId === p.id ? 'var(--info-bg)' : 'var(--bg-card)'
                  }}>
                    <input type="radio" name="plan" value={p.id} checked={form.planId === p.id} onChange={() => setForm(f => ({ ...f, planId: p.id }))} style={{ marginTop: 3 }} />
                    <div style={{ fontSize: '0.9rem' }}>
                      <strong>{p.label}</strong>{p.id === product.plans[0].id && <span className="text-muted" style={{ fontSize: '0.75rem', marginLeft: 6 }}>standaard</span>}
                      <div className="text-muted" style={{ fontSize: '0.8rem' }}>{p.omschrijving}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>Notitie op de offerte (optioneel)</label>
              <input className="form-control" value={form.notitie} onChange={set('notitie')} placeholder="Bijv. afgesproken startdatum" autoComplete="off" />
            </div>

            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg-elevated)', fontSize: '0.85rem', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{plan.eenmalig > 0 ? 'Eenmalig (excl. btw)' : 'Per maand (excl. btw)'}</span><strong>{euro(plan.eenmalig > 0 ? plan.eenmalig : plan.maand)}</strong></div>
              {plan.eenmalig > 0 && <div className="text-muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span>Incl. 21% btw</span><span>{euro(plan.eenmalig * 1.21)}</span></div>}
            </div>

            {error && <div style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: 10 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>Annuleren</button>
              <button type="submit" className="btn btn-primary" disabled={busy || !emailOk || !form.zaak.trim()}>
                <Send size={16} /> {busy ? 'Versturen...' : 'Offerte versturen'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
