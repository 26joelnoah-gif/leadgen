import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLeadLists } from '../hooks/useLeadLists'
import Header from '../components/Header'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Plus, Users, Settings, UserPlus, Phone, PhoneOff, Mail,
  UserCheck, Shield, Activity, Download, Play, Zap, Upload,
  X, CheckCircle, AlertTriangle, Bell, Megaphone, Target,
  DollarSign, Calendar, List, ChevronRight, Layers, Trash2, Search, KeyRound
} from 'lucide-react'
import { STATUS_MAP } from '../utils/statusUtils'
import { exportToCSV } from '../utils/exportUtils'
import { parseCSV, validateLeads } from '../utils/importUtils'
import { CAMPAIGN_TYPES } from '../utils/campaignUtils'
import { getSettings, saveSettings } from '../utils/settingsUtils'
import { useToast } from '../components/Toast'
import LoadingSpinner from '../components/LoadingSpinner'
import StatusSelector from '../components/StatusSelector'
import PipelineFunnel from '../components/PipelineFunnel'
import CampaignModal, { CampaignCard } from '../components/CampaignModal'
import BriefingModal, { BriefingCard } from '../components/BriefingModal'
import { LeadListModal } from '../components/LeadListModal'
import EmployeeModal from '../components/EmployeeModal'
import ResetPasswordModal from '../components/ResetPasswordModal'
import IntensityModal from '../components/IntensityModal'
import ManagerProjectsModal from '../components/ManagerProjectsModal'
import NewProjectWizard from '../components/NewProjectWizard'
import PayoutSettings from '../components/PayoutSettings'
import ImportLeadsModal from '../components/ImportLeadsModal'
import LeadManagement from './LeadManagement' // IMPORT THE MANAGEMENT COMPONENT

// Seconden -> "1u 11m" / "11m"
function fmtBeltijd(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}u ${m}m`
  return `${m}m`
}

export default function Admin() {
  const { user, profile, isWorking, toggleWorkingMode, isDemoMode } = useAuth()
  const toast = useToast()
  const { leadLists, fetchLeadLists } = useLeadLists()

  // Tab in de URL (?tab=team) zodat terug-knop en delen van links werken
  const [searchParams, setSearchParams] = useSearchParams()
  // Admin start in beheer (Projecten & Leads) - het dashboard met lead-stats
  // blijft bereikbaar via de tab, maar is niet de beginpagina.
  const activeTab = searchParams.get('tab') || 'data'
  const setActiveTab = (t) => setSearchParams(t === 'data' ? {} : { tab: t }, { replace: true })
  const [leads, setLeads] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)
  const [newLead, setNewLead] = useState({
    name: '', phone: '', email: '', notes: '', 
    assigned_to: '', lead_list_id: '', lead_source: 'cold', decision_maker: false
  })
  
  const [showCampaign, setShowCampaign] = useState(false)
  const [showBriefing, setShowBriefing] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const [briefings, setBriefings] = useState([])
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null)
  const [todayStats, setTodayStats] = useState({ calls: 0, seconds: 0, afspraken: 0, deals: 0, perAgent: {} })
  const [showEmployee, setShowEmployee] = useState(false)
  const [managingUser, setManagingUser] = useState(null) // manager wiens projecten we koppelen
  const [resettingUser, setResettingUser] = useState(null) // v35: wachtwoord resetten voor deze gebruiker
  const [intensityUser, setIntensityUser] = useState(null) // v43: intensiteit/ingelogde-tijd voor deze gebruiker
  const [showNewProject, setShowNewProject] = useState(false)
  const [managerLinks, setManagerLinks] = useState([]) // campaign_managers-rijen voor de projectenteller (v23)
  // Voor het projecten/leadlijsten-overzicht per beller (Team-tab): teams met hun
  // leden, en de campaign_teams-koppeling om per team de projecten te vinden.
  const [assignTeams, setAssignTeams] = useState([])
  const [assignCampaignTeams, setAssignCampaignTeams] = useState([])
  const [assignProjects, setAssignProjects] = useState([]) // campaigns (projecten), niet verwijderd
  const [expandedAssignments, setExpandedAssignments] = useState({}) // per user-id: toon leadlijsten
  const [showLeadList, setShowLeadList] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importMode, setImportMode] = useState('import') // v32.1: 'import' of 'enrich'
  const [systemSettings, setSystemSettings] = useState(getSettings)
  // v31: organisaties (fundament voor klant-omgevingen) + org-beheerpaneel
  const [orgs, setOrgs] = useState([])
  const [showOrgs, setShowOrgs] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [creatingOrg, setCreatingOrg] = useState(false)

  useEffect(() => {
    fetchData()
    fetchLeadLists()
  }, [isDemoMode])

  async function handleAddEmployee(employeeData) {
    if (isDemoMode) {
      const newUser = {
        id: `demo-${Date.now()}`,
        email: employeeData.email,
        full_name: employeeData.name,
        role: employeeData.role,
        created_at: new Date().toISOString()
      }
      setUsers(prev => [...prev, newUser])
      toast('Medewerker toegevoegd (Demo Mode)', 'success')
      return
    }

    try {
      // BELANGRIJK: aparte client zonder sessie-opslag, anders vervangt
      // signUp de sessie van de admin en ben je ineens ingelogd als de nieuwe medewerker
      const tempClient = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } }
      )
      const { data: signUpData, error } = await tempClient.auth.signUp({
        email: employeeData.email,
        password: employeeData.password,
        options: {
          data: {
             full_name: employeeData.name
          }
        }
      })
      if (error) throw error

      // Nieuwe accounts worden altijd als 'employee' aangemaakt (handle_new_user);
      // een andere rol zet de admin hier expliciet via de eigen (admin-)sessie.
      // v31: nieuwe accounts erven de organisatie van hun maker (nu meestal
      // leeg = jouw eigen omgeving; belangrijk zodra klanten eigen orgs hebben).
      if (signUpData?.user?.id) {
        const updates = {}
        if (employeeData.role && employeeData.role !== 'employee') updates.role = employeeData.role
        if (profile?.organization_id) updates.organization_id = profile.organization_id
        if (Object.keys(updates).length > 0) {
          const { error: updErr } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', signUpData.user.id)
          if (updErr) toast(`Account aangemaakt, maar instellen van rol/organisatie mislukte: ${updErr.message}`, 'error')
        }

        // v36: recruiter krijgt meteen een eigen sollicitatieproject (campagne
        // type='recruitment' + lijst "Sollicitanten", assigned_to = de recruiter)
        // zodat hij/zij direct zelf sollicitanten kan toevoegen en bellen.
        if (employeeData.role === 'recruiter') {
          const { data: campaign, error: campErr } = await supabase
            .from('campaigns')
            .insert({
              name: `Sollicitaties — ${employeeData.name}`,
              type: 'recruitment',
              organization_id: profile?.organization_id || null,
              created_by: user.id
            })
            .select()
            .single()
          if (campErr) {
            toast(`Recruiter aangemaakt, maar het sollicitatieproject kon niet worden opgezet: ${campErr.message}`, 'error')
          } else {
            const { error: cmErr } = await supabase.from('campaign_managers').insert({ campaign_id: campaign.id, manager_id: signUpData.user.id })
            if (cmErr) toast(`Recruiter aangemaakt, maar de koppeling aan het sollicitatieproject mislukte: ${cmErr.message}. Zonder deze koppeling kan de recruiter zijn eigen sollicitanten niet zien.`, 'error')
            const { error: listErr } = await supabase.from('lead_lists').insert({
              name: 'Sollicitanten',
              campaign_id: campaign.id,
              assigned_to: signUpData.user.id,
              created_by: user.id,
              organization_id: profile?.organization_id || null
            })
            if (listErr) toast(`Project aangemaakt, maar de lijst kon niet worden opgezet: ${listErr.message}`, 'error')
          }
        }
      }

      toast(
        employeeData.role === 'manager'
          ? 'Manager aangemaakt! Koppel nu projecten via de knop "Projecten".'
          : employeeData.role === 'recruiter'
          ? 'Recruiter aangemaakt! Het sollicitatieproject "Sollicitanten" staat klaar.'
          : employeeData.role === 'backoffice'
          ? 'Backoffice-medewerker aangemaakt! Koppel hem/haar aan een team via Lead Beheer > Teams, net als een beller.'
          : 'Medewerker uitnodiging verstuurd!',
        'success'
      )
      fetchData()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // Welke projecten en leadlijsten heeft deze persoon aan staan? Bellers/backoffice
  // via hun team (assignTeams -> assignCampaignTeams), managers/recruiters via hun
  // campaign_managers-koppeling (managerLinks). Leadlijsten = lijsten van die
  // projecten, plus lijsten die rechtstreeks aan deze persoon zijn toegewezen.
  function getUserAssignments(u) {
    const myTeamIds = assignTeams.filter(t => (t.team_members || []).some(m => m.profile_id === u.id)).map(t => t.id)
    const viaTeam = assignCampaignTeams.filter(ct => myTeamIds.includes(ct.team_id)).map(ct => ct.campaign_id)
    const viaManager = managerLinks.filter(pm => pm.manager_id === u.id).map(pm => pm.campaign_id)
    const projectIds = [...new Set([...viaTeam, ...viaManager])]
    const userProjects = assignProjects.filter(p => projectIds.includes(p.id))
    const userLists = leadLists.filter(l => !l.deleted_at && (l.assigned_to === u.id || projectIds.includes(l.campaign_id)))
    return { projects: userProjects, lists: userLists }
  }

  if (profile && profile.role !== 'admin') return <Navigate to="/dashboard" />

  async function fetchData() {
    setLoading(true)
    try {
      const { data: l, error: lErr } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
      if (lErr) throw lErr
      const { data: u, error: uErr } = await supabase.from('profiles').select('*').order('full_name')
      if (uErr) throw uErr
      const { data: pm } = await supabase.from('campaign_managers').select('campaign_id, manager_id')
      const { data: o } = await supabase.from('organizations').select('id, name, slug, owner_id').order('name')
      // Voor "welke projecten/leadlijsten heeft deze beller aan staan" (Team-tab):
      // dezelfde route als my_list_ids() in de database - team -> campaign_teams.
      const { data: atRows } = await supabase.from('teams').select('id, name, team_members(profile_id)')
      const { data: actRows } = await supabase.from('campaign_teams').select('campaign_id, team_id')
      const { data: apRows } = await supabase.from('campaigns').select('id, name, organization_id, is_active').is('deleted_at', null).order('name')
      setAssignTeams(atRows || [])
      setAssignCampaignTeams(actRows || [])
      setAssignProjects(apRows || [])
      setLeads(l || [])
      setUsers(u || [])
      setManagerLinks(pm || [])
      setOrgs(o || [])

      // Vandaag: gesprekken, beltijd en resultaten uit call_logs (voor KPI-rij + teamkaarten)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const { data: logs } = await supabase
        .from('call_logs')
        .select('agent_id, lead_id, duration_seconds, disposition')
        .gte('disposed_at', todayStart.toISOString())
        .limit(5000)
      // Statuskaart per lead, zodat een teruggedraaide afboeking (bv. "Terug in wachtrij"
      // bij Manager > Resultaten) niet als afspraak/deal blijft meetellen als de lead
      // inmiddels een andere status heeft.
      const leadStatusById = {}
      ;(l || []).forEach(lead => { leadStatusById[lead.id] = lead.status })
      const stats = { calls: 0, seconds: 0, afspraken: 0, deals: 0, perAgent: {} }
      ;(logs || []).forEach(log => {
        stats.calls++
        stats.seconds += log.duration_seconds || 0
        const nogSteedsActueel = leadStatusById[log.lead_id] === log.disposition
        if (log.disposition === 'afspraak_gemaakt' && nogSteedsActueel) stats.afspraken++
        if ((log.disposition === 'deal' || log.disposition === 'bruto_deal') && nogSteedsActueel) stats.deals++
        if (log.agent_id) {
          if (!stats.perAgent[log.agent_id]) stats.perAgent[log.agent_id] = { calls: 0, seconds: 0 }
          stats.perAgent[log.agent_id].calls++
          stats.perAgent[log.agent_id].seconds += log.duration_seconds || 0
        }
      })
      setTodayStats(stats)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteEmployee(userId) {
    // Twee keer klikken = bevestigen (voorkomt per ongeluk verwijderen)
    if (confirmDeleteUser !== userId) {
      setConfirmDeleteUser(userId)
      toast('Klik nogmaals op de prullenbak om definitief te verwijderen. Tip: inactief zetten bewaart alles en is omkeerbaar.', 'error')
      return
    }
    setConfirmDeleteUser(null)
    try {
      // v31: .select() erbij zodat we ZIEN of er echt iets verwijderd is -
      // vroeger blokkeerde de database dit stilletjes en kwam de medewerker
      // na verversen gewoon terug.
      const { data, error } = await supabase.from('profiles').delete().eq('id', userId).select('id')
      if (error) throw error
      if (!data || data.length === 0) throw new Error('Verwijderen is geweigerd door de database. Ververs de pagina en probeer opnieuw.')
      setUsers(prev => prev.filter(u => u.id !== userId))
      toast('Medewerker verwijderd. Gesprekshistorie blijft bewaard in de rapportage.', 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // v31: inactief zetten = niet meer kunnen inloggen en uit alle lijsten,
  // maar alle historie en instellingen blijven staan. Omkeerbaar.
  async function handleToggleActive(u) {
    const nowActive = u.is_active !== false
    try {
      const { error } = await supabase.from('profiles').update({ is_active: !nowActive }).eq('id', u.id)
      if (error) throw error
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !nowActive } : x))
      toast(nowActive ? `${u.full_name} is inactief gezet en kan niet meer inloggen` : `${u.full_name} is weer actief`, 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // v31: organisatie aanmaken (fundament voor eigen klant-omgevingen)
  async function handleCreateOrg(e) {
    e.preventDefault()
    const name = newOrgName.trim()
    if (!name) return
    setCreatingOrg(true)
    try {
      const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org'
      const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`
      const { error } = await supabase.from('organizations').insert({ name, slug, owner_id: user.id })
      if (error) throw error
      setNewOrgName('')
      toast(`Organisatie "${name}" aangemaakt. Deel medewerkers in via het dropdown-menu op hun kaart.`, 'success')
      fetchData()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCreatingOrg(false)
    }
  }

  // v31: medewerker in een organisatie plaatsen (of terug naar jouw omgeving)
  async function handleSetUserOrg(u, orgId) {
    try {
      const { error } = await supabase.from('profiles').update({ organization_id: orgId || null }).eq('id', u.id)
      if (error) throw error
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, organization_id: orgId || null } : x))
      toast(orgId ? `${u.full_name} ingedeeld bij ${orgs.find(o => o.id === orgId)?.name || 'organisatie'}` : `${u.full_name} staat weer in jouw eigen omgeving`, 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  async function addLead(e) {
    e.preventDefault()
    if (!newLead.lead_list_id) {
       toast('Selecteer eerst een lijst', 'error')
       return
    }
    try {
      const { error } = await supabase.from('leads').insert({
        name: newLead.name,
        phone: newLead.phone,
        email: newLead.email || null,
        notes: newLead.notes || '',
        lead_list_id: newLead.lead_list_id,
        assigned_to: newLead.assigned_to || null,
        created_by: user.id,
        status: 'new',
        lead_source: newLead.lead_source,
        decision_maker: newLead.decision_maker,
        organization_id: profile?.organization_id
      })
      if (error) throw error
      setShowAddLead(false)
      fetchData()
      toast('Lead toegevoegd!', 'success')
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  // Support functions...
  const handleUpdateFlow = async (id, updates) => {
    try {
      const { error } = await supabase.from('profiles').update(updates).eq('id', id)
      if (error) throw error
      fetchData()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="min-h-screen bg-dark text-body">
      <Header />

      <main className="container-wide py-6 px-8">
        {/* TABS MENU */}
        <div className="tab-bar mb-8">
           {[
             { id: 'data', label: 'Projecten & Leads', Icon: Layers },
             { id: 'medewerkers', label: 'Team', Icon: Users },
             { id: 'verdiensten', label: 'Uitbetaling', Icon: DollarSign },
             { id: 'dashboard', label: 'Dashboard', Icon: Activity }
           ].map(t => (
             <button
               key={t.id}
               onClick={() => setActiveTab(t.id)}
               className={`tab-btn ${activeTab === t.id ? 'active' : ''}`}
             >
               <t.Icon size={16} />
               {t.label}
             </button>
           ))}
        </div>

        {activeTab === 'dashboard' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
             <div className="flex justify-between items-center mb-10" style={{ flexWrap: 'wrap', gap: '16px' }}>
                <div>
                   <h1 className="page-title">Admin</h1>
                   <p className="page-subtitle">Welkom terug, {profile?.full_name?.split(' ')[0]}. Dit gebeurt er vandaag.</p>
                </div>
                <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                   <button className="btn btn-secondary" onClick={() => setShowNewProject(true)}><Layers size={18} /> Nieuw project</button>
                   <button className="btn btn-primary" onClick={() => { setImportMode('import'); setShowImport(true) }}><Upload size={18} /> Leads importeren</button>
                   <button className="btn btn-primary" onClick={() => { setImportMode('enrich'); setShowImport(true) }}><Zap size={18} /> Leads verrijken</button>
                   <button className="btn btn-outline" onClick={() => setShowAddLead(true)}><Plus size={18} /> Nieuwe lead</button>
                   <button className="btn btn-outline" onClick={() => setShowCampaign(true)}><Megaphone size={18}/> Campagne</button>
                </div>
             </div>

             {/* KPI-rij: wat gebeurt er vandaag (live uit call_logs) */}
             <div className="stats-grid">
                {[
                  { label: 'Gesprekken vandaag', val: todayStats.calls, Icon: Phone, color: 'var(--primary)' },
                  { label: 'Beltijd vandaag', val: fmtBeltijd(todayStats.seconds), Icon: Activity, color: 'var(--secondary)' },
                  { label: 'Afspraken vandaag', val: todayStats.afspraken, Icon: Calendar, color: 'var(--info)' },
                  { label: 'Deals vandaag', val: todayStats.deals, Icon: CheckCircle, color: 'var(--success)' }
                ].map((kpi, i) => (
                  <motion.div key={kpi.label} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }} className="stat-card glass-panel">
                     <div className="flex justify-between items-start">
                        <div>
                           <div className="number" style={{ color: kpi.color }}>{kpi.val}</div>
                           <div className="label">{kpi.label}</div>
                        </div>
                        <kpi.Icon size={24} style={{ color: kpi.color, opacity: 0.25 }} />
                     </div>
                  </motion.div>
                ))}
             </div>

             <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-10">
                <div className="glass-panel p-6 border-l-2 border-secondary h-fit">
                   <h2 className="text-secondary font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2"><Zap size={14}/> Live Campagnes</h2>
                   {campaigns.length > 0 ? campaigns.map(c => <CampaignCard key={c.id} campaign={c} />) : <p className="text-xs text-muted opacity-50 italic">Geen actieve campagnes.</p>}
                </div>
                <div className="glass-panel p-6 border-l-2 border-primary h-fit">
                   <h2 className="text-primary font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2"><Bell size={14}/> Mededelingen</h2>
                   <button onClick={() => setShowBriefing(true)} className="btn btn-outline btn-sm btn-block mb-4">Verstuur nieuwe briefing</button>
                   {briefings.map(b => <BriefingCard key={b.id} briefing={b} />)}
                </div>
                <div className="glass-panel p-8 bg-gradient-to-br from-primary/20 to-transparent border border-border">
                   <h2 className="text-primary font-black text-sm uppercase tracking-widest mb-4 flex items-center gap-2"><Download size={14}/> Export & Tools</h2>
                   <button onClick={() => exportToCSV(leads, 'LeadGen_Backup')} className="btn btn-primary btn-block py-4 font-black">Download alle data (.csv)</button>
                   <Link to="/admin/telemetry" className="btn btn-outline btn-block mt-4 border-border text-muted hover:text-body">Telemetrie openen</Link>
                </div>
             </div>
          </motion.div>
        )}

        {activeTab === 'medewerkers' && (
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
             <div className="flex justify-between items-center mb-8" style={{ flexWrap: 'wrap', gap: '12px' }}>
                <div>
                   <h2 className="page-title">Team</h2>
                   <p className="page-subtitle">Bellers, managers en admins - met hun activiteit van vandaag.</p>
                </div>
                <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                   <button onClick={() => setShowOrgs(v => !v)} className="btn btn-outline"><Shield size={18} /> Organisaties {orgs.length > 0 && `(${orgs.length})`}</button>
                   <button onClick={() => setShowEmployee(true)} className="btn btn-primary"><UserPlus size={18} /> Nieuwe medewerker</button>
                </div>
             </div>

             {/* v31: organisaties - elke klant kan straks zijn eigen omgeving krijgen
                 met eigen admin, leadlijsten en team. Een admin/manager binnen een
                 organisatie ziet alleen de mensen van die organisatie. Jij blijft
                 als eigenaar alles zien. */}
             {showOrgs && (
               <div className="glass-panel p-6 mb-8 border border-border">
                  <h3 className="font-black text-sm uppercase tracking-widest mb-2 text-primary">Organisaties</h3>
                  <p className="text-muted text-sm mb-4" style={{ maxWidth: '720px' }}>
                    Maak per klant een organisatie aan en deel hun mensen in via het organisatie-menu op de medewerkerskaart.
                    Iedereen binnen een organisatie ziet alleen elkaar; jij blijft als eigenaar alles zien.
                    Medewerkers zonder organisatie horen bij jouw eigen omgeving.
                  </p>
                  <form onSubmit={handleCreateOrg} className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
                     <input
                       className="form-dark"
                       style={{ flex: 1, minWidth: '220px', padding: '11px 14px' }}
                       value={newOrgName}
                       onChange={e => setNewOrgName(e.target.value)}
                       placeholder="Naam van de nieuwe organisatie (bijv. Jobfuel)"
                     />
                     <button type="submit" className="btn btn-primary" disabled={creatingOrg || !newOrgName.trim()}>
                       <Plus size={16} /> {creatingOrg ? 'Aanmaken...' : 'Organisatie aanmaken'}
                     </button>
                  </form>
                  {orgs.length === 0 ? (
                    <p className="text-muted text-sm italic">Nog geen organisaties - iedereen staat nu in jouw eigen omgeving.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                       {orgs.map(o => (
                         <div key={o.id} className="p-4 rounded-xl border border-border bg-elevated">
                            <div className="font-bold text-body break-words">{o.name}</div>
                            <div className="text-xs text-muted mt-1">
                              {users.filter(u2 => u2.organization_id === o.id).length} medewerker(s)
                              {o.owner_id === user.id ? ' · eigenaar: jij' : ''}
                            </div>
                         </div>
                       ))}
                    </div>
                  )}
               </div>
             )}
             {(() => {
                const sortedUsers = [...users].sort((a, b) => (a.is_active === false ? 1 : 0) - (b.is_active === false ? 1 : 0))
                const groups = orgs.length > 0
                  ? [
                      { key: 'none', label: 'Mijn eigen omgeving', users: sortedUsers.filter(u => !u.organization_id) },
                      ...orgs.map(o => ({ key: o.id, label: o.name, users: sortedUsers.filter(u => u.organization_id === o.id) }))
                    ].filter(g => g.users.length > 0)
                  : [{ key: 'all', label: null, users: sortedUsers }]
                return groups.map(group => (
                  <div key={group.key} className="mb-10">
                     {group.label && (
                       <h3 className="text-xs font-black uppercase tracking-widest text-secondary mb-4 flex items-center gap-2">
                          <Shield size={14} /> {group.label}
                          <span className="text-muted font-bold normal-case tracking-normal">({group.users.length} medewerker{group.users.length === 1 ? '' : 's'})</span>
                       </h3>
                     )}
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {group.users.map(u => (
                  <div key={u.id} className="glass-panel p-6 group hover:border-primary/50 transition-all border border-border" style={u.is_active === false ? { opacity: 0.55 } : undefined}>
                     <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                           <div className="w-12 h-12 bg-elevated rounded-xl flex items-center justify-center font-black text-primary border border-border shrink-0">{u.full_name?.charAt(0)}</div>
                           <div className="min-w-0">
                              <div className="font-bold text-body tracking-tight break-words">{u.full_name}</div>
                              <div className="text-[10px] text-muted opacity-50 font-black break-all">{u.email}</div>
                              {u.organization_id && (
                                <div className="text-[10px] font-black uppercase tracking-widest text-secondary mt-1 break-words">
                                  {orgs.find(o => o.id === u.organization_id)?.name || 'Organisatie'}
                                </div>
                              )}
                           </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                           <span className={`self-start shrink-0 whitespace-nowrap px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-secondary/20 text-secondary' : u.role === 'manager' ? 'bg-primary/20 text-primary' : u.role === 'recruiter' ? 'bg-warning/20 text-warning' : u.role === 'backoffice' ? 'bg-primary/20 text-primary' : 'bg-success/20 text-success'}`}>{u.role === 'employee' ? 'Beller' : u.role === 'recruiter' ? 'Recruiter' : u.role === 'backoffice' ? 'Backoffice' : u.role}</span>
                           {u.is_active === false && (
                             <span className="whitespace-nowrap px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest bg-error/20 text-error">Inactief</span>
                           )}
                        </div>
                     </div>
                     <div className="mt-6 pt-4 border-t border-border flex justify-between items-center">
                        <div>
                           <div className="text-xs text-muted font-bold uppercase tracking-tight">Actieve Leads</div>
                           <div className="text-2xl font-black text-body">{leads.filter(l => l.assigned_to === u.id).length}</div>
                        </div>
                        <div>
                           <div className="text-xs text-muted font-bold uppercase tracking-tight">Vandaag</div>
                           <div className="text-sm font-black text-body">
                              {(todayStats.perAgent[u.id]?.calls || 0)} gesprekken · {fmtBeltijd(todayStats.perAgent[u.id]?.seconds || 0)}
                           </div>
                        </div>
                        {u.id !== user.id && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setIntensityUser(u)}
                              className="p-2 rounded-lg transition-all text-muted hover:bg-primary/20 hover:text-primary opacity-0 group-hover:opacity-100"
                              title="Intensiteit & ingelogde tijd"
                            >
                              <Zap size={18}/>
                            </button>
                            <button
                              onClick={() => setResettingUser(u)}
                              className="p-2 rounded-lg transition-all text-muted hover:bg-primary/20 hover:text-primary opacity-0 group-hover:opacity-100"
                              title="Wachtwoord resetten"
                            >
                              <KeyRound size={18}/>
                            </button>
                            <button
                              onClick={() => handleToggleActive(u)}
                              className={`p-2 rounded-lg transition-all ${u.is_active === false ? 'text-success hover:bg-success/20' : 'text-muted hover:bg-secondary/20 hover:text-secondary opacity-0 group-hover:opacity-100'}`}
                              title={u.is_active === false ? 'Weer activeren (kan dan weer inloggen)' : 'Inactief zetten - kan niet meer inloggen, historie blijft bewaard'}
                            >
                              {u.is_active === false ? <Play size={18}/> : <PhoneOff size={18}/>}
                            </button>
                            <button
                              onClick={() => handleDeleteEmployee(u.id)}
                              className={`p-2 rounded-lg transition-all ${confirmDeleteUser === u.id ? 'bg-error text-white' : 'text-muted hover:bg-error/20 hover:text-error opacity-0 group-hover:opacity-100'}`}
                              title={confirmDeleteUser === u.id ? 'Klik nogmaals om definitief te verwijderen' : 'Definitief verwijderen (gesprekshistorie blijft, zonder naam)'}
                            >
                              <Trash2 size={18}/>
                            </button>
                          </div>
                        )}
                     </div>
                     {u.role !== 'admin' && (() => {
                       const { projects: uProjects, lists: uLists } = getUserAssignments(u)
                       const isOpen = !!expandedAssignments[u.id]
                       if (uProjects.length === 0 && uLists.length === 0) {
                         return <div className="mt-3 pt-3 border-t border-border text-[10px] text-muted italic">Nog geen project of leadlijst gekoppeld</div>
                       }
                       return (
                         <div className="mt-3 pt-3 border-t border-border">
                            <div className="text-[10px] text-muted font-black uppercase tracking-widest mb-2">
                               Projecten ({uProjects.length}) &middot; Leadlijsten ({uLists.length})
                            </div>
                            <div className="flex flex-wrap gap-1.5" style={{ marginBottom: uLists.length > 0 ? '8px' : 0 }}>
                               {uProjects.length > 0 ? uProjects.map(p => (
                                 <span key={p.id} className={`px-2 py-1 rounded text-[10px] font-bold break-words ${p.is_active === false ? 'bg-elevated text-muted' : 'bg-primary/15 text-primary'}`}>
                                    {p.name}{p.is_active === false ? ' (gepauzeerd)' : ''}
                                 </span>
                               )) : (
                                 <span className="text-[10px] text-muted italic">Geen project, wel losse leadlijst(en)</span>
                               )}
                            </div>
                            {uLists.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedAssignments(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                                className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                              >
                                 {isOpen ? 'Verberg leadlijsten' : `Toon ${uLists.length} leadlijst${uLists.length === 1 ? '' : 'en'}`}
                              </button>
                            )}
                            {isOpen && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                 {uLists.map(l => {
                                   const scheduled = l.activate_at && new Date(l.activate_at) > new Date()
                                   return (
                                     <span key={l.id} className={`px-2 py-1 rounded text-[10px] font-bold break-words ${scheduled ? 'bg-elevated text-muted' : 'bg-secondary/15 text-secondary'}`}>
                                        {l.name}{scheduled ? ' (gepland)' : ''}
                                     </span>
                                   )
                                 })}
                              </div>
                            )}
                         </div>
                       )
                     })()}
                     {u.role === 'manager' && (
                       <div className="mt-3">
                          {(() => {
                            const count = managerLinks.filter(pm => pm.manager_id === u.id).length
                            return count > 0 ? (
                              <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-primary/15 text-primary">
                                {count} project{count === 1 ? '' : 'en'} gekoppeld{u.can_manage_leads ? ' · mag leads beheren' : ''}
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded text-[10px] font-black uppercase tracking-widest bg-secondary/15 text-secondary">
                                Nog geen projecten gekoppeld - klik op "Projecten &amp; rechten"
                              </span>
                            )
                          })()}
                       </div>
                     )}
                     {u.id !== user.id && (
                       <div className="mt-3 flex items-center gap-2">
                          <span className="text-[10px] text-muted font-black uppercase tracking-widest">Rol</span>
                          <select
                            value={u.role}
                            onChange={e => handleUpdateFlow(u.id, { role: e.target.value })}
                            className="form-dark"
                            style={{ padding: '6px 10px', fontSize: '0.75rem', flex: 1 }}
                          >
                             <option value="employee">Beller</option>
                             <option value="backoffice">Backoffice</option>
                             <option value="manager">Manager</option>
                             <option value="recruiter">Recruiter</option>
                             <option value="admin">Admin</option>
                          </select>
                          {u.role === 'manager' && (
                            <button onClick={() => setManagingUser(u)} className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }}><Shield size={14}/> Projecten &amp; rechten</button>
                          )}
                       </div>
                     )}
                     {u.id !== user.id && (
                       // v51: Verdiensten-tab per medewerker aan/uit - staat nu
                       // standaard uit (Noah wilde 'm tijdelijk voor iedereen weg).
                       <label className="mt-2 flex items-center gap-2 cursor-pointer select-none" style={{ fontSize: '0.72rem' }}>
                          <input
                             type="checkbox"
                             checked={u.can_view_earnings !== false}
                             onChange={e => handleUpdateFlow(u.id, { can_view_earnings: e.target.checked })}
                          />
                          <span className="text-muted font-bold uppercase tracking-widest text-[10px]">Verdiensten tonen</span>
                       </label>
                     )}
                     {u.id !== user.id && orgs.length > 0 && (
                       <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] text-muted font-black uppercase tracking-widest">Org</span>
                          <select
                            value={u.organization_id || ''}
                            onChange={e => handleSetUserOrg(u, e.target.value)}
                            className="form-dark"
                            style={{ padding: '6px 10px', fontSize: '0.75rem', flex: 1 }}
                          >
                             <option value="">Mijn eigen omgeving</option>
                             {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </select>
                       </div>
                     )}
                  </div>
                ))}
                     </div>
                  </div>
                ))
             })()}
          </motion.div>
        )}

        {activeTab === 'data' && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <LeadManagement standalone={false} />
           </motion.div>
        )}

        {activeTab === 'verdiensten' && (
           <PayoutSettings />
        )}

        {/* MODAL: ADD LEAD */}
        <AnimatePresence>
          {showAddLead && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowAddLead(false)}>
              <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} className="modal glass-panel p-8 max-w-xl w-full" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-black tracking-tight">Lead toevoegen</h2>
                  <button onClick={() => setShowAddLead(false)} className="text-muted hover:text-body"><X size={24}/></button>
                </div>
                <form onSubmit={addLead} className="grid grid-cols-1 gap-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                      <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-2 block">Bedrijfsnaam *</label>
                      <input className="form-dark w-full" value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} required placeholder="Bijv. Jansen BV" />
                    </div>
                    <div className="form-group">
                      <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-2 block">Telefoonnummer *</label>
                      <input className="form-dark w-full" value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} required placeholder="06..." />
                    </div>
                  </div>

                  <div className="form-group p-4 bg-primary/10 rounded-2xl border border-primary/20">
                    <label className="text-[10px] font-black uppercase text-primary tracking-widest mb-2 block">Project (leadlijst) *</label>
                    <div className="flex gap-2">
                       <select 
                         className="form-dark w-full border-primary/30 text-secondary font-bold"
                         value={newLead.lead_list_id} 
                         onChange={e => setNewLead({...newLead, lead_list_id: e.target.value})}
                         required
                       >
                          <option value="">-- SELECTEER EEN PROJECT --</option>
                          {leadLists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
                       </select>
                       <button type="button" onClick={() => setShowLeadList(true)} className="p-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-all"><Plus size={18}/></button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-2 block">E-mailadres</label>
                    <input className="form-dark w-full" type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} placeholder="info@..." />
                  </div>

                  <div className="form-group">
                    <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-2 block">Notities / Briefing</label>
                    <textarea className="form-dark w-full" value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} rows={3} placeholder="Extra info voor de beller..." />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="form-group">
                       <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-2 block">Bron</label>
                       <select className="form-dark w-full" value={newLead.lead_source} onChange={e => setNewLead({...newLead, lead_source: e.target.value})}>
                          <option value="cold">Cold Call</option>
                          <option value="linkedin">LinkedIn</option>
                          <option value="referral">Referral</option>
                       </select>
                    </div>
                    <div className="form-group">
                       <label className="text-[10px] font-black uppercase text-muted tracking-widest mb-2 block">Beller (Optioneel)</label>
                       <select className="form-dark w-full" value={newLead.assigned_to} onChange={e => setNewLead({...newLead, assigned_to: e.target.value})}>
                          <option value="">Niet toewijzen (Pool)</option>
                          {users.filter(u => u.is_active !== false).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                       </select>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary btn-block py-4 text-lg font-black mt-4">Lead opslaan</button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      <EmployeeModal isOpen={showEmployee} onClose={() => setShowEmployee(false)} onAdd={handleAddEmployee} />
      <ResetPasswordModal isOpen={!!resettingUser} onClose={() => setResettingUser(null)} targetUser={resettingUser} />
      <IntensityModal isOpen={!!intensityUser} onClose={() => setIntensityUser(null)} targetUser={intensityUser} users={users} />
      <AnimatePresence>
        {managingUser && (
          <ManagerProjectsModal
            isOpen={!!managingUser}
            onClose={() => setManagingUser(null)}
            manager={managingUser}
            leadLists={leadLists}
            onSaved={fetchData}
          />
        )}
      </AnimatePresence>
      <BriefingModal isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
      <CampaignModal isOpen={showCampaign} onClose={() => setShowCampaign(false)} />
      <LeadListModal isOpen={showLeadList} onClose={() => setShowLeadList(false)} />
      <ImportLeadsModal isOpen={showImport} initialMode={importMode} onClose={() => setShowImport(false)} onImported={() => { fetchData(); fetchLeadLists() }} />
      <NewProjectWizard isOpen={showNewProject} onClose={() => setShowNewProject(false)} onCreated={() => { fetchData(); fetchLeadLists() }} />

      <style jsx>{`
        .container-wide { max-width: 1400px; margin: 0 auto; }
        .glass-panel { background: var(--glass-bg); backdrop-filter: blur(20px); border-radius: 20px; }
      `}</style>
    </div>
  )
}