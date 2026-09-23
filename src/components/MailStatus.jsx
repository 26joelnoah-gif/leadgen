// LEADGEN v70 - hoe ver komt een gemailde lead bij de bron?
// Eén bron: public.lead_mail_status, gevuld door de Edge Function 'mailstatus'
// (de bron post elke stap). Twee plekken:
//   - belscherm (WorkInterface): <MailStatusBriefing leadId={lead.id} />
//   - contactkaart (LeadDetailModal): <MailStatusBlok leadId={lead.id} />
// Alleen lezen; LEADGEN verandert deze rijen zelf nooit.
import { useEffect, useState } from 'react'
import { MailCheck, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { mailTypeLabel, mailSourceLabel } from '../lib/mailSources'

export const MAIL_STATUS = {
  gemaild:      { label: 'Gemaild', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  link_geklikt: { label: 'Link geklikt', color: 'var(--info)', bg: 'var(--info-bg)' },
  offerte_open: { label: 'Offerte open', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  getekend:     { label: 'Getekend', color: 'var(--success)', bg: 'var(--success-bg)' },
  betaald:      { label: 'Betaald', color: 'var(--success)', bg: 'var(--success-bg)' },
}
const statusInfo = (s) => MAIL_STATUS[s] || { label: s || 'Onbekend', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' }

const dt = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
const d = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : null

const SELECT = 'id, source, mail_soort, email, bureau, offerte_url, status, status_rank, status_op, gemaild_op, geklikt_op, offerte_open_op, getekend_op, betaald_op, updated_at'

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

// Korte regel: wat is er gebeurd sinds de mail de deur uit ging.
export function mailStatusSamenvatting(r) {
  if (!r) return ''
  const parts = []
  if (r.gemaild_op) parts.push(`gemaild ${d(r.gemaild_op)}`)
  if (r.geklikt_op) parts.push(`link geklikt ${d(r.geklikt_op)}`)
  else if (r.gemaild_op && r.status_rank <= 1) parts.push('nog niets mee gedaan')
  if (r.offerte_open_op) parts.push(`offerte open ${d(r.offerte_open_op)}`)
  if (r.getekend_op) parts.push(`getekend ${d(r.getekend_op)}`)
  if (r.betaald_op) parts.push(`betaald ${d(r.betaald_op)}`)
  return parts.join(' · ')
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
          return (
            <div key={r.id} title={r.email || ''} style={{
              display: 'flex', gap: 8, alignItems: 'center', padding: '5px 10px', borderRadius: 8,
              background: s.bg, borderLeft: `3px solid ${s.color}`, fontSize: '0.78rem', minWidth: 0,
            }}>
              <MailCheck size={14} style={{ color: s.color, flex: 'none' }} />
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{mailTypeLabel(r.mail_soort)}</span>
              <MailStatusChip status={r.status} />
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
        return (
          <div key={r.id} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10,
            background: s.bg, borderLeft: `3px solid ${s.color}`, marginBottom: 10,
          }}>
            <MailCheck size={16} style={{ color: s.color, flex: 'none', marginTop: 2 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{mailTypeLabel(r.mail_soort)} via {mailSourceLabel(r.source)}</span>
                <MailStatusChip status={r.status} />
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {mailStatusSamenvatting(r)}{r.email ? ` · ${r.email}` : ''}
              </div>
            </div>
          </div>
        )
      })}
    </>
  )
}

// Blok voor de contactkaart: alle mails met alle stappen eronder.
export function MailStatusBlok({ leadId }) {
  const { mailStatus, loading } = useMailStatus(leadId)
  if (loading || mailStatus.length === 0) return null
  return (
    <div style={{ marginTop: 14 }}>
      <div className="text-[10px] font-black uppercase text-muted tracking-widest mb-2" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <MailCheck size={12} /> Mailingservice ({mailStatus.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mailStatus.map(r => {
          const s = statusInfo(r.status)
          return (
            <div key={r.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, borderLeft: `3px solid ${s.color}` }}>
              <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{mailTypeLabel(r.mail_soort)}</span>
                <MailStatusChip status={r.status} />
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                {mailSourceLabel(r.source)}{r.email ? ` · ${r.email}` : ''}{r.bureau ? ` · ${r.bureau}` : ''}
              </div>
              <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1px 10px' }}>
                {r.gemaild_op && <><span>Gemaild</span><span>{dt(r.gemaild_op)}</span></>}
                {r.geklikt_op && <><span>Link geklikt</span><span>{dt(r.geklikt_op)}</span></>}
                {r.offerte_open_op && <><span>Offerte open</span><span>{dt(r.offerte_open_op)}</span></>}
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
    </div>
  )
}
