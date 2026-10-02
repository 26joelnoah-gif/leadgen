// ReachConnect v70 - hoe ver komt een gemailde lead bij de bron?
// Eén bron: public.lead_mail_status, gevuld door de Edge Function 'mailstatus'
// (de bron post elke stap). Twee plekken:
//   - belscherm (WorkInterface): <MailStatusBriefing leadId={lead.id} />
//   - contactkaart (LeadDetailModal): <MailStatusBlok leadId={lead.id} />
// Alleen lezen; ReachConnect verandert deze rijen zelf nooit.
//
// v122 (02-10-2026): BeautyInfo stuurt veel meer dan de 5 funnelstappen (mail
// bezorgd/geopend/gebounced, klant op de pagina, bij het betalen, betaling
// mislukt, abonnement, ...). Daarvoor staan er extra kolommen op de rij
// (laatste_event, fase, pagina_actief_op/pagina_verlaten_op, actie_nodig) en
// is er een tabel lead_mail_events met elke losse gebeurtenis (tijdlijn op de
// contactkaart). Nieuw in beeld: voortgangsbalk Mail > Bezoek > Betaling >
// Klant, label "Nu op de pagina" en een rode terugbel-vlag.
import { useEffect, useState } from 'react'
import { MailCheck, ExternalLink, Radio, PhoneCall } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mailTypeLabel, mailSourceLabel } from '../lib/mailSources'

export const MAIL_STATUS = {
  gemaild:      { label: 'Gemaild', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  link_geklikt: { label: 'Link geklikt', color: 'var(--info)', bg: 'var(--info-bg)' },
  offerte_open: { label: 'Offerte open', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  getekend:     { label: 'Getekend', color: 'var(--success)', bg: 'var(--success-bg)' },
  betaald:      { label: 'Betaald', color: 'var(--success)', bg: 'var(--success-bg)' },
}

// v122: labels voor elke losse gebeurtenis (laatste_event en tijdlijn).
// Sleutels = de statusnamen uit de webhook-spec van BeautyInfo.
export const MAIL_EVENT_LABELS = {
  gemaild: 'Mail verstuurd',
  herinnering_verstuurd: 'Herinnering verstuurd',
  mail_mislukt: 'Mail niet verstuurd',
  bezorgd: 'Mail bezorgd',
  bounced: 'Mail gebounced',
  spam_melding: 'Als spam gemarkeerd',
  geopend: 'Mail geopend',
  link_geklikt: 'Link geklikt',
  pagina_bekeken: 'Pagina opnieuw bekeken',
  pagina_actief: 'Nu op de pagina',
  pagina_verlaten: 'Pagina verlaten',
  checkout_gestart: 'Bij het betalen',
  checkout_verlaten: 'Niet betaald (verlopen)',
  betaling_mislukt: 'Betaling mislukt',
  betaald: 'Betaald',
  welkomstmail_verstuurd: 'Welkomstmail verstuurd',
  abonnement_verlengd: 'Abonnement verlengd',
  abonnement_opgezegd: 'Abonnement opgezegd',
  afgemeld: 'Gestopt',
  offerte_open: 'Offerte geopend',
  getekend: 'Getekend',
}
export const mailEventLabel = (s) => MAIL_EVENT_LABELS[s] || (s ? s.replace(/_/g, ' ') : 'Onbekend')

// v122: wat betekent een terugbel-vlag voor de beller (korte tekst op de chip).
export const MAIL_ACTIE_LABELS = {
  bounced: 'Mail kwam niet aan',
  mail_mislukt: 'Mail niet verstuurd',
  spam_melding: 'Spam gemeld',
  checkout_verlaten: 'Niet gaan betalen',
  betaling_mislukt: 'Betaling mislukt',
  abonnement_opgezegd: 'Abonnement opgezegd',
}
export const mailActieLabel = (s) => MAIL_ACTIE_LABELS[s] || mailEventLabel(s)

// v122: fase-balk. 'einde' (gestopt) toont de balk gedoofd.
export const MAIL_FASES = [
  { key: 'mail', label: 'Mail' },
  { key: 'bezoek', label: 'Bezoek' },
  { key: 'betaling', label: 'Betaling' },
  { key: 'klant', label: 'Klant' },
]
// Fase afleiden als de bron er geen meestuurde (oude MK-rijen): uit de funnelstap.
export const faseVan = (r) => {
  if (!r) return null
  if (r.fase) return r.fase
  const rank = r.status_rank || 0
  if (rank >= 4) return 'klant'
  if (rank === 3) return 'betaling'
  if (rank === 2) return 'bezoek'
  if (rank === 1) return 'mail'
  return null
}

// v122: is de klant NU op de aanmeldpagina? actief_op moet na verlaten_op
// liggen, en niet ouder dan 15 minuten zijn (de bron meldt "verlaten" na 2 min
// zonder hartslag; dit is de vangnet als die melding niet aankomt).
export const isLiveOpPagina = (r, nu = Date.now()) => {
  if (!r?.pagina_actief_op) return false
  const actief = new Date(r.pagina_actief_op).getTime()
  const verlaten = r.pagina_verlaten_op ? new Date(r.pagina_verlaten_op).getTime() : 0
  return actief > verlaten && nu - actief < 15 * 60_000
}

const statusInfo = (s) => MAIL_STATUS[s] || { label: mailEventLabel(s), color: 'var(--text-muted)', bg: 'var(--bg-elevated)' }

const dt = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
const d = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : null

const SELECT = 'id, source, mail_soort, email, bureau, offerte_url, status, status_rank, status_op, gemaild_op, geklikt_op, offerte_open_op, getekend_op, betaald_op, updated_at, laatste_event, laatste_event_op, fase, pagina_actief_op, pagina_verlaten_op, actie_nodig, actie_nodig_op'

export function MailStatusChip({ status }) {
  const s = statusInfo(status)
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700,
      padding: '2px 9px', borderRadius: 999, color: s.color, background: s.bg, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {s.label}
    </span>
  )
}

// v122: "Nu op de pagina" (knipperend bolletje) en de rode terugbel-vlag.
export function MailLiveChip() {
  return (
    <span className="ms-live" style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 800,
      padding: '2px 9px', borderRadius: 999, color: '#fff', background: 'var(--secondary)', whiteSpace: 'nowrap',
    }}>
      <Radio size={11} /> Nu op de pagina
    </span>
  )
}
export function MailActieChip({ actie }) {
  if (!actie) return null
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700,
      padding: '2px 9px', borderRadius: 999, color: 'var(--danger)', background: 'var(--danger-bg)', whiteSpace: 'nowrap',
    }}>
      <PhoneCall size={11} /> Terugbellen: {mailActieLabel(actie)}
    </span>
  )
}

// v122: voortgangsbalk Mail > Bezoek > Betaling > Klant.
export function MailFaseBalk({ row, compact = false }) {
  const fase = faseVan(row)
  if (!fase) return null
  const gestopt = fase === 'einde'
  const idx = MAIL_FASES.findIndex(f => f.key === fase)
  return (
    <div title={gestopt ? 'Gestopt via /stop' : `Fase: ${MAIL_FASES[idx]?.label || fase}`}
         style={{ display: 'flex', gap: 3, alignItems: 'center', opacity: gestopt ? 0.45 : 1 }}>
      {MAIL_FASES.map((f, i) => {
        const done = !gestopt && i <= idx
        const huidig = !gestopt && i === idx
        return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: compact ? 26 : 44 }}>
            <div style={{
              height: compact ? 4 : 5, width: '100%', borderRadius: 3,
              background: done ? (i >= 2 ? 'var(--success)' : 'var(--info)') : 'var(--border)',
              outline: huidig ? '2px solid var(--bg-card)' : 'none',
              boxShadow: huidig ? `0 0 0 3px ${i >= 2 ? 'var(--success-bg)' : 'var(--info-bg)'}` : 'none',
            }} />
            {!compact && <span style={{ fontSize: '0.62rem', fontWeight: huidig ? 800 : 600, color: done ? 'var(--text)' : 'var(--text-muted)' }}>{f.label}</span>}
          </div>
        )
      })}
    </div>
  )
}

// Mailstatussen van één lead, met realtime-updates (v70: tabel zit in supabase_realtime).
export function useMailStatus(leadId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(!!leadId)

  useEffect(() => {
    if (!leadId) { setRows([]); setLoading(false); return }
    let alive = true
    setLoading(true)
    const load = () => supabase
      .from('lead_mail_status').select(SELECT).eq('lead_id', leadId).order('updated_at', { ascending: false })
      .then(({ data }) => { if (alive) { setRows(data || []); setLoading(false) } })
    load()
    const ch = supabase
      .channel(`mailstatus-lead-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_mail_status', filter: `lead_id=eq.${leadId}` }, load)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [leadId])

  return { mailStatus: rows, loading }
}

// v122: losse gebeurtenissen (tijdlijn) van één lead, nieuwste eerst.
export function useMailEvents(leadId, limit = 15) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    if (!leadId) { setRows([]); return }
    let alive = true
    const load = () => supabase
      .from('lead_mail_events').select('id, source, status, stage, occurred_at, details')
      .eq('lead_id', leadId).order('occurred_at', { ascending: false }).limit(limit)
      .then(({ data }) => { if (alive) setRows(data || []) })
    load()
    const ch = supabase
      .channel(`mailevents-lead-${leadId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_mail_events', filter: `lead_id=eq.${leadId}` }, load)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [leadId, limit])
  return rows
}

// Korte regel: wat is er gebeurd sinds de mail de deur uit ging.
export function mailStatusSamenvatting(r) {
  if (!r) return ''
  const parts = []
  if (r.gemaild_op) parts.push(`gemaild ${d(r.gemaild_op)}`)
  if (r.geklikt_op) parts.push(`link geklikt ${d(r.geklikt_op)}`)
  else if (r.gemaild_op && r.status_rank <= 1) parts.push('nog niets mee gedaan')
  if (r.offerte_open_op) parts.push(`${r.source === 'BEAUTYINFO' ? 'bij het betalen' : 'offerte open'} ${d(r.offerte_open_op)}`)
  if (r.getekend_op) parts.push(`getekend ${d(r.getekend_op)}`)
  if (r.betaald_op) parts.push(`betaald ${d(r.betaald_op)}`)
  // v122: de laatste losse gebeurtenis als die iets anders zegt dan de funnelstap
  if (r.laatste_event && r.laatste_event !== r.status && !['pagina_actief'].includes(r.laatste_event)) {
    parts.push(`laatst: ${mailEventLabel(r.laatste_event).toLowerCase()} ${d(r.laatste_event_op)}`)
  }
  return parts.join(' · ')
}

// Chips die bij een rij horen: funnelstap + live + terugbel-vlag.
function RijChips({ r }) {
  return (
    <>
      <MailStatusChip status={r.source === 'BEAUTYINFO' && r.status === 'offerte_open' ? 'checkout_gestart' : r.status} />
      {isLiveOpPagina(r) && <MailLiveChip />}
      <MailActieChip actie={r.actie_nodig} />
    </>
  )
}

export function MailStatusBriefing({ leadId, compact = false }) {
  const { mailStatus } = useMailStatus(leadId)
  if (mailStatus.length === 0) return null
  // 23-09: compacte versie voor het belscherm op desktop - één regel per mail,
  // naast elkaar, zodat de contactkaart eronder zonder scrollen past.
  if (compact) {
    return (
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {mailStatus.map(r => {
          const s = statusInfo(r.status)
          const live = isLiveOpPagina(r)
          return (
            <div key={r.id} title={r.email || ''} style={{
              display: 'flex', gap: 8, alignItems: 'center', padding: '5px 10px', borderRadius: 8,
              background: live ? 'var(--secondary-bg, var(--warning-bg))' : r.actie_nodig ? 'var(--danger-bg)' : s.bg,
              borderLeft: `3px solid ${live ? 'var(--secondary)' : r.actie_nodig ? 'var(--danger)' : s.color}`, fontSize: '0.78rem', minWidth: 0,
            }}>
              <MailCheck size={14} style={{ color: s.color, flex: 'none' }} />
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{mailTypeLabel(r.mail_soort)}</span>
              <MailFaseBalk row={r} compact />
              <RijChips r={r} />
              <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mailStatusSamenvatting(r)}</span>
            </div>
          )
        })}
      </div>
    )
  }
  return (
    <>
      {mailStatus.map(r => {
        const s = statusInfo(r.status)
        const live = isLiveOpPagina(r)
        return (
          <div key={r.id} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10,
            background: live ? 'var(--secondary-bg, var(--warning-bg))' : r.actie_nodig ? 'var(--danger-bg)' : s.bg,
            borderLeft: `3px solid ${live ? 'var(--secondary)' : r.actie_nodig ? 'var(--danger)' : s.color}`, marginBottom: 10,
          }}>
            <MailCheck size={16} style={{ color: s.color, flex: 'none', marginTop: 2 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{mailTypeLabel(r.mail_soort)} via {mailSourceLabel(r.source)}</span>
                <RijChips r={r} />
              </div>
              <div style={{ marginTop: 6 }}><MailFaseBalk row={r} /></div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                {mailStatusSamenvatting(r)}{r.email ? ` · ${r.email}` : ''}
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

// Blok voor de contactkaart: alle mails met alle stappen eronder + tijdlijn (v122).
export function MailStatusBlok({ leadId }) {
  const { mailStatus, loading } = useMailStatus(leadId)
  const events = useMailEvents(leadId)
  if (loading || mailStatus.length === 0) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div className="text-[10px] font-black uppercase text-muted tracking-widest mb-2" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <MailCheck size={12} /> Mailingservice ({mailStatus.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mailStatus.map(r => {
          const s = statusInfo(r.status)
          const live = isLiveOpPagina(r)
          return (
            <div key={r.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, borderLeft: `3px solid ${live ? 'var(--secondary)' : r.actie_nodig ? 'var(--danger)' : s.color}` }}>
              <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{mailTypeLabel(r.mail_soort)}</span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><RijChips r={r} /></span>
              </div>
              <div style={{ marginTop: 8 }}><MailFaseBalk row={r} /></div>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 6 }}>
                {mailSourceLabel(r.source)}{r.email ? ` · ${r.email}` : ''}{r.bureau ? ` · ${r.bureau}` : ''}
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1px 10px' }}>
                {r.gemaild_op && <><span>Gemaild</span><span>{dt(r.gemaild_op)}</span></>}
                {r.geklikt_op && <><span>Link geklikt</span><span>{dt(r.geklikt_op)}</span></>}
                {r.offerte_open_op && <><span>{r.source === 'BEAUTYINFO' ? 'Bij het betalen' : 'Offerte open'}</span><span>{dt(r.offerte_open_op)}</span></>}
                {r.getekend_op && <><span>Getekend</span><span>{dt(r.getekend_op)}</span></>}
                {r.betaald_op && <><span>Betaald</span><span>{dt(r.betaald_op)}</span></>}
              </div>
              {r.offerte_url && (
                <a className="btn btn-outline btn-sm" href={r.offerte_url} target="_blank" rel="noopener noreferrer nofollow"
                   style={{ marginTop: 8, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                  Offerte bekijken <ExternalLink size={12} />
                </a>
              )}
            </div>
          )
        })}
      </div>
      {events.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="text-[10px] font-black uppercase text-muted tracking-widest mb-1">Tijdlijn</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', fontSize: '0.75rem' }}>
            {events.map(e => (
              <div key={e.id} style={{ display: 'contents' }}>
                <span className="text-muted" style={{ whiteSpace: 'nowrap' }}>{dt(e.occurred_at)}</span>
                <span style={{ color: MAIL_ACTIE_LABELS[e.status] ? 'var(--danger)' : e.status === 'betaald' ? 'var(--success)' : 'var(--text)' }}>
                  {mailEventLabel(e.status)}
                  {e.status === 'betaald' && e.details?.amount ? ` · € ${e.details.amount}${e.details.interval === 'year' ? ' per jaar' : ''}` : ''}
                  {e.details?.reason ? ` (${String(e.details.reason)})` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
