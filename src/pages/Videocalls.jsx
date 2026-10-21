// v152 (21-10-2026): overzicht van alle ingeplande videocalls (afspraaksoort
// 'videocall', 30 minuten). Zelfde bron als de agenda: leads met een
// appointment_at in projecten met appointment_scheduling_enabled, maar dan als
// lijst per dag, over alle accountmanagers heen. Klik = AppointmentModal
// (bellen, afboeken, verplaatsen), net als in de agenda.
// Toegang: zelfde regel als de agenda (AgendaGate in App.jsx), plus managers.
// Goedkeuren: elke videocall staat op "Te keuren" (leads.appointment_approved
// null) tot een admin of een manager van DAT project hem goed- of afkeurt.
// De database bewaakt dat al (trigger leads_commissie_guard, v110).
// Meet-link: leads.appointment_meet_link (alleen https), in te vullen door
// admin, manager of de accountmanager van de afspraak.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Video, RefreshCw, Filter, Phone, Check, X, Link2, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { afspraakStand, sentimentInfo } from '../lib/appointments'
import Header from '../components/Header'
import PersonSelect from '../components/PersonSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import AppointmentModal from '../components/AppointmentModal'
import { useToast } from '../components/Toast'

const WEERGAVEN = [
  { id: 'keuren', label: 'Te keuren' },
  { id: 'komend', label: 'Komend' },
  { id: 'vandaag', label: 'Vandaag' },
  { id: 'week', label: 'Deze week' },
  { id: 'geweest', label: 'Geweest' },
  { id: 'alles', label: 'Alles' },
]

function startVanDag(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

function bereik(id) {
  const nu = new Date()
  const vandaag = startVanDag(nu)
  if (id === 'komend') return { van: nu, tot: null, oplopend: true }
  if (id === 'vandaag') return { van: vandaag, tot: new Date(vandaag.getTime() + 864e5), oplopend: true }
  if (id === 'week') {
    const dag = (vandaag.getDay() + 6) % 7 // maandag = 0
    const ma = new Date(vandaag.getTime() - dag * 864e5)
    return { van: ma, tot: new Date(ma.getTime() + 7 * 864e5), oplopend: true }
  }
  if (id === 'keuren') return { van: null, tot: null, oplopend: true, keuren: true }
  if (id === 'geweest') return { van: null, tot: nu, oplopend: false }
  return { van: null, tot: null, oplopend: false }
}

function dagKop(iso) {
  const d = new Date(iso)
  const vandaag = startVanDag(new Date())
  const verschil = Math.round((startVanDag(d) - vandaag) / 864e5)
  const datum = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  if (verschil === 0) return `Vandaag, ${datum}`
  if (verschil === 1) return `Morgen, ${datum}`
  if (verschil === -1) return `Gisteren, ${datum}`
  return datum.charAt(0).toUpperCase() + datum.slice(1)
}

export function keuringInfo(l) {
  if (l?.appointment_approved === true) return { label: 'Goedgekeurd', color: '#10B981' }
  if (l?.appointment_approved === false) return { label: 'Afgekeurd', color: '#EF4444' }
  return { label: 'Te keuren', color: '#F59E0B' }
}

export function geldigeMeetLink(v) {
  const t = String(v || '').trim()
  return /^https:\/\/\S+$/i.test(t) && t.length <= 500 ? t : null
}

function tijd(iso) {
  const d = new Date(iso)
  const eind = new Date(d.getTime() + 30 * 60000)
  const f = x => x.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${f(d)} - ${f(eind)}`
}

export default function Videocalls() {
  const { user, profile } = useAuth()
  const toast = useToast()
  const isAdmin = profile?.role === 'admin'
  const canManage = isAdmin || profile?.role === 'manager'

  const [weergave, setWeergave] = useState(canManage ? 'keuren' : 'komend')
  const [beheerdeProjecten, setBeheerdeProjecten] = useState(new Set())
  const [teKeurenAantal, setTeKeurenAantal] = useState(0)
  const [linkBewerk, setLinkBewerk] = useState(null) // { id, waarde }
  const [bezig, setBezig] = useState(null)
  const [amId, setAmId] = useState('all')
  const [accountmanagers, setAccountmanagers] = useState([])
  const [calls, setCalls] = useState([])
  const [namen, setNamen] = useState({})
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState(null)
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase.from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['accountmanager', 'admin'])
      .is('deleted_at', null)
      .order('full_name')
      .then(({ data }) => setAccountmanagers(data || []))
  }, [])

  // Welke projecten beheer ik als manager? Daar mag ik keuren.
  useEffect(() => {
    if (profile?.role !== 'manager' || !user?.id) return
    supabase.from('campaign_managers').select('campaign_id').eq('manager_id', user.id)
      .then(({ data }) => setBeheerdeProjecten(new Set((data || []).map(r => r.campaign_id))))
  }, [profile?.role, user?.id])

  const magKeuren = useCallback(
    (l) => isAdmin || beheerdeProjecten.has(l?.lead_lists?.campaign_id),
    [isAdmin, beheerdeProjecten]
  )
  const magLinkZetten = useCallback(
    (l) => magKeuren(l) || (l?.assigned_to && l.assigned_to === user?.id),
    [magKeuren, user?.id]
  )

  const laad = useCallback(async () => {
    setLaden(true)
    setFout(null)
    try {
      const { van, tot, oplopend, keuren } = bereik(weergave)
      let q = supabase
        .from('leads')
        .select(`
          id, name, contact_person, phone, email, status, appointment_at, notes,
          assigned_to, lead_list_id, sale_date,
          address, house_number, postal_code, city,
          appointment_sentiment, appointment_outcome, appointment_outcome_at,
          appointment_by, appointment_commission, appointment_type,
          appointment_approved, appointment_approved_at, appointment_approved_by, appointment_meet_link,
          lead_lists!inner(id, name, campaign_id, campaigns!inner(id, name, appointment_scheduling_enabled))
        `)
        .eq('appointment_type', 'videocall')
        .in('status', ['afspraak_gemaakt', 'deal'])
        .eq('lead_lists.campaigns.appointment_scheduling_enabled', true)
        .not('appointment_at', 'is', null)
        .is('deleted_at', null)
        .order('appointment_at', { ascending: oplopend })
        .limit(500)
      if (van) q = q.gte('appointment_at', van.toISOString())
      if (tot) q = q.lt('appointment_at', tot.toISOString())
      if (amId !== 'all') q = q.eq('assigned_to', amId)
      if (keuren) q = q.is('appointment_approved', null)
      const { data, error } = await q
      if (error) throw error
      const rijen = data || []
      setCalls(rijen)
      // Teller voor het tabblad "Te keuren" (los van de gekozen weergave)
      if (keuren) setTeKeurenAantal(rijen.length)
      else {
        let tq = supabase.from('leads')
          .select('id, lead_lists!inner(campaigns!inner(appointment_scheduling_enabled))', { count: 'exact', head: true })
          .eq('appointment_type', 'videocall')
          .in('status', ['afspraak_gemaakt', 'deal'])
          .eq('lead_lists.campaigns.appointment_scheduling_enabled', true)
          .is('appointment_approved', null)
          .is('deleted_at', null)
        if (amId !== 'all') tq = tq.eq('assigned_to', amId)
        const { count } = await tq
        setTeKeurenAantal(count || 0)
      }
      const ids = [...new Set(rijen.flatMap(l => [l.assigned_to, l.appointment_by, l.appointment_approved_by]).filter(Boolean))]
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        const map = {}
        ;(profs || []).forEach(p => { map[p.id] = p.full_name })
        setNamen(map)
      } else setNamen({})
    } catch (err) {
      setFout(err.message || 'Videocalls laden mislukt')
    } finally {
      setLaden(false)
    }
  }, [weergave, amId])

  useEffect(() => { laad() }, [laad])

  // Live bijwerken: een nieuwe of verplaatste afspraak komt vanzelf binnen
  useEffect(() => {
    let t = null
    const kanaal = supabase
      .channel('videocalls-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (p) => {
        const r = p.new || {}
        const o = p.old || {}
        if (r.appointment_type !== 'videocall' && o.appointment_type !== 'videocall') return
        clearTimeout(t)
        t = setTimeout(laad, 1200)
      })
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(kanaal) }
  }, [laad])

  function werkBij(id, updates) {
    setCalls(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  async function keur(l, goed) {
    if (bezig) return
    setBezig(l.id)
    const updates = {
      appointment_approved: goed,
      appointment_approved_at: new Date().toISOString(),
      appointment_approved_by: user?.id || null,
    }
    const { error } = await supabase.from('leads').update(updates).eq('id', l.id)
    setBezig(null)
    if (error) { toast(`Niet opgeslagen: ${error.message}`, 'error'); return }
    toast(goed ? 'Videocall goedgekeurd' : 'Videocall afgekeurd', 'success')
    if (user?.id) setNamen(prev => ({ ...prev, [user.id]: profile?.full_name || prev[user.id] }))
    if (weergave === 'keuren') {
      setCalls(prev => prev.filter(c => c.id !== l.id))
    } else werkBij(l.id, updates)
    if (l.appointment_approved == null) setTeKeurenAantal(n => Math.max(0, n - 1))
  }

  async function bewaarLink(l) {
    const ruw = (linkBewerk?.waarde || '').trim()
    const link = ruw ? geldigeMeetLink(ruw) : null
    if (ruw && !link) { toast('Plak een volledige link die begint met https://', 'error'); return }
    setBezig(l.id)
    const { error } = await supabase.from('leads').update({ appointment_meet_link: link, appointment_at: l.appointment_at }).eq('id', l.id) // appointment_at mee = Google Agenda werkt bij
    setBezig(null)
    if (error) { toast(`Link niet opgeslagen: ${error.message}`, 'error'); return }
    werkBij(l.id, { appointment_meet_link: link })
    setLinkBewerk(null)
    toast(link ? 'Meeting-link opgeslagen' : 'Meeting-link verwijderd', 'success')
  }

  const perDag = useMemo(() => {
    const groepen = []
    let huidig = null
    calls.forEach(l => {
      const sleutel = startVanDag(l.appointment_at).toISOString()
      if (!huidig || huidig.sleutel !== sleutel) {
        huidig = { sleutel, kop: dagKop(l.appointment_at), items: [] }
        groepen.push(huidig)
      }
      huidig.items.push(l)
    })
    return groepen
  }, [calls])

  const vandaagAantal = useMemo(() => {
    const v = startVanDag(new Date()).getTime()
    return calls.filter(l => startVanDag(l.appointment_at).getTime() === v).length
  }, [calls])

  return (
    <>
      <Header />
      <main className="container pb-12" style={{ maxWidth: '1100px' }}>
        <div className="flex justify-between items-center mb-4 pt-4" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="page-title flex items-center gap-2" style={{ margin: 0 }}>
              <Video size={26} className="text-primary" /> Videocalls
            </h1>
            <p className="page-subtitle text-xs" style={{ margin: '4px 0 0' }}>
              Alle ingeplande videocalls van 30 minuten, van alle accountmanagers.
            </p>
          </div>
          <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
            {accountmanagers.length > 0 && (
              <div className="flex items-center gap-2 bg-elevated px-3 py-1.5 rounded-lg border border-border">
                <Filter size={14} className="text-muted" />
                <PersonSelect
                  people={accountmanagers}
                  value={amId}
                  onChange={id => setAmId(id || 'all')}
                  extraOptions={[{ value: 'all', label: 'Alle accountmanagers' }]}
                  className="form-dark text-xs"
                  style={{ padding: '2px 6px', border: 'none', background: 'transparent', minWidth: 190 }}
                />
              </div>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={laad} disabled={laden}>
              <RefreshCw size={14} /> Verversen
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-4 items-center" style={{ flexWrap: 'wrap' }}>
          {WEERGAVEN.map(w => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWeergave(w.id)}
              className={weergave === w.id ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
            >
              {w.label}{w.id === 'keuren' && teKeurenAantal > 0 ? ` (${teKeurenAantal})` : ''}
            </button>
          ))}
          {!laden && (
            <span className="text-xs text-muted" style={{ marginLeft: 6 }}>
              {calls.length} videocall{calls.length === 1 ? '' : 's'}
              {weergave !== 'vandaag' && weergave !== 'geweest' && vandaagAantal > 0 ? ` · ${vandaagAantal} vandaag` : ''}
            </span>
          )}
        </div>

        {fout && (
          <div className="card" style={{ padding: '12px 14px', color: 'var(--error)', marginBottom: 12 }}>{fout}</div>
        )}

        {laden ? (
          <LoadingSpinner />
        ) : calls.length === 0 ? (
          <EmptyState
            icon={Video}
            title="Geen videocalls"
            message={weergave === 'keuren' ? 'Er staan geen videocalls meer klaar om goed te keuren.' : "Kies bij 'Afspraak gemaakt' de soort Videocall, dan staat hij hier."}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {perDag.map(g => (
              <section key={g.sleutel}>
                <h2 style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                  {g.kop} <span style={{ fontWeight: 600 }}>({g.items.length})</span>
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {g.items.map(l => {
                    const stand = afspraakStand(l)
                    const sent = sentimentInfo(l.appointment_sentiment)
                    const keuring = keuringInfo(l)
                    const bewerkt = linkBewerk?.id === l.id
                    return (
                      <div
                        key={l.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setOpen(l)}
                        onKeyDown={e => { if (e.key === 'Enter' && e.target === e.currentTarget) setOpen(l) }}
                        className="card"
                        style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', textAlign: 'left', cursor: 'pointer', width: '100%' }}
                      >
                        <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--primary)', minWidth: 104 }}>
                          {tijd(l.appointment_at)}
                        </div>
                        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                          <div style={{ fontWeight: 800, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{l.name}</div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2, overflowWrap: 'anywhere' }}>
                            {[l.contact_person, l.city, l.lead_lists?.campaigns?.name].filter(Boolean).join(' · ')}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Accountmanager: {namen[l.assigned_to] || 'nog niemand'}
                            {l.appointment_by ? ` · ingepland door ${namen[l.appointment_by] || 'onbekend'}` : ''}
                            {l.appointment_approved != null && l.appointment_approved_by ? ` · ${l.appointment_approved ? 'goedgekeurd' : 'afgekeurd'} door ${namen[l.appointment_approved_by] || 'beheer'}` : ''}
                          </div>
                          {/* Meeting-link */}
                          <div onClick={e => e.stopPropagation()} style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {bewerkt ? (
                              <>
                                <input
                                  autoFocus
                                  className="form-dark text-xs"
                                  style={{ flex: '1 1 220px', minWidth: 0, padding: '5px 8px' }}
                                  placeholder="https://meet.google.com/..."
                                  value={linkBewerk.waarde}
                                  onChange={e => setLinkBewerk({ id: l.id, waarde: e.target.value })}
                                  onKeyDown={e => { if (e.key === 'Enter') bewaarLink(l); if (e.key === 'Escape') setLinkBewerk(null) }}
                                />
                                <button type="button" className="btn btn-primary btn-sm" disabled={bezig === l.id} onClick={() => bewaarLink(l)}>Opslaan</button>
                                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkBewerk(null)}>Annuleren</button>
                                <a href="https://meet.google.com/new" target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" title="Maak een nieuwe Google Meet en plak de link hier">
                                  <ExternalLink size={13} /> Nieuwe Meet maken
                                </a>
                              </>
                            ) : l.appointment_meet_link ? (
                              <>
                                <a href={l.appointment_meet_link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                                  <Video size={13} /> Meeting openen
                                </a>
                                {magLinkZetten(l) && (
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLinkBewerk({ id: l.id, waarde: l.appointment_meet_link })}>Link wijzigen</button>
                                )}
                              </>
                            ) : magLinkZetten(l) ? (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => setLinkBewerk({ id: l.id, waarde: '' })}>
                                <Link2 size={13} /> Meeting-link toevoegen
                              </button>
                            ) : (
                              <span className="text-[11px] text-muted">Nog geen meeting-link</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          {l.phone && (
                            <a href={`tel:${l.phone}`} onClick={e => e.stopPropagation()} className="btn btn-ghost btn-sm" title="Bellen">
                              <Phone size={14} /> {l.phone}
                            </a>
                          )}
                          {sent && (
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: 6, color: sent.color, background: `${sent.color}22` }}>
                              {sent.emoji} {sent.label}
                            </span>
                          )}
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: 6, color: keuring.color, background: `${keuring.color}22` }}>
                            {keuring.label}
                          </span>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: 6, color: '#fff', background: stand.color }}>
                            {stand.label}
                          </span>
                          {magKeuren(l) && l.appointment_approved !== true && (
                            <button type="button" className="btn btn-primary btn-sm" disabled={bezig === l.id}
                              onClick={e => { e.stopPropagation(); keur(l, true) }}>
                              <Check size={14} /> Goedkeuren
                            </button>
                          )}
                          {magKeuren(l) && l.appointment_approved !== false && (
                            <button type="button" className="btn btn-ghost btn-sm" disabled={bezig === l.id}
                              onClick={e => { e.stopPropagation(); keur(l, false) }}
                              title="Afkeuren: de afspraak telt niet mee voor de uitbetaling">
                              <X size={14} /> Afkeuren
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        )}

        {open && (
          <AppointmentModal
            lead={open}
            accountmanagers={accountmanagers}
            canManage={canManage}
            onClose={() => setOpen(null)}
            onChanged={(id, updates, opts) => {
              if (opts?.removed) { setOpen(null); setCalls(prev => prev.filter(c => c.id !== id)); return }
              werkBij(id, updates)
              setOpen(prev => prev && prev.id === id ? { ...prev, ...updates } : prev)
            }}
          />
        )}
      </main>
    </>
  )
}
