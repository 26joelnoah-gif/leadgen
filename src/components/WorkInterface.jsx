import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Phone, Mail, MapPin, User, Building2,
  Calendar, Clock, AlertCircle, CheckCircle2,
  ChevronRight, ChevronDown, Copy, Save, Users, Target, Ban,
  BookOpen, Info, History, Tag, Maximize2, Minimize2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { supabase } from '../lib/supabase'
import { normalizeWebsite, displayWebsite } from '../utils/urlUtils'
import { getStatusDetails, RECRUITMENT_LABELS } from '../utils/statusUtils'

// v36: labels van de dispositie-knoppen (footer) voor recruitment-projecten.
// Zelfde status-keys/logica als sales, alleen de tekst op de knop wijkt af.
const RECRUITMENT_BUTTON_LABELS = {
  deal: 'AANGENOMEN',
  afspraak_gemaakt: 'GESPREK GEPLAND',
  geen_interesse: 'AFGEWEZEN',
  blacklist: 'NIET MEER BENADEREN'
}

// v36: veldlabels in de contactkaart die voor sollicitanten anders heten
// (bv. het 'name'-veld heet in sales "Bedrijfsnaam", voor recruitment "Naam sollicitant")
const RECRUITMENT_FIELD_LABELS = {
  Bedrijfsnaam: 'Naam sollicitant',
  Contactpersoon: 'Referentie / contactpersoon',
  Functie: 'Functie / vacature',
  'Extra info 1': 'CV / LinkedIn-link',
  'Extra info 2': 'Ervaring',
  'Extra info 3': 'Beschikbaarheid'
}

// v38: backoffice belt particuliere klanten om de monteur in te plannen -
// dit zijn geen bedrijven, dus het 'name'-veld heet hier "Naam klant".
const BACKOFFICE_FIELD_LABELS = {
  Bedrijfsnaam: 'Naam klant'
}

const CopyButton = ({ text, label }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!text) return
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(err => {
        console.error('Kopiëren mislukt:', err)
      })
  }

  return (
    <button
      onClick={handleCopy}
      title={label}
      style={{
        background: 'var(--bg-elevated)',
        border: 'none',
        color: copied ? 'var(--success)' : 'var(--text-primary)',
        padding: '6px',
        borderRadius: '4px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s'
      }}
    >
      {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
    </button>
  )
}

export default function WorkInterface() {
  const { isWorking, toggleWorkingMode, workingLead, workingListId, sessionCallCount, profile, user } = useAuth()
  const { leads, updateLeadStatus, logActivity, handleLeadDisposition, claimNextLead, claimNextBackofficeLead, releaseMyLeads } = useLeads()

  // v29: briefing van het project (belscript + projectinfo) als inklapbare tabs.
  // De open/dicht-stand blijft staan tijdens de hele belsessie.
  const [briefing, setBriefing] = useState(null)
  const [briefingTab, setBriefingTab] = useState(null) // null | 'script' | 'info'
  // v36: type van de campagne ('sales' | 'recruitment') - bepaalt of de
  // dispositie-knoppen en veldlabels als sollicitant-tekst getoond worden.
  const [isRecruitmentCampaign, setIsRecruitmentCampaign] = useState(false)
  // v47: type van de campagne bepaalt of een live-gesloten 'DEAL' meteen
  // moet doorstromen naar bruto_deal (backoffice moet de monteur nog
  // inplannen) i.p.v. de gewone eindstatus 'deal'.
  const [isBackofficeCampaign, setIsBackofficeCampaign] = useState(false)
  useEffect(() => {
    const listId = workingListId || workingLead?.lead_list_id
    if (!isWorking || !listId) { setBriefing(null); setIsRecruitmentCampaign(false); setIsBackofficeCampaign(false); return }
    let cancelled = false
    supabase.from('lead_lists').select('campaign_id, campaigns(type)').eq('id', listId).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setIsRecruitmentCampaign(data?.campaigns?.type === 'recruitment')
        setIsBackofficeCampaign(data?.campaigns?.type === 'backoffice')
        if (!data?.campaign_id) { setBriefing(null); return }
        supabase.from('campaign_briefings')
          .select('call_script, project_info')
          .eq('campaign_id', data.campaign_id)
          .maybeSingle()
          .then(({ data: b }) => { if (!cancelled) setBriefing(b || null) })
      })
    return () => { cancelled = true }
  }, [isWorking, workingListId, workingLead?.lead_list_id])

  // v38/v50: backoffice-gedrag (wachtrij, claim-functie, knoppenset) volgt
  // sinds v50 het PROJECTTYPE waarin je op dit moment belt, niet meer de
  // rol van je account - zo kan een gewone beller die aan een backoffice-
  // project is gekoppeld daar gewoon bellen, zonder rolwissel. Rol
  // 'backoffice' blijft daarnaast ook werken (dedicated backoffice-account).
  const isBackofficeMode = isBackofficeCampaign || profile?.role === 'backoffice'

  // Belwachtrij: leads uit de projectlijst die nu belbaar zijn.
  // Afgeronde statussen vallen eruit, en leads met een terugbelmoment
  // in de toekomst (TBA / later bellen / geen gehoor) wachten tot hun datum.
  // Leads die een collega op dit moment in behandeling heeft (lock < 10 min
  // oud) tellen niet mee in de wachtrij.
  const DONE_STATUSES = ['deal', 'bruto_deal', 'afspraak_gemaakt', 'geen_interesse', 'onjuiste_timing', 'verkeerd_nummer', 'cold', 'terugbelafspraak']
  const LOCK_TTL_MS = 10 * 60 * 1000
  const listLeads = workingListId
    ? leads.filter(l =>
        l.lead_list_id === workingListId &&
        (isBackofficeMode ? l.status === 'bruto_deal' : !DONE_STATUSES.includes(l.status)) &&
        (!l.next_contact_date || new Date(l.next_contact_date) <= new Date()) &&
        (!l.locked_by || l.locked_by === user?.id || !l.locked_at || (Date.now() - new Date(l.locked_at).getTime()) > LOCK_TTL_MS)
      )
    : []

  // v21: de volgende lead wordt ATOMISCH geclaimd in de database
  // (claim_next_lead). Twee bellers op dezelfde lijst krijgen daardoor
  // nooit dezelfde lead - ook niet als ze exact tegelijk klikken.
  const [claimedLead, setClaimedLead] = useState(null)
  const [claiming, setClaiming] = useState(false)
  const currentLead = workingLead || claimedLead || null
  const [listDisplayName, setListDisplayName] = useState('')

  // Claim de eerste lead zodra de belmodus in lijstmodus opent
  useEffect(() => {
    if (!isWorking || !workingListId || workingLead) return
    let cancelled = false
    setClaiming(true)
    const claimFn = isBackofficeMode ? claimNextBackofficeLead : claimNextLead
    claimFn(workingListId).then(lead => {
      if (cancelled) return
      setClaimedLead(lead)
      setClaiming(false)
    })
    return () => { cancelled = true }
  }, [isWorking, workingListId, isBackofficeMode])

  // Bij het sluiten van de belmodus: alle eigen locks vrijgeven,
  // zodat collega's de niet-afgehandelde lead direct kunnen oppakken
  useEffect(() => {
    if (!isWorking) return
    return () => {
      setClaimedLead(null)
      releaseMyLeads()
    }
  }, [isWorking])

  const [editableLead, setEditableLead] = useState({})
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [showMobileDetails, setShowMobileDetails] = useState(false)
  const [dispositionNotes, setDispositionNotes] = useState('')
  const [notesExpanded, setNotesExpanded] = useState(false)
  const [showDispositionModal, setShowDispositionModal] = useState(false)
  const [selectedDisposition, setSelectedDisposition] = useState(null)
  const [nextContactDate, setNextContactDate] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Call tracking: wanneer kwam deze lead in beeld + teller van vandaag
  const leadStartRef = useRef(new Date().toISOString())
  const [todayCalls, setTodayCalls] = useState(0)
  const [dailyTarget, setDailyTarget] = useState(0)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (currentLead) setEditableLead(currentLead)
    // Start de timer voor deze lead: tijd tot dispositie = afhandeltijd
    leadStartRef.current = new Date().toISOString()
  }, [currentLead?.id])

  // Haal calls-van-vandaag + dagtarget op zodra de belmodus opent
  useEffect(() => {
    if (!user?.id || !isWorking) return
    let cancelled = false
    async function fetchTodayStats() {
      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const { count } = await supabase
          .from('call_logs')
          .select('id', { count: 'exact', head: true })
          .eq('agent_id', user.id)
          .gte('disposed_at', start.toISOString())
        if (!cancelled && typeof count === 'number') setTodayCalls(count)

        const { data: rules } = await supabase
          .from('payout_rules')
          .select('min_calls_per_day')
          .limit(1)
        if (!cancelled && rules?.[0]?.min_calls_per_day) setDailyTarget(rules[0].min_calls_per_day)
      } catch (err) {
        console.error('Kon dagstats niet laden:', err)
      }
    }
    fetchTodayStats()
    return () => { cancelled = true }
  }, [user?.id, isWorking])

  // Haal de echte lijstnaam op (voor de projectbalk bovenin)
  useEffect(() => {
    if (!workingListId) { setListDisplayName(''); return }
    let cancelled = false
    supabase.from('lead_lists').select('name').eq('id', workingListId).maybeSingle()
      .then(({ data }) => { if (!cancelled && data?.name) setListDisplayName(data.name) })
    return () => { cancelled = true }
  }, [workingListId])

  // v29: gespreksgeschiedenis van deze lead (ook gesprekken van collega's),
  // zodat de beller kan aanknopen bij het vorige gesprek
  const [callHistory, setCallHistory] = useState([])
  useEffect(() => {
    const leadId = (workingLead || claimedLead)?.id
    if (!isWorking || !leadId) { setCallHistory([]); return }
    let cancelled = false
    supabase.rpc('lead_call_history', { p_lead_id: leadId })
      .then(({ data }) => { if (!cancelled) setCallHistory(data || []) })
    return () => { cancelled = true }
  }, [isWorking, workingLead?.id, claimedLead?.id])

  // v28: admin kan afboekredenen aan/uit zetten (flow_settings.is_active);
  // uitgezette redenen verdwijnen uit de knoppenbalk.
  // (Hook staat bewust VOOR de early returns - anders klapt React over
  // een wisselend aantal hooks tussen renders.)
  const [disabledDispositions, setDisabledDispositions] = useState([])
  const [customReasons, setCustomReasons] = useState([]) // v41: eigen afboekredenen
  useEffect(() => {
    if (!isWorking) return
    supabase.from('flow_settings').select('disposition_type, is_active')
      .then(({ data }) => setDisabledDispositions((data || []).filter(f => f.is_active === false).map(f => f.disposition_type)))
    supabase.from('custom_dispositions').select('*').eq('is_active', true).order('sort_order').order('created_at')
      .then(({ data }) => setCustomReasons(data || []))
  }, [isWorking])

  // Don't render if not working
  if (!isWorking) return null

  const listName = listDisplayName || (workingListId ? 'Lijst' : 'Direct')
  const isListMode = !!workingListId && !workingLead
  const progress = isListMode ? { remaining: listLeads.length } : null

  // Bezig met claimen van de volgende lead
  if (!currentLead && claiming) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'var(--bg-dark)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 700
      }}>
        Volgende lead ophalen…
      </div>
    )
  }

  // Empty state when no leads available
  if (!currentLead) {
    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'var(--bg-dark)', zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-main)', padding: '20px'
      }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <CheckCircle2 size={56} style={{ color: 'var(--success)', marginBottom: '16px', opacity: 0.7 }} />
          <h2 style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>Wachtrij leeg</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Alle belbare leads in deze lijst zijn afgehandeld. Leads met een terugbelmoment komen vanzelf terug in de wachtrij.
          </p>
          <button
            onClick={toggleWorkingMode}
            style={{
              background: 'var(--primary)', color: 'var(--text-on-accent)',
              border: 'none', padding: '12px 24px', borderRadius: '8px',
              fontWeight: 700, cursor: 'pointer'
            }}
          >
            Terug naar Dashboard
          </button>
        </div>
      </div>
    )
  }

  const saveLeadEdits = async () => {
    // Website altijd opgeschoond opslaan (kort en klikbaar)
    const cleaned = editableLead.website
      ? { ...editableLead, website: normalizeWebsite(editableLead.website) }
      : editableLead
    const error = await updateLeadStatus(currentLead.id, currentLead.status, cleaned)
    if (!error) {
      logActivity(currentLead.id, 'edit', 'Lead gegevens gewijzigd')
    }
  }


  // quick: true = direct afboeken met 1 klik, geen modal en geen verplichte notitie
  // v36: label wijkt af voor recruitment-projecten (zelfde id/logica, andere tekst)
  const dLabel = (id, fallback) => (isRecruitmentCampaign && RECRUITMENT_BUTTON_LABELS[id]) || fallback
  // v38: backoffice-medewerkers bellen al gemaakte sales om de monteur in te
  // plannen - eigen, kleinere knoppenset i.p.v. de sales-dispositielijst.
  const dispositions = isBackofficeMode ? [
    { id: 'monteur_ingepland', label: 'MONTEUR INGEPLAND', color: '#10B981', icon: <CheckCircle2 size={18} /> },
    { id: 'wil_annuleren', label: 'WIL ANNULEREN', color: '#EF4444', icon: <Ban size={18} /> },
    { id: 'terugbelafspraak', label: 'TBA (Terugbel)', color: '#8B5CF6', icon: <Clock size={18} /> },
    { id: 'later_bellen', label: 'LATER BELLEN', color: '#F59E0B', icon: <Clock size={18} /> },
    { id: 'geen_gehoor', label: 'GEEN GEHOOR', color: '#64748B', icon: <Phone size={18} />, quick: true },
    { id: 'verkeerd_nummer', label: 'FOUTIEVE INFO', color: '#EF4444', icon: <AlertCircle size={18} />, quick: true },
  ] : [
    { id: isBackofficeCampaign ? 'bruto_deal' : 'deal', label: dLabel('deal', 'DEAL'), color: '#10B981', icon: <CheckCircle2 size={18} /> },
    { id: 'afspraak_gemaakt', label: dLabel('afspraak_gemaakt', 'AFSPRAAK'), color: '#3B82F6', icon: <Calendar size={18} /> },
    { id: 'terugbelafspraak', label: 'TBA (Terugbel)', color: '#8B5CF6', icon: <Clock size={18} /> },
    { id: 'later_bellen', label: 'LATER BELLEN', color: '#F59E0B', icon: <Clock size={18} /> },
    { id: 'geen_gehoor', label: 'GEEN GEHOOR', color: '#64748B', icon: <Phone size={18} />, quick: true },
    { id: 'verkeerd_nummer', label: 'FOUTIEVE INFO', color: '#EF4444', icon: <AlertCircle size={18} />, quick: true },
    { id: 'geen_interesse', label: dLabel('geen_interesse', 'GEEN INTERESSE'), color: '#334155', icon: <X size={18} />, quick: true },
    { id: 'onjuiste_timing', label: 'ONJUISTE TIMING', color: '#0EA5E9', icon: <Clock size={18} />, quick: true },
    { id: 'blacklist', label: dLabel('blacklist', 'BLACKLIST'), color: '#991B1B', icon: <Ban size={18} />, quick: true },
  ]

  // v41: eigen afboekredenen worden extra quick-knoppen naast de vaste set -
  // alleen in de sales/recruitment-knoppenset (niet backoffice), en verborgen
  // zodra de onderliggende basisreden zelf is uitgezet.
  const customButtons = isBackofficeMode ? [] : customReasons
    .filter(c => !disabledDispositions.includes(c.base_status))
    .map(c => ({
      id: `custom:${c.id}`,
      label: c.label.toUpperCase(),
      rawLabel: c.label,
      color: dispositions.find(d => d.id === c.base_status)?.color || '#64748B',
      icon: <Tag size={18} />,
      quick: true,
      custom: true,
      baseStatus: c.base_status,
      customId: c.id
    }))
  const allButtons = [...dispositions, ...customButtons]

  // Veiligheidsklep: als alles uitgezet zou zijn, toon dan toch alle knoppen
  const visibleDispositions = (() => {
    const v = allButtons.filter(d => d.custom ? true : !disabledDispositions.includes(d.id))
    return v.length > 0 ? v : allButtons
  })()

  const submitDisposition = async (dispositionType, notes = '', nextDate = null, customDispositionId = null) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await handleLeadDisposition(
        currentLead.id,
        listName,
        dispositionType,
        notes,
        nextDate || null,
        { startedAt: leadStartRef.current },
        customDispositionId
      )
      setTodayCalls(prev => prev + 1)

      setShowDispositionModal(false)
      setDispositionNotes('')
      setNextContactDate('')
      setSelectedDisposition(null)

      if (workingLead) {
        toggleWorkingMode()
      } else {
        // Lijstmodus: claim atomisch de volgende lead - de database
        // slaat leads over die een collega net heeft geclaimd
        setClaimedLead(null)
        setClaiming(true)
        const claimFn = isBackofficeMode ? claimNextBackofficeLead : claimNextLead
        const nextLead = await claimFn(workingListId)
        setClaimedLead(nextLead)
        setClaiming(false)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFinalDisposition = () => {
    if (!selectedDisposition) return
    submitDisposition(selectedDisposition, dispositionNotes, nextContactDate || null)
  }

  // v29: vorige gesprekken op deze lead (ook van collega's) - compacte lijst
  const renderCallHistory = () => {
    if (callHistory.length === 0) return null
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: isMobile ? '160px' : '140px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>
          <History size={12} /> Vorige gesprekken ({callHistory.length})
        </div>
        {callHistory.map((h, i) => {
          const d = getStatusDetails(h.disposition)
          return (
            <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px', padding: '7px 10px', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ background: d.bg, color: d.color, padding: '1px 8px', borderRadius: '5px', fontWeight: 800, fontSize: '0.7rem' }}>{d.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                  {new Date(h.disposed_at).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit' })} {new Date(h.disposed_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 700 }}>{h.agent_name}</span>
              </div>
              {h.notes && <div style={{ marginTop: '3px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{h.notes}</div>}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <AnimatePresence>
      {isWorking && currentLead && (
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--bg-dark)',
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            color: 'var(--text-main)',
            overflow: 'hidden'
          }}
        >

          {/* Top Header */}
          <header style={{ background: 'var(--primary-dark)', color: 'var(--text-on-accent)', padding: isMobile ? '8px 12px' : '8px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="flex items-center gap-4">
               <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 700 }}>
                 <Phone size={18} />
                 {isBackofficeMode ? 'Backoffice - Monteur inplannen' : 'Belmodus'}
               </h2>
               <span style={{ background: 'var(--secondary)', color: 'var(--primary-dark)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>Vandaag: {todayCalls}</span>
               {dailyTarget > 0 && (
                 <span style={{
                   background: todayCalls >= dailyTarget ? 'var(--success)' : 'rgba(255,255,255,0.15)',
                   color: 'var(--text-on-accent)', padding: '2px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                   display: 'flex', alignItems: 'center', gap: '4px'
                 }}>
                   <Target size={12} /> {todayCalls}/{dailyTarget}{todayCalls >= dailyTarget ? ' ✅' : ''}
                 </span>
               )}
               {progress && (
                 <span style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', padding: '2px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                   Nog {progress.remaining} in wachtrij
                 </span>
               )}
            </div>
            <button onClick={toggleWorkingMode} style={{ background: 'transparent', border: '1px solid var(--border-strong)', color: 'var(--text-primary)', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><X size={16} /> Sluiten</button>
          </header>

          {/* Sub Header */}
          <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: isMobile ? '10px 14px' : '10px 24px', display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', minWidth: 0 }}>
               <h1 style={{ margin: 0, fontSize: isMobile ? '1.05rem' : '1.2rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentLead.name}</h1>
               <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                 <p style={{ margin: 0, fontSize: isMobile ? '0.95rem' : '1rem', fontWeight: 700, color: 'var(--primary)' }}>{currentLead.phone}</p>
                 {currentLead.phone && <CopyButton text={currentLead.phone} label="Telefoonnummer Kopiëren" />}
               </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
               &gt; {listName}
            </div>
          </div>

          {/* v29: briefing-tabs - belscript en projectinfo, inklapbaar */}
          {(briefing?.call_script || briefing?.project_info) && (
            <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: isMobile ? '8px 12px' : '8px 24px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  briefing?.call_script && { id: 'script', label: 'Belscript', icon: <BookOpen size={14} /> },
                  briefing?.project_info && { id: 'info', label: 'Projectinfo', icon: <Info size={14} /> }
                ].filter(Boolean).map(t => {
                  const open = briefingTab === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setBriefingTab(open ? null : t.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        background: open ? 'var(--primary)' : 'var(--bg-elevated)',
                        color: open ? 'var(--text-on-accent)' : 'var(--text-primary)',
                        border: '1px solid ' + (open ? 'var(--primary)' : 'var(--border)'),
                        padding: '6px 14px', borderRadius: '8px', fontWeight: 700,
                        fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s'
                      }}
                    >
                      {t.icon} {t.label} <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                  )
                })}
              </div>
              {briefingTab && (
                <div style={{
                  marginTop: '8px', padding: '12px 14px', background: 'var(--bg-elevated)',
                  border: '1px solid var(--border)', borderRadius: '10px',
                  maxHeight: isMobile ? '35vh' : '28vh', overflowY: 'auto',
                  whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: 1.55,
                  color: 'var(--text-primary)'
                }}>
                  {briefingTab === 'script' ? briefing?.call_script : briefing?.project_info}
                </div>
              )}
            </div>
          )}

          <main style={{ flex: 1, padding: isMobile ? '12px' : '14px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Mobiel: grote belknop bovenaan - opent direct de telefoon-app */}
                {currentLead.phone && (
                  <a
                    href={`tel:${currentLead.phone}`}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                      background: 'linear-gradient(90deg, var(--success) 0%, #059669 100%)',
                      color: '#fff', padding: '16px', borderRadius: '14px',
                      fontWeight: 900, fontSize: '1.1rem', letterSpacing: '0.5px',
                      textDecoration: 'none', boxShadow: '0 6px 20px rgba(16,185,129,0.35)'
                    }}
                  >
                    <Phone size={22} /> BEL
                  </a>
                )}

                {/* Notities voorop - dat is waar de beller mee werkt */}
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 0 6px' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', margin: 0, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Notities</p>
                    <button type="button" onClick={() => setNotesExpanded(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', padding: '2px 4px' }}>
                      {notesExpanded ? <><Minimize2 size={13} /> Inklappen</> : <><Maximize2 size={13} /> Uitklappen</>}
                    </button>
                  </div>
                  <textarea value={editableLead.notes || ''} onChange={e => setEditableLead({ ...editableLead, notes: e.target.value })} rows={notesExpanded ? 14 : 6} style={{ width: '100%', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.95rem', lineHeight: 1.4, resize: 'vertical' }} placeholder="Notities en bijzonderheden..." />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button onClick={saveLeadEdits} style={{ flex: 1, background: 'var(--primary)', color: 'var(--text-on-accent)', border: 'none', padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                      <Save size={14} style={{ verticalAlign: '-2px', marginRight: '6px' }} />Opslaan
                    </button>
                    <button onClick={() => setShowMobileDetails(v => !v)} style={{ flex: 1, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)', padding: '10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}>
                      {showMobileDetails ? 'Verberg gegevens' : 'Alle gegevens'}
                    </button>
                  </div>
                </div>

                {editableLead.website && (
                  <a href={normalizeWebsite(editableLead.website) || editableLead.website} target="_blank" rel="nofollow noopener noreferrer" referrerPolicy="no-referrer" style={{ padding: '10px', borderRadius: '10px', background: 'var(--primary)', color: 'var(--text-on-accent)', fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none', textAlign: 'center' }}>
                    {displayWebsite(editableLead.website)} openen ↗
                  </a>
                )}

                {callHistory.length > 0 && (
                  <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    {renderCallHistory()}
                  </div>
                )}

                {showMobileDetails && (
                  <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
                    {[
                      ['Bedrijfsnaam', 'name'], ['Contactpersoon', 'contact_person'],
                      ['Functie', 'function'], ['Email', 'email'],
                      ['Telefoonnummer', 'phone'], ['Website', 'website'],
                      ['Straat', 'address'], ['Huisnr.', 'house_number'],
                      ['Postcode', 'postal_code'], ['Plaats', 'city'],
                      ['Extra info 1', 'extra_info1'], ['Extra info 2', 'extra_info2'], ['Extra info 3', 'extra_info3']
                    ].map(([label, field]) => (
                      <div key={field}>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isRecruitmentCampaign ? (RECRUITMENT_FIELD_LABELS[label] || label) : (isBackofficeMode ? (BACKOFFICE_FIELD_LABELS[label] || label) : label)}</label>
                        <input type="text" value={editableLead[field] || ''} onChange={e => setEditableLead({ ...editableLead, [field]: e.target.value })} placeholder="..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* Desktop: alles in één oogopslag, geen scrollen nodig */
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '14px', alignItems: 'stretch', flex: 1, minHeight: 0 }}>

                {/* Contactkaart */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ background: 'linear-gradient(90deg, var(--success) 0%, #059669 100%)', color: 'var(--text-on-accent)', padding: '8px 14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <Users size={15} /> Adres- & Contactinformatie
                  </div>
                  <div style={{ padding: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px', alignContent: 'start' }}>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isRecruitmentCampaign ? RECRUITMENT_FIELD_LABELS.Bedrijfsnaam : (isBackofficeMode ? BACKOFFICE_FIELD_LABELS.Bedrijfsnaam : 'Bedrijfsnaam')}</label>
                      <input type="text" value={editableLead.name || ''} onChange={e => setEditableLead({...editableLead, name: e.target.value})} style={{ ...{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }, fontWeight: 600 }}/>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Straat</label>
                        <input type="text" value={editableLead.address || ''} onChange={e => setEditableLead({...editableLead, address: e.target.value})} placeholder="..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }}/>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Huisnr.</label>
                        <input type="text" value={editableLead.house_number || ''} onChange={e => setEditableLead({...editableLead, house_number: e.target.value})} placeholder="..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }}/>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isRecruitmentCampaign ? RECRUITMENT_FIELD_LABELS.Contactpersoon : 'Contactpersoon'}</label>
                      <input type="text" value={editableLead.contact_person || ''} onChange={e => setEditableLead({...editableLead, contact_person: e.target.value})} placeholder="..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }}/>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                      <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Postcode</label>
                        <input type="text" value={editableLead.postal_code || ''} onChange={e => setEditableLead({...editableLead, postal_code: e.target.value})} placeholder="..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }}/>
                      </div>
                      <div>
                        <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Plaats</label>
                        <input type="text" value={editableLead.city || ''} onChange={e => setEditableLead({...editableLead, city: e.target.value})} placeholder="..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }}/>
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
                      <input type="text" value={editableLead.email || ''} onChange={e => setEditableLead({...editableLead, email: e.target.value})} placeholder="..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }}/>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{isRecruitmentCampaign ? RECRUITMENT_FIELD_LABELS.Functie : 'Functie'}</label>
                      <input type="text" value={editableLead.function || ''} onChange={e => setEditableLead({...editableLead, function: e.target.value})} placeholder="..." style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }}/>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Telefoonnummer</label>
                      <input type="text" value={editableLead.phone || ''} onChange={e => setEditableLead({...editableLead, phone: e.target.value})} style={{ ...{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }, fontWeight: 700, fontSize: '1rem' }}/>
                    </div>
                    <div>
                      <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', marginBottom: '3px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Website</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="text" value={editableLead.website || ''} onChange={e => setEditableLead({...editableLead, website: e.target.value})} placeholder="..." style={{ ...{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }, flex: 1, minWidth: 0, width: 'auto' }}/>
                        {editableLead.website && (
                          <a
                            href={normalizeWebsite(editableLead.website) || editableLead.website}
                            target="_blank" rel="nofollow noopener noreferrer" referrerPolicy="no-referrer"
                            title={editableLead.website}
                            style={{ flexShrink: 0, padding: '7px 12px', borderRadius: '8px', background: 'var(--primary)', color: 'var(--text-on-accent)', fontWeight: 700, fontSize: '0.75rem', textDecoration: 'none', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {displayWebsite(editableLead.website)} ↗
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Rechts: notities (rekt mee) + extra info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minHeight: 0 }}>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div style={{ background: 'var(--secondary)', color: 'var(--bg-dark)', padding: '8px 14px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '0.85rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={15} /> Notities & Geschiedenis</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>Pogingen: {currentLead.contact_attempts || 0}</span>
                        <button type="button" onClick={() => setNotesExpanded(v => !v)} title={notesExpanded ? 'Notitieveld inklappen' : 'Notitieveld uitklappen'} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(0,0,0,0.15)', border: 'none', color: 'inherit', fontWeight: 700, fontSize: '0.7rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px' }}>
                          {notesExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
                        </button>
                      </span>
                    </div>
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0 }}>
                      <textarea
                        value={editableLead.notes || ''}
                        onChange={e => setEditableLead({...editableLead, notes: e.target.value})}
                        style={{ width: '100%', flex: 1, minHeight: notesExpanded ? '340px' : '150px', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: '1.5', resize: 'vertical', transition: 'min-height 0.15s ease' }}
                        placeholder="Voer hier alle relevante gespreksnotities in..."
                      />
                      <button onClick={saveLeadEdits} style={{ alignSelf: 'flex-end', background: 'var(--primary)', color: 'var(--text-on-accent)', border: 'none', padding: '8px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                        <Save size={15} /> Opslaan
                      </button>
                      {renderCallHistory()}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: 'linear-gradient(90deg, var(--info, #38BDF8) 0%, #0EA5E9 100%)', color: 'var(--text-on-accent)', padding: '8px 14px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                      <AlertCircle size={15} /> Extra Informatie
                    </div>
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {['extra_info1', 'extra_info2', 'extra_info3'].map((field, idx) => (
                        <input
                          key={field}
                          type="text"
                          value={editableLead[field] || ''}
                          onChange={e => setEditableLead({ ...editableLead, [field]: e.target.value })}
                          placeholder={isRecruitmentCampaign
                            ? (RECRUITMENT_FIELD_LABELS[`Extra info ${idx + 1}`] || `Extra info ${idx + 1}`)
                            : `Extra info ${idx + 1} (uit niet-herkende importkolommen)`}
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'var(--text-primary)', fontSize: '0.9rem' }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* Action Bar (Footer) */}
          <footer style={{ 
            background: 'var(--bg-card)', 
            borderTop: '1px solid var(--border)', 
            padding: isMobile ? '10px' : '10px 24px', 
            display: 'flex', 
            justifyContent: 'center', 
            gap: isMobile ? '8px' : '12px', 
            flexWrap: 'wrap',
            maxHeight: isMobile ? '30vh' : 'auto',
            overflowY: isMobile ? 'auto' : 'visible'
          }}>
            {visibleDispositions.map(d => (
              <button
                key={d.id}
                disabled={isSubmitting}
                onClick={() => {
                  if (d.custom) {
                    // v41: eigen reden - 1 klik, telt als de gekoppelde basisreden,
                    // de eigen tekst gaat mee als notitie zodat hij herleidbaar blijft
                    submitDisposition(d.baseStatus, `Reden: ${d.rawLabel}`, null, d.customId)
                  } else if (d.quick) {
                    // 1 klik = direct afgeboekt, geen notitie nodig
                    submitDisposition(d.id)
                  } else {
                    setSelectedDisposition(d.id)
                    setShowDispositionModal(true)
                  }
                }}
                className="glow-hover"
                style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${d.color}`,
                  color: d.color,
                  padding: isMobile ? '8px 10px' : '8px 14px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: isMobile ? '110px' : '118px',
                  fontSize: isMobile ? '0.75rem' : '0.78rem',
                  flex: isMobile ? '1 1 120px' : '0 1 auto',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  boxShadow: `0 4px 12px ${d.color}20`
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = d.color
                  e.currentTarget.style.color = 'white'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'var(--bg-elevated)'
                  e.currentTarget.style.color = d.color
                }}
              >
                {d.icon} {d.label}
              </button>
            ))}
          </footer>

          {/* Disposition Modal */}
          {showDispositionModal && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '30px', position: 'relative' }}>
                  <button onClick={() => setShowDispositionModal(false)} style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={24} /></button>

                  <h2 style={{ color: 'var(--text-primary)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {dispositions.find(d => d.id === selectedDisposition)?.icon}
                    {dispositions.find(d => d.id === selectedDisposition)?.label} AFHANDELEN
                  </h2>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {(selectedDisposition === 'terugbelafspraak' || selectedDisposition === 'later_bellen' || (isRecruitmentCampaign && selectedDisposition === 'afspraak_gemaakt')) && (
                      <div>
                        {/* v57: in recruitment-modus is de datum bij GESPREK GEPLAND het
                            gesprek zelf (leads.appointment_at, zichtbaar in de agenda) */}
                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.9rem' }}>
                          {selectedDisposition === 'afspraak_gemaakt' ? 'Wanneer is het gesprek?' : 'Wanneer moet er teruggebeld worden?'}
                        </label>
                        <input
                          type="datetime-local"
                          step="900"
                          value={nextContactDate}
                          onChange={e => setNextContactDate(e.target.value)}
                          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)' }}
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.9rem' }}>
                        {selectedDisposition === 'wil_annuleren' ? 'Reden van annulering (verplicht)' : 'Gespreksverslag / Toelichting'}
                      </label>
                      <textarea
                        value={dispositionNotes}
                        onChange={e => setDispositionNotes(e.target.value)}
                        placeholder={selectedDisposition === 'wil_annuleren' ? 'Waarom wil de klant annuleren?' : 'Wat is er besproken? Waarom deze status?'}
                        rows={4}
                        style={{ width: '100%', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)' }}
                      />
                    </div>

                    <button
                      onClick={handleFinalDisposition}
                      disabled={isSubmitting || (selectedDisposition === 'wil_annuleren' && !dispositionNotes.trim())}
                      style={{
                        background: dispositions.find(d => d.id === selectedDisposition)?.color,
                        color: 'var(--text-on-accent)',
                        padding: '15px',
                        borderRadius: '8px',
                        border: 'none',
                        fontWeight: 800,
                        fontSize: '1.1rem',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        marginTop: '10px',
                        opacity: isSubmitting ? 0.7 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px'
                      }}
                    >
                      {isSubmitting ? (
                        <>
                          <div className="spinner-small" style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.35)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
                          AFHANDELEN...
                        </>
                      ) : (
                        'AFRONDEN & VOLGENDE'
                      )}
                    </button>
                  </div>
               </motion.div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
