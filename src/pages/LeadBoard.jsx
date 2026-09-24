import { useState, useEffect, useMemo, useCallback } from 'react'
import { Phone, MapPin, Lock, Search, RefreshCw, User, Inbox, Navigation, List, Map as MapIcon, Compass, LayoutGrid, Mail, Clock, X, ListChecks, Flame, Info, Trash2, CalendarDays } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLeadLists } from '../hooks/useLeadLists'
import { useGeolocation } from '../hooks/useGeolocation'
import { useProjectMailService } from '../hooks/useProjectMailService'
import { useToast } from '../components/Toast'
import { getStatusDetails } from '../utils/statusUtils'
import { distanceM, formatDistance, distanceBand } from '../utils/geoUtils'
import { nextContactOnOtherDaypart, isFollowUpDue, daysSince } from '../utils/followUpUtils'
import { SALES_BOARD_COLUMNS, BOARD_CLOSED_STATUSES, boardColumnFor } from '../lib/leadBoard'
import { APPOINTMENT_DURATION_MINUTES } from '../lib/appointmentConfig'
import { SENTIMENTS } from '../lib/appointments'
import { mailSourceLabel, mailTypeLabel } from '../lib/mailSources'
import { stopMailsVoorLead } from '../lib/mailStop'
import { MAIL_STATUS } from '../components/MailStatus'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import LeadMap from '../components/LeadMap'
import LeadKanban from '../components/LeadKanban'
import MailingserviceModal from '../components/MailingserviceModal'
import MailQueueView from '../components/MailQueueView'
import LeadDetailModal from '../components/LeadDetailModal'
import { leadBelstatus, BELSTATUS, useProjectCompliance, urenTotWissen, rechtsvormLabel } from '../lib/compliance'
import PersonSelect from '../components/PersonSelect' // v102

// v62: gedeelde Leadlijst. Iedereen die in een project zit (team, manager,
// planning-account met projectvlag) ziet ALLE leads van de gekozen lijst en
// kiest zelf welke hij oppakt. Klik = RPC claim_lead: de lead wordt 10 min
// vergrendeld en gaat open in het belscherm (WorkInterface, single-lead-modus).
//
// v64 (Outside, stap 1): "Locatie aan" geeft elke lead een afstand, dichtbij
// eerst, plus een kaartweergave (LeadMap).
//
// v72: bordweergave. Staat campaigns.board_view_enabled aan voor het project van
// deze lijst, dan kan dezelfde lijst ook als kanban getoond worden - hetzelfde
// idee als het sollicitantenbord van de recruiter (v36b). Kolommen zijn groepjes
// van bestaande statussen (src/lib/leadBoard.js), plus een kolom "Mail
// verstuurd": daarheen slepen opent de Mailingservice (v69/v70), dus mailen
// blijft handmatig op het moment dat jij kiest. De kaarten tonen zelf wanneer er
// iets moet gebeuren ("Opvolgen", "x dagen niets mee gedaan") en het bord werkt
// live bij via realtime op leads en lead_mail_status.
// v75: een lead blijft van degene die hem pakt totdat hij hem afboekt of het
// belscherm sluit; het slot verloopt dus niet meer vanzelf na 10 minuten. Een
// collega kan hem wel OVERNEMEN (claim_lead met p_force), en dan krijgen
// allebei een melding (tabel notifications, belletje in de header).
// v78: weergave "Mailinglijst": mails die in de Mailingservice-popup zijn
// bewaard (mail_queue) en later per stuk of in een keer verstuurd worden.
// Zie MailQueueView. De lead staat intussen op 'mail_gepland'.
// v82: warme leads. Meldt de bron dat een bureau op de link klikte of de
// offerte opende (lead_mail_status rang 2 of 3) en is de lead nog open, dan
// staat hij BOVENAAN (lijst, bord-kolom en kaart), krijgt een vlammetje en er
// is een filter "Warm". De eigenaar krijgt op dat moment ook een melding
// (Edge Function mailstatus schrijft in notifications).
const POLL_MS = 8000
const DONE_STATUSES = ['deal', 'bruto_deal', 'afspraak_gemaakt', 'geen_interesse', 'verkeerd_nummer', 'cold', 'blacklist', 'monteur_ingepland', 'wil_annuleren']

// v98: bureau vroeg via de mail "mail me later" (mailstatus later_mailen)
const isMailPauze = (l) => !!l?.mail_pauze_tot && new Date(l.mail_pauze_tot) > new Date()

const dateShort = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''

function defaultTbaDateTimeLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

function Chip({ label, color, bg, title }) {
  return (
    <span title={title} style={{
      display: 'inline-block', padding: '0px 6px', borderRadius: 6, fontSize: '0.58rem', fontWeight: 800,
      color, background: bg, whiteSpace: 'nowrap', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis'
    }}>{label}</span>
  )
}

// v97: bij een afspraak zijn contactpersoon, adres, plaats en sentiment verplicht
function afspraakPromptCompleet(p) {
  return !!(p && (p.contact_person || '').trim() && (p.address || '').trim() && (p.city || '').trim() && p.sentiment)
}

export default function LeadBoard() {
  const { user, profile, isWorking, toggleWorkingMode } = useAuth()
  const { leadLists, loading: listsLoading } = useLeadLists()
  const toast = useToast()
  const geo = useGeolocation()
  const isStaff = profile?.role === 'admin' || profile?.role === 'manager'
  // v93: verwijderknop (afvalbak) op de kaart alleen voor admin/manager, niet voor
  // bellers met can_manage_leads (dat recht geldt alleen voor importeren, niet verwijderen)

  // Alleen bel-/acquisitielijsten; sollicitanten horen op de wervingspagina
  const lists = useMemo(
    () => (leadLists || []).filter(l => l.campaigns?.type !== 'recruitment'),
    [leadLists]
  )
  // v80: eerst een project kiezen, daarna een lijst of "Alle lijsten". Met
  // "Alle lijsten" staan alle leads van het project samen op het bord.
  const projects = useMemo(() => {
    const map = new Map()
    lists.forEach(l => {
      const key = l.campaign_id || 'geen'
      if (!map.has(key)) map.set(key, { id: key, name: l.campaigns?.name || 'Zonder project', lists: [] })
      map.get(key).lists.push(l)
    })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [lists])
  const [projectId, setProjectId] = useState(() => {
    try { return localStorage.getItem('leadgen-leads-project') || null } catch { return null }
  })
  const [listChoice, setListChoice] = useState(() => {
    try { return localStorage.getItem('leadgen-leads-list') || 'all' } catch { return 'all' }
  })
  const currentProject = useMemo(() => projects.find(p => p.id === projectId) || null, [projects, projectId])
  useEffect(() => {
    if (projects.length > 0 && !currentProject) setProjectId(projects[0].id)
  }, [projects, currentProject])
  useEffect(() => {
    if (currentProject && listChoice !== 'all' && !currentProject.lists.some(l => l.id === listChoice)) setListChoice('all')
  }, [currentProject, listChoice])
  useEffect(() => {
    try {
      if (projectId) localStorage.setItem('leadgen-leads-project', projectId)
      localStorage.setItem('leadgen-leads-list', listChoice)
    } catch { /* privemodus */ }
  }, [projectId, listChoice])

  const projectLists = currentProject?.lists || []
  const allLists = listChoice === 'all' || !projectLists.some(l => l.id === listChoice)
  const listIdsKey = (allLists ? projectLists.map(l => l.id) : [listChoice]).join(',')
  const listIds = useMemo(() => (listIdsKey ? listIdsKey.split(',') : []), [listIdsKey])
  // listId = de lijst waar projectinstellingen (bord aan, mailservice) uit komen
  const listId = listIds[0] || null
  const listNames = useMemo(() => Object.fromEntries(lists.map(l => [l.id, l.name])), [lists])

  const currentList = useMemo(() => lists.find(l => l.id === listId) || null, [lists, listId])
  const boardEnabled = currentList?.campaigns?.board_view_enabled === true
  // v91: projecten met appointment_scheduling_enabled vragen bij de kolom
  // "Afspraak / offerte" ook een datum/tijd (leads.appointment_at), net als
  // de terugbel-kolom dat al doet voor next_contact_date. Zo heeft de
  // accountmanager een agenda in plaats van alleen een statuskolom.
  const appointmentSchedulingEnabled = currentList?.campaigns?.appointment_scheduling_enabled === true
  const boardColumns = useMemo(() => {
    if (!appointmentSchedulingEnabled) return SALES_BOARD_COLUMNS
    return SALES_BOARD_COLUMNS.map(c => c.id === 'offerte'
      ? {
          ...c, label: 'Afspraak (agenda)', needsDate: true, dateField: 'appointment_at',
          dateTitle: 'Afspraak inplannen', dateLabel: 'Wanneer is de afspraak?', dateButton: 'Afspraak inplannen'
        }
      : c)
  }, [appointmentSchedulingEnabled])
  const { mailService } = useProjectMailService(listId)
  const followUpDays = mailService?.follow_up_days || 5
  // v98: compliance. Belstatus per lead (zelfde regel als claim_next_lead) +
  // lijst "Afgemeld": zelf verwijderen, anders gaat het na 48 uur vanzelf.
  const complianceProject = useProjectCompliance(listId)
  const belstatusVan = useCallback((l) => leadBelstatus(l, complianceProject || null), [complianceProject])
  const [wisBevestig, setWisBevestig] = useState(false)
  const [wissen, setWissen] = useState(false)

  const [leads, setLeads] = useState([])
  const [lockNames, setLockNames] = useState({})
  const [assignedNames, setAssignedNames] = useState({})
  const [mailRows, setMailRows] = useState({})
  const [mailTick, setMailTick] = useState(0)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [claimingId, setClaimingId] = useState(null)
  const [view, setView] = useState(() => {
    try {
      const saved = localStorage.getItem('leadgen-leads-view')
      return ['map', 'board', 'list', 'mail'].includes(saved) ? saved : 'list'
    } catch { return 'list' }
  })
  const [sortBy, setSortBy] = useState('distance') // 'distance' | 'order'
  const [geocoding, setGeocoding] = useState(false)
  const [mailLead, setMailLead] = useState(null)
  // v90: contactkaart apart van bellen kunnen openen - tot nu toe deed elke
  // klik op een lead meteen claim_lead + belscherm open. Zo kon je een lead
  // (bv. een "Bel mij terug"-verzoek) niet even rustig bekijken zonder hem
  // meteen te claimen.
  const [detailLead, setDetailLead] = useState(null)
  const [datePrompt, setDatePrompt] = useState(null)
  const [moving, setMoving] = useState(false)
  const [takeover, setTakeover] = useState(null)
  // v92: klik-nogmaals-bevestiging voor de verwijderknop op een kaart, per lead-id
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  // v75: admin/manager kan het bord per persoon bekijken ('all' | 'me' | profiel-id)
  const [wie, setWie] = useState('all')
  const [mensen, setMensen] = useState([])
  useEffect(() => { try { localStorage.setItem('leadgen-leads-view', view) } catch { /* privemodus */ } }, [view])
  // Bordweergave uit voor dit project? Dan terug naar de lijst.
  useEffect(() => { if (view === 'board' && listId && !boardEnabled) setView('list') }, [view, listId, boardEnabled])

  const load = useCallback(async (silent = false) => {
    if (listIds.length === 0) return
    if (!silent) setLoading(true)
    const [{ data: rows, error }, ...lockResults] = await Promise.all([
      supabase.from('leads')
        .select('id, lead_list_id, name, phone, email, website, city, address, house_number, contact_person, lead_source, status, locked_by, locked_at, assigned_to, next_contact_date, contact_attempts, created_at, updated_at, lat, lng, rechtsvorm, rechtsvorm_bron, opt_in_at, opt_in_bewijs, afgemeld_at, afgemeld_bron, mail_pauze_tot')
        .in('lead_list_id', listIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true }),
      ...listIds.map(id => supabase.rpc('lead_lock_names', { p_list_id: id }))
    ])
    const locks = lockResults.flatMap(r => r.data || [])
    if (error) console.error('LeadBoard load:', error)
    setLeads(rows || [])
    const map = {}
    ;(locks || []).forEach(r => { map[r.lead_id] = r.full_name })
    setLockNames(map)
    // Naam van de eigenaar op elke kaart: locked_by komt uit lead_lock_names,
    // assigned_to (toegewezen zonder dat iemand hem gepakt heeft) via profiles.
    const assignedIds = [...new Set((rows || []).filter(l => l.assigned_to && !map[l.id]).map(l => l.assigned_to))]
    if (assignedIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', assignedIds)
      const byId = {}
      ;(profs || []).forEach(p => { byId[p.id] = p.full_name })
      setAssignedNames(byId)
    } else {
      setAssignedNames({})
    }
    setLoading(false)
  }, [listIds])

  // Eerste keer + elke 8s verversen, en direct opnieuw zodra het belscherm sluit
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!listId) return
    const t = setInterval(() => { if (!document.hidden) load(true) }, POLL_MS)
    return () => clearInterval(t)
  }, [listId, load])
  useEffect(() => { if (!isWorking) load(true) }, [isWorking]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (geo.error) toast(geo.error, 'error') }, [geo.error]) // eslint-disable-line react-hooks/exhaustive-deps

  // v72: live meekijken. leads en lead_mail_status zitten allebei al in
  // supabase_realtime (v63/v70); de poll hierboven blijft als vangnet staan.
  useEffect(() => {
    if (!listId) return
    const ch = supabase
      .channel(`leadboard-${listIdsKey}`.slice(0, 120))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `lead_list_id=in.(${listIdsKey})` }, () => load(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_mail_status' }, () => setMailTick(t => t + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [listId, listIdsKey, load])

  // v72: hoe ver komt een gemailde lead bij de bron (v70)? Per lead de hoogste stap.
  const leadIdsKey = useMemo(() => leads.map(l => l.id).join(','), [leads])
  useEffect(() => {
    let alive = true
    const ids = leadIdsKey ? leadIdsKey.split(',') : []
    if (!mailService || ids.length === 0) { setMailRows({}); return }
    supabase.from('lead_mail_status')
      .select('lead_id, source, mail_soort, status, status_rank, status_op, gemaild_op, offerte_url')
      .in('lead_id', ids)
      .then(({ data }) => {
        if (!alive) return
        const map = {}
        ;(data || []).forEach(r => {
          const cur = map[r.lead_id]
          if (!cur || (r.status_rank || 0) >= (cur.status_rank || 0)) map[r.lead_id] = r
        })
        setMailRows(map)
      })
    return () => { alive = false }
  }, [leadIdsKey, mailTick, mailService])

  // v75: wie zitten er op dit project? (teams van de campagne + de managers)
  // Alleen admin/manager heeft dit nodig, voor de keuzelijst "Wie".
  useEffect(() => {
    let alive = true
    const campaignId = currentList?.campaign_id
    if (!isStaff || !campaignId) { setMensen([]); return }
    ;(async () => {
      const [{ data: teams }, { data: mgrs }] = await Promise.all([
        supabase.from('campaign_teams').select('team_id').eq('campaign_id', campaignId),
        supabase.from('campaign_managers').select('manager_id').eq('campaign_id', campaignId),
      ])
      const teamIds = (teams || []).map(t => t.team_id)
      let ids = (mgrs || []).map(m => m.manager_id)
      if (teamIds.length) {
        const { data: leden } = await supabase.from('team_members').select('profile_id').in('team_id', teamIds)
        ids = ids.concat((leden || []).map(l => l.profile_id))
      }
      ids = [...new Set(ids.filter(Boolean))]
      if (ids.length === 0) { if (alive) setMensen([]); return }
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids).order('full_name')
      if (alive) setMensen((profs || []).filter(p => p.id !== user?.id))
    })()
    return () => { alive = false }
  }, [isStaff, currentList?.campaign_id, user?.id])

  // Filter "Wie": leads die bij iemand in behandeling zijn of aan hem toegewezen.
  const vanPersoon = useCallback((l, id) => l.locked_by === id || l.assigned_to === id, [])

  const isLockedByOther = useCallback((l) => !!(l.locked_by && l.locked_by !== user?.id), [user?.id])
  // v87: een lead die eerder aan een collega is toegewezen (assigned_to) telt ook
  // als "van een ander", ook als hij nu even niet actief vergrendeld is. Anders
  // pak je iemands lead per ongeluk gewoon over door hem te openen.
  const needsTakeoverCheck = useCallback((l) => isLockedByOther(l) || !!(l.assigned_to && l.assigned_to !== user?.id), [isLockedByOther, user?.id])
  // Naam van wie de lead is (gepakt of toegewezen). Eigen lead = 'Jouw lead'.
  const ownerLabel = useCallback((l) => {
    const owner = l.locked_by || l.assigned_to
    if (!owner) return null
    if (owner === user?.id) return 'Jouw lead'
    const naam = (l.locked_by && lockNames[l.id]) || assignedNames[owner]
    return naam ? `Bij ${naam}` : 'Bij een collega'
  }, [user?.id, lockNames, assignedNames])

  // Pakken, of bewust overnemen van een collega (p_force). Bij een overname
  // schrijft de database twee meldingen: een voor de collega die de lead
  // kwijtraakt en een voor jezelf.
  const claim = useCallback(async (lead, { force = false } = {}) => {
    const { data, error } = await supabase.rpc('claim_lead', { p_lead_id: lead.id, p_force: force })
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) return null
    setLeads(prev => prev.map(l => l.id === row.id ? { ...l, locked_by: row.locked_by, locked_at: row.locked_at } : l))
    return row
  }, [])

  const openLead = useCallback(async (lead) => {
    if (claimingId || isWorking) return
    // v98: afgemeld of toestemming nodig = niet bellen. Open de contactkaart,
    // daar staat waarom (en kan admin/manager toestemming vastleggen).
    const bs = belstatusVan(lead)
    if (bs === 'afgemeld' || bs === 'toestemming_nodig') {
      toast(bs === 'afgemeld' ? 'Deze lead heeft zich afgemeld. Niet bellen.' : 'Deze lead mag je alleen met toestemming bellen.', 'error')
      setDetailLead(lead)
      return
    }
    if (needsTakeoverCheck(lead)) { setTakeover({ lead, doel: 'open' }); return }
    setClaimingId(lead.id)
    const row = await claim(lead)
    setClaimingId(null)
    if (!row) {
      const who = lockNames[lead.id]
      toast(who ? `Deze lead is in behandeling bij ${who}` : 'Deze lead is op dit moment in behandeling bij een collega', 'error')
      load(true)
      return
    }
    toggleWorkingMode(row)
  }, [claimingId, isWorking, needsTakeoverCheck, claim, lockNames, toast, load, toggleWorkingMode, belstatusVan])

  // Bevestigd overnemen. Daarna doen we alsnog wat je wilde: openen of slepen.
  const doeOvername = useCallback(async () => {
    if (!takeover || claimingId) return
    const { lead, doel, column } = takeover
    const who = lockNames[lead.id] || assignedNames[lead.assigned_to] || 'een collega'
    setClaimingId(lead.id)
    const row = await claim(lead, { force: true })
    setClaimingId(null)
    setTakeover(null)
    if (!row) { toast('Overnemen mislukt', 'error'); load(true); return }
    toast(`Je hebt de lead overgenomen van ${who}`, 'success')
    if (doel === 'open') { toggleWorkingMode(row); return }
    if (doel === 'drop' && column) handleBoardDrop(column, { ...lead, locked_by: row.locked_by, locked_at: row.locked_at })
  }, [takeover, claimingId, lockNames, claim, toast, load, toggleWorkingMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // v64: leads zonder coordinaten alsnog laten geocoderen (admin/manager)
  const missingCoords = leads.filter(l => l.lat == null).length
  async function geocodeList() {
    if (listIds.length === 0 || geocoding) return
    setGeocoding(true)
    let ok = 0, failed = 0, fout = false
    for (const id of listIds) {
      const { data, error } = await supabase.functions.invoke('geocode-leads', { body: { list_id: id } })
      if (error) { fout = true; continue }
      ok += data?.ok || 0
      failed += data?.failed || 0
    }
    setGeocoding(false)
    if (fout && ok === 0) { toast('Coordinaten ophalen mislukt', 'error'); return }
    toast(`${ok} adressen gevonden${failed ? `, ${failed} niet gevonden` : ''}`, 'success')
    load(true)
  }

  // ---------- v72: bord ----------
  function logBoardActivity(leadId, notes) {
    if (!user?.id) return
    supabase.from('activities').insert({ lead_id: leadId, user_id: user.id, action: 'status_change', notes })
      .then(({ error }) => { if (error) console.error('activiteit loggen mislukt:', error) })
  }

  // v92: lead direct vanaf de kaart verwijderen (soft delete via RPC delete_leads,
  // zelfde RPC + autorisatie als de bulk-verwijderknop in Admin/Manager, v49).
  // Klik-nogmaals bevestiging, reset vanzelf na een paar seconden.
  function askDeleteLead(lead) {
    if (confirmDeleteId !== lead.id) {
      setConfirmDeleteId(lead.id)
      toast('Klik nogmaals om deze lead definitief te verwijderen', 'info')
      setTimeout(() => setConfirmDeleteId(id => id === lead.id ? null : id), 4000)
      return
    }
    setConfirmDeleteId(null)
    deleteLead(lead)
  }

  async function deleteLead(lead) {
    setDeletingId(lead.id)
    try {
      const { error } = await supabase.rpc('delete_leads', { p_lead_ids: [lead.id] })
      if (error) throw error
      setLeads(prev => prev.filter(l => l.id !== lead.id))
      toast('Lead verwijderd', 'success')
    } catch (err) {
      toast(err.message || 'Verwijderen mislukt', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  async function moveLead(lead, status, extra = {}) {
    if (moving) return
    setMoving(true)
    const updates = { status, ...extra, updated_at: new Date().toISOString() }
    if (boardEnabled && user?.id) updates.assigned_to = user.id // v79: wie een status geeft is eigenaar
    if (status === 'later_bellen' && !('next_contact_date' in extra)) {
      updates.next_contact_date = nextContactOnOtherDaypart(1)
    }
    if (BOARD_CLOSED_STATUSES.includes(status) && !('next_contact_date' in extra)) {
      updates.next_contact_date = null
    }
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updates } : l))
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    setMoving(false)
    if (error) {
      toast(error.message || 'Verplaatsen mislukt', 'error')
      load(true)
      return
    }
    logBoardActivity(lead.id, `Verplaatst naar "${getStatusDetails(status).label}" (bord)`)
    // v73: nee gezegd of juist klant geworden? Dan bij de bron de herinnering afzetten.
    stopMailsVoorLead(lead.id, status)
  }

  function handleBoardDrop(column, lead) {
    if (needsTakeoverCheck(lead)) {
      setTakeover({ lead, doel: 'drop', column })
      return
    }
    if (column.mail) {
      if (!mailService) { toast('De Mailingservice staat niet aan voor dit project', 'error'); return }
      setMailLead(lead)
      return
    }
    if (column.needsDate) {
      setDatePrompt({
        lead, column, value: toLocalInput(lead[column.dateField]) || defaultTbaDateTimeLocal(),
        // v97: afspraakdetails (alleen gebruikt bij appointment_at)
        contact_person: lead.contact_person || '', address: lead.address || '', house_number: lead.house_number || '',
        postal_code: lead.postal_code || '', city: lead.city || '', sentiment: null
      })
      return
    }
    moveLead(lead, column.dropStatus)
  }

  async function confirmDatePrompt() {
    if (!datePrompt?.value) return
    const { lead, column, value } = datePrompt
    const isAfspraak = column.dateField === 'appointment_at'
    if (isAfspraak && !afspraakPromptCompleet(datePrompt)) {
      toast('Vul contactpersoon, adres, plaats en hoe de klant erin staat in', 'error', 6000)
      return
    }

    // v94/v95: check of het gekozen moment beschikbaar is bij de
    // accountmanager - zowel geblokkeerde tijdvakken (agenda_blocks) als
    // een afspraak die een ANDERE beller er al voor dezelfde AM heeft
    // ingepland (leads.appointment_at). Zelfde controle als in het
    // belscherm (WorkInterface.jsx), hier ook nodig omdat een afspraak
    // ook via het bord (slepen naar "Afspraak (agenda)") wordt ingepland.
    if (column.dateField === 'appointment_at') {
      try {
        const targetDate = new Date(value)
        const targetEnd = new Date(targetDate.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000)
        const amId = lead.assigned_to || user?.id

        if (amId) {
          const { data: blocks } = await supabase
            .from('agenda_blocks')
            .select('*')
            .eq('user_id', amId)
            .lt('start_at', targetEnd.toISOString())
            .gt('end_at', targetDate.toISOString())

          if (blocks && blocks.length > 0) {
            toast(`⚠️ Dit tijdvak is geblokkeerd ("${blocks[0].title || 'Niet beschikbaar'}"). Kies een ander moment.`, 'error', 7000)
            return
          }

          // Bestaande afspraken van dezelfde AM: elke afspraak duurt zelf
          // ook APPOINTMENT_DURATION_MINUTES, dus haal alles op dat binnen
          // die marge rond het gekozen moment kan overlappen en toets de
          // echte overlap in JS.
          const marginStart = new Date(targetDate.getTime() - APPOINTMENT_DURATION_MINUTES * 60 * 1000).toISOString()
          const marginEnd = new Date(targetDate.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000).toISOString()
          const { data: nearbyAppts } = await supabase
            .from('leads')
            .select('id, name, appointment_at')
            .eq('assigned_to', amId)
            .eq('status', 'afspraak_gemaakt')
            .neq('id', lead.id)
            .gte('appointment_at', marginStart)
            .lte('appointment_at', marginEnd)
            .is('deleted_at', null)

          const overlapping = (nearbyAppts || []).find(a => {
            const aStart = new Date(a.appointment_at)
            const aEnd = new Date(aStart.getTime() + APPOINTMENT_DURATION_MINUTES * 60 * 1000)
            return aStart < targetEnd && aEnd > targetDate
          })
          if (overlapping) {
            toast(`⚠️ Er staat al een afspraak op dit tijdstip (${overlapping.name}). Kies een ander moment.`, 'error', 7000)
            return
          }
        }
      } catch (err) {
        console.error('Check beschikbaarheid mislukt:', err)
      }
    }

    const extra = { [column.dateField]: new Date(value).toISOString() }
    if (isAfspraak) {
      Object.assign(extra, {
        contact_person: datePrompt.contact_person.trim(),
        address: datePrompt.address.trim(),
        house_number: datePrompt.house_number.trim() || null,
        postal_code: datePrompt.postal_code.trim() || null,
        city: datePrompt.city.trim(),
        appointment_sentiment: datePrompt.sentiment,
        appointment_outcome: null, appointment_outcome_at: null, appointment_outcome_by: null,
      })
    }
    moveLead(lead, column.dropStatus, extra)
    setDatePrompt(null)
  }

  // Mailen blijft handmatig: de Mailingservice stuurt pas na bevestiging, en pas
  // als de mail echt weg is gaat de lead op "Mail verstuurd" met een opvolgdatum
  // (zelfde regels als in het belscherm, v69/v70).
  // v93: staat de lead al op een terugbelafspraak (TBA), dan is deze mail een
  // HERINNERING erbovenop - geen nieuwe dispositie. Status en terugbelmoment
  // blijven dan gewoon staan, anders verdween de TBA uit "Terugbellen" en was
  // hij nergens meer terug te vinden zodra je ook nog een mail stuurde.
  async function handleMailSent({ email, contactpersoon, followUpDays: dagen, source, mailType }) {
    const lead = mailLead
    if (!lead) return
    const behoudTba = lead.status === 'terugbelafspraak'
    const updates = { updated_at: new Date().toISOString() }
    if (!behoudTba) {
      updates.status = 'mail_verstuurd'
      const next = new Date()
      next.setDate(next.getDate() + (Number(dagen) || followUpDays))
      updates.next_contact_date = next.toISOString()
      if (boardEnabled && user?.id) updates.assigned_to = user.id // v79
      // Wie mailt, pakt de lead (zelfde regel als in het belscherm, v75), als hij nog van niemand is.
      if (!lead.locked_by && user?.id) { updates.locked_by = user.id; updates.locked_at = new Date().toISOString() }
    }
    if (email && email !== (lead.email || '').trim().toLowerCase()) updates.email = email
    if (contactpersoon && contactpersoon !== (lead.contact_person || '').trim()) updates.contact_person = contactpersoon
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updates } : l))
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    setMailLead(null)
    if (error) {
      toast('Mail is verstuurd, maar de status kon niet worden opgeslagen', 'error')
      load(true)
      return
    }
    logBoardActivity(lead.id, `Mailingservice (${mailSourceLabel(source)}): ${mailTypeLabel(mailType).toLowerCase()} verstuurd naar ${email}${behoudTba ? ' - terugbelafspraak blijft staan' : ''} (bord)`)
    toast(behoudTba ? `${mailTypeLabel(mailType)} verstuurd naar ${email} - de terugbelafspraak blijft staan` : `${mailTypeLabel(mailType)} verstuurd naar ${email}`, 'success')
  }

  // v78: mail bewaard voor later. Lead op 'mail_gepland' zonder opvolgdatum;
  // die komt pas als de mail vanuit de Mailinglijst echt verstuurd is.
  // v93: staat de lead al op een terugbelafspraak (TBA), dan blijft die gewoon
  // staan - dit plant alleen een extra herinneringsmail, het is geen nieuwe
  // dispositie (zie handleMailSent hierboven).
  async function handleMailQueued({ email, contactpersoon, source, mailType, sendAt }) {
    const lead = mailLead
    if (!lead) return
    const behoudTba = lead.status === 'terugbelafspraak'
    const updates = { updated_at: new Date().toISOString() }
    if (!behoudTba) {
      updates.status = 'mail_gepland'
      updates.next_contact_date = null
      if (boardEnabled && user?.id) updates.assigned_to = user.id // v79
    }
    if (email && email !== (lead.email || '').trim().toLowerCase()) updates.email = email
    if (contactpersoon && contactpersoon !== (lead.contact_person || '').trim()) updates.contact_person = contactpersoon
    setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updates } : l))
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    setMailLead(null)
    if (error) {
      toast('Mail is bewaard, maar de status kon niet worden opgeslagen', 'error')
      load(true)
      return
    }
    const wanneer = sendAt ? ` (gaat automatisch op ${dateShort(sendAt)})` : '' // v83
    logBoardActivity(lead.id, `Mailingservice (${mailSourceLabel(source)}): ${mailTypeLabel(mailType).toLowerCase()} bewaard in de mailinglijst voor ${email}${wanneer}${behoudTba ? ' - terugbelafspraak blijft staan' : ''} (bord)`)
    toast(sendAt ? `${mailTypeLabel(mailType)} ingepland voor ${dateShort(sendAt)}` : `${mailTypeLabel(mailType)} bewaard in de mailinglijst`, 'success')
  }

  // v88: warm = de bron zag de offerte GEOPEND, en er is nog geen deal of
  // afwijzing. Alleen op de link geklikt (rang 2) is nog geen warm signaal -
  // dat laat alleen de neutrale chip "Link geklikt" zien (mailInfo hieronder),
  // want iemand die klikte maar niet doorging naar de offerte hoeft nog geen
  // "bel nu"-behandeling. Getekend/betaald (rang 4/5) is geen belmoment meer.
  const isWarm = useCallback((lead) => {
    const r = mailRows[lead.id]?.status_rank || 0
    return r === 3 && !DONE_STATUSES.includes(lead.status)
  }, [mailRows])

  // Wat vraagt om actie op deze lead?
  const signalsFor = useCallback((lead) => {
    const out = []
    const bs = belstatusVan(lead)
    if (isMailPauze(lead)) {
      out.push({ label: `Later mailen (tot ${new Date(lead.mail_pauze_tot).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })})`, color: 'var(--info)', bg: 'var(--info-bg)' })
    }
    if (bs === 'afgemeld') {
      const u = urenTotWissen(lead)
      out.push({ label: `Afgemeld · weg over ${u}u`, color: '#fff', bg: 'var(--danger)' })
    } else if (bs !== 'ok') {
      out.push({ label: BELSTATUS[bs].kort + (lead.rechtsvorm && lead.rechtsvorm !== 'onbekend' ? ` (${rechtsvormLabel(lead.rechtsvorm)})` : ''), color: BELSTATUS[bs].color, bg: BELSTATUS[bs].bg })
    }
    const mail = mailRows[lead.id]
    if (isWarm(lead)) {
      out.push({ label: 'Bel nu: offerte open', color: '#fff', bg: 'var(--secondary)', warm: true })
    }
    if (isFollowUpDue(lead) && !DONE_STATUSES.includes(lead.status)) {
      out.push({ label: lead.status === 'mail_verstuurd' ? 'Opvolgen na mail' : 'Opvolgen', color: 'var(--warning)', bg: 'var(--warning-bg)' })
    }
    if (mail && (mail.status_rank || 0) <= 1) {
      const d = daysSince(mail.gemaild_op)
      // v87: als de lead ná het mailen nog gebeld/afgeboekt is (updated_at ligt na
      // gemaild_op) is er wél iets mee gedaan, ook al reageerde de ontvanger niet
      // op de mail - dan dus geen "niets mee gedaan"-signaal meer tonen.
      const mailTime = mail.gemaild_op ? new Date(mail.gemaild_op).getTime() : null
      const updatedTime = lead.updated_at ? new Date(lead.updated_at).getTime() : null
      const touchedSindsMail = mailTime != null && updatedTime != null && updatedTime > mailTime
      if (d !== null && d >= followUpDays && !touchedSindsMail) {
        out.push({ label: `${d} dagen niets mee gedaan`, color: 'var(--danger)', bg: 'var(--danger-bg)' })
      }
    }
    if (lead.status === 'mail_gepland') {
      out.push({ label: 'Mail staat klaar', color: 'var(--info)', bg: 'var(--info-bg)' })
    } else if (!mail && mailService && !DONE_STATUSES.includes(lead.status) && lead.status !== 'mail_verstuurd') {
      out.push({ label: 'Nog niet gemaild', color: 'var(--text-muted)', bg: 'var(--bg-card)' })
    }
    return out
  }, [mailRows, mailService, followUpDays, isWarm, belstatusVan])

  const pos = geo.enabled ? geo.position : null
  const q = search.trim().toLowerCase()
  // v79: in een bord-project ziet een beller alleen de vrije leads (van
  // niemand, niet gepakt) plus zijn eigen leads. Wie een lead een status
  // geeft wordt eigenaar (trigger tr_leads_owner_on_status in de DB).
  // Admin/manager zien alles en kunnen per persoon kijken.
  const pool = useMemo(() => {
    if (isStaff || !boardEnabled) return leads
    const me = user?.id
    return leads.filter(l => (!l.assigned_to && !l.locked_by) || l.assigned_to === me || l.locked_by === me)
  }, [leads, isStaff, boardEnabled, user?.id])
  const visible = useMemo(() => {
    const rows = pool
      .filter(l => {
        // v87: het bord toont elke status in zijn eigen kolom (o.a. "Klant" en
        // "Geen interesse" bestaan puur uit afgeronde statussen) - de
        // open/afgerond-knoppen zijn daar dan ook niet op van toepassing.
        // Zonder deze uitzondering leken afgeboekte leads in de bordweergave
        // in het niets te verdwijnen, omdat de standaardfilter "Open" precies
        // de statussen wegfiltert die in die kolommen thuishoren.
        if (view !== 'board') {
          if (filter === 'open' && DONE_STATUSES.includes(l.status)) return false
          if (filter === 'done' && !DONE_STATUSES.includes(l.status)) return false
        }
        if (filter === 'warm' && !isWarm(l)) return false
        if (filter === 'afgemeld' && belstatusVan(l) !== 'afgemeld') return false
        if (filter === 'later_mailen' && !isMailPauze(l)) return false
        if (filter === 'kvk' && belstatusVan(l) !== 'kvk_check') return false
        if (filter === 'toestemming' && belstatusVan(l) !== 'toestemming_nodig') return false
        if (wie === 'me' && !vanPersoon(l, user?.id)) return false
        if (wie !== 'all' && wie !== 'me' && !vanPersoon(l, wie)) return false
        if (!q) return true
        return [l.name, l.phone, l.city, l.address, l.contact_person].some(v => (v || '').toLowerCase().includes(q))
      })
      .map(l => ({ ...l, _distance: pos ? distanceM(pos.lat, pos.lng, l.lat, l.lng) : null }))
    if (pos && sortBy === 'distance') {
      rows.sort((a, b) => (a._distance ?? Infinity) - (b._distance ?? Infinity))
    }
    // v82: warme leads altijd bovenaan (stabiel: de rest houdt zijn volgorde)
    const warm = rows.filter(isWarm)
    if (warm.length) {
      const rest = rows.filter(l => !isWarm(l))
      warm.sort((a, b) => (mailRows[b.id]?.status_rank || 0) - (mailRows[a.id]?.status_rank || 0))
      return [...warm, ...rest]
    }
    return rows
  }, [pool, filter, q, pos, sortBy, wie, vanPersoon, user?.id, isWarm, mailRows, view, belstatusVan])
  const openCount = pool.filter(l => !DONE_STATUSES.includes(l.status)).length
  const warmCount = useMemo(() => pool.filter(isWarm).length, [pool, isWarm])
  const afgemeldeLeads = useMemo(() => pool.filter(l => belstatusVan(l) === 'afgemeld'), [pool, belstatusVan])
  const laterMailenCount = useMemo(() => pool.filter(isMailPauze).length, [pool])
  const kvkCount = useMemo(() => pool.filter(l => !DONE_STATUSES.includes(l.status) && belstatusVan(l) === 'kvk_check').length, [pool, belstatusVan])
  const toestemmingCount = useMemo(() => pool.filter(l => !DONE_STATUSES.includes(l.status) && belstatusVan(l) === 'toestemming_nodig').length, [pool, belstatusVan])

  async function wisAfgemeldeNu() {
    if (!wisBevestig) { setWisBevestig(true); return }
    setWissen(true)
    const { data, error } = await supabase.rpc('afgemelde_leads_wissen_nu', { p_ids: afgemeldeLeads.map(l => l.id) })
    setWissen(false)
    setWisBevestig(false)
    if (error) { toast(error.message || 'Verwijderen mislukt', 'error'); return }
    toast(`${data || 0} afgemelde lead${data === 1 ? '' : 's'} verwijderd`, 'success')
    load(true)
  }
  const busyCount = pool.filter(isLockedByOther).length
  const actionCount = useMemo(
    () => pool.filter(l => !DONE_STATUSES.includes(l.status) && isFollowUpDue(l)).length,
    [pool]
  )

  function renderBoardCard(lead) {
    const mail = mailRows[lead.id]
    const busy = isLockedByOther(lead)
    const st = getStatusDetails(lead.status)
    const mailInfo = mail ? (MAIL_STATUS[mail.status] || { label: mail.status, color: 'var(--text-muted)', bg: 'var(--bg-card)' }) : null
    const sigs = signalsFor(lead)
    return (
      <>
        <div style={{ fontWeight: 700, fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isWarm(lead) ? 'var(--secondary)' : undefined }}>
          {isWarm(lead) && <Flame size={11} style={{ verticalAlign: -1, marginRight: 3 }} />}{lead.name || 'Naam onbekend'}
        </div>
        {lead.contact_person && (
          <div className="text-muted" style={{ fontSize: '0.62rem', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.contact_person}</div>
        )}
        <div className="text-muted" style={{ fontSize: '0.62rem', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.phone}{lead.city ? ` - ${lead.city}` : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
          <Chip label={st.label} color={st.color} bg={st.bg} />
          {listIds.length > 1 && listNames[lead.lead_list_id] && <Chip label={listNames[lead.lead_list_id]} color="var(--text-muted)" bg="var(--bg-card)" title="Lijst" />}
          {mailInfo && <Chip label={mailInfo.label} color={mailInfo.color} bg={mailInfo.bg} title={`${mailTypeLabel(mail.mail_soort)} - ${dateShort(mail.status_op)}`} />}
          {sigs.map(s => <Chip key={s.label} label={s.label} color={s.color} bg={s.bg} />)}
        </div>
        {mail?.gemaild_op && (
          <div style={{ fontSize: '0.6rem', marginTop: 3, color: 'var(--text-muted)' }}>
            Gemaild {dateShort(mail.gemaild_op)}
          </div>
        )}
        {lead.next_contact_date && !DONE_STATUSES.includes(lead.status) && (
          <div style={{ fontSize: '0.6rem', marginTop: 3, color: 'var(--text-muted)', fontWeight: 700 }} title="Opvolgdatum: dan komt de lead terug in de wachtrij">
            <Clock size={9} style={{ verticalAlign: -1, marginRight: 2 }} />Opvolgen {dateShort(lead.next_contact_date)}
          </div>
        )}
        {lead.appointment_at && lead.status === 'afspraak_gemaakt' && (
          <div style={{ fontSize: '0.6rem', marginTop: 3, color: 'var(--secondary)', fontWeight: 700 }} title="Afspraakmoment">
            <CalendarDays size={9} style={{ verticalAlign: -1, marginRight: 2 }} />Afspraak {dateShort(lead.appointment_at)}
          </div>
        )}
        {!busy && ownerLabel(lead) && (
          <div style={{ fontSize: '0.6rem', marginTop: 3, color: 'var(--primary)', fontWeight: 700 }}>
            <User size={9} style={{ verticalAlign: -1, marginRight: 2 }} />{ownerLabel(lead)}
          </div>
        )}
        {busy ? (
          <div style={{ fontSize: '0.6rem', marginTop: 5, color: 'var(--warning)', fontWeight: 700 }}>
            <Lock size={9} style={{ verticalAlign: -1, marginRight: 2 }} />{lockNames[lead.id] ? `Bij ${lockNames[lead.id]}` : 'In behandeling'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
            <button
              onClick={e => { e.stopPropagation(); openLead(lead) }}
              className="btn btn-success btn-sm"
              style={{ flex: 1, padding: 3, fontSize: '0.62rem' }}
              disabled={claimingId === lead.id || isWorking}
            >
              <Phone size={10} /> Bel
            </button>
            <button
              onClick={e => { e.stopPropagation(); setDetailLead(lead) }}
              className="btn btn-outline btn-sm"
              style={{ padding: '3px 6px', fontSize: '0.62rem' }}
              title="Contactkaart bekijken (zonder te bellen)"
            >
              <Info size={10} />
            </button>
            {isStaff && (
              <button
                onClick={e => { e.stopPropagation(); askDeleteLead(lead) }}
                className="btn btn-outline btn-sm"
                style={{
                  padding: '3px 6px',
                  fontSize: '0.62rem',
                  color: confirmDeleteId === lead.id ? '#fff' : 'var(--danger)',
                  background: confirmDeleteId === lead.id ? 'var(--danger)' : undefined,
                  borderColor: 'var(--danger)'
                }}
                disabled={deletingId === lead.id}
                title={confirmDeleteId === lead.id ? 'Klik nogmaals om definitief te verwijderen' : 'Lead verwijderen'}
              >
                <Trash2 size={10} />
              </button>
            )}
            {mailService && (
              <button
                onClick={e => { e.stopPropagation(); setMailLead(lead) }}
                className="btn btn-outline btn-sm"
                style={{ padding: '3px 6px', fontSize: '0.62rem' }}
                title="Mail sturen via de Mailingservice"
              >
                <Mail size={10} />
              </button>
            )}
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <Header />
      <main className="container" style={{ paddingTop: 24, paddingBottom: 96 }}>
        <div className="flex justify-between items-center mb-4" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1>Leads</h1>
            <p className="text-muted" style={{ margin: 0 }}>
              {boardEnabled && !isStaff
                ? 'Nieuwe leads ziet iedereen. Geef je een lead een status, dan is hij van jou en zien collega\'s hem niet meer.'
                : 'Iedereen in het project ziet dezelfde lijst. Open je een lead, dan is hij tijdelijk niet beschikbaar voor je collega\'s.'}
            </p>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {geo.supported && (
              <button
                type="button"
                className={`btn btn-sm ${geo.enabled ? 'btn-secondary' : 'btn-outline'}`}
                onClick={geo.toggle}
                title={geo.enabled ? 'Locatie uitzetten' : 'Zet je locatie aan om afstanden te zien'}
              >
                <Navigation size={14} /> {geo.enabled ? (geo.locating ? 'Locatie zoeken...' : 'Locatie aan') : 'Locatie aan'}
              </button>
            )}
            <button type="button" className="btn btn-sm btn-outline" onClick={() => load()} disabled={loading}>
              <RefreshCw size={14} /> Verversen
            </button>
          </div>
        </div>

        {listsLoading ? (
          <LoadingSpinner />
        ) : lists.length === 0 ? (
          <EmptyState icon={Inbox} title="Geen leadlijsten" message="Je bent nog aan geen enkel project met leads gekoppeld." />
        ) : (
          <>
            <div className="filter-bar glass-panel mb-3" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              {projects.length > 1 && (
                <select className="form-control" value={projectId || ''} onChange={e => { setProjectId(e.target.value); setListChoice('all') }} title="Project" style={{ minWidth: 180, flex: '0 1 auto' }}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {projectLists.length > 1 && (
                <select className="form-control" value={allLists ? 'all' : listChoice} onChange={e => setListChoice(e.target.value)} title="Lijst" style={{ minWidth: 180, flex: '0 1 auto' }}>
                  <option value="all">Alle lijsten ({projectLists.length})</option>
                  {projectLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              )}
              <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  className="form-control"
                  style={{ paddingLeft: 36, width: '100%' }}
                  placeholder="Zoek op naam, plaats of telefoon..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              {/* v75: bord per persoon bekijken (admin/manager) */}
              <PersonSelect
                people={isStaff ? mensen : []}
                className="form-control"
                value={wie}
                onChange={id => setWie(id)}
                extraOptions={[
                  { value: 'all', label: isStaff || !boardEnabled ? 'Iedereen' : 'Nieuw + mijn leads' },
                  { value: 'me', label: isStaff || !boardEnabled ? 'Mijn leads' : 'Alleen mijn leads' },
                ]}
                showEmail={false}
                title="Van wie wil je de leads zien?"
                style={{ minWidth: 170, flex: '0 1 auto' }}
              />
              <div className="flex gap-2">
                {[
                  ...(mailService ? [['warm', `Warm (${warmCount})`]] : []),
                  // v87/v93: Open/Afgerond/Alles hebben op het bord geen effect
                  // (elke status staat daar al in zijn eigen kolom, zie de
                  // v87-uitzondering in de `visible`-filter hierboven), maar
                  // blijven wel zichtbaar zodat het bord er hetzelfde uitziet
                  // als lijst-/kaartweergave.
                  ['open', `Open (${openCount})`], ['done', `Afgerond (${pool.length - openCount})`], ['all', `Alles (${pool.length})`],
                  // v98: compliance-filters
                  ...(kvkCount > 0 ? [['kvk', `KvK-check (${kvkCount})`]] : []),
                  ...(toestemmingCount > 0 ? [['toestemming', `Toestemming nodig (${toestemmingCount})`]] : []),
                  ...(afgemeldeLeads.length > 0 || filter === 'afgemeld' ? [['afgemeld', `Afgemeld (${afgemeldeLeads.length})`]] : []),
                  ...(laterMailenCount > 0 || filter === 'later_mailen' ? [['later_mailen', `Later mailen (${laterMailenCount})`]] : [])
                ].map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)} className={`btn btn-sm ${filter === k ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 20, ...(k === 'warm' && warmCount > 0 && filter !== 'warm' ? { color: 'var(--secondary)', borderColor: 'var(--secondary)', fontWeight: 800 } : {}) }} title={k === 'warm' ? 'Leads die de offerte openden. Die bel je eerst.' : undefined}>
                    {k === 'warm' && <Flame size={12} style={{ verticalAlign: -2 }} />} {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
                {pos && view !== 'board' && (
                  <button type="button" onClick={() => setSortBy(s => s === 'distance' ? 'order' : 'distance')} className="btn btn-sm btn-outline" style={{ borderRadius: 20 }} title="Sortering wisselen">
                    <Compass size={14} /> {sortBy === 'distance' ? 'Dichtbij eerst' : 'Lijstvolgorde'}
                  </button>
                )}
                <div style={{ display: 'inline-flex', border: '1px solid var(--border-subtle)', borderRadius: 20, overflow: 'hidden' }}>
                  <button type="button" onClick={() => setView('list')} className={`btn btn-sm ${view === 'list' ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 0, border: 0 }} title="Lijst">
                    <List size={14} /> Lijst
                  </button>
                  {boardEnabled && (
                    <button type="button" onClick={() => setView('board')} className={`btn btn-sm ${view === 'board' ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 0, border: 0 }} title="Bord">
                      <LayoutGrid size={14} /> Bord
                    </button>
                  )}
                  <button type="button" onClick={() => setView('map')} className={`btn btn-sm ${view === 'map' ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 0, border: 0 }} title="Kaart">
                    <MapIcon size={14} /> Kaart
                  </button>
                  {mailService && (
                    <button type="button" onClick={() => setView('mail')} className={`btn btn-sm ${view === 'mail' ? 'btn-secondary' : 'btn-outline'}`} style={{ borderRadius: 0, border: 0 }} title="Bewaarde mails die nog verstuurd moeten worden">
                      <ListChecks size={14} /> Mailinglijst
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center mb-2" style={{ gap: 12, flexWrap: 'wrap', fontSize: '0.8rem' }}>
              {warmCount > 0 && (
                <span style={{ color: 'var(--secondary)', fontWeight: 800 }}>
                  <Flame size={12} style={{ verticalAlign: -2 }} /> {warmCount} warme lead{warmCount === 1 ? '' : 's'}: {warmCount === 1 ? 'heeft' : 'hebben'} je mail geopend of de offerte bekeken. Bel die eerst.
                </span>
              )}
              {filter === 'afgemeld' && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%', padding: '8px 12px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger)', color: 'var(--text-primary)' }}>
                  <span style={{ flex: 1, minWidth: 220 }}>
                    <strong style={{ color: 'var(--danger)' }}>Afgemeld of opt-out.</strong> Niet bellen en niet mailen. Ze staan op de afmeldlijst, dus ook bij een nieuwe import komen ze niet terug.
                    {' '}Na 48 uur worden ze automatisch verwijderd.
                  </span>
                  {isStaff && afgemeldeLeads.length > 0 && (
                    <button type="button" className="btn btn-sm" disabled={wissen} onClick={wisAfgemeldeNu}
                      style={{ background: 'var(--danger)', color: '#fff', border: 'none' }}>
                      <Trash2 size={13} style={{ verticalAlign: -2 }} /> {wissen ? 'Bezig...' : wisBevestig ? `Zeker? Klik nogmaals (${afgemeldeLeads.length})` : `Nu verwijderen (${afgemeldeLeads.length})`}
                    </button>
                  )}
                </span>
              )}
              {filter === 'later_mailen' && (
                <span style={{ width: '100%', color: 'var(--info)', fontWeight: 700 }}>
                  Deze bureaus willen nu geen mail, maar wel later. Mailen kan pas weer na de datum op de kaart. Bellen mag wel.
                </span>
              )}
              {filter === 'kvk' && (
                <span style={{ width: '100%', color: 'var(--warning)', fontWeight: 700 }}>
                  Van deze leads is de rechtsvorm nog niet bekend. Open een lead, zoek hem op bij kvk.nl en kies de rechtsvorm. Pas daarna zie je het nummer.
                </span>
              )}
              {actionCount > 0 && (
                <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                  <Clock size={12} style={{ verticalAlign: -2 }} /> {actionCount} lead{actionCount === 1 ? '' : 's'} vraagt om opvolging
                </span>
              )}
              {busyCount > 0 && (
                <span className="text-muted">
                  <Lock size={12} style={{ verticalAlign: -2 }} /> {busyCount} lead{busyCount === 1 ? '' : 's'} nu in behandeling bij collega's
                </span>
              )}
              {view === 'board' && mailService && (
                <span className="text-muted">
                  <Mail size={12} style={{ verticalAlign: -2 }} /> Sleep naar "Mail verstuurd" om de mail van {mailSourceLabel(mailService.source)} te sturen. Hij gaat pas weg als jij hem bevestigt.
                </span>
              )}
              {geo.supported && !geo.enabled && view !== 'board' && (
                <span className="text-muted"><Navigation size={12} style={{ verticalAlign: -2 }} /> Zet "Locatie aan" om te zien hoe ver elke lead van je vandaan is.</span>
              )}
              {missingCoords > 0 && view !== 'board' && (
                <span className="text-muted">
                  <MapPin size={12} style={{ verticalAlign: -2 }} /> {missingCoords} lead{missingCoords === 1 ? '' : 's'} zonder coordinaten
                  {isStaff && (
                    <button type="button" className="btn btn-sm btn-outline" style={{ marginLeft: 8 }} onClick={geocodeList} disabled={geocoding}>
                      {geocoding ? 'Bezig...' : 'Coordinaten ophalen'}
                    </button>
                  )}
                </span>
              )}
            </div>

            {view === 'mail' ? (
              <MailQueueView listId={listId} listIds={listIds} mailService={mailService} onChanged={() => load(true)} />
            ) : loading && leads.length === 0 ? (
              <LoadingSpinner />
            ) : view === 'board' ? (
              <LeadKanban
                columns={boardColumns}
                items={visible}
                columnFor={lead => boardColumnFor(lead, boardColumns)}
                onDropItem={handleBoardDrop}
                renderCard={renderBoardCard}
                canDrag={lead => !isLockedByOther(lead)}
                onCardClick={lead => setDetailLead(lead)}
              />
            ) : view === 'map' ? (
              <LeadMap
                leads={visible}
                position={pos}
                lockNames={lockNames}
                isLockedByOther={isLockedByOther}
                onOpen={openLead}
                height={Math.max(420, (typeof window !== 'undefined' ? window.innerHeight : 800) - 300)}
              />
            ) : visible.length === 0 ? (
              <EmptyState icon={Inbox} title="Geen leads" message={filter === 'open' ? 'Alle leads in deze lijst zijn afgerond.' : filter === 'warm' ? 'Nog geen warme leads. Zodra een bureau de offerte opent, komt hij hier bovenaan.' : 'Niets gevonden.'} />
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {visible.map(lead => {
                  const busy = isLockedByOther(lead)
                  const mine = lead.locked_by === user?.id
                  const st = getStatusDetails(lead.status)
                  const done = DONE_STATUSES.includes(lead.status)
                  const place = [lead.address && `${lead.address} ${lead.house_number || ''}`.trim(), lead.city].filter(Boolean).join(', ')
                  const band = distanceBand(lead._distance)
                  const sigs = signalsFor(lead)
                  return (
                    <div key={lead.id} style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                    <button
                      type="button"
                      onClick={() => openLead(lead)}
                      disabled={claimingId === lead.id}
                      className="card glow-hover"
                      style={{
                        textAlign: 'left', cursor: 'pointer', opacity: busy ? 0.55 : 1,
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', margin: 0,
                        border: mine ? '1px solid var(--primary)' : isWarm(lead) ? '1px solid var(--secondary)' : undefined, flex: 1, minWidth: 0
                      }}
                    >
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {isWarm(lead) && <Flame size={13} style={{ verticalAlign: -2, marginRight: 4, color: 'var(--secondary)' }} />}{lead.name || 'Naam onbekend'}
                          {lead.contact_person && <span className="text-muted" style={{ fontWeight: 400 }}> · {lead.contact_person}</span>}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.8rem', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                          {lead.phone && <span><Phone size={12} style={{ verticalAlign: -2 }} /> {lead.phone}</span>}
                          {place && <span><MapPin size={12} style={{ verticalAlign: -2 }} /> {place}</span>}
                          {listIds.length > 1 && listNames[lead.lead_list_id] && <span><List size={12} style={{ verticalAlign: -2 }} /> {listNames[lead.lead_list_id]}</span>}
                          {(lead.contact_attempts || 0) > 0 && <span>{lead.contact_attempts}x gebeld</span>}
                          {sigs.map(s => <Chip key={s.label} label={s.label} color={s.color} bg={s.bg} />)}
                        </div>
                      </div>
                      {pos && (
                        <span
                          title={band === 'far' ? 'Ver weg' : band === 'near' ? 'Dichtbij' : ''}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap',
                            padding: '4px 10px', borderRadius: 'var(--radius-full)',
                            color: band === 'far' ? 'var(--warning)' : band === 'near' ? 'var(--success)' : 'var(--text-secondary)',
                            background: band === 'far' ? 'var(--warning-bg)' : band === 'near' ? 'var(--success-bg)' : 'var(--bg-elevated)'
                          }}
                        >
                          <Navigation size={11} /> {lead._distance == null ? 'geen adres' : formatDistance(lead._distance)}
                        </span>
                      )}
                      {busy ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-bg)', padding: '4px 10px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap' }}>
                          <Lock size={12} /> {lockNames[lead.id] ? `Bij ${lockNames[lead.id]}` : 'In behandeling'}
                        </span>
                      ) : ownerLabel(lead) ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', background: 'var(--info-bg)', padding: '4px 10px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap' }}>
                          <User size={12} /> {ownerLabel(lead)}
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: st.color, background: st.bg, padding: '4px 10px', borderRadius: 'var(--radius-full)', whiteSpace: 'nowrap', opacity: done ? 0.8 : 1 }}>
                          {st.label}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDetailLead(lead)}
                      className="card glow-hover"
                      title="Contactkaart bekijken (zonder te bellen)"
                      style={{ padding: '0 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, flexShrink: 0 }}
                    >
                      <Info size={16} />
                    </button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {mailLead && mailService && (
          <MailingserviceModal
            key={mailLead.id}
            lead={mailLead}
            defaults={{ email: mailLead.email, contactpersoon: mailLead.contact_person }}
            mailService={mailService}
            listId={mailLead.lead_list_id || listId}
            onClose={() => setMailLead(null)}
            onSent={handleMailSent}
            onQueued={handleMailQueued}
          />
        )}

        {/* v90: los van bellen de contactkaart kunnen inzien - geen claim_lead,
            dus ook geen invloed op wie de lead in behandeling heeft. */}
        <LeadDetailModal
          isOpen={!!detailLead}
          onClose={() => setDetailLead(null)}
          lead={detailLead}
          assignedName={detailLead ? ownerLabel(detailLead) : ''}
          onUpdated={(id, updates) => { setLeads(prev => prev.map(l => l.id === id ? { ...l, ...updates } : l)); setDetailLead(prev => (prev && prev.id === id) ? { ...prev, ...updates } : prev) }}
        />

        {/* v75: overnemen van een collega gaat nooit per ongeluk. */}
        {takeover && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 420, padding: 24, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
              <button onClick={() => setTakeover(null)} aria-label="Sluiten" style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>Lead overnemen?</h2>
              <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.85rem', lineHeight: 1.5 }}>
                <strong style={{ color: 'var(--text-primary)' }}>{lockNames[takeover.lead.id] || assignedNames[takeover.lead.assigned_to] || 'Een collega'}</strong>{' '}
                {takeover.lead.locked_at ? (
                  <>heeft <strong style={{ color: 'var(--text-primary)' }}>{takeover.lead.name}</strong> in behandeling sinds {dateShort(takeover.lead.locked_at)}.</>
                ) : (
                  <>is eigenaar van <strong style={{ color: 'var(--text-primary)' }}>{takeover.lead.name}</strong>.</>
                )}{' '}
                Neem je hem over, dan krijgen jullie allebei een melding.
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setTakeover(null)}>Laat staan</button>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={doeOvername} disabled={!!claimingId}>
                  {claimingId ? 'Bezig...' : 'Overnemen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {datePrompt && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 20, width: '100%', maxWidth: 420, padding: 24, position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
              <button onClick={() => setDatePrompt(null)} aria-label="Sluiten" style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
              <h2 style={{ margin: '0 0 6px', fontSize: '1.1rem' }}>{datePrompt.column.dateTitle}</h2>
              <p className="text-muted" style={{ margin: '0 0 16px', fontSize: '0.85rem' }}>{datePrompt.lead.name}</p>
              <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 6, fontSize: '0.85rem' }}>{datePrompt.column.dateLabel}</label>
              <input
                type="datetime-local"
                className="form-control"
                style={{ width: '100%', fontSize: 16 }}
                value={datePrompt.value}
                onChange={e => setDatePrompt(p => ({ ...p, value: e.target.value }))}
              />
              {datePrompt.column.dateField === 'appointment_at' && (() => {
                const upd = (k) => (e) => { const v = e.target.value; setDatePrompt(p => ({ ...p, [k]: v })) }
                const lbl = { display: 'block', color: 'var(--text-muted)', margin: '12px 0 5px', fontSize: '0.82rem' }
                return (
                  <div>
                    <label style={lbl}>Contactpersoon (verplicht)</label>
                    <input className="form-control" style={{ width: '100%', fontSize: 16 }} value={datePrompt.contact_person} onChange={upd('contact_person')} placeholder="Met wie is de afspraak?" />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: 8 }}>
                      <div><label style={lbl}>Straat (verplicht)</label><input className="form-control" style={{ width: '100%', fontSize: 16 }} value={datePrompt.address} onChange={upd('address')} /></div>
                      <div><label style={lbl}>Nr.</label><input className="form-control" style={{ width: '100%', fontSize: 16 }} value={datePrompt.house_number} onChange={upd('house_number')} /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
                      <div><label style={lbl}>Postcode</label><input className="form-control" style={{ width: '100%', fontSize: 16 }} value={datePrompt.postal_code} onChange={upd('postal_code')} /></div>
                      <div><label style={lbl}>Plaats (verplicht)</label><input className="form-control" style={{ width: '100%', fontSize: 16 }} value={datePrompt.city} onChange={upd('city')} /></div>
                    </div>
                    <label style={lbl}>Hoe staat de klant erin? (verplicht)</label>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {SENTIMENTS.map(s => {
                        const actief = datePrompt.sentiment === s.id
                        return (
                          <button key={s.id} type="button" onClick={() => setDatePrompt(p => ({ ...p, sentiment: s.id }))}
                            style={{ flex: 1, padding: '9px 4px', borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: '0.8rem',
                              border: `2px solid ${actief ? s.color : 'var(--border)'}`, background: actief ? `${s.color}22` : 'transparent',
                              color: actief ? s.color : 'var(--text-primary)' }}>
                            {s.emoji} {s.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
              <div className="flex gap-2" style={{ marginTop: 18 }}>
                <button type="button" className="btn btn-outline" style={{ flex: 1 }} onClick={() => setDatePrompt(null)}>Annuleren</button>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={confirmDatePrompt} disabled={!datePrompt.value || (datePrompt.column.dateField === 'appointment_at' && !afspraakPromptCompleet(datePrompt))}>{datePrompt.column.dateButton}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
