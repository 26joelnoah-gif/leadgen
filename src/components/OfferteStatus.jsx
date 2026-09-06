// LEADGEN v65 — status van offertes zichtbaar voor beller, AM en admin.
// Eén bron (public.offertes, gekoppeld via lead_id), drie plekken:
//   - contactkaart (LeadDetailModal): <OffertesBlok lead={lead} />
//   - belscherm (WorkInterface): <OfferteBriefing leadId={lead.id} />
//   - Tools-overzicht: OFFERTE_STATUS + <OfferteChip status=... />
// Acties (herinneren / nieuwe link / intrekken) lopen via de Edge Function
// offerte-send; de tabel zelf wordt hier alleen gelezen.
import { useEffect, useState } from 'react'
import { FileSignature, Send, Ban, Copy, ExternalLink } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { offerteHrefForLead } from '../hooks/useProjectTools'

export const OFFERTE_STATUS = {
  concept: { label: 'Concept', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  verzonden: { label: 'Verzonden', color: 'var(--info)', bg: 'var(--info-bg)' },
  geopend: { label: 'Geopend', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  getekend: { label: 'Getekend', color: 'var(--success)', bg: 'var(--success-bg)' },
  verlopen: { label: 'Verlopen', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  afgewezen: { label: 'Afgewezen', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  geannuleerd: { label: 'Ingetrokken', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
}
export const OPEN_OFFERTE_STATUSSEN = ['verzonden', 'geopend', 'verlopen']

const eur = (n) => '€ ' + Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const dt = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
const d = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : null

export function OfferteChip({ status }) {
  const s = OFFERTE_STATUS[status] || OFFERTE_STATUS.concept
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

const SELECT = 'id, nummer, status, zaak_naam, email, accountmanager, user_id, eenmalig_ex, maandbedrag_ex, verzonden_op, verzonden_naar, sign_token_expires_at, geopend_op, geopend_aantal, getekend_op, herinnering_op, afgewezen_reden, akkoord, updated_at'

// Offertes van één lead, met realtime-updates (offertes zit in supabase_realtime, v65).
export function useOffertesForLead(leadId) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(!!leadId)

  useEffect(() => {
    if (!leadId) { setRows([]); setLoading(false); return }
    let alive = true
    setLoading(true)
    const load = () => supabase
      .from('offertes').select(SELECT).eq('lead_id', leadId).order('created_at', { ascending: false })
      .then(({ data }) => { if (alive) { setRows(data || []); setLoading(false) } })
    load()
    const ch = supabase
      .channel(`offertes-lead-${leadId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offertes', filter: `lead_id=eq.${leadId}` }, load)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(ch) }
  }, [leadId])

  return { offertes: rows, loading }
}

async function callSend(payload) {
  const { data, error } = await supabase.functions.invoke('offerte-send', { body: payload })
  if (error) {
    let msg = error.message || 'Aanroep mislukt'
    try { const body = await error.context?.json?.(); if (body?.error) msg = body.error } catch { /* geen json */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

// Korte samenvatting voor het belscherm: alleen tonen als er iets open staat.
export function offerteSamenvatting(o) {
  if (!o) return ''
  const parts = [`${eur(o.eenmalig_ex)} eenmalig`]
  if (o.verzonden_op) parts.push(`verstuurd ${d(o.verzonden_op)}`)
  if (o.geopend_op) parts.push(`geopend ${d(o.geopend_op)}${o.geopend_aantal > 1 ? ` (${o.geopend_aantal}×)` : ''}`)
  else if (o.verzonden_op) parts.push('nog niet geopend')
  if (o.status === 'verlopen') parts.push(`verlopen ${d(o.sign_token_expires_at)}`)
  else if (o.status === 'getekend') parts.push(`getekend ${d(o.getekend_op)}`)
  else if (o.sign_token_expires_at) parts.push(`geldig tot ${d(o.sign_token_expires_at)}`)
  return parts.join(' · ')
}

export function OfferteBriefing({ leadId }) {
  const { offertes } = useOffertesForLead(leadId)
  const open = offertes.find(o => OPEN_OFFERTE_STATUSSEN.includes(o.status)) || offertes.find(o => o.status === 'getekend')
  if (!open) return null
  const s = OFFERTE_STATUS[open.status] || OFFERTE_STATUS.concept
  const isGetekend = open.status === 'getekend'
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 10,
      background: s.bg, borderLeft: `3px solid ${s.color}`, marginBottom: 10,
    }}>
      <FileSignature size={16} style={{ color: s.color, flex: 'none', marginTop: 2 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{isGetekend ? 'Getekende offerte' : 'Open offerte'} {open.nummer}</span>
          <OfferteChip status={open.status} />
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
          {offerteSamenvatting(open)}{open.accountmanager ? ` · ${open.accountmanager}` : ''}
        </div>
        {!isGetekend && open.status !== 'verlopen' && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Klant tekent via de link; zodra dat gebeurt springt de lead vanzelf naar deal.
          </div>
        )}
      </div>
    </div>
  )
}

// Blok voor de contactkaart: lijst + acties.
export function OffertesBlok({ lead, canCreate }) {
  const { profile } = useAuth()
  const toast = useToast()
  const { offertes, loading } = useOffertesForLead(lead?.id)
  const [busy, setBusy] = useState(null)
  const isStaff = profile?.role === 'admin' || profile?.role === 'manager'

  async function herinner(o) {
    setBusy(o.id)
    try {
      const r = await callSend({ offerteId: o.id, actie: 'herinneren' })
      toast(`Herinnering gemaild naar ${o.verzonden_naar || o.email}`, 'success')
      if (r?.url) { try { await navigator.clipboard.writeText(r.url) } catch { /* geen clipboard */ } }
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(null) }
  }
  async function nieuweLink(o) {
    setBusy(o.id)
    try {
      const r = await callSend({ offerteId: o.id, actie: 'versturen' })
      toast(`Nieuwe link gemaild, geldig tot ${r.geldigTot}`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setBusy(null) }
  }
  async function intrekken(o) {
    if (!confirm(`Offerte ${o.nummer} intrekken? De link van de klant werkt daarna niet meer.`)) return
    setBusy(o.id)
    try { await callSend({ offerteId: o.id, actie: 'intrekken' }); toast('Offerte ingetrokken', 'success') }
    catch (e) { toast(e.message, 'error') }
    finally { setBusy(null) }
  }

  const mag = (o) => isStaff || o.user_id === profile?.id

  return (
    <div>
      <div className="text-[10px] font-black uppercase text-muted tracking-widest mb-2" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FileSignature size={12} /> Offertes ({offertes.length})</span>
        {canCreate && lead?.id && (
          <a className="btn btn-outline btn-sm" href={offerteHrefForLead(lead.id)} target="_blank" rel="noopener" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
            Offerte maken <ExternalLink size={12} />
          </a>
        )}
      </div>
      {loading ? (
        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Laden…</p>
      ) : offertes.length === 0 ? (
        <p className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>Nog geen offerte voor deze lead.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {offertes.map(o => {
            const s = OFFERTE_STATUS[o.status] || OFFERTE_STATUS.concept
            const openStatus = ['verzonden', 'geopend'].includes(o.status)
            return (
              <div key={o.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: 8, borderLeft: `3px solid ${s.color}`, opacity: ['verlopen', 'geannuleerd'].includes(o.status) ? 0.7 : 1 }}>
                <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem' }} className="mono-num">{o.nummer}</span>
                  <OfferteChip status={o.status} />
                </div>
                <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>
                  {eur(o.eenmalig_ex)} eenmalig · {eur(o.maandbedrag_ex)}/mnd{o.accountmanager ? ` · ${o.accountmanager}` : ''}
                </div>
                <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 4, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1px 10px' }}>
                  {o.verzonden_op && <><span>Verstuurd</span><span>{dt(o.verzonden_op)} naar {o.verzonden_naar}</span></>}
                  {o.geopend_op && <><span>Geopend</span><span>{dt(o.geopend_op)}{o.geopend_aantal > 1 ? ` (${o.geopend_aantal}×)` : ''}</span></>}
                  {o.herinnering_op && <><span>Herinnerd</span><span>{dt(o.herinnering_op)}</span></>}
                  {o.sign_token_expires_at && openStatus && <><span>Geldig tot</span><span>{d(o.sign_token_expires_at)}</span></>}
                  {o.getekend_op && <><span>Getekend</span><span>{dt(o.getekend_op)}{o.akkoord?.door ? ` door ${o.akkoord.door}` : ''}{o.akkoord?.methode === 'op_afstand' ? ' (via link)' : o.akkoord ? ' (op locatie)' : ''}</span></>}
                  {o.afgewezen_reden && <><span>Reden</span><span>{o.afgewezen_reden}</span></>}
                </div>
                {mag(o) && (openStatus || o.status === 'verlopen') && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    {openStatus && (
                      <button className="btn btn-outline btn-sm" disabled={busy === o.id} onClick={() => herinner(o)} title="Mailt de klant opnieuw de link; de link wordt ook gekopieerd">
                        <Send size={12} /> Herinnering
                      </button>
                    )}
                    {o.status === 'verlopen' && (
                      <button className="btn btn-outline btn-sm" disabled={busy === o.id} onClick={() => nieuweLink(o)}>
                        <Copy size={12} /> Nieuwe link mailen
                      </button>
                    )}
                    <button className="btn btn-outline btn-sm" disabled={busy === o.id} onClick={() => intrekken(o)} style={{ color: 'var(--danger)' }}>
                      <Ban size={12} /> Intrekken
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
