import { useState } from 'react'
import { motion } from 'framer-motion'
import { X, Send, Mail, ListPlus } from 'lucide-react'
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
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i

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
  const bezig = sending || saving

  const bron = mailSourceLabel(mailService?.source)
  const dagen = mailService?.follow_up_days || 5
  const emailOk = EMAIL_RE.test(email.trim())
  const naamOk = bellerNaam.trim().length >= 2
  const kanVersturen = emailOk && naamOk

  // v78: niet sturen maar bewaren voor later
  async function handleQueue() {
    if (bezig || !kanVersturen || !onQueued) return
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
      }
      const { error: insErr } = await supabase.from('mail_queue').insert(rij)
      if (insErr) {
        if (insErr.code === '23505') throw new Error('Deze mail staat al in de mailinglijst voor deze lead')
        throw new Error(insErr.message || 'Bewaren mislukt')
      }
      await onQueued({ email: rij.email, contactpersoon: contactpersoon.trim(), source: rij.source, mailType })
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
            <div>
              <button
                type="button"
                onClick={handleQueue}
                disabled={bezig || !kanVersturen}
                title="Nog niet versturen. De mail komt in de mailinglijst op de Leads-pagina en gaat pas weg als jij hem daar verstuurt."
                style={{ width: '100%', background: 'transparent', color: 'var(--text-secondary)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 700, fontSize: '0.9rem', cursor: bezig || !kanVersturen ? 'not-allowed' : 'pointer', opacity: bezig || !kanVersturen ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}
              >
                <ListPlus size={16} /> {saving ? 'BEWAREN...' : 'BEWAREN IN MAILINGLIJST'}
              </button>
              <p className="text-muted" style={{ margin: '6px 0 0', fontSize: '0.75rem', lineHeight: 1.4 }}>
                Nog niet sturen? Dan staat de mail klaar op de Leads-pagina onder Mailinglijst. De lead gaat op "Mail gepland".
              </p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
