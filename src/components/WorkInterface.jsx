import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Phone, Mail, MapPin, User, Building2,
  Calendar, Clock, AlertCircle, CheckCircle2,
  ChevronRight, Copy, Save, Users, Target
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { supabase } from '../lib/supabase'
import { normalizeWebsite, displayWebsite } from '../utils/urlUtils'

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
        background: 'rgba(255,255,255,0.1)',
        border: 'none',
        color: copied ? 'var(--success)' : 'white',
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
  const { leads, updateLeadStatus, logActivity, handleLeadDisposition } = useLeads()

  // Belwachtrij: leads uit de projectlijst die nu belbaar zijn.
  // Afgeronde statussen vallen eruit, en leads met een terugbelmoment
  // in de toekomst (TBA / later bellen / geen gehoor) wachten tot hun datum.
  const DONE_STATUSES = ['deal', 'afspraak_gemaakt', 'geen_interesse', 'onjuiste_timing', 'verkeerd_nummer', 'cold', 'terugbelafspraak']
  const listLeads = workingListId
    ? leads.filter(l =>
        l.lead_list_id === workingListId &&
        !DONE_STATUSES.includes(l.status) &&
        (!l.next_contact_date || new Date(l.next_contact_date) <= new Date())
      )
    : []

  // Afgehandelde leads verdwijnen uit de wachtrij, dus de volgende lead
  // is altijd gewoon de eerste in de rij — geen index-gedoe.
  const currentLead = workingLead || listLeads[0] || null
  const [listDisplayName, setListDisplayName] = useState('')

  const [editableLead, setEditableLead] = useState({})
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [dispositionNotes, setDispositionNotes] = useState('')
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

  // Don't render if not working
  if (!isWorking) return null

  const listName = listDisplayName || (workingListId ? 'Lijst' : 'Direct')
  const isListMode = !!workingListId && !workingLead
  const progress = isListMode ? { remaining: listLeads.length } : null

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
          <div style={{ fontSize: '4rem', marginBottom: '16px', opacity: 0.5 }}>🎉</div>
          <h2 style={{ color: 'white', marginBottom: '8px' }}>Wachtrij leeg!</h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
            Alle belbare leads in deze lijst zijn afgehandeld. Leads met een terugbelmoment komen vanzelf terug in de wachtrij.
          </p>
          <button
            onClick={toggleWorkingMode}
            style={{
              background: 'var(--primary)', color: 'white',
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
  const dispositions = [
    { id: 'deal', label: 'DEAL', color: '#10B981', icon: <CheckCircle2 size={18} /> },
    { id: 'afspraak_gemaakt', label: 'AFSPRAAK', color: '#3B82F6', icon: <Calendar size={18} /> },
    { id: 'terugbelafspraak', label: 'TBA (Terugbel)', color: '#8B5CF6', icon: <Clock size={18} /> },
    { id: 'later_bellen', label: 'LATER BELLEN', color: '#F59E0B', icon: <Clock size={18} /> },
    { id: 'geen_gehoor', label: 'GEEN GEHOOR', color: '#64748B', icon: <Phone size={18} />, quick: true },
    { id: 'verkeerd_nummer', label: 'FOUTIEVE INFO', color: '#EF4444', icon: <AlertCircle size={18} />, quick: true },
    { id: 'geen_interesse', label: 'GEEN INTERESSE', color: '#334155', icon: <X size={18} />, quick: true },
    { id: 'onjuiste_timing', label: 'ONJUISTE TIMING', color: '#0EA5E9', icon: <Clock size={18} />, quick: true },
  ]

  const submitDisposition = async (dispositionType, notes = '', nextDate = null) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      await handleLeadDisposition(
        currentLead.id,
        listName,
        dispositionType,
        notes,
        nextDate || null,
        { startedAt: leadStartRef.current }
      )
      setTodayCalls(prev => prev + 1)

      setShowDispositionModal(false)
      setDispositionNotes('')
      setNextContactDate('')
      setSelectedDisposition(null)

      // In lijstmodus schuift de volgende lead vanzelf naar voren
      // (de afgehandelde lead valt uit de wachtrij-filter).
      if (workingLead) {
        toggleWorkingMode()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleFinalDisposition = () => {
    if (!selectedDisposition) return
    submitDisposition(selectedDisposition, dispositionNotes, nextContactDate || null)
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
          <header style={{ background: 'var(--primary-dark)', color: 'white', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="flex items-center gap-4">
               <h2 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                 <Phone size={20} />
                 <span style={{
                   background: 'linear-gradient(135deg, var(--secondary) 0%, #FFF 100%)',
                   WebkitBackgroundClip: 'text',
                   WebkitTextFillColor: 'transparent',
                   fontWeight: 900,
                   letterSpacing: '1px',
                   fontStyle: 'italic'
                 }}>
                   DOORTIKKEN
                 </span>
               </h2>
               <span style={{ background: 'var(--secondary)', color: 'var(--primary-dark)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>📞 Vandaag: {todayCalls}</span>
               {dailyTarget > 0 && (
                 <span style={{
                   background: todayCalls >= dailyTarget ? 'var(--success)' : 'rgba(255,255,255,0.15)',
                   color: 'white', padding: '2px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                   display: 'flex', alignItems: 'center', gap: '4px'
                 }}>
                   <Target size={12} /> {todayCalls}/{dailyTarget}{todayCalls >= dailyTarget ? ' ✅' : ''}
                 </span>
               )}
               {progress && (
                 <span style={{ background: 'rgba(255,255,255,0.15)', color: 'white', padding: '2px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                   Nog {progress.remaining} in wachtrij
                 </span>
               )}
            </div>
            <button onClick={toggleWorkingMode} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><X size={16} /> Sluiten</button>
          </header>

          {/* Sub Header */}
          <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: isMobile ? '16px 20px' : '20px 40px', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '12px' : '0', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center' }}>
            <div>
               <h1 style={{ margin: '0 0 8px 0', fontSize: '1.4rem', color: 'white' }}>{currentLead.name}</h1>
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--primary)' }}>Tel: {currentLead.phone}</p>
                 {currentLead.phone && <CopyButton text={currentLead.phone} label="Telefoonnummer Kopiëren" />}
               </div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}>
               &gt; Project {listName}
            </div>
          </div>

          <main style={{ flex: 1, padding: isMobile ? '16px' : '24px 40px', overflowY: 'auto' }}>

            {isMobile ? (
              <div style={{ padding: '8px 0' }}>
                <div style={{ width: '100%', background: 'var(--bg-card)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)', marginBottom: '8px' }}>
                   <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px', fontWeight: 600 }}>Notities</p>
                   <textarea value={editableLead.notes || ''} onChange={e => setEditableLead({...editableLead, notes: e.target.value})} rows={5} style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white', fontSize: '1rem' }} placeholder="Notities en bijzonderheden..." />
                   <button onClick={saveLeadEdits} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', marginTop: '12px', width: '100%', fontWeight: 700, fontSize: '1rem' }}>Sla Notities Op</button>
                </div>
              </div>
            ) : (
              <>
                {/* Sectie: Bedrijfsgegevens (Desktop View) */}
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', padding: '8px 12px', margin: '0 0 16px 0', borderRadius: '4px', fontSize: '1rem', border: '1px solid var(--border)' }}>&gt; Bedrijfsgegevens</h3>

                  <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ flex: '0 1 850px', minWidth: '500px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
                      <div style={{ background: 'linear-gradient(90deg, var(--success) 0%, #059669 100%)', color: 'white', padding: '14px 20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.1rem' }}>
                        <Users size={20} /> Adres- & Contactinformatie
                      </div>

                      <div style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>

                        {/* Linker Kolom */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Bedrijfsnaam</label>
                            <input type="text" value={editableLead.name || ''} onChange={e => setEditableLead({...editableLead, name: e.target.value})} style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white', fontSize: '1.1rem', fontWeight: 600 }}/>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Contactpersoon</label>
                            <input type="text" value={editableLead.contact_person || ''} onChange={e => setEditableLead({...editableLead, contact_person: e.target.value})} placeholder="..." style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white' }}/>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Email</label>
                            <input type="text" value={editableLead.email || ''} onChange={e => setEditableLead({...editableLead, email: e.target.value})} placeholder="..." style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white' }}/>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Telefoonnummer</label>
                            <input type="text" value={editableLead.phone || ''} onChange={e => setEditableLead({...editableLead, phone: e.target.value})} style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white', fontWeight: 700, fontSize: '1.1rem' }}/>
                          </div>
                        </div>

                        {/* Rechter Kolom */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Straat</label>
                              <input type="text" value={editableLead.address || ''} onChange={e => setEditableLead({...editableLead, address: e.target.value})} placeholder="..." style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white' }}/>
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Huisnr.</label>
                              <input type="text" value={editableLead.house_number || ''} onChange={e => setEditableLead({...editableLead, house_number: e.target.value})} placeholder="..." style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white' }}/>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Postcode</label>
                              <input type="text" value={editableLead.postal_code || ''} onChange={e => setEditableLead({...editableLead, postal_code: e.target.value})} placeholder="..." style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white' }}/>
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Plaats</label>
                              <input type="text" value={editableLead.city || ''} onChange={e => setEditableLead({...editableLead, city: e.target.value})} placeholder="..." style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white' }}/>
                            </div>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Functie</label>
                            <input type="text" value={editableLead.function || ''} onChange={e => setEditableLead({...editableLead, function: e.target.value})} placeholder="..." style={{ width: '100%', padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white' }}/>
                          </div>
                          <div>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Website</label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input type="text" value={editableLead.website || ''} onChange={e => setEditableLead({...editableLead, website: e.target.value})} placeholder="..." style={{ flex: 1, minWidth: 0, padding: '12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white' }}/>
                              {editableLead.website && (
                                <a
                                  href={normalizeWebsite(editableLead.website) || editableLead.website}
                                  target="_blank" rel="noopener noreferrer"
                                  title={editableLead.website}
                                  style={{ flexShrink: 0, padding: '10px 14px', borderRadius: '8px', background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none', whiteSpace: 'nowrap', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                  {displayWebsite(editableLead.website)} ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Extra info: vangnet voor niet-herkende importkolommen */}
                    <div style={{ flex: '1 1 280px', minWidth: '260px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.4)' }}>
                      <div style={{ background: 'linear-gradient(90deg, var(--info, #38BDF8) 0%, #0EA5E9 100%)', color: 'white', padding: '14px 20px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.05rem' }}>
                        <AlertCircle size={18} /> Extra Informatie
                      </div>
                      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {['extra_info1', 'extra_info2', 'extra_info3'].map((field, idx) => (
                          <div key={field}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>Extra info {idx + 1}</label>
                            <textarea
                              value={editableLead[field] || ''}
                              onChange={e => setEditableLead({ ...editableLead, [field]: e.target.value })}
                              placeholder="..."
                              rows={2}
                              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white', fontSize: '0.9rem', resize: 'vertical', lineHeight: '1.4' }}
                            />
                          </div>
                        ))}
                        <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                          Hier komt automatisch de data uit importkolommen die niet herkend werden.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sectie: Notities */}
                <div style={{ marginBottom: '24px' }}>
                  <div style={{ background: 'var(--secondary)', color: 'var(--bg-dark)', padding: '10px 16px', fontWeight: 700, borderTopLeftRadius: '8px', borderTopRightRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={18} /> Notities & Geschiedenis
                  </div>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderTop: 'none', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <textarea
                      value={editableLead.notes || ''}
                      onChange={e => setEditableLead({...editableLead, notes: e.target.value})}
                      rows={6}
                      style={{ width: '100%', padding: '16px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-elevated)', color: 'white', fontSize: '1rem', lineHeight: '1.5' }}
                      placeholder="Voer hier alle relevante gespreksnotities in..."
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Contact pogingen: {currentLead.contact_attempts || 0}</span>
                      <button onClick={saveLeadEdits} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', transition: 'transform 0.2s' }}>
                        <Save size={18} /> Wijzigingen Opslaan
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </main>

          {/* Action Bar (Footer) */}
          <footer style={{ 
            background: 'var(--bg-card)', 
            borderTop: '1px solid var(--border)', 
            padding: isMobile ? '12px' : '20px 40px', 
            display: 'flex', 
            justifyContent: 'center', 
            gap: isMobile ? '8px' : '12px', 
            flexWrap: 'wrap',
            maxHeight: isMobile ? '30vh' : 'auto',
            overflowY: isMobile ? 'auto' : 'visible'
          }}>
            {dispositions.map(d => (
              <button
                key={d.id}
                disabled={isSubmitting}
                onClick={() => {
                  if (d.quick) {
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
                  padding: isMobile ? '8px 12px' : '10px 20px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: isMobile ? '120px' : '140px',
                  fontSize: isMobile ? '0.8rem' : '0.9rem',
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

                  <h2 style={{ color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {dispositions.find(d => d.id === selectedDisposition)?.icon}
                    {dispositions.find(d => d.id === selectedDisposition)?.label} AFHANDELEN
                  </h2>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {(selectedDisposition === 'terugbelafspraak' || selectedDisposition === 'later_bellen') && (
                      <div>
                        <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.9rem' }}>Wanneer moet er teruggebeld worden?</label>
                        <input
                          type="datetime-local"
                          value={nextContactDate}
                          onChange={e => setNextContactDate(e.target.value)}
                          style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'white' }}
                        />
                      </div>
                    )}

                    <div>
                      <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: '8px', fontSize: '0.9rem' }}>Gespreksverslag / Toelichting</label>
                      <textarea
                        value={dispositionNotes}
                        onChange={e => setDispositionNotes(e.target.value)}
                        placeholder="Wat is er besproken? Waarom deze status?"
                        rows={4}
                        style={{ width: '100%', padding: '15px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'white' }}
                      />
                    </div>

                    <button
                      onClick={handleFinalDisposition}
                      disabled={isSubmitting}
                      style={{
                        background: dispositions.find(d => d.id === selectedDisposition)?.color,
                        color: 'white',
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
                          <div className="spinner-small" style={{ width: '18px', height: '18px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
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
