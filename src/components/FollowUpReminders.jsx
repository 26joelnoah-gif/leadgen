import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { BellRing, Phone, Clock, ChevronDown, ChevronUp, CalendarClock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { useLeadUserState } from '../hooks/useLeadUserState'
import { REMINDER_STATUSES, reminderLabel, relativeDue, tomorrowAt, inHours } from '../lib/followUps'

// v130: Te doen-paneel. Zodra een terugbelafspraak of opvolging van JOU zijn
// tijd bereikt, komt de lead hier in beeld, op elke pagina. Wegklikken kan
// alleen per lead, en alleen door er iets mee te doen:
//   Bel nu    = belscherm open (afboeken zet een nieuwe status/datum)
//   Verzetten = opvolgdatum echt verschuiven (+1 uur, morgen 10:00, zelf kiezen)
//   Straks    = 1 uur uit het paneel, daarna komt hij terug
// Er is bewust geen "alles wegklikken", zodat er niets wordt overgeslagen.
// Inklappen mag; dan blijft er een knop met het aantal staan.
const POLL_MS = 60000
const VERBORGEN_PADEN = ['/tekenen', '/aanmelden', '/login', '/setup', '/privacy', '/voorwaarden']

function toLocalInput(iso) {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function FollowUpReminders() {
  const { user, profile, isWorking, toggleWorkingMode } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const { isSnoozed, snooze } = useLeadUserState()
  const [leads, setLeads] = useState([])
  const [now, setNow] = useState(() => Date.now())
  const [ingeklapt, setIngeklapt] = useState(() => {
    try { return sessionStorage.getItem('reachconnect-todo-dicht') === '1' } catch { return false }
  })
  const [verzetOpen, setVerzetOpen] = useState(null) // lead-id
  const [eigenTijd, setEigenTijd] = useState('')
  const [bezig, setBezig] = useState(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, contact_person, phone, city, status, next_contact_date, lead_list_id, assigned_to, locked_by, lead_lists!inner(name, deleted_at, campaigns(type))')
      .or(`assigned_to.eq.${user.id},locked_by.eq.${user.id}`)
      .in('status', REMINDER_STATUSES)
      .is('deleted_at', null)
      .is('lead_lists.deleted_at', null)
      .lte('next_contact_date', new Date().toISOString())
      .order('next_contact_date', { ascending: true })
      .limit(100)
    if (error) { console.warn('Te doen laden:', error.message); return }
    setLeads((data || []).filter(l => l.lead_lists?.campaigns?.type !== 'recruitment'))
    setNow(Date.now())
  }, [user?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!user?.id) return
    const t = setInterval(() => { if (!document.hidden) load() }, POLL_MS)
    const opFocus = () => load()
    window.addEventListener('focus', opFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', opFocus) }
  }, [user?.id, load])
  // Na het bellen meteen opnieuw kijken: de lead heeft dan een nieuwe status/datum
  useEffect(() => { if (!isWorking) load() }, [isWorking]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try { sessionStorage.setItem('reachconnect-todo-dicht', ingeklapt ? '1' : '0') } catch { /* privemodus */ }
  }, [ingeklapt])

  const zichtbaar = useMemo(() => leads.filter(l => !isSnoozed(l, now)), [leads, isSnoozed, now])

  // Komt er een NIEUWE lead bij (tijd net bereikt) terwijl het paneel dicht
  // is: weer openklappen, zodat hij niet gemist wordt.
  const aantal = zichtbaar.length
  const gezien = useRef(null)
  useEffect(() => {
    const ids = zichtbaar.map(l => l.id)
    if (gezien.current && ids.some(id => !gezien.current.has(id))) setIngeklapt(false)
    gezien.current = new Set(ids)
  }, [zichtbaar])

  async function belNu(lead) {
    if (isWorking || bezig) return
    setBezig(lead.id)
    const { data, error } = await supabase.rpc('claim_lead', { p_lead_id: lead.id, p_force: false })
    setBezig(null)
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) { toast('Deze lead is nu bij een collega in behandeling', 'error'); load(); return }
    setIngeklapt(true)
    toggleWorkingMode(row)
  }

  async function verzet(lead, iso) {
    setBezig(lead.id)
    const { error } = await supabase.from('leads')
      .update({ next_contact_date: iso, updated_at: new Date().toISOString() })
      .eq('id', lead.id)
    setBezig(null)
    if (error) { toast(error.message || 'Verzetten mislukt', 'error'); return }
    const wanneer = new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    supabase.from('activities').insert({ lead_id: lead.id, user_id: user.id, action: 'status_change', notes: `${reminderLabel(lead.status)} verzet naar ${wanneer} (Te doen)` })
      .then(({ error: e }) => { if (e) console.error('activiteit loggen mislukt:', e) })
    setLeads(prev => prev.filter(l => l.id !== lead.id))
    setVerzetOpen(null)
    toast(`${lead.name || 'Lead'} verzet naar ${wanneer}`, 'success')
  }

  async function straks(lead) {
    const ok = await snooze(lead.id, inHours(1), lead.next_contact_date)
    if (!ok) toast('Kon niet opslaan, probeer opnieuw', 'error')
  }

  if (!user || !profile) return null
  if (VERBORGEN_PADEN.some(p => location.pathname.startsWith(p))) return null
  if (aantal === 0) return null
  // Tijdens het bellen niet in de weg zitten
  if (isWorking) return null

  if (ingeklapt) {
    return (
      <button type="button" className="todo-pill" onClick={() => setIngeklapt(false)} title="Openstaande opvolgingen bekijken">
        <BellRing size={16} /> Te doen <span className="todo-badge">{aantal}</span>
      </button>
    )
  }

  return (
    <div className="todo-panel" role="region" aria-label="Te doen">
      <div className="todo-head">
        <BellRing size={16} />
        <strong>Te doen ({aantal})</strong>
        <span className="todo-sub">Klik elke lead apart weg</span>
        <button type="button" className="todo-icon" onClick={() => setIngeklapt(true)} title="Inklappen" aria-label="Inklappen">
          <ChevronDown size={16} />
        </button>
      </div>
      <div className="todo-list">
        {zichtbaar.map(lead => {
          const tba = lead.status === 'terugbelafspraak'
          const sub = [lead.contact_person, lead.city].filter(Boolean).join(' · ')
          return (
            <div key={lead.id} className={`todo-item${tba ? ' is-tba' : ''}`}>
              <div className="todo-item-top">
                <span className={`todo-kind${tba ? ' is-tba' : ''}`}>{reminderLabel(lead.status)}</span>
                <span className="todo-when"><Clock size={11} /> {relativeDue(lead.next_contact_date, new Date(now))}</span>
              </div>
              <div className="todo-name" title={lead.name || ''}>{lead.name || 'Naam onbekend'}</div>
              {sub && <div className="todo-meta">{sub}</div>}
              {lead.phone && <div className="todo-meta" style={{ fontVariantNumeric: 'tabular-nums' }}>{lead.phone}</div>}
              {verzetOpen === lead.id ? (
                <div className="todo-verzet">
                  <div className="todo-actions">
                    <button type="button" className="lc-btn" disabled={bezig === lead.id} onClick={() => verzet(lead, inHours(1))}>+1 uur</button>
                    <button type="button" className="lc-btn" disabled={bezig === lead.id} onClick={() => verzet(lead, tomorrowAt(10))}>Morgen 10:00</button>
                    <button type="button" className="lc-btn" onClick={() => setVerzetOpen(null)}><ChevronUp size={13} /></button>
                  </div>
                  <div className="todo-actions">
                    <input type="datetime-local" className="form-control" style={{ flex: 1, fontSize: 14, padding: '4px 8px' }} value={eigenTijd} onChange={e => setEigenTijd(e.target.value)} />
                    <button type="button" className="lc-btn" disabled={!eigenTijd || bezig === lead.id} onClick={() => verzet(lead, new Date(eigenTijd).toISOString())}>Zet</button>
                  </div>
                </div>
              ) : (
                <div className="todo-actions">
                  <button type="button" className="lc-btn lc-btn-call" disabled={bezig === lead.id} onClick={() => belNu(lead)}>
                    <Phone size={12} /> Bel nu
                  </button>
                  <button type="button" className="lc-btn" onClick={() => { setVerzetOpen(lead.id); setEigenTijd(toLocalInput(tomorrowAt(10))) }} title="Opvolgdatum verschuiven">
                    <CalendarClock size={13} /> Verzetten
                  </button>
                  <button type="button" className="lc-btn" onClick={() => straks(lead)} title="Over 1 uur komt hij terug in dit lijstje">
                    Straks
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
