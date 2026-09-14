import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import {
  Phone, Mail, Globe, MapPin, Search, Send, RotateCcw, Hand, Clock, CalendarDays,
  X, CheckCircle, Users, Briefcase, AlertTriangle, PhoneOff, MessageSquare, History
} from 'lucide-react'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import OfferteSturenModal from '../components/OfferteSturenModal'
import { OffertesBlok } from '../components/OfferteStatus'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { formatDateTime } from '../utils/dateUtils'
import { useAccountManagementAccess, useAccountManagementLeads, useAccountManagementWeekStats } from '../hooks/useAccountManagement'
import { AM_PIPELINE, AM_DONE, amStage, amStageInfo, needsFollowUpToday, isOverdue, startOfWeek } from '../lib/accountmanagement'
import { getProduct } from '../lib/products'

// v68: werkplek van de accountmanager (BRIEF-leadgen 6a).
// Wie in het team van een accountmanagement-project zit komt hier terecht:
// "vandaag opvolgen", eigen pipeline, vrije leads om op te pakken, offerte
// sturen vanuit de lead, en terugzetten naar de pool (met behoud van notities).
// Managers van het project en admin zien daarnaast de hele teampipeline.

const TABS = [
  { id: 'today', label: 'Vandaag opvolgen', icon: Clock },
  { id: 'pipeline', label: 'Mijn pipeline', icon: Briefcase },
  { id: 'pool', label: 'Vrije leads', icon: Hand },
]

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
function plusDays(days, hour = 10) {
  const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.toISOString()
}

function StageBadge({ status }) {
  const s = amStageInfo(status)
  return (
    <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: 999, color: s.color, background: 'var(--bg-elevated)', border: `1px solid ${s.color}`, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

export default function AccountManagement() {
  const { profile } = useAuth()
  const toast = useToast()
  const { amLists, hasAccountManagement, loading: accessLoading } = useAccountManagementAccess()
  const [listId, setListId] = useState(null)
  const [tab, setTab] = useState('today')
  const [search, setSearch] = useState('')
  const [openLead, setOpenLead] = useState(null)
  const isStaff = profile?.role === 'admin' || profile?.role === 'manager'

  useEffect(() => {
    if (!listId && amLists.length) setListId(amLists[0].id)
  }, [amLists, listId])

  const list = amLists.find(l => l.id === listId)
  const campaign = list?.campaigns
  const product = getProduct(campaign?.product_code)
  const { leads, mine, pool, others, owners, loading, released, claim, release, save, logContact, reload } = useAccountManagementLeads(listId)
  const weekStart = useMemo(() => startOfWeek(), [])
  const { stats, reload: reloadStats } = useAccountManagementWeekStats(listId, weekStart)

  useEffect(() => { if (released > 0) toast(`${released} lead(s) zonder actie zijn terug in de pool gezet`, 'info') }, [released]) // eslint-disable-line react-hooks/exhaustive-deps

  if (accessLoading) return <div className="container" style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner /></div>
  if (!hasAccountManagement) return <Navigate to="/" replace />

  const today = mine.filter(needsFollowUpToday).sort((a, b) => new Date(a.next_contact_date || 0) - new Date(b.next_contact_date || 0))
  const q = search.trim().toLowerCase()
  const matches = (l) => !q || [l.name, l.contact_person, l.phone, l.email, l.city].some(v => (v || '').toLowerCase().includes(q))

  const allTabs = isStaff ? [...TABS, { id: 'team', label: 'Hele team', icon: Users }] : TABS
  const counts = { today: today.length, pipeline: mine.length, pool: pool.length, team: leads.length }

  // Actueel exemplaar van de geopende lead (realtime/updates)
  const current = openLead ? leads.find(l => l.id === openLead.id) || openLead : null

  return (
    <div>
      <Header />
      <div className="container" style={{ paddingTop: 20, paddingBottom: 40 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 2 }}>Accountmanagement · {product.naam}</div>
            <h1 style={{ margin: '4px 0 0', fontSize: '1.6rem', fontWeight: 900, letterSpacing: -1 }}>{list?.name || 'Mijn klanten'}</h1>
          </div>
          {amLists.length > 1 && (
            <select className="form-control" value={listId || ''} onChange={e => { setListId(e.target.value); setOpenLead(null) }} style={{ maxWidth: 280 }}>
              {amLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </div>

        {/* Weekteller */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Gebeld deze week', value: stats.gebeld, icon: Phone, color: 'var(--primary)' },
            { label: 'Offertes gestuurd', value: stats.offertes, icon: Send, color: 'var(--info)' },
            { label: 'Getekend', value: stats.getekend, icon: CheckCircle, color: 'var(--success)' },
            { label: 'Vandaag opvolgen', value: today.length, icon: Clock, color: today.some(isOverdue) ? 'var(--danger)' : 'var(--warning)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
              <s.icon size={20} style={{ color: s.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: 900, lineHeight: 1 }}>{s.value}</div>
                <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs + zoeken */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
          {allTabs.map(t => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-outline'}`}>
              <t.icon size={14} /> {t.label} <span style={{ opacity: 0.7 }}>({counts[t.id]})</span>
            </button>
          ))}
          <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 220, flex: '1 1 220px', maxWidth: 360 }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-control" placeholder="Zoek bedrijf, contact, telefoon..." value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner /></div>
        ) : tab === 'pipeline' ? (
          <PipelineBoard leads={mine.filter(matches)} onOpen={setOpenLead} />
        ) : tab === 'team' ? (
          <PipelineBoard leads={leads.filter(matches)} onOpen={setOpenLead} owners={owners} showOwner />
        ) : (
          <LeadRows
            leads={(tab === 'today' ? today : pool).filter(matches)}
            onOpen={setOpenLead}
            pool={tab === 'pool'}
            onClaim={async (l) => { try { await claim(l.id); toast(`${l.name} staat nu bij jou`, 'success'); setOpenLead(l) } catch (e) { toast(e.message, 'error') } }}
            empty={tab === 'today'
              ? { title: 'Niets meer op te volgen vandaag', message: pool.length ? `Er liggen nog ${pool.length} vrije leads in de pool.` : 'Pak een vrije lead of zet een volgende actie op je leads.' }
              : { title: 'Geen vrije leads', message: 'Alle leads in dit project zijn in behandeling.' }}
          />
        )}
      </div>

      {current && (
        <LeadPanel
          lead={current}
          ownerName={current.assigned_to ? owners[current.assigned_to] : null}
          isMine={current.assigned_to === profile?.id}
          isStaff={isStaff}
          product={product}
          releaseDays={campaign?.am_release_days}
          onClose={() => setOpenLead(null)}
          onClaim={async () => { try { await claim(current.id); toast('Lead staat nu bij jou', 'success') } catch (e) { toast(e.message, 'error') } }}
          onRelease={async (reason) => { try { await release(current.id, reason); toast('Lead terug in de pool, notities blijven bewaard', 'success'); setOpenLead(null) } catch (e) { toast(e.message, 'error') } }}
          onSave={async (patch) => { try { await save(current.id, patch) } catch (e) { toast(e.message, 'error') } }}
          onLog={async (disposition, notes) => { await logContact(current, disposition, notes); reloadStats() }}
          onSent={() => { reload(); reloadStats() }}
        />
      )}
    </div>
  )
}

function LeadRows({ leads, onOpen, pool, onClaim, empty }) {
  if (!leads.length) return <EmptyState icon="calendar" title={empty.title} message={empty.message} />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {leads.map(l => {
        const overdue = isOverdue(l)
        return (
          <div key={l.id} className="card" onClick={() => onOpen(l)} style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer', borderLeft: `4px solid ${overdue ? 'var(--danger)' : amStageInfo(l.status).color}` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '0.95rem' }}>{l.name}</strong>
                <StageBadge status={l.status} />
              </div>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {l.contact_person && <span>{l.contact_person}</span>}
                <span>{l.phone}</span>
                {l.city && <span>{l.city}</span>}
              </div>
              {l.notes && <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.notes.split('\n').filter(Boolean).slice(-1)[0]}</div>}
            </div>
            {pool ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); onClaim(l) }}><Hand size={14} /> Oppakken</button>
            ) : (
              <div style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, color: overdue ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {l.next_contact_date ? <>{overdue && <AlertTriangle size={12} style={{ verticalAlign: -2 }} />} {formatDateTime(l.next_contact_date)}</> : 'Geen actie gepland'}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PipelineBoard({ leads, onOpen, owners = {}, showOwner }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${AM_PIPELINE.length}, minmax(200px, 1fr))`, gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
      {AM_PIPELINE.map(stage => {
        const items = leads.filter(l => amStage(l.status) === stage.id)
        return (
          <div key={stage.id} style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: 10, minHeight: 120 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, color: stage.color }}>{stage.label}</span>
              <span className="text-muted" style={{ fontSize: '0.72rem', fontWeight: 800 }}>{items.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(l => (
                <div key={l.id} className="card" onClick={() => onOpen(l)} style={{ padding: '8px 10px', cursor: 'pointer', borderLeft: isOverdue(l) && !AM_DONE.includes(l.status) ? '3px solid var(--danger)' : undefined }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{l.name}</div>
                  <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                    {showOwner ? (l.assigned_to ? owners[l.assigned_to] || 'Collega' : 'Vrij') : (l.next_contact_date ? formatDateTime(l.next_contact_date) : 'Geen actie gepland')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LeadPanel({ lead, ownerName, isMine, isStaff, product, releaseDays, onClose, onClaim, onRelease, onSave, onLog, onSent }) {
  const [notes, setNotes] = useState(lead.notes || '')
  const [contact, setContact] = useState({ contact_person: lead.contact_person || '', email: lead.email || '', phone: lead.phone || '' })
  const [nextAt, setNextAt] = useState(toLocalInput(lead.next_contact_date))
  const [showOfferte, setShowOfferte] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [reason, setReason] = useState('')
  const [history, setHistory] = useState([])
  const canEdit = isMine || isStaff
  const done = AM_DONE.includes(lead.status)

  useEffect(() => { setNotes(lead.notes || '') }, [lead.notes])
  useEffect(() => { setNextAt(toLocalInput(lead.next_contact_date)) }, [lead.next_contact_date])
  useEffect(() => {
    supabase.rpc('lead_call_history', { p_lead_id: lead.id }).then(({ data }) => setHistory(data || []))
  }, [lead.id, lead.updated_at])

  const saveNotes = () => { if (canEdit && notes !== (lead.notes || '')) onSave({ notes }) }
  const saveContact = () => {
    if (!canEdit) return
    const patch = {}
    if (contact.contact_person !== (lead.contact_person || '')) patch.contact_person = contact.contact_person || null
    if (contact.email !== (lead.email || '')) patch.email = contact.email || null
    if (contact.phone !== (lead.phone || '') && contact.phone.length >= 8) patch.phone = contact.phone
    if (Object.keys(patch).length) onSave(patch)
  }
  const setNext = (iso) => { setNextAt(toLocalInput(iso)); onSave({ next_contact_date: iso }) }
  const setStage = (id) => onSave({ status: id, ...(AM_DONE.includes(id) ? { next_contact_date: null } : {}) })

  async function gesproken() {
    await onLog('gebeld', 'Gesproken (accountmanagement)')
    const patch = amStage(lead.status) === 'new' ? { status: 'gebeld' } : {}
    if (Object.keys(patch).length) onSave(patch)
  }
  async function geenGehoor() {
    await onLog('geen_gehoor', 'Geen gehoor')
    setNext(plusDays(1))
  }

  return (
    <>
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>{lead.name}</h2>
              <StageBadge status={lead.status} />
            </div>
            <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 4 }}>
              {lead.assigned_to ? <>In behandeling bij <strong>{isMine ? 'jou' : ownerName || 'collega'}</strong>{lead.owner_since && <> sinds {formatDateTime(lead.owner_since)}</>}</> : 'Vrije lead (pool)'}
              {releaseDays && !done && lead.assigned_to && <> · valt terug na {releaseDays} dagen zonder actie</>}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Sluiten"><X size={18} /></button>
        </div>

        {!lead.assigned_to && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 12, borderRadius: 10, background: 'var(--info-bg)', marginBottom: 14 }}>
            <Hand size={18} style={{ color: 'var(--primary)' }} />
            <span style={{ flex: 1, fontSize: '0.85rem' }}>Deze lead ligt in de pool. Pak hem op om te bellen en op te volgen.</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={onClaim}>Oppakken</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {/* Linkerkolom: contact + acties */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                  <Users size={14} className="text-muted" />
                  <input className="form-control" placeholder="Contactpersoon" value={contact.contact_person} disabled={!canEdit} onChange={e => setContact(c => ({ ...c, contact_person: e.target.value }))} onBlur={saveContact} style={{ padding: '6px 10px' }} />
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                  <Phone size={14} className="text-muted" />
                  <input className="form-control" placeholder="Telefoon" value={contact.phone} disabled={!canEdit} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} onBlur={saveContact} style={{ padding: '6px 10px' }} />
                  <a className="btn btn-success btn-sm" href={`tel:${lead.phone}`} style={{ whiteSpace: 'nowrap' }}><Phone size={14} /> Bel</a>
                </label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}>
                  <Mail size={14} className="text-muted" />
                  <input className="form-control" placeholder="E-mailadres" type="email" value={contact.email} disabled={!canEdit} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} onBlur={saveContact} style={{ padding: '6px 10px' }} />
                </label>
                {lead.website && <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}><Globe size={14} className="text-muted" /><a href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer nofollow">{lead.website}</a></div>}
                {(lead.address || lead.city) && <div className="text-muted" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.85rem' }}><MapPin size={14} />{[lead.address, lead.house_number, lead.postal_code, lead.city].filter(Boolean).join(' ')}</div>}
              </div>
            </div>

            {canEdit && lead.assigned_to && (
              <div className="card" style={{ padding: 12 }}>
                <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Contactmoment</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={gesproken}><MessageSquare size={14} /> Gesproken</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={geenGehoor}><PhoneOff size={14} /> Geen gehoor (morgen weer)</button>
                  {!done && <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowOfferte(true)}><Send size={14} /> Offerte sturen</button>}
                </div>
              </div>
            )}

            <div className="card" style={{ padding: 12 }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Status</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {AM_PIPELINE.map(s => {
                  const active = amStage(lead.status) === s.id
                  const clickable = canEdit && lead.assigned_to && (s.manual || isStaff)
                  return (
                    <button key={s.id} type="button" title={s.hint} disabled={!clickable} onClick={() => clickable && setStage(s.id)}
                      className={`btn btn-sm ${active ? 'btn-primary' : 'btn-outline'}`} style={{ opacity: clickable || active ? 1 : 0.5 }}>
                      {s.label}
                    </button>
                  )
                })}
              </div>
              <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 6 }}>"Offerte gestuurd", "Geaccepteerd" en "Actief" zet het systeem zelf.</div>
            </div>

            {canEdit && lead.assigned_to && !done && (
              <div className="card" style={{ padding: 12 }}>
                <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}><CalendarDays size={12} style={{ verticalAlign: -2 }} /> Volgende actie</div>
                <input type="datetime-local" className="form-control" value={nextAt} onChange={e => setNextAt(e.target.value)} onBlur={() => { if (nextAt) onSave({ next_contact_date: new Date(nextAt).toISOString() }) }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setNext(plusDays(1))}>Morgen</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setNext(plusDays(3))}>+3 dagen</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setNext(plusDays(7))}>+1 week</button>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setNext(plusDays(30))}>+1 maand</button>
                </div>
              </div>
            )}
          </div>

          {/* Rechterkolom: notities, offertes, geschiedenis */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Notities</div>
              <textarea className="form-control" rows={7} value={notes} disabled={!canEdit} onChange={e => setNotes(e.target.value)} onBlur={saveNotes}
                placeholder="Wat is er besproken, wat is afgesproken, wie beslist?" style={{ resize: 'vertical', fontSize: '0.85rem' }} />
              <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>Wordt opgeslagen zodra je het veld verlaat. Blijft bewaard als de lead terug in de pool gaat.</div>
            </div>

            <div className="card" style={{ padding: 12 }}>
              <OffertesBlok lead={lead} canCreate={false} />
            </div>

            <div className="card" style={{ padding: 12 }}>
              <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}><History size={12} style={{ verticalAlign: -2 }} /> Geschiedenis</div>
              {history.length === 0 ? <p className="text-muted" style={{ fontSize: '0.8rem', fontStyle: 'italic', margin: 0 }}>Nog geen contactmomenten.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                  {history.map((h, i) => (
                    <div key={i} style={{ fontSize: '0.78rem', borderLeft: '2px solid var(--border)', paddingLeft: 8 }}>
                      <div><strong>{h.agent_name || 'Onbekend'}</strong> · {formatDateTime(h.disposed_at)} · <span className="text-muted">{h.disposition}</span></div>
                      {h.notes && <div className="text-muted">{h.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Terugzetten naar pool */}
        {canEdit && lead.assigned_to && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {!releasing ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setReleasing(true)}><RotateCcw size={14} /> Terugzetten naar de pool</button>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="form-control" placeholder="Reden (optioneel, komt onder de notities)" value={reason} onChange={e => setReason(e.target.value)} style={{ flex: '1 1 240px' }} autoFocus />
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onRelease(reason)}><RotateCcw size={14} /> Terugzetten</button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setReleasing(false); setReason('') }}>Annuleren</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    {showOfferte && (
      <OfferteSturenModal lead={{ ...lead, ...contact }} productCode={product.code} onClose={() => setShowOfferte(false)} onSent={() => onSent?.()} />
    )}
    </>
  )
}
