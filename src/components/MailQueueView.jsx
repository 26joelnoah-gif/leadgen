import { useState, useEffect, useCallback, useMemo } from 'react'
import { Send, Trash2, Mail, RefreshCw, Inbox, CheckSquare, Square, Clock, AlertTriangle, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { mailTypeLabel, mailSourceLabel } from '../lib/mailSources'
import { nextContactOnOtherDaypart } from '../utils/followUpUtils'
import LoadingSpinner from './LoadingSpinner'
import EmptyState from './EmptyState'

// v78: Mailinglijst op de Leads-pagina. Hier staan de mails die een beller in
// de Mailingservice-popup heeft BEWAARD in plaats van verstuurd
// (public.mail_queue, status 'open'). Versturen gaat per stuk of in een keer,
// altijd via de Edge Function mailingservice met queue_id; die controleert dat
// alleen wie de mail bewaarde (of admin / manager van het project) hem stuurt
// en zet de rij op 'verzonden'. Pas na een gelukte verzending gaat de lead op
// 'mail_verstuurd' met een opvolgdatum, precies zoals bij direct versturen.
// Verwijderen = de mail gaat niet; de lead gaat terug naar 'later_bellen'
// (morgen opnieuw in de wachtrij) als hij nog op 'mail_gepland' stond.
// v83: rijen met send_at gaan vanzelf weg via de Edge Function mailqueue-runner
// (pg_cron, elke 5 min, alleen werkdagen 08:00-18:00). Hier zie je wanneer, en
// je kunt de tijd nog aanpassen. Mislukt het automatisch versturen, dan staat
// de rij op 'fout' met de reden; "Opnieuw" zet hem terug op 'open' (meteen in
// de volgende ronde), "Versturen" stuurt hem direct handmatig.
const dateShort = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
const dateLang = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
function naarLokaal(d) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function MailQueueView({ listId, listIds, mailService, onChanged }) {
  // v80: meerdere lijsten tegelijk (heel project) kan ook
  const idsKey = (listIds && listIds.length ? listIds : (listId ? [listId] : [])).join(',')
  const { user, profile } = useAuth()
  const toast = useToast()
  const isStaff = profile?.role === 'admin' || profile?.role === 'manager'
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState({})
  const [busyIds, setBusyIds] = useState({})
  const [bulkBusy, setBulkBusy] = useState(false)
  const [tijdBewerk, setTijdBewerk] = useState(null) // v83: { id, value }
  const followUpDays = mailService?.follow_up_days || 5

  const load = useCallback(async (silent = false) => {
    if (!idsKey) return
    if (!silent) setLoading(true)
    const { data, error } = await supabase
      .from('mail_queue')
      .select('id, created_at, agent_id, lead_id, mail_type, email, contactpersoon, beller_naam, source, status, send_at, last_error, attempts, agent:profiles!mail_queue_agent_id_fkey(full_name), leads(name, city, status)')
      .in('lead_list_id', idsKey.split(','))
      .in('status', ['open', 'fout'])
      .order('created_at', { ascending: true })
    if (error) console.error('mail_queue laden:', error)
    setRows(data || [])
    setLoading(false)
  }, [idsKey])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!idsKey) return
    const ch = supabase
      .channel(`mailqueue-${idsKey}`.slice(0, 120))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mail_queue', filter: `lead_list_id=in.(${idsKey})` }, () => load(true))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [idsKey, load])

  const magBeheren = useCallback((row) => row.agent_id === user?.id || isStaff, [user?.id, isStaff])
  const mijn = useMemo(() => rows.filter(magBeheren), [rows, magBeheren])
  const gekozen = useMemo(() => mijn.filter(r => selected[r.id]), [mijn, selected])

  function toggle(id) { setSelected(s => ({ ...s, [id]: !s[id] })) }
  function toggleAll() {
    if (gekozen.length === mijn.length) setSelected({})
    else setSelected(Object.fromEntries(mijn.map(r => [r.id, true])))
  }

  function logActiviteit(leadId, notes) {
    if (!user?.id) return
    supabase.from('activities').insert({ lead_id: leadId, user_id: user.id, action: 'status_change', notes })
      .then(({ error }) => { if (error) console.error('activiteit loggen mislukt:', error) })
  }

  // Een bewaarde mail echt versturen. Geeft true bij succes.
  async function verstuur(row, stil = false) {
    setBusyIds(b => ({ ...b, [row.id]: true }))
    try {
      const { data, error: fnError } = await supabase.functions.invoke('mailingservice', { body: { queue_id: row.id } })
      if (fnError) {
        let msg = 'Versturen mislukt'
        try { msg = (await fnError.context?.json())?.error || msg } catch { /* geen json */ }
        throw new Error(msg)
      }
      if (!data?.ok) throw new Error(data?.error || 'Versturen mislukt')
      const next = new Date()
      next.setDate(next.getDate() + (Number(data.follow_up_days) || followUpDays))
      const updates = { status: 'mail_verstuurd', next_contact_date: next.toISOString(), updated_at: new Date().toISOString() }
      if (row.email) updates.email = row.email
      if (row.contactpersoon) updates.contact_person = row.contactpersoon
      const { error: updErr } = await supabase.from('leads').update(updates).eq('id', row.lead_id)
      if (updErr) toast(`Mail naar ${row.email} is verstuurd, maar de status kon niet worden opgeslagen`, 'error')
      logActiviteit(row.lead_id, `Mailingservice (${mailSourceLabel(data.source || row.source)}): ${mailTypeLabel(data.mail_type || row.mail_type).toLowerCase()} verstuurd naar ${row.email} (mailinglijst)`)
      setRows(prev => prev.filter(r => r.id !== row.id))
      setSelected(s => { const n = { ...s }; delete n[row.id]; return n })
      if (!stil) toast(`${mailTypeLabel(row.mail_type)} verstuurd naar ${row.email}`, 'success')
      return true
    } catch (e) {
      if (!stil) toast(e.message || 'Versturen mislukt', 'error', 7000)
      return e.message || 'Versturen mislukt'
    } finally {
      setBusyIds(b => { const n = { ...b }; delete n[row.id]; return n })
    }
  }

  async function verstuurGekozen() {
    if (bulkBusy || gekozen.length === 0) return
    setBulkBusy(true)
    let gelukt = 0
    const fouten = []
    for (const row of gekozen) {
      const r = await verstuur(row, true)
      if (r === true) gelukt++
      else fouten.push(`${row.leads?.name || row.email}: ${r}`)
    }
    setBulkBusy(false)
    if (gelukt) toast(`${gelukt} mail${gelukt === 1 ? '' : 's'} verstuurd`, 'success')
    if (fouten.length) toast(`Niet verstuurd: ${fouten.slice(0, 3).join(' | ')}${fouten.length > 3 ? ` (+${fouten.length - 3})` : ''}`, 'error', 10000)
    onChanged?.()
  }

  // v83: mislukte mail opnieuw laten proberen door de automaat (volgende ronde)
  async function opnieuw(row) {
    if (busyIds[row.id]) return
    setBusyIds(b => ({ ...b, [row.id]: true }))
    const { error } = await supabase.from('mail_queue')
      .update({ status: 'open', send_at: new Date().toISOString(), last_error: null })
      .eq('id', row.id)
    setBusyIds(b => { const n = { ...b }; delete n[row.id]; return n })
    if (error) { toast(error.message || 'Opnieuw plannen mislukt', 'error'); return }
    toast('Mail staat weer klaar, hij gaat in de volgende ronde (binnen werktijd)', 'success')
    load(true)
  }

  // v83: verzendmoment aanpassen (leeg = handmatig)
  async function tijdOpslaan(row, waarde) {
    const d = waarde ? new Date(waarde) : null
    if (d && isNaN(d.getTime())) { toast('Ongeldige tijd', 'error'); return }
    setBusyIds(b => ({ ...b, [row.id]: true }))
    const { error } = await supabase.from('mail_queue')
      .update({ send_at: d ? d.toISOString() : null, ...(row.status === 'fout' ? { status: 'open', last_error: null } : {}) })
      .eq('id', row.id)
    setBusyIds(b => { const n = { ...b }; delete n[row.id]; return n })
    setTijdBewerk(null)
    if (error) { toast(error.message || 'Tijd opslaan mislukt', 'error'); return }
    toast(d ? `Gaat automatisch op ${dateLang(d.toISOString())}` : 'Mail gaat nu alleen nog handmatig', 'success')
    load(true)
  }

  async function verwijder(row) {
    if (busyIds[row.id]) return
    setBusyIds(b => ({ ...b, [row.id]: true }))
    const { error } = await supabase.from('mail_queue').delete().eq('id', row.id)
    if (error) {
      toast(error.message || 'Verwijderen mislukt', 'error')
      setBusyIds(b => { const n = { ...b }; delete n[row.id]; return n })
      return
    }
    // Staat er geen andere open mail meer voor deze lead? Dan terug in de wachtrij.
    const anderen = rows.filter(r => r.lead_id === row.lead_id && r.id !== row.id)
    if (anderen.length === 0 && row.leads?.status === 'mail_gepland') {
      await supabase.from('leads').update({ status: 'later_bellen', next_contact_date: nextContactOnOtherDaypart(1), updated_at: new Date().toISOString() }).eq('id', row.lead_id)
      logActiviteit(row.lead_id, `Mail (${mailTypeLabel(row.mail_type).toLowerCase()}) uit de mailinglijst gehaald, lead terug naar Later bellen`)
    }
    setRows(prev => prev.filter(r => r.id !== row.id))
    setBusyIds(b => { const n = { ...b }; delete n[row.id]; return n })
    toast('Mail uit de mailinglijst gehaald', 'info')
    onChanged?.()
  }

  if (!mailService) return <EmptyState icon={Mail} title="Mailingservice staat uit" message="Voor dit project staat de Mailingservice niet aan." />
  if (loading && rows.length === 0) return <LoadingSpinner />

  return (
    <div>
      <div className="flex items-center mb-3" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="text-muted" style={{ fontSize: '0.85rem' }}>
          <Mail size={13} style={{ verticalAlign: -2 }} /> {rows.length} mail{rows.length === 1 ? '' : 's'} klaar om te versturen via {mailSourceLabel(mailService.source)}
          {rows.length !== mijn.length && ` (${mijn.length} van jou)`}
        </span>
        <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => load()} disabled={loading}><RefreshCw size={14} /> Verversen</button>
          {mijn.length > 0 && (
            <button type="button" className="btn btn-sm btn-outline" onClick={toggleAll}>
              {gekozen.length === mijn.length ? <CheckSquare size={14} /> : <Square size={14} />} {gekozen.length === mijn.length ? 'Niets kiezen' : 'Alles kiezen'}
            </button>
          )}
          <button type="button" className="btn btn-sm btn-primary" onClick={verstuurGekozen} disabled={bulkBusy || gekozen.length === 0}>
            <Send size={14} /> {bulkBusy ? 'Bezig...' : `${gekozen.length || ''} ${gekozen.length === 1 ? 'mail' : 'mails'} versturen`.trim()}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Inbox} title="Mailinglijst is leeg" message='Kies in de Mailingservice-popup "Bewaren in mailinglijst" om een mail hier klaar te zetten.' />
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {rows.map(row => {
            const mag = magBeheren(row)
            const busy = !!busyIds[row.id]
            return (
              <div key={row.id} className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', opacity: busy ? 0.6 : 1 }}>
                <button type="button" onClick={() => mag && toggle(row.id)} disabled={!mag || busy} aria-label="Kiezen" style={{ background: 'transparent', border: 'none', color: mag ? 'var(--text-primary)' : 'var(--text-muted)', cursor: mag ? 'pointer' : 'not-allowed', padding: 0 }}>
                  {selected[row.id] ? <CheckSquare size={18} /> : <Square size={18} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.leads?.name || 'Lead'}{row.leads?.city ? <span className="text-muted" style={{ fontWeight: 400 }}> - {row.leads.city}</span> : null}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <strong style={{ color: 'var(--info)' }}>{mailTypeLabel(row.mail_type)}</strong> naar {row.email}
                    {row.contactpersoon ? ` (t.a.v. ${row.contactpersoon})` : ''}
                    {row.beller_naam ? ` - groet van ${row.beller_naam}` : ''}
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                    Bewaard door {row.agent?.full_name || 'collega'} op {dateShort(row.created_at)}
                    {!mag && ' - alleen die persoon (of een manager) kan hem versturen'}
                  </div>
                  {/* v83: automatisch of handmatig, en fouten */}
                  {row.status === 'fout' ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={12} /> Automatisch versturen mislukt: {row.last_error || 'onbekende fout'}
                    </div>
                  ) : row.send_at ? (
                    <div style={{ fontSize: '0.75rem', color: 'var(--info)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> Gaat automatisch op {dateLang(row.send_at)}{new Date(row.send_at) <= new Date() ? ' (wacht op werktijd)' : ''}
                    </div>
                  ) : (
                    <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: 2 }}>Handmatig versturen</div>
                  )}
                  {tijdBewerk?.id === row.id && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      <input type="datetime-local" value={tijdBewerk.value} min={naarLokaal(new Date())} onChange={e => setTijdBewerk({ id: row.id, value: e.target.value })}
                        style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => tijdOpslaan(row, tijdBewerk.value)} disabled={busy}>Opslaan</button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => tijdOpslaan(row, '')} disabled={busy} title="Niet automatisch, alleen handmatig">Handmatig</button>
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => setTijdBewerk(null)}>Annuleren</button>
                    </div>
                  )}
                </div>
                {mag && (
                  <div className="flex gap-1">
                    {row.status === 'fout' && (
                      <button type="button" className="btn btn-sm btn-outline" onClick={() => opnieuw(row)} disabled={busy || bulkBusy} title="Automatisch opnieuw proberen">
                        <RotateCcw size={12} /> Opnieuw
                      </button>
                    )}
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => setTijdBewerk(tijdBewerk?.id === row.id ? null : { id: row.id, value: naarLokaal(row.send_at ? new Date(row.send_at) : new Date(Date.now() + 3600_000)) })} disabled={busy || bulkBusy} title="Verzendmoment aanpassen">
                      <Clock size={12} />
                    </button>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => verstuur(row)} disabled={busy || bulkBusy} title="Nu versturen">
                      <Send size={12} /> Versturen
                    </button>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => verwijder(row)} disabled={busy || bulkBusy} title="Uit de mailinglijst halen (niet versturen)">
                      <Trash2 size={12} />
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
