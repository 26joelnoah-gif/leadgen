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
  DollarSign, Calendar, List, ChevronRight, Layers, Trash2, Search
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
  const [showSettings, setShowSettings] = useState(false)
  const [showEmployee, setShowEmployee] = useState(false)
  const [managingUser, setManagingUser] = useState(null) // manager wiens projecten we koppelen
  const [showNewProject, setShowNewProject] = useState(false)
  const [managerLinks, setManagerLinks] = useState([]) // project_managers-rijen voor de projectenteller
  const [showLeadList, setShowLeadList] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [systemSettings, setSystemSettings] = useState(getSettings)

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
      if (employeeData.role && employeeData.role !== 'employee' && signUpData?.user?.id) {
        const { error: roleErr } = await supabase
          .from('profiles')
          .update({ role: employeeData.role })
          .eq('id', signUpData.user.id)
        if (roleErr) toast(`Account aangemaakt, maar rol instellen mislukte: ${roleErr.message}`, 'error')
      }

      toast(employeeData.role === 'manager' ? 'Manager aangemaakt! Koppel nu projecten via de knop "Projecten".' : 'Medewerker uitnodiging verstuurd!', 'success')
      fetchData()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  if (profile && profile.role !== 'admin') return <Navigate to="/dashboard" />

  async function fetchData() {
    setLoading(true)
    try {
      const { data: l, error: lErr } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
      if (lErr) throw lErr
      const { data: u, error: uErr } = await supabase.from('profiles').select('*').order('full_name')
      if (uErr) throw uErr
      const { data: pm } = await supabase.from('project_managers').select('lead_list_id, manager_id')
      setLeads(l || [])
      setUsers(u || [])
      setManagerLinks(pm || [])

      // Vandaag: gesprekken, beltijd en resultaten uit call_logs (voor KPI-rij + teamkaarten)
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const { data: logs } = await supabase
        .from('call_logs')
        .select('agent_id, duration_seconds, disposition')
        .gte('disposed_at', todayStart.toISOString())
        .limit(5000)
      const stats = { calls: 0, seconds: 0, afspraken: 0, deals: 0, perAgent: {} }
      ;(logs || []).forEach(log => {
        stats.calls++
        stats.seconds += log.duration_seconds || 0
        if (log.disposition === 'afspraak_gemaakt') stats.afspraken++
        if (log.disposition === 'deal') stats.deals++
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
      toast('Klik nogmaals op de prullenbak om definitief te verwijderen', 'error')
      return
    }
    setConfirmDeleteUser(null)
    try {
      const { error } = await supabase.from('profiles').delete().eq('id', userId)
      if (error) throw error
      setUsers(prev => prev.filter(u => u.id !== userId))
      toast('Medewerker verwijderd', 'success')
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
      <Header onOpenSettings={() => setShowSettings(true)} />

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
                   <button className="btn btn-primary" onClick={() => setShowImport(true)}><Upload size={18} /> Leads importeren</button>
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
                <button onClick={() => setShowEmployee(true)} className="btn btn-primary"><UserPlus size={18} /> Nieuwe medewerker</button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map(u => (
                  <div key={u.id} className="glass-panel p-6 group hover:border-primary/50 transition-all border border-border">
                     <div className="flex justify-between items-start gap-3">
                        <div className="flex items-center gap-4 min-w-0">
                           <div className="w-12 h-12 bg-elevated rounded-xl flex items-center justify-center font-black text-primary border border-border shrink-0">{u.full_name?.charAt(0)}</div>
                           <div className="min-w-0">
                              <div className="font-bold text-body tracking-tight break-words">{u.full_name}</div>
                              <div className="text-[10px] text-muted opacity-50 font-black break-all">{u.email}</div>
                           </div>
                        </div>
                        <span className={`self-start shrink-0 whitespace-nowrap px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-secondary/20 text-secondary' : u.role === 'manager' ? 'bg-primary/20 text-primary' : 'bg-success/20 text-success'}`}>{u.role === 'employee' ? 'Beller' : u.role}</span>
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
                          <button
                            onClick={() => handleDeleteEmployee(u.id)}
                            className={`p-2 rounded-lg transition-all ${confirmDeleteUser === u.id ? 'bg-error text-white' : 'text-muted hover:bg-error/20 hover:text-error opacity-0 group-hover:opacity-100'}`}
                            title={confirmDeleteUser === u.id ? 'Klik nogmaals om definitief te verwijderen' : 'Verwijderen'}
                          >
                            <Trash2 size={18}/>
                          </button>
                        )}
                     </div>
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
                                Nog geen projecten gekoppeld - klik op "Projecten"
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
                             <option value="manager">Manager</option>
                             <option value="admin">Admin</option>
                          </select>
                          {u.role === 'manager' && (
                            <button onClick={() => setManagingUser(u)} className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }}><Layers size={14}/> Projecten</button>
                          )}
                       </div>
                     )}
                  </div>
                ))}
             </div>
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
                          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
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
      <ImportLeadsModal isOpen={showImport} onClose={() => setShowImport(false)} onImported={() => { fetchData(); fetchLeadLists() }} />
      <NewProjectWizard isOpen={showNewProject} onClose={() => setShowNewProject(false)} onCreated={() => { fetchData(); fetchLeadLists() }} />

      <style jsx>{`
        .container-wide { max-width: 1400px; margin: 0 auto; }
        .glass-panel { background: var(--glass-bg); backdrop-filter: blur(20px); border-radius: 20px; }
      `}</style>
    </div>
  )
}