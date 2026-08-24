import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLeadLists } from '../hooks/useLeadLists'
import Header from '../components/Header'
import { 
  Settings, Users, Shield, Layout, List, 
  Search, Download, Upload, Trash2, Edit, Save, Plus,
  DollarSign, PhoneOff, AlertTriangle, UserMinus,
  CheckCircle, Briefcase, BarChart, ChevronRight,
  X, Clock, Calendar, ArrowRight, UserCheck, FastForward,
  Filter, Layers, RotateCcw, Share2, Grid, Zap, Pause, Play, Sparkles
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingSpinner from '../components/LoadingSpinner'
import { useToast } from '../components/Toast'
import FlowSettingsEditor from '../components/FlowSettingsEditor'
import { getStatusDetails } from '../utils/statusUtils'
import ImportLeadsModal from '../components/ImportLeadsModal'
import EnrichResultsModal from '../components/EnrichResultsModal'
import NewProjectWizard from '../components/NewProjectWizard'
import CampaignBriefingModal from '../components/CampaignBriefingModal'
import LeadDetailModal from '../components/LeadDetailModal'

function StatusBadge({ status }) {
  const configs = {
    new: { bg: 'bg-primary/20', text: 'text-primary', label: 'Nieuw' },
    deal: { bg: 'bg-success/20', text: 'text-success', label: 'DEAL' },
    afspraak_gemaakt: { bg: 'bg-info/20', text: 'text-info', label: 'Afspraak' },
    terugbelafspraak: { bg: 'bg-warning/20', text: 'text-warning', label: 'TBA' },
    geen_gehoor: { bg: 'bg-elevated', text: 'text-muted', label: 'Geen Gehoor' },
    default: { bg: 'bg-elevated', text: 'text-muted', label: status?.toUpperCase() || 'Onbekend' }
  }
  const config = configs[status] || configs.default
  return (
    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

const TABS = [
  { id: 'data', label: 'Projecten & flows', icon: <Layers size={18} /> },
  { id: 'teams', label: 'Teams', icon: <Users size={18} /> },
  { id: 'mass', label: 'Bulk-toewijzing', icon: <RotateCcw size={18} /> }
]

export default function LeadManagement({ standalone = true }) {
  const { profile, user } = useAuth()
  const toast = useToast()
  const { 
    leadLists, loading: listsLoading, fetchLeadLists, deleteLeadList, 
    restoreLeadList, permanentDeleteLeadList 
  } = useLeadLists()
  const [activeTab, setActiveTab] = useState('data')
  
  // Data View State
  const [selectedList, setSelectedList] = useState(null)
  const [leads, setLeads] = useState([])
  const [leadSearch, setLeadSearch] = useState('')
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [dataSubTab, setDataSubTab] = useState('active') // 'active', 'archived', 'flows'
  const [deletedLists, setDeletedLists] = useState([])
  const [loadingDeleted, setLoadingDeleted] = useState(false)
  const [confirmPermanentId, setConfirmPermanentId] = useState(null)
  
  // Team State
  const [teams, setTeams] = useState([])
  const [campaignTeams, setCampaignTeams] = useState([]) // v23: {campaign_id, team_id}-rijen
  const [campaignManagers, setCampaignManagers] = useState([]) // v28: {campaign_id, manager_id}-rijen
  const [campaigns, setCampaigns] = useState([])
  const [agents, setAgents] = useState([])
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')
  const [confirmDeleteTeam, setConfirmDeleteTeam] = useState(null)
  const [confirmDeleteProject, setConfirmDeleteProject] = useState(null)
  const [memberSearch, setMemberSearch] = useState({}) // v31: zoekterm per teamkaart

  // v32/v33: AI-verrijking (Perplexity via Edge Function enrich-lead) -
  // werkt in blokken van 10 door de hele lijst, met voortgang en stopknop
  const [aiConfirm, setAiConfirm] = useState(false)
  const [aiRunning, setAiRunning] = useState(false)
  const [aiProgress, setAiProgress] = useState(null) // { done, total }
  const [aiResults, setAiResults] = useState(null)   // resultaten-overzicht na afloop
  const aiStopRef = useRef(false)

  // Bulk State
  const [bulkListId, setBulkListId] = useState('')
  const [bulkTargetAgentId, setBulkTargetAgentId] = useState('')
  const [bulkTargetTeamId, setBulkTargetTeamId] = useState('')
  const [processingBulk, setProcessingBulk] = useState(false)

  // Import wizard
  const [showImport, setShowImport] = useState(false)
  const [importMode, setImportMode] = useState('import') // v32.1: 'import' of 'enrich'
  const [showNewProject, setShowNewProject] = useState(false)

  // v29: briefing (belscript + projectinfo) per project
  const [briefingCampaign, setBriefingCampaign] = useState(null)

  // v36: contactkaart - klik op een lead in de leadlijst
  const [detailLead, setDetailLead] = useState(null)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (selectedList && activeTab === 'data') {
      fetchLeads(selectedList.id)
    }
    if (activeTab === 'data' && dataSubTab === 'archived') {
      fetchDeletedLists()
    }
  }, [selectedList, activeTab, dataSubTab])

  async function fetchData() {
    try {
      const { data: profiles, error: pErr } = await supabase.from('profiles').select('*').order('full_name')
      if (pErr) throw pErr
      setAgents(profiles || [])
      
      const { data: teamsRes, error: tErr } = await supabase.from('teams').select('*, team_members(*)').order('name')
      if (tErr) throw tErr
      setTeams(teamsRes || [])

      // v21: projecten (campagnes) - hieronder hangen de lijsten
      const { data: campRes, error: cErr } = await supabase.from('campaigns').select('*').is('deleted_at', null).order('name')
      if (cErr) throw cErr
      setCampaigns(campRes || [])

      // v23: teams hangen via campaign_teams aan het project (meerdere per project)
      const { data: ctRes, error: ctErr } = await supabase.from('campaign_teams').select('campaign_id, team_id')
      if (ctErr) throw ctErr
      setCampaignTeams(ctRes || [])

      // v28: managers per project (meerdere per project)
      const { data: cmRes, error: cmErr } = await supabase.from('campaign_managers').select('campaign_id, manager_id')
      if (cmErr) throw cmErr
      setCampaignManagers(cmRes || [])
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function fetchLeads(listId) {
    setLoadingLeads(true)
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('lead_list_id', listId)
        .is('deleted_at', null) // Only active leads
        .order('updated_at', { ascending: false })
      
      if (error) throw error
      setLeads(data || [])
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoadingLeads(false)
    }
  }

  // v33: AI-verrijken over de hele lijst, in blokken van 10 (max 100 per run)
  const aiCandidates = leads.filter(l => !(l.contact_person || '').trim() || !(l.email || '').trim()).slice(0, 100)

  async function runAiEnrich() {
    if (!aiConfirm) {
      setAiConfirm(true)
      toast(`Klik nogmaals om ${aiCandidates.length} lead(s) via AI te verrijken. Gaat in blokken van 10; alleen lege velden worden gevuld en de bron komt in de notities. Stoppen kan tussendoor.`, 'info')
      setTimeout(() => setAiConfirm(false), 6000)
      return
    }
    setAiConfirm(false)
    setAiRunning(true)
    aiStopRef.current = false
    const all = []
    try {
      for (let i = 0; i < aiCandidates.length; i += 10) {
        if (aiStopRef.current) break
        setAiProgress({ done: i, total: aiCandidates.length })
        const chunk = aiCandidates.slice(i, i + 10)
        const { data, error } = await supabase.functions.invoke('enrich-lead', {
          body: { leadIds: chunk.map(l => l.id) }
        })
        if (error) {
          // Edge Functions geven de echte foutmelding in de response-body mee
          let msg = error.message
          try {
            const body = await error.context?.json?.()
            if (body?.error) msg = body.error
          } catch { /* geen json */ }
          throw new Error(msg)
        }
        if (data?.error) throw new Error(data.error)
        all.push(...(data?.results || []))
        setAiProgress({ done: Math.min(i + 10, aiCandidates.length), total: aiCandidates.length })
      }
      setAiResults(all)
    } catch (err) {
      toast(err.message, 'error')
      if (all.length) setAiResults(all)
    } finally {
      setAiProgress(null)
      setAiRunning(false)
      if (selectedList) fetchLeads(selectedList.id)
    }
  }

  async function fetchDeletedLists() {
    setLoadingDeleted(true)
    try {
      const { data, error } = await supabase
        .from('lead_lists')
        .select('*')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false })
      if (error) throw error
      setDeletedLists(data || [])
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoadingDeleted(false)
    }
  }

  async function handleRestore(id) {
    await restoreLeadList(id)
    fetchLeadLists()
    fetchDeletedLists()
  }

  async function handlePermanentDelete(id) {
    // Twee-staps bevestiging: eerste klik waarschuwt, tweede klik verwijdert echt
    if (confirmPermanentId !== id) {
      setConfirmPermanentId(id)
      toast('Klik nogmaals op de prullenbak om definitief te verwijderen', 'error')
      return
    }
    setConfirmPermanentId(null)
    await permanentDeleteLeadList(id)
    fetchDeletedLists()
    toast('Lijst definitief verwijderd', 'success')
  }

  async function createTeam() {
    if (!newTeamName) return
    const { data, error } = await supabase.from('teams').insert({
      name: newTeamName,
      created_by: user?.id
    }).select().single()

    if (error) {
      toast(error.message, 'error')
      return
    }
    setTeams([...teams, { ...data, team_members: [] }])
    setNewTeamName('')
    setShowAddTeam(false)
  }

  async function addProjectTeam(campaignId, teamId) {
    const { error } = await supabase.from('campaign_teams').insert({ campaign_id: campaignId, team_id: teamId })
    if (error) { toast(error.message, 'error'); return }
    toast('Team gekoppeld - dit team kan nu op alle lijsten in dit project bellen', 'success')
    fetchData()
  }

  async function addProjectManager(campaignId, managerId) {
    const { error } = await supabase.from('campaign_managers').insert({ campaign_id: campaignId, manager_id: managerId })
    if (error) { toast(error.message, 'error'); return }
    toast('Manager gekoppeld aan dit project - hij ziet alle lijsten en bellers ervan', 'success')
    fetchData()
  }

  async function removeProjectManager(campaignId, managerId) {
    const { error } = await supabase.from('campaign_managers').delete().eq('campaign_id', campaignId).eq('manager_id', managerId)
    if (error) { toast(error.message, 'error'); return }
    toast('Manager losgekoppeld van dit project', 'success')
    fetchData()
  }

  async function removeProjectTeam(campaignId, teamId) {
    const { error } = await supabase.from('campaign_teams').delete().eq('campaign_id', campaignId).eq('team_id', teamId)
    if (error) { toast(error.message, 'error'); return }
    toast('Team losgekoppeld van dit project', 'success')
    fetchData()
  }

  // v29: wachtrij-modus per project (fifo = import-volgorde, score = beste leads eerst)
  async function setQueueMode(campaign, mode) {
    const { error } = await supabase.rpc('set_campaign_queue_mode', { p_campaign_id: campaign.id, p_mode: mode })
    if (error) { toast(error.message, 'error'); return }
    setCampaigns(prev => prev.map(c => c.id === campaign.id ? { ...c, queue_mode: mode } : c))
    toast(mode === 'score'
      ? 'Wachtrij aangepast: warme leads en beslissers worden nu als eerste aangeboden'
      : 'Wachtrij aangepast: leads komen in volgorde van import', 'success')
  }

  async function toggleProjectActive(campaign) {
    const nieuweStatus = campaign.is_active === false
    const { error } = await supabase.from('campaigns').update({ is_active: nieuweStatus }).eq('id', campaign.id)
    if (error) { toast(error.message, 'error'); return }
    toast(nieuweStatus ? 'Project geactiveerd - bellers kunnen weer bellen' : 'Project gepauzeerd - bellers zien de lijsten niet meer', 'success')
    fetchData()
  }

  async function deleteProject(campaignId) {
    if (leadLists.some(l => l.campaign_id === campaignId)) {
      toast('Dit project heeft nog lijsten. Verwijder die eerst (of verplaats de leads).', 'error')
      return
    }
    if (confirmDeleteProject !== campaignId) {
      setConfirmDeleteProject(campaignId)
      toast('Klik nogmaals om dit project definitief te verwijderen', 'info')
      return
    }
    setConfirmDeleteProject(null)
    const { error } = await supabase.from('campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', campaignId)
    if (error) { toast(error.message, 'error'); return }
    toast('Project verwijderd', 'success')
    fetchData()
  }

  async function deleteTeam(teamId) {
    if (confirmDeleteTeam !== teamId) {
      setConfirmDeleteTeam(teamId)
      toast('Klik nogmaals om dit team definitief te verwijderen', 'info')
      return
    }
    setConfirmDeleteTeam(null)
    const { error } = await supabase.from('teams').delete().eq('id', teamId)
    if (error) { toast(error.message, 'error'); return }
    setTeams(teams.filter(t => t.id !== teamId))
    toast('Team verwijderd', 'success')
  }

  async function toggleTeamMember(teamId, profileId, isMember) {
    try {
      if (isMember) {
        const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('profile_id', profileId)
        if (error) throw error
      } else {
        const { error } = await supabase.from('team_members').insert({ team_id: teamId, profile_id: profileId })
        if (error) throw error
      }
      fetchData() // Refresh to get updated membership info
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function runBulkAssignment() {
    if (!bulkListId || (!bulkTargetAgentId && !bulkTargetTeamId)) {
      toast('Selecteer een lijst én een doel', 'error')
      return
    }

    setProcessingBulk(true)
    try {
      // Beller: alle leads in de lijst worden aan deze beller toegewezen
      if (bulkTargetAgentId) {
        const { error } = await supabase
          .from('leads')
          .update({ assigned_to: bulkTargetAgentId, updated_at: new Date().toISOString() })
          .eq('lead_list_id', bulkListId)
        if (error) throw error
      }

      // Team: v21 - het team hangt aan het PROJECT (campagne) van deze lijst
      if (bulkTargetTeamId) {
        const list = leadLists.find(l => l.id === bulkListId)
        if (!list?.campaign_id) {
          throw new Error('Deze lijst hangt nog niet onder een project. Koppel de lijst eerst aan een project - zonder project kan een team niet bellen.')
        }
        const { error } = await supabase
          .from('campaign_teams')
          .upsert({ campaign_id: list.campaign_id, team_id: bulkTargetTeamId }, { onConflict: 'campaign_id,team_id' })
        if (error) throw error
      }

      toast('Bulk-toewijzing voltooid!', 'success')
      fetchData()
      fetchLeadLists()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setProcessingBulk(false)
    }
  }

  if (!profile || profile.role !== 'admin') {
    return <div className="p-8 text-center bg-dark text-body min-h-screen">Toegang geweigerd.</div>
  }

  return (
    <div className={standalone ? 'min-h-screen bg-dark text-body' : 'text-body'}>
      {standalone && <Header />}

      <main className="container-wide py-8">
        <div className="flex justify-between items-center mb-10 px-6" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div className="flex items-center gap-2 text-secondary mb-1">
               <Shield size={14} /> <span className="text-xs font-bold uppercase tracking-widest">Administrator</span>
            </div>
            <h1 className="page-title">Projecten & Leads</h1>
            <p className="text-muted text-sm mt-1">Beheer je projecten (leadlijsten), teams en wat er na een afboeking gebeurt.</p>
          </div>
          <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
             <button
               onClick={() => setShowNewProject(true)}
               className="btn btn-secondary"
               style={{ padding: '14px 24px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}
             >
                <Plus size={18} /> Nieuw project
             </button>
             <button
               onClick={() => { setImportMode('import'); setShowImport(true) }}
               className="btn btn-primary"
               style={{ padding: '14px 24px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}
             >
                <Upload size={18} /> Leads importeren
             </button>
             <button
               onClick={() => { setImportMode('enrich'); setShowImport(true) }}
               className="btn btn-primary"
               title="Plak nieuwe info (beslissers, contactpersonen, e-mails...) en die wordt bij de juiste bestaande leads gezet"
               style={{ padding: '14px 24px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}
             >
                <Sparkles size={18} /> Leads verrijken
             </button>
             <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '10px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Grid size={18} className="text-primary" />
                <div>
                   <div className="text-xs text-muted uppercase font-bold">Projecten</div>
                   <div className="text-xl font-bold">{campaigns.length}</div>
                </div>
             </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 mb-8">
          <div className="tab-bar">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6">
          <AnimatePresence mode="wait">
            
            {/* VIEW: DATA & CONFIGURATION */}
            {activeTab === 'data' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-12 gap-8">
                
                <div className="col-span-12 lg:col-span-4">
                  <div className="glass-panel p-6 sticky top-[100px]">
                    <div className="flex flex-column gap-4 mb-6">
                       <h3 className="text-lg font-bold flex items-center gap-2"><Layers size={20} className="text-primary" /> Projecten</h3>
                       
                       <div className="flex bg-dark p-1 rounded-xl border border-border">
                          <button 
                            onClick={() => { setDataSubTab('active'); setSelectedList(null); }}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${dataSubTab === 'active' ? 'bg-elevated text-body' : 'text-muted hover:text-body'}`}
                          >Projecten</button>
                          <button 
                            onClick={() => { setDataSubTab('flows'); setSelectedList(null); }}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${dataSubTab === 'flows' ? 'bg-elevated text-body' : 'text-muted hover:text-body'}`}
                          >Flows</button>
                          <button 
                            onClick={() => { setDataSubTab('archived'); setSelectedList(null); }}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${dataSubTab === 'archived' ? 'bg-elevated text-body' : 'text-muted hover:text-body'}`}
                          >Archief</button>
                       </div>
                    </div>

                    <div className="flex flex-column gap-2" style={{ maxHeight: 'calc(100vh - 450px)', overflowY: 'auto' }}>
                      {dataSubTab === 'active' && (
                        <>
                          {campaigns.map(c => {
                            const linkedTeamIds = campaignTeams.filter(ct => ct.campaign_id === c.id).map(ct => ct.team_id)
                            const availableTeams = teams.filter(t => !linkedTeamIds.includes(t.id))
                            const linkedManagerIds = campaignManagers.filter(cm => cm.campaign_id === c.id).map(cm => cm.manager_id)
                            const allManagers = agents.filter(a => a.role === 'manager')
                            const availableManagers = allManagers.filter(m => !linkedManagerIds.includes(m.id))
                            const lists = leadLists.filter(l => l.campaign_id === c.id)
                            return (
                              <div key={c.id} className={`mb-2 ${c.is_active === false ? 'opacity-60' : ''}`}>
                                <div className="flex items-center justify-between px-2 py-1 gap-2">
                                  <span className="text-[10px] font-black uppercase tracking-widest text-body/70 break-words">{c.name}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {c.is_active === false ? (
                                      <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-warning/15 text-warning">gepauzeerd</span>
                                    ) : (
                                      <div className="flex items-center gap-1" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                        {linkedTeamIds.map(tid => (
                                          <button
                                            key={tid}
                                            onClick={() => removeProjectTeam(c.id, tid)}
                                            title="Klik om dit team los te koppelen van het project"
                                            className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-success/15 text-success hover:bg-error/15 hover:text-error transition-all"
                                          >{teams.find(t => t.id === tid)?.name || 'team'} ×</button>
                                        ))}
                                        {availableTeams.length > 0 && (
                                          <select
                                            value=""
                                            onChange={e => e.target.value && addProjectTeam(c.id, e.target.value)}
                                            title="Team toevoegen - meerdere teams per project kan"
                                            className="text-[9px] font-black uppercase tracking-widest px-1 py-1 rounded-lg cursor-pointer bg-elevated text-muted"
                                            style={{ maxWidth: '110px', border: 'none' }}
                                          >
                                            <option value="">{linkedTeamIds.length ? '+ team' : 'geen team'}</option>
                                            {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                          </select>
                                        )}
                                      </div>
                                    )}
                                    <button
                                      onClick={() => toggleProjectActive(c)}
                                      title={c.is_active === false ? 'Project weer activeren' : 'Project pauzeren (bellers zien de lijsten dan niet meer)'}
                                      className="p-1 rounded text-muted hover:text-body hover:bg-elevated transition-all"
                                    >{c.is_active === false ? <Play size={12} /> : <Pause size={12} />}</button>
                                    <button
                                      onClick={() => deleteProject(c.id)}
                                      title={confirmDeleteProject === c.id ? 'Klik nogmaals om definitief te verwijderen' : 'Project verwijderen (kan alleen als het geen lijsten meer heeft)'}
                                      className={`p-1 rounded transition-all ${confirmDeleteProject === c.id ? 'text-error bg-error/10' : 'text-muted hover:text-error hover:bg-elevated'}`}
                                    ><Trash2 size={12} /></button>
                                  </div>
                                </div>
                                {allManagers.length > 0 && (
                                  <div className="flex items-center gap-1 px-2 pb-1" style={{ flexWrap: 'wrap' }}>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-muted">managers:</span>
                                    {linkedManagerIds.map(mid => (
                                      <button
                                        key={mid}
                                        onClick={() => removeProjectManager(c.id, mid)}
                                        title="Klik om deze manager los te koppelen van het project"
                                        className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-primary/15 text-primary hover:bg-error/15 hover:text-error transition-all"
                                      >{agents.find(a => a.id === mid)?.full_name || 'manager'} ×</button>
                                    ))}
                                    {availableManagers.length > 0 && (
                                      <select
                                        value=""
                                        onChange={e => e.target.value && addProjectManager(c.id, e.target.value)}
                                        title="Manager toevoegen - meerdere managers per project kan. Nieuwe manager-accounts maak je aan via Admin of de project-wizard."
                                        className="text-[9px] font-black uppercase tracking-widest px-1 py-1 rounded-lg cursor-pointer bg-elevated text-muted"
                                        style={{ maxWidth: '120px', border: 'none' }}
                                      >
                                        <option value="">{linkedManagerIds.length ? '+ manager' : 'geen manager'}</option>
                                        {availableManagers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                                      </select>
                                    )}
                                  </div>
                                )}
                                <div className="flex items-center gap-1 px-2 pb-1" style={{ flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => setBriefingCampaign(c)}
                                    title="Belscript en projectinfo die de beller in het belscherm ziet"
                                    className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg bg-secondary/15 text-secondary hover:bg-secondary/30 transition-all"
                                  >briefing</button>
                                  <select
                                    value={c.queue_mode || 'fifo'}
                                    onChange={e => setQueueMode(c, e.target.value)}
                                    title="Volgorde waarin de wachtrij leads aanbiedt aan bellers"
                                    className="text-[9px] font-black uppercase tracking-widest px-1 py-1 rounded-lg cursor-pointer bg-elevated text-muted"
                                    style={{ maxWidth: '170px', border: 'none' }}
                                  >
                                    <option value="fifo">wachtrij: import-volgorde</option>
                                    <option value="score">wachtrij: beste leads eerst</option>
                                  </select>
                                </div>
                                {lists.length === 0 ? (
                                  <p className="text-[10px] text-muted px-2 py-1">Nog geen lijsten - importeer leads in dit project.</p>
                                ) : lists.map(list => (
                                  <button
                                    key={list.id}
                                    onClick={() => setSelectedList(list)}
                                    className={`w-full flex items-center justify-between p-3 mb-1 rounded-xl border transition-all ${
                                      selectedList?.id === list.id
                                        ? 'bg-primary border-primary shadow-lg shadow-primary/20'
                                        : 'bg-dark-soft border-border hover:border-border'
                                    }`}
                                  >
                                    <div className="text-left font-bold text-sm break-words">{list.name}</div>
                                    <ChevronRight size={16} />
                                  </button>
                                ))}
                              </div>
                            )
                          })}
                          {leadLists.filter(l => !l.campaign_id).length > 0 && (
                            <div className="mb-2">
                              <div className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-error">Zonder project - niet belbaar voor teams</div>
                              {leadLists.filter(l => !l.campaign_id).map(list => (
                                <button
                                  key={list.id}
                                  onClick={() => setSelectedList(list)}
                                  className={`w-full flex items-center justify-between p-3 mb-1 rounded-xl border transition-all ${
                                    selectedList?.id === list.id
                                      ? 'bg-primary border-primary shadow-lg shadow-primary/20'
                                      : 'bg-dark-soft border-error/20 hover:border-error/40'
                                  }`}
                                >
                                  <div className="text-left font-bold text-sm break-words">{list.name}</div>
                                  <ChevronRight size={16} />
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}

                      {dataSubTab === 'archived' && (
                        loadingDeleted ? <LoadingSpinner size="sm" /> : deletedLists.map(list => (
                          <div key={list.id} className="p-4 bg-dark-soft rounded-xl border border-border flex items-center justify-between group">
                             <div>
                                <div className="font-bold text-sm text-muted">{list.name}</div>
                                <div className="text-[10px] text-error font-mono">Verwijderd op {new Date(list.deleted_at).toLocaleDateString('nl-NL')}</div>
                             </div>
                             <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={() => handleRestore(list.id)} className="p-2 hover:bg-success/20 text-success rounded-lg"><RotateCcw size={14}/></button>
                                <button onClick={() => handlePermanentDelete(list.id)} className="p-2 hover:bg-error/20 text-error rounded-lg" style={confirmPermanentId === list.id ? { background: 'var(--error, #EF4444)', color: 'var(--text-on-accent)' } : undefined}><Trash2 size={14}/></button>
                             </div>
                          </div>
                        ))
                      )}

                      {dataSubTab === 'flows' && (
                         <div className="text-center py-10">
                            <FastForward size={32} className="mx-auto mb-4 opacity-20 text-primary" />
                            <p className="text-xs text-muted font-bold px-4 leading-relaxed">Rechts zie je per afboekreden precies wat er met een lead gebeurt. Leads blijven altijd in hun eigen projectlijst.</p>
                         </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-span-12 lg:col-span-8">
                  {dataSubTab === 'flows' ? (
                    <FlowSettingsEditor />
                  ) : selectedList ? (
                    <div className="glass-panel p-0 overflow-hidden min-h-[600px] flex flex-col">
                      <div className="p-6 border-b border-border flex justify-between items-center bg-elevated" style={{ flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ minWidth: 0 }}>
                           <h2 className="text-xl font-black text-body leading-none mb-1" style={{ overflowWrap: 'break-word' }}>{selectedList.name}</h2>
                           <p className="text-[10px] text-muted font-bold uppercase tracking-widest">{leads.length} leads in dit project</p>
                        </div>
                        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                          <div style={{ position: 'relative', minWidth: 0 }}>
                             <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                             <input
                               type="text"
                               value={leadSearch}
                               onChange={e => setLeadSearch(e.target.value)}
                               placeholder="Zoeken..."
                               className="bg-dark border border-border rounded-lg text-xs w-[160px] focus:w-[220px] transition-all focus:border-primary/50"
                               style={{ padding: '8px 14px 8px 34px', maxWidth: '100%' }}
                             />
                          </div>
                          <button
                            className={`btn btn-sm ${aiConfirm || aiRunning ? 'btn-primary' : 'btn-outline'}`}
                            disabled={!aiRunning && aiCandidates.length === 0}
                            onClick={() => { if (aiRunning) { aiStopRef.current = true } else runAiEnrich() }}
                            title={aiRunning ? 'Klik om te stoppen na het huidige blok' : 'Zoekt via AI (Perplexity) openbare info op: contactpersoon, functie, e-mail, website, branche. Alleen lege velden worden gevuld; bronnen komen in de notities.'}
                            style={{ opacity: (!aiRunning && aiCandidates.length === 0) ? 0.5 : 1, whiteSpace: 'nowrap' }}
                          >
                            <Sparkles size={14} /> {aiRunning ? `Stop (${aiProgress ? `${aiProgress.done}/${aiProgress.total}` : '...'})` : aiConfirm ? `Bevestig (${aiCandidates.length})` : 'AI-verrijken'}
                          </button>
                          <button
                            className="btn btn-sm btn-outline text-error hover:bg-error/10"
                            onClick={async () => { await deleteLeadList(selectedList.id); setSelectedList(null); fetchLeadLists(); }}
                          ><Trash2 size={14} /> Verwijderen</button>
                        </div>
                      </div>

                      {/* Batch Intelligence Summary */}
                      <div className="grid grid-cols-4 border-b border-border">
                         <div className="p-4 border-r border-border text-center">
                            <div className="text-[10px] font-black text-muted uppercase mb-1">Pijplijn Totaal</div>
                            <div className="text-xl font-black">{leads.length}</div>
                         </div>
                         <div className="p-4 border-r border-border text-center bg-primary/5">
                            <div className="text-[10px] font-black text-primary uppercase mb-1">Nieuwe Leads</div>
                            <div className="text-xl font-black text-primary">{leads.filter(l => l.status === 'new').length}</div>
                         </div>
                         <div className="p-4 border-r border-border text-center bg-info/5">
                            <div className="text-[10px] font-black text-info uppercase mb-1">Afspraken</div>
                            <div className="text-xl font-black text-info">{leads.filter(l => l.status === 'afspraak_gemaakt').length}</div>
                         </div>
                         <div className="p-4 text-center bg-success/5">
                            <div className="text-[10px] font-black text-success uppercase mb-1">Deals Verzorgd</div>
                            <div className="text-xl font-black text-success">{leads.filter(l => l.status === 'deal').length}</div>
                         </div>
                      </div>

                      <div className="p-0 flex-1 overflow-y-auto overflow-x-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                        {loadingLeads ? <div className="p-20"><LoadingSpinner /></div> : (
                          <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-dark z-10 text-[10px] font-black text-muted uppercase tracking-widest border-b border-border shadow-sm">
                              <tr>
                                <th className="p-4 pl-8">Lead Contact</th>
                                <th className="p-4">Huidige Status</th>
                                <th className="p-4">Toegewezen aan</th>
                                <th className="p-4">Pogingen</th>
                                <th className="p-4">Laatste notitie</th>
                                <th className="p-4 pr-8 text-right">Laatste Actie</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(leadSearch ? leads.filter(l => l.name.toLowerCase().includes(leadSearch.toLowerCase()) || l.phone.includes(leadSearch)) : leads).length === 0 ? (
                                <tr><td colSpan={6} className="p-20 text-center text-muted font-bold italic">Geen leads gevonden die voldoen aan je zoekopdracht...</td></tr>
                              ) : (leadSearch ? leads.filter(l => l.name.toLowerCase().includes(leadSearch.toLowerCase()) || l.phone.includes(leadSearch)) : leads).map(lead => (
                                <tr
                                  key={lead.id}
                                  className="border-b border-border hover:bg-elevated transition-all group cursor-pointer"
                                  onClick={() => setDetailLead(lead)}
                                  title="Klik voor de contactkaart, afboek-geschiedenis en notities"
                                >
                                  <td className="p-4 pl-8">
                                     <div className="font-bold text-body group-hover:text-primary transition-colors">{lead.name}</div>
                                     <div className="text-[10px] text-muted font-mono">{lead.phone}</div>
                                  </td>
                                  <td className="p-4"><StatusBadge status={lead.status} /></td>
                                  <td className="p-4">
                                     <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-elevated flex items-center justify-center text-[10px] font-bold text-muted">
                                           {(agents.find(a => a.id === lead.assigned_to)?.full_name || '-').charAt(0)}
                                        </div>
                                        <span className="text-xs text-muted">{agents.find(a => a.id === lead.assigned_to)?.full_name || 'Geen toewijzing'}</span>
                                     </div>
                                  </td>
                                  <td className="p-4 text-center font-bold text-muted">{lead.contact_attempts || 0}x</td>
                                  <td className="p-4 text-xs text-muted" style={{ maxWidth: '260px' }}>
                                     <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {(lead.notes || '').split('\n').filter(Boolean).pop() || '-'}
                                     </div>
                                  </td>
                                  <td className="p-4 pr-8 text-right">
                                     <div className="text-[10px] font-black text-body/40 uppercase">{new Date(lead.updated_at).toLocaleDateString()}</div>
                                     <div className="text-[9px] text-muted uppercase tracking-tighter">{new Date(lead.updated_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="glass-panel flex flex-column items-center justify-center p-20 text-center opacity-30">
                       <Layers size={64} className="mb-4 text-primary" />
                       <h3 className="text-xl font-black">Kies een project</h3>
                       <p className="max-w-xs text-sm mt-2 font-bold text-muted">Klik links op een project om de leads te zien, of open Flows om in te stellen wat er na een afboeking gebeurt.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* VIEW: TEAM SETUP */}
            {activeTab === 'teams' && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                
                {/* Team Cards */}
                {teams.map(team => (
                  <div key={team.id} className="glass-panel p-6 flex flex-column gap-6">
                    <div className="flex justify-between items-start">
                      <div>
                         <h3 className="text-xl font-black text-body">{team.name}</h3>
                         <div className="text-xs text-muted font-bold flex items-center gap-2 mt-1">
                            <Users size={12} /> {team.team_members?.length || 0} Members
                         </div>
                      </div>
                      <button
                        onClick={() => deleteTeam(team.id)}
                        title={confirmDeleteTeam === team.id ? 'Klik nogmaals om definitief te verwijderen' : 'Team verwijderen'}
                        className={`transition-colors ${confirmDeleteTeam === team.id ? 'text-error' : 'text-muted hover:text-error'}`}
                      ><Trash2 size={18} /></button>
                    </div>

                    <div className="flex flex-column gap-2">
                       <div className="text-xs text-muted uppercase font-black tracking-widest mb-1">Members</div>
                       {/* v31: typen i.p.v. scrollen - zoek op naam of e-mail */}
                       <input
                         type="text"
                         value={memberSearch[team.id] || ''}
                         onChange={e => setMemberSearch(prev => ({ ...prev, [team.id]: e.target.value }))}
                         placeholder="Typ een naam om te zoeken..."
                         className="form-dark w-full"
                         style={{ padding: '9px 12px', fontSize: '0.85rem', marginBottom: '4px' }}
                       />
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                          {(() => {
                            const q = (memberSearch[team.id] || '').toLowerCase().trim()
                            const list = agents
                              .filter(a => a.is_active !== false)
                              .filter(a => !q
                                || (a.full_name || '').toLowerCase().includes(q)
                                || (a.email || '').toLowerCase().includes(q))
                              .sort((a, b) => {
                                const am = team.team_members?.some(m => m.profile_id === a.id) ? 0 : 1
                                const bm = team.team_members?.some(m => m.profile_id === b.id) ? 0 : 1
                                return am - bm || (a.full_name || '').localeCompare(b.full_name || '')
                              })
                            if (list.length === 0) {
                              return <div className="text-muted text-sm p-2">Geen medewerkers gevonden voor "{memberSearch[team.id]}"</div>
                            }
                            return list.map(a => {
                              const isMember = team.team_members?.some(m => m.profile_id === a.id)
                              return (
                                <div key={a.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-elevated transition-all text-sm group">
                                   <span className={isMember ? 'text-body font-bold' : 'text-muted'}>{a.full_name}</span>
                                   <button
                                     onClick={() => toggleTeamMember(team.id, a.id, isMember)}
                                     className={`w-6 h-6 rounded flex items-center justify-center transition-all ${isMember ? 'bg-primary text-white' : 'bg-elevated text-transparent group-hover:text-muted'}`}
                                   >
                                      <CheckCircle size={14} />
                                   </button>
                                </div>
                              )
                            })
                          })()}
                       </div>
                    </div>

                  </div>
                ))}

                {/* Add Team Card */}
                {showAddTeam ? (
                  <div className="glass-panel p-6 border-dashed border-primary/50">
                    <h3 className="text-lg font-bold mb-4">Nieuw Team Aanmaken</h3>
                    <input 
                      type="text" 
                      placeholder="Team Naam..." 
                      value={newTeamName}
                      onChange={e => setNewTeamName(e.target.value)}
                      className="w-full bg-dark border border-border p-3 rounded-xl mb-4 focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-2">
                       <button className="btn btn-primary flex-1" onClick={createTeam}>Opslaan</button>
                       <button className="btn btn-outline flex-1" onClick={() => setShowAddTeam(false)}>Sluiten</button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowAddTeam(true)}
                    className="glass-panel p-6 border-dashed border-border flex flex-column items-center justify-center gap-3 hover:border-primary/50 transition-all text-muted hover:text-primary min-h-[300px]"
                  >
                    <Plus size={32} />
                    <span className="font-bold">Team Toevoegen</span>
                  </button>
                )}
              </motion.div>
            )}

            {/* VIEW: MASS OPERATIONS */}
            {/* VIEW: MASS OPERATIONS */}
            {activeTab === 'mass' && (
              <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="max-w-4xl mx-auto">
                 <div className="glass-panel p-10">
                    <div className="flex items-center gap-6 mb-12">
                       <div className="p-5 bg-secondary/10 text-secondary rounded-[28px] shadow-inner"><FastForward size={32} /></div>
                       <div>
                          <h2 className="text-3xl font-black tracking-tight italic uppercase">BULK DISTRIBUTION</h2>
                          <p className="text-muted text-sm font-medium">Wijs volledige batches toe aan specifieke medewerkers of teams.</p>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                       
                       <div className="flex flex-column gap-6">
                          <div className="flex flex-column gap-3">
                             <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-secondary/20 text-secondary text-[10px] flex items-center justify-center font-black">1</span>
                                <label className="text-xs font-black uppercase tracking-widest text-muted">Selecteer bron-project</label>
                             </div>
                             <select 
                               className="bg-dark p-4 rounded-xl border border-border w-full font-bold text-lg focus:border-secondary transition-all"
                               value={bulkListId}
                               onChange={e => setBulkListId(e.target.value)}
                             >
                                <option value="">-- Kies een lijst --</option>
                                {leadLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                             </select>
                          </div>

                          <div className="flex flex-column gap-3">
                             <div className="flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-secondary/20 text-secondary text-[10px] flex items-center justify-center font-black">2</span>
                                <label className="text-xs font-black uppercase tracking-widest text-muted">Doel Toewijzing</label>
                             </div>
                             
                             <div className="bg-dark/50 p-6 rounded-2xl border border-border space-y-6">
                                <div>
                                   <label className="text-[10px] text-muted font-black block mb-3 uppercase tracking-widest">Individuele Beller</label>
                                   <select 
                                     className="bg-dark p-3 rounded-lg border border-border w-full text-sm font-bold"
                                     value={bulkTargetAgentId}
                                     onChange={e => { setBulkTargetAgentId(e.target.value); if(e.target.value) setBulkTargetTeamId(''); }}
                                   >
                                      <option value="">-- Geen beller --</option>
                                      {agents.filter(a => a.is_active !== false).map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                                   </select>
                                </div>

                                <div className="relative py-2">
                                   <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
                                   <div className="relative flex justify-center"><span className="bg-dark px-3 text-[10px] font-black text-body/20 uppercase tracking-widest">of</span></div>
                                </div>

                                <div>
                                   <label className="text-[10px] text-muted font-black block mb-3 uppercase tracking-widest">Beller Groep (Team)</label>
                                   <select 
                                     className="bg-dark p-3 rounded-lg border border-border w-full text-sm font-bold"
                                     value={bulkTargetTeamId}
                                     onChange={e => { setBulkTargetTeamId(e.target.value); if(e.target.value) setBulkTargetAgentId(''); }}
                                   >
                                      <option value="">-- Geen team --</option>
                                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                   </select>
                                </div>
                             </div>
                          </div>
                       </div>

                       <div className="flex flex-column">
                          <div className="flex items-center gap-2 mb-3">
                             <span className="w-6 h-6 rounded-full bg-secondary/20 text-secondary text-[10px] flex items-center justify-center font-black">3</span>
                             <label className="text-xs font-black uppercase tracking-widest text-muted">Actie Preview</label>
                          </div>
                          
                          <div className="flex-1 bg-gradient-to-br from-secondary/5 to-transparent border border-secondary/10 rounded-2xl p-8 flex flex-column items-center justify-center text-center">
                             {bulkListId ? (
                                <>
                                   <Zap size={48} className="text-secondary mb-6 animate-pulse" />
                                   <h3 className="text-xl font-black text-body mb-2 italic">READY TO SYNC</h3>
                                   <p className="text-sm text-muted leading-relaxed font-medium">
                                      {bulkTargetTeamId ? (
                                        <>Team <span className="text-body font-bold">{teams.find(t => t.id === bulkTargetTeamId)?.name}</span> wordt gekoppeld aan het project van <span className="text-body font-bold">{leadLists.find(l => l.id === bulkListId)?.name}</span> - en mag dan op álle lijsten binnen dat project bellen.</>
                                      ) : (
                                        <>Je staat op het punt om alle leads in <span className="text-body font-bold">{leadLists.find(l => l.id === bulkListId)?.name}</span> toe te wijzen aan
                                        <span className="text-body font-bold"> {bulkTargetAgentId ? agents.find(a => a.id === bulkTargetAgentId)?.full_name : '...'}</span>. Ook leads die al bij iemand anders lagen gaan mee.</>
                                      )}
                                   </p>
                                   <div className="mt-8 pt-8 border-t border-border w-full">
                                      <button 
                                        onClick={runBulkAssignment}
                                        disabled={processingBulk || (!bulkTargetAgentId && !bulkTargetTeamId)}
                                        className="btn btn-secondary w-full py-5 text-lg font-black tracking-widest uppercase hover:scale-[1.02] transition-transform active:scale-95 shadow-2xl shadow-secondary/20"
                                      >
                                         {processingBulk ? <LoadingSpinner size="sm" /> : 'VOER DISTRIBUTIE UIT'}
                                      </button>
                                   </div>
                                </>
                             ) : (
                                <div className="opacity-20 flex flex-column items-center">
                                   <Grid size={64} className="mb-4" />
                                   <p className="text-sm font-bold uppercase tracking-widest">Distributie preview wordt hier geladen...</p>
                                </div>
                             )}
                          </div>
                       </div>

                    </div>
                 </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

      <ImportLeadsModal
        isOpen={showImport}
        initialMode={importMode}
        onClose={() => setShowImport(false)}
        onImported={() => { fetchData(); fetchLeadLists(); if (selectedList) fetchLeads(selectedList.id) }}
      />

      {aiResults && <EnrichResultsModal results={aiResults} onClose={() => setAiResults(null)} />}

      <LeadDetailModal
        isOpen={!!detailLead}
        onClose={() => setDetailLead(null)}
        lead={detailLead}
        assignedName={agents.find(a => a.id === detailLead?.assigned_to)?.full_name}
      />

      <NewProjectWizard
        isOpen={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreated={(list) => { fetchData(); fetchLeadLists(); setDataSubTab('active'); setSelectedList(list) }}
      />

      <CampaignBriefingModal
        isOpen={!!briefingCampaign}
        campaign={briefingCampaign}
        onClose={() => setBriefingCampaign(null)}
      />

      <style>{`
        .container-wide { max-width: 1400px; margin: 0 auto; }
        .grid-cols-12 { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); }
        .col-span-12 { grid-column: span 12; min-width: 0; }
        .lg\\:col-span-4 { grid-column: span 4; }
        .lg\\:col-span-8 { grid-column: span 8; }
        .glass-panel { background: var(--border); backdrop-filter: blur(20px); border: 1px solid var(--border); border-radius: 24px; }
        .bg-dark-soft { background: var(--bg-elevated); }
        .text-secondary { color: var(--secondary); }
        .text-error { color: var(--danger); }
        .btn-secondary { background: var(--secondary); color: var(--primary-dark); }
        .btn-outline { border: 1px solid var(--border-strong); color: var(--text-muted); }
        .btn-outline:hover { background: var(--bg-elevated); color: var(--text-primary); }
        .hover-danger:hover { color: var(--danger); }
      `}</style>
    </div>
  )
}

function ListButton({ list, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-between w-full p-4 rounded-xl transition-all ${
        active ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'bg-elevated text-muted hover:bg-elevated'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <List size={16} className="shrink-0" />
        <span className="text-sm font-bold break-words text-left min-w-0">{list.name}</span>
      </div>
      <ChevronRight size={14} className="shrink-0" />
    </button>
  )
}

