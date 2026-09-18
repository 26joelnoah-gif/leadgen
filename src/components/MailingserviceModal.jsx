import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Send, Mail, ListPlus, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { mailSourceLabel, mailTypesVoor, mailTypeLabel } from '../lib/mailSources'

// v69: Mailingservice vanuit het belscherm. De beller checkt e-mail en
// contactpersoon, de Edge Function 'mailingservice' laat de bron van het
// project de mail sturen. Afboeken op 'mail_verstuurd' doet de aanroeper
// (WorkInterface -> handleLeadDisposition) pas NA een gelukte verzending.
// v70: de beller kiest zelf de mailsoort (infomail of aanmeldmail). Welke
// soorten mogen staat in campaign_mail_services.mail_types; mail_type is de
// standaardkeuze. De sleutel gaat als 'mail' mee naar de Edge Function.
// v74: de naam onder de mail ("Met vriendelijke groet, ...") staat standaard op
// de naam van het account, maar de beller mag hem aanpassen. Die naam gaat mee
// als beller_naam en komt ook in de uitnodigingslink terecht, zodat MK bij een
// aanmelding vastlegt via wie de sale liep. Wie er echt inlogde blijft altijd
// in mailservice_logs.agent_id staan.
// v78: "Bewaren in mailinglijst" zet de mail (soort, adres, naam) klaar in
// public.mail_queue zonder te versturen. De aanroeper zet de lead via onQueued
// op 'mail_gepland'. Versturen gebeurt later vanuit de Mailinglijst op /leads,
// alleen door wie hem bewaarde (of admin / manager van het project).
// v83: "Later versturen": de beller kiest een moment (morgen 09:00, over 3
// dagen, volgende week, of zelf een tijd). Dat komt in mail_queue.send_at en de
// Edge Function mailqueue-runner (pg_cron, elke 5 min) verstuurt hem dan
// vanzelf, maar alleen op werkdagen tussen 08:00 en 18:00. "Handmatig" laat
// send_at leeg: dan gaat hij pas weg als iemand hem in de Mailinglijst verstuurt.
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i

// Eerstvolgende werkdag om `uur` uur, minstens `dagen` dagen vooruit.
function werkdagOm(dagen, uur = 9) {
  const d = new Date()
  d.setDate(d.getDate() + dagen)
  d.setHours(uur, 0, 0, 0)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d
}
const PLANNING = [
  { key: 'morgen', label: 'Morgen 09:00', bereken: () => werkdagOm(1) },
  { key: '3dagen', label: 'Over 3 dagen', bereken: () => werkdagOm(3) },
  { key: 'week', label: 'Volgende week', bereken: () => werkdagOm(7) },
  { key: 'zelf', label: 'Zelf kiezen' },
  { key: 'handmatig', label: 'Handmatig' },
]
const tijdLang = (d) => d ? d.toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
// Voor <input type="datetime-local">: lokale tijd zonder zone
function naarLokaal(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const buitenWerktijd = (d) => !d ? false : (d.getDay() === 0 || d.getDay() === 6 || d.getHours() < 8 || d.getHours() >= 18)

export default function MailingserviceModal({ lead, defaults, mailService, listId, onClose, onSent, onQueued }) {
  const { profile, user } = useAuth()
  const eigenNaam = (profile?.full_name || '').trim()
  const soorten = mailTypesVoor(mailService)
  const standaard = soorten.find(t => t.key === mailService?.mail_type)?.key || soorten[0]?.key || 'introductie'
  const [mailType, setMailType] = useState(standaard)
  const [email, setEmail] = useState((defaults?.email || '').trim())
  const [contactpersoon, setContactpersoon] = useState((defaults?.contactpersoon || '').trim())
  const [bellerNaam, setBellerNaam] = useState(eigenNaam)
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [planning, setPlanning] = useState('morgen') // v83
  const [eigenTijd, setEigenTijd] = useState(() => naarLokaal(werkdagOm(1)))
  const bezig = sending || saving

  // v83: wanneer gaat de mail weg? null = handmatig vanuit de Mailinglijst
  const sendAt = (() => {
    if (planning === 'handmatig') return null
    if (planning === 'zelf') { const d = new Date(eigenTijd); return isNaN(d.getTime()) ? null : d }
    return PLANNING.find(p => p.key === planning)?.bereken() || null
  })()
  const sendAtOngeldig = planning === 'zelf' && (!sendAt || sendAt.getTime() < Date.now() - 60_000)

  const bron = mailSourceLabel(mailService?.source)
  const dagen = mailService?.follow_up_days || 5
  const emailOk = EMAIL_RE.test(email.trim())
  const naamOk = bellerNaam.trim().length >= 2
  const kanVersturen = emailOk && naamOk

  // v78: niet sturen maar bewaren voor later
  async function handleQueue() {
    if (bezig || !kanVersturen || !onQueued || sendAtOngeldig) return
    setSaving(true)
    setError('')
    try {
      const rij = {
        agent_id: user?.id,
        lead_id: lead.id,
        lead_list_id: listId || lead.lead_list_id || null,
        campaign_id: mailService?.campaign_id || null,
        organization_id: profile?.organization_id || null,
        source: mailService?.source || 'MARKETINGKIEZER',
        mail_type: mailType,
        email: email.trim().toLowerCase(),
        contactpersoon: contactpersoon.trim() || null,
        beller_naam: bellerNaam.trim() || null,
        send_at: sendAt ? sendAt.toISOString() : null, // v83
      }
      const { error: insErr } = await supabase.from('mail_queue').insert(rij)
      if (insErr) {
        if (insErr.code === '23505') throw new Error('Deze mail staat al in de mailinglijst voor deze lead')
        throw new Error(insErr.message || 'Bewaren mislukt')
      }
      await onQueued({ email: rij.email, contactpersoon: contactpersoon.trim(), source: rij.source, mailType, sendAt: sendAt ? sendAt.toISOString() : null })
    } catch (e) {
      setError(e.message || 'Bewaren mislukt')
      setSaving(false)
    }
  }

  async function handleSend() {
    if (bezig || !kanVersturen) return
    setSending(true)
    setError('')
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mailingservice', {
        body: { lead_id: lead.id, mail: mailType, email: email.trim(), contactpersoon: contactpersoon.trim() || undefined, beller_naam: bellerNaam.trim() || undefined }
      })
      if (fnError) {
        // supabase-js geeft bij een foutstatus de body in fnError.context
        let msg = 'Versturen mislukt'
        try { msg = (await fnError.context?.json())?.error || msg } catch { /* geen json */ }
        throw new Error(msg)
      }
      if (!data?.ok) throw new Error(data?.error || 'Versturen mislukt')
      await onSent({ email: data.email, contactpersoon: contactpersoon.trim(), followUpDays: data.follow_up_days || dagen, source: data.source, mailType: data.mail_type || mailType })
    } catch (e) {
      setError(e.message || 'Versturen mislukt')
      setSending(false)
    }
  }

  const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '16px' }
  const labelStyle = { display: 'block', color: 'var(--text-muted)', marginBottom: '6px', fontSize: '0.85rem' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', width: '100%', maxWidth: '460px', padding: '28px', position: 'relative' }}>
        <button onClick={onClose} disabled={bezig} aria-label="Sluiten" style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>

        <h2 style={{ color: 'var(--text-primary)', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
          <Mail size={20} /> MAILINGSERVICE
        </h2>
        <p className="text-muted" style={{ margin: '0 0 18px', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {bron} stuurt de mail naar <strong style={{ color: 'var(--text-primary)' }}>{lead?.name}</strong>. Daarna staat de lead op Mail verstuurd en komt hij over {dagen} dagen terug om op te volgen.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {soorten.length > 1 && (
            <div>
              <label style={labelStyle}>Welke mail?</label>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {soorten.map(t => {
                  const actief = t.key === mailType
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setMailType(t.key)}
                      title={t.description}
                      style={{
                        flex: '1 1 140px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: `1px solid ${actief ? 'var(--info, #0EA5E9)' : 'var(--border)'}`,
                        background: actief ? 'var(--info-bg, rgba(14,165,233,0.12))' : 'var(--bg-dark)',
                        color: actief ? 'var(--info, #0EA5E9)' : 'var(--text-secondary)',
                        fontWeight: actief ? 800 : 600, fontSize: '0.85rem',
                      }}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
              {soorten.find(t => t.key === mailType)?.description && (
                <p className="text-muted" style={{ margin: '6px 0 0', fontSize: '0.78rem', lineHeight: 1.4 }}>
                  {soorten.find(t => t.key === mailType).description}
                </p>
              )}
            </div>
          )}
          <div>
            <label style={labelStyle}>E-mailadres (verplicht)</label>
            <input type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)} placeholder="info@bedrijf.nl" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Contactpersoon (voor de aanhef)</label>
            <input type="text" autoComplete="off" value={contactpersoon} onChange={e => setContactpersoon(e.target.value)} placeholder="Voornaam" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Jouw naam (onder de mail, verplicht)</label>
            <input type="text" autoComplete="off" value={bellerNaam} onChange={e => setBellerNaam(e.target.value)} placeholder="Voornaam Achternaam" style={inputStyle} />
            <p className="text-muted" style={{ margin: '6px 0 0', fontSize: '0.78rem', lineHeight: 1.4 }}>
              De mail eindigt met "Met vriendelijke groet, {bellerNaam.trim() || '...'}". Deze naam komt ook mee als het bureau zich aanmeldt, zo zie je van wie de sale is.
            </p>
          </div>

          {error && (
            <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '8px', padding: '10px 12px', fontSize: '0.85rem' }}>{error}</div>
          )}

          <button
            onClick={handleSend}
            disabled={bezig || !kanVersturen}
            style={{ background: 'var(--info, #0EA5E9)', color: 'var(--text-on-accent)', padding: '14px', borderRadius: '8px', border: 'none', fontWeight: 800, fontSize: '1rem', cursor: bezig || !kanVersturen ? 'not-allowed' : 'pointer', opacity: bezig || !kanVersturen ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
          >
            <Send size={16} /> {sending ? 'VERSTUREN...' : `${mailTypeLabel(mailType).toUpperCase()} VERSTUREN & VOLGENDE`}
          </button>
          {onQueued && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
              <label style={labelStyle}><Clock size={13} style={{ verticalAlign: -2 }} /> Of later versturen</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {PLANNING.map(p => {
                  const actief = p.key === planning
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPlanning(p.key)}
                      style={{
                        padding: '8px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem',
                        border: `1px solid ${actief ? 'var(--info, #0EA5E9)' : 'var(--border)'}`,
                        background: actief ? 'var(--info-bg, rgba(14,165,233,0.12))' : 'var(--bg-dark)',
                        color: actief ? 'var(--info, #0EA5E9)' : 'var(--text-secondary)',
                        fontWeight: actief ? 800 : 600,
                      }}
                    >
                      {p.label}
                    </button>
                  )
                })}
              </div>
              {planning === 'zelf' && (
                <input
                  type="datetime-local"
                  value={eigenTijd}
                  min={naarLokaal(new Date())}
                  onChange={e => setEigenTijd(e.target.value)}
                  style={{ ...inputStyle, marginTop: '8px' }}
                />
              )}
              <p className="text-muted" style={{ margin: '8px 0 10px', fontSize: '0.75rem', lineHeight: 1.4 }}>
                {planning === 'handmatig'
                  ? 'De mail staat klaar op de Leads-pagina onder Mailinglijst en gaat pas weg als jij hem daar verstuurt.'
                  : sendAtOngeldig
                    ? 'Kies een moment in de toekomst.'
                    : <>De mail gaat vanzelf weg op <strong style={{ color: 'var(--text-primary)' }}>{tijdLang(sendAt)}</strong>.{buitenWerktijd(sendAt) ? ' Dat is buiten werktijd, dus hij gaat de eerstvolgende werkdag om 08:00.' : ''} Tot die tijd staat hij in de Mailinglijst; daar kun je hem nog aanpassen.</>}
                {' '}De lead gaat op "Mail gepland".
              </p>
              <button
                type="button"
                onClick={handleQueue}
                disabled={bezig || !kanVersturen || sendAtOngeldig}
                style={{ width: '100%', background: 'transparent', color: 'var(--text-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 700, fontSize: '0.9rem', cursor: bezig || !kanVersturen || sendAtOngeldig ? 'not-allowed' : 'pointer', opacity: bezig || !kanVersturen || sendAtOngeldig ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
              >
                {planning === 'handmatig' ? <ListPlus size={16} /> : <Clock size={16} />}
                {saving ? 'BEWAREN...' : planning === 'handmatig' ? 'BEWAREN IN MAILINGLIJST' : `INPLANNEN: ${tijdLang(sendAt).toUpperCase()}`}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
