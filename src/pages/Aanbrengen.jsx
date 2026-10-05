// v127 (05-10-2026): "Aanbrengen" - de pagina voor een klant met de rol
// 'aanbrenger'. Hij brengt een ander bedrijf aan (formulier) en ziet daaronder
// wat er met zijn eerdere aanbrengingen is gebeurd. Meer ziet dit account niet.
//
// Alles loopt via twee RPC's (migration v127): lead_aanbrengen() maakt een
// gewone lead aan in de lijst "Aangebracht" van het gekozen project, en
// mijn_aanbrengingen() geeft alleen de eigen aanbrengingen terug met beperkte
// velden. De aanbrenger heeft zelf geen leesrecht op leads (is_planning()).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Handshake, Building2, User, Phone, Mail, MapPin, MessageSquare, RefreshCw, Send, CalendarClock, Home } from 'lucide-react'
import AgendaPickerModal from '../components/AgendaPickerModal'
import { APPOINTMENT_TYPES, appointmentLabel, duurTekst } from '../lib/appointmentConfig'
import { supabase } from '../lib/supabase'
import { useToast } from '../components/Toast'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

// Wat de klant te zien krijgt per lead-status. Bewust grof: hij hoeft niet te
// weten dat we drie keer geen gehoor hadden.
export function aanbrengStand(status, afgemeld) {
  if (afgemeld) return { key: 'geen', label: 'Geen klant geworden', kleur: 'var(--text-muted)' }
  switch (status) {
    case 'deal':
    case 'bruto_deal':
    case 'actief':
    case 'geaccepteerd':
    case 'monteur_ingepland':
      return { key: 'klant', label: 'Klant geworden', kleur: 'var(--success)' }
    case 'afspraak_gemaakt':
    case 'offerte_verzonden':
      return { key: 'afspraak', label: 'Afspraak of offerte', kleur: 'var(--secondary)' }
    case 'geen_interesse':
    case 'afgewezen':
    case 'blacklist':
    case 'verkeerd_nummer':
    case 'wil_annuleren':
      return { key: 'geen', label: 'Geen klant geworden', kleur: 'var(--text-muted)' }
    case 'new':
    case 'cold':
      return { key: 'nieuw', label: 'Ontvangen, nog niet gebeld', kleur: 'var(--info)' }
    default:
      return { key: 'bezig', label: 'In behandeling', kleur: 'var(--primary)' }
  }
}

function fmtDatum(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}
function fmtMoment(d) {
  if (!d) return ''
  const x = new Date(d)
  return x.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' +
    x.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

const LEEG = { bedrijf: '', contact: '', telefoon: '', email: '', plaats: '', straat: '', toelichting: '' }

export default function Aanbrengen() {
  const toast = useToast()
  const [projecten, setProjecten] = useState([])
  const [projectId, setProjectId] = useState('')
  const [form, setForm] = useState(LEEG)
  const [bezig, setBezig] = useState(false)
  const [lijst, setLijst] = useState([])
  const [laden, setLaden] = useState(true)
  // v128: meteen een afspraak inplannen bij een accountmanager
  const [metAfspraak, setMetAfspraak] = useState(false)
  const [ams, setAms] = useState([])
  const [amId, setAmId] = useState('')
  const [soort, setSoort] = useState(APPOINTMENT_TYPES[0].id)
  const [moment, setMoment] = useState(null) // Date
  const [kiezer, setKiezer] = useState(false)

  function zet(veld, waarde) { setForm(f => ({ ...f, [veld]: waarde })) }

  async function laadProjecten() {
    const { data, error } = await supabase.rpc('mijn_aanbreng_projecten')
    if (error) { toast('Projecten laden mislukt: ' + error.message, 'error'); return }
    setProjecten(data || [])
    if (!projectId && data?.length) setProjectId(data[0].id)
  }

  async function laadLijst() {
    setLaden(true)
    const { data, error } = await supabase.rpc('mijn_aanbrengingen')
    if (error) toast('Overzicht laden mislukt: ' + error.message, 'error')
    setLijst(data || [])
    setLaden(false)
  }

  useEffect(() => { laadProjecten(); laadLijst() }, [])

  // accountmanagers van het gekozen project (alleen als de aanbrenger een afspraak wil)
  useEffect(() => {
    if (!metAfspraak || !projectId) return
    let weg = false
    supabase.rpc('aanbreng_accountmanagers', { p_campaign: projectId }).then(({ data, error }) => {
      if (weg) return
      if (error) { toast('Accountmanagers laden mislukt: ' + error.message, 'error'); return }
      setAms(data || [])
      if (data?.length && !data.some(a => a.id === amId)) setAmId(data[0].id)
    })
    return () => { weg = true }
  }, [metAfspraak, projectId])

  useEffect(() => { setMoment(null) }, [soort, projectId])

  // bezette tijden van de accountmanager, zonder namen (RPC aanbreng_bezet)
  const loadBusy = useCallback(async (am, van, tot) => {
    const { data, error } = await supabase.rpc('aanbreng_bezet', { p_am: am, p_van: van, p_tot: tot })
    if (error) { toast('Agenda laden mislukt: ' + error.message, 'error'); return { appointments: [], blocks: [] } }
    const appointments = []
    const blocks = []
    ;(data || []).forEach((r, i) => {
      if (r.soort === 'afspraak') {
        const min = Math.round((new Date(r.end_at) - new Date(r.start_at)) / 60000)
        appointments.push({ id: `x${i}`, name: 'Bezet', appointment_at: r.start_at, appointment_type: min <= 60 ? 'bezoek' : 'shoot' })
      } else {
        blocks.push({ id: `x${i}`, start_at: r.start_at, end_at: r.end_at, title: 'Niet beschikbaar' })
      }
    })
    return { appointments, blocks }
  }, [])

  const afspraakOk = !metAfspraak || (amId && moment && form.contact.trim() && form.plaats.trim())
  const kanVersturen = projectId && form.bedrijf.trim() && (form.telefoon.trim() || form.email.trim()) && afspraakOk && !bezig

  async function verstuur(e) {
    e.preventDefault()
    if (!kanVersturen) return
    setBezig(true)
    const { error } = await supabase.rpc('lead_aanbrengen', {
      p_campaign: projectId,
      p_bedrijf: form.bedrijf.trim(),
      p_contact: form.contact.trim() || null,
      p_telefoon: form.telefoon.trim() || null,
      p_email: form.email.trim() || null,
      p_plaats: form.plaats.trim() || null,
      p_toelichting: form.toelichting.trim() || null,
      p_am: metAfspraak ? amId : null,
      p_at: metAfspraak && moment ? new Date(moment).toISOString() : null,
      p_type: metAfspraak ? soort : null,
      p_straat: form.straat.trim() || null,
    })
    setBezig(false)
    if (error) { toast(error.message, 'error'); return }
    toast(metAfspraak
      ? 'Afspraak ingepland op ' + fmtMoment(moment) + ' voor ' + form.bedrijf.trim() + '.'
      : 'Bedankt! We nemen contact op met ' + form.bedrijf.trim() + '.', 'success')
    setForm(LEEG)
    setMoment(null)
    setMetAfspraak(false)
    laadLijst()
  }

  const tellers = useMemo(() => {
    const t = { totaal: lijst.length, klant: 0, afspraak: 0 }
    lijst.forEach(r => {
      const s = aanbrengStand(r.status, r.afgemeld).key
      if (s === 'klant') t.klant++
      if (s === 'afspraak') t.afspraak++
    })
    return t
  }, [lijst])

  const veld = (icon, label, key, props = {}) => (
    <div className="form-group" style={{ margin: 0 }}>
      <label>{icon} {label}</label>
      <input value={form[key]} onChange={e => zet(key, e.target.value)} {...props} />
    </div>
  )

  return (
    <>
      <Header />
      <main className="container pb-12" style={{ maxWidth: '900px' }}>
        <div className="mb-4 pt-4">
          <h1 className="page-title flex items-center gap-2" style={{ margin: 0 }}>
            <Handshake size={26} className="text-primary" /> Een bedrijf aanbrengen
          </h1>
          <p className="page-subtitle text-xs" style={{ margin: '4px 0 0' }}>
            Ken je een bedrijf dat wij kunnen helpen? Vul het hieronder in. Wij nemen contact op en je ziet hier wat ermee gebeurt.
          </p>
        </div>

        {projecten.length === 0 ? (
          <div className="card" style={{ padding: '20px' }}>
            <p style={{ margin: 0 }}>Je account is nog niet aan een project gekoppeld. Vraag je contactpersoon om dat te regelen, daarna kun je hier bedrijven aanbrengen.</p>
          </div>
        ) : (
          <motion.form initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onSubmit={verstuur} className="card" style={{ padding: '20px', display: 'grid', gap: '14px' }}>
            {projecten.length > 1 && (
              <div className="form-group" style={{ margin: 0 }}>
                <label>Voor welk project?</label>
                <select value={projectId} onChange={e => setProjectId(e.target.value)}>
                  {projecten.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'grid', gap: '14px', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
              {veld(<Building2 size={14} />, 'Bedrijfsnaam *', 'bedrijf', { required: true, placeholder: 'Bakkerij Jansen' })}
              {veld(<User size={14} />, 'Contactpersoon', 'contact', { placeholder: 'Naam van wie we moeten spreken' })}
              {veld(<Phone size={14} />, 'Telefoonnummer', 'telefoon', { type: 'tel', placeholder: '06 12345678' })}
              {veld(<Mail size={14} />, 'E-mailadres', 'email', { type: 'email', placeholder: 'info@bedrijf.nl' })}
              {veld(<MapPin size={14} />, 'Plaats', 'plaats', { placeholder: 'Arnhem' })}
            </div>
            {/* v128: meteen een afspraak inplannen */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', display: 'grid', gap: '12px' }}>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontWeight: 600, margin: 0 }}>
                <input type="checkbox" checked={metAfspraak} onChange={e => setMetAfspraak(e.target.checked)} />
                <CalendarClock size={16} /> Meteen een afspraak inplannen
              </label>
              {metAfspraak && (
                <>
                  <p className="text-muted" style={{ fontSize: '0.78rem', margin: 0 }}>
                    Kies wie de afspraak doet en een vrij moment. Voor een afspraak zijn contactpersoon, straat en plaats nodig.
                  </p>
                  <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Accountmanager</label>
                      <select value={amId} onChange={e => { setAmId(e.target.value); setMoment(null) }}>
                        {ams.length === 0 && <option value="">Geen accountmanager beschikbaar</option>}
                        {ams.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Soort afspraak</label>
                      <select value={soort} onChange={e => setSoort(e.target.value)}>
                        {APPOINTMENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label} ({duurTekst(t.minutes)})</option>)}
                      </select>
                    </div>
                    {veld(<Home size={14} />, 'Straat en huisnummer', 'straat', { placeholder: 'Hoofdstraat 12' })}
                  </div>
                  <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setKiezer(true)} disabled={!amId}>
                      <CalendarClock size={14} /> {moment ? 'Ander moment kiezen' : 'Kies een moment'}
                    </button>
                    {moment
                      ? <span style={{ fontWeight: 600 }}>{appointmentLabel(soort)} op {fmtMoment(moment)}</span>
                      : <span className="text-muted" style={{ fontSize: '0.8rem' }}>Nog geen moment gekozen</span>}
                  </div>
                </>
              )}
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label><MessageSquare size={14} /> Toelichting</label>
              <textarea rows={3} value={form.toelichting} onChange={e => zet('toelichting', e.target.value)} placeholder="Bijvoorbeeld: zoekt een nieuwe website, vraag naar Peter" />
            </div>
            <p className="text-muted" style={{ fontSize: '0.75rem', margin: 0 }}>Vul minimaal een telefoonnummer of e-mailadres in.</p>
            <div>
              <button type="submit" className="btn btn-primary" disabled={!kanVersturen}>
                <Send size={14} /> {bezig ? 'Versturen...' : metAfspraak ? 'Aanbrengen en afspraak inplannen' : 'Aanbrengen'}
              </button>
            </div>
          </motion.form>
        )}

        <div className="flex justify-between items-center mt-8 mb-3" style={{ flexWrap: 'wrap', gap: '8px' }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>Mijn aanbrengingen</h2>
          <div className="flex items-center gap-3" style={{ fontSize: '0.8rem' }}>
            <span className="text-muted">{tellers.totaal} aangebracht</span>
            <span style={{ color: 'var(--secondary)' }}>{tellers.afspraak} afspraak</span>
            <span style={{ color: 'var(--success)' }}>{tellers.klant} klant</span>
            <button type="button" className="btn btn-outline btn-sm" onClick={laadLijst} disabled={laden}>
              <RefreshCw size={14} /> Verversen
            </button>
          </div>
        </div>

        {laden ? (
          <div className="flex justify-center p-8"><LoadingSpinner /></div>
        ) : lijst.length === 0 ? (
          <EmptyState icon={Handshake} title="Nog niets aangebracht" message="Je eerste aanbrenging verschijnt hier zodra je het formulier hebt verstuurd." />
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {lijst.map((r, i) => {
              const stand = aanbrengStand(r.status, r.afgemeld)
              return (
                <div key={r.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                  padding: '12px 16px', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap'
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }} className="break-words">{r.bedrijf}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {[r.contact, r.plaats, r.project].filter(Boolean).join(' · ')}
                      {r.aangebracht_op ? ` · ${fmtDatum(r.aangebracht_op)}` : ''}
                    </div>
                    {r.afspraak_op && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--secondary)', marginTop: '2px' }}>
                        <CalendarClock size={12} style={{ verticalAlign: '-2px' }} /> {appointmentLabel(r.afspraak_soort)} op {fmtMoment(r.afspraak_op)}
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
                    border: `1px solid ${stand.kleur}`, color: stand.kleur, whiteSpace: 'nowrap'
                  }}>{stand.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </main>
      {kiezer && (
        <AgendaPickerModal
          accountmanagers={ams}
          defaultAmId={amId}
          type={soort}
          loadBusy={loadBusy}
          anoniem
          onConfirm={({ amId: gekozenAm, date }) => { setAmId(gekozenAm); setMoment(date); setKiezer(false) }}
          onClose={() => setKiezer(false)}
        />
      )}
    </>
  )
}
