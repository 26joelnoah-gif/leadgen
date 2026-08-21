import { useState, useEffect } from 'react'
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
  Filter, Layers, RotateCcw, Share2, Grid
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingSpinner from '../components/LoadingSpinner'
import { useToast } from '../components/Toast'
import { getStatusDetails } from '../utils/statusUtils'
import ImportLeadsModal from '../components/ImportLeadsModal'

function StatusBadge({ status }) {
  const configs = {
    new: { bg: 'bg-primary/20', text: 'text-primary', label: 'Nieuw' },
    deal: { bg: 'bg-success/20', text: 'text-success', label: 'DEAL' },
    afspraak_gemaakt: { bg: 'bg-info/20', text: 'text-info', label: 'Afspraak' },
    terugbelafspraak: { bg: 'bg-warning/20', text: 'text-warning', label: 'TBA' },
    geen_gehoor: { bg: 'bg-white/10', text: 'text-muted', label: 'Geen Gehoor' },
    default: { bg: 'bg-white/5', text: 'text-muted', label: status?.toUpperCase() || 'Onbekend' }
  }
  const config = configs[status] || configs.default
  return (
    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-wider ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  )
}

const TABS = [
  { id: 'data', label: 'Data & Configuration', icon: <Layers size={18} /> },
  { id: 'teams', label: 'Team Setup', icon: <Users size={18} /> },
  { id: 'mass', label: 'Mass Actions', icon: <RotateCcw size={18} /> }
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
  
  // Flows State
  const [flowSettings, setFlowSettings] = useState([])
  const [savingFlow, setSavingFlow] = useState(false)

  // Team State
  const [teams, setTeams] = useState([])
  const [agents, setAgents] = useState([])
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [newTeamName, setNewTeamName] = useState('')

  // Bulk State
  const [bulkListId, setBulkListId] = useState('')
  const [bulkTargetAgentId, setBulkTargetAgentId] = useState('')
  const [bulkTargetTeamId, setBulkTargetTeamId] = useState('')
  const [processingBulk, setProcessingBulk] = useState(false)

  // Import wizard
  const [showImport, setShowImport] = useState(false)

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
      
      const { data: flows, error: fErr } = await supabase.from('flow_settings').select('*')
      if (fErr) throw fErr
      setFlowSettings(flows || [])

      const { data: teamsRes, error: tErr } = await supabase.from('teams').select('*, team_members(*)').order('name')
      if (tErr) throw tErr
      setTeams(teamsRes || [])
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

  async function handleUpdateFlow(disposition, updates) {
    setSavingFlow(true)
    try {
      const { error } = await supabase
        .from('flow_settings')
        .update(updates)
        .eq('disposition_type', disposition)
      
      if (error) throw error
      setFlowSettings(prev => prev.map(f => f.disposition_type === disposition ? { ...f, ...updates } : f))
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingFlow(false)
    }
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
      const updates = { updated_at: new Date().toISOString() }
      if (bulkTargetAgentId) updates.assigned_to = bulkTargetAgentId

      const { error } = await supabase
        .from('leads')
        .update(updates)
        .eq('lead_list_id', bulkListId)

      if (bulkTargetTeamId) {
        await supabase.from('lead_lists').update({ assigned_team_id: bulkTargetTeamId }).eq('id', bulkListId)
      }

      if (error) throw error
      toast('Bulk-toewijzing voltooid!', 'success')
      fetchLeadLists()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setProcessingBulk(false)
    }
  }

  if (!profile || profile.role !== 'admin') {
    return <div className="p-8 text-center bg-dark text-white min-h-screen">Toegang geweigerd.</div>
  }

  return (
    <div className={standalone ? 'min-h-screen bg-dark text-white' : 'text-white'}>
      {standalone && <Header />}

      <main className="container-wide py-8">
        <div className="flex justify-between items-center mb-10 px-6">
          <div>
            <div className="flex items-center gap-2 text-secondary mb-1">
               <Shield size={14} /> <span className="text-xs font-bold uppercase tracking-widest">Administrator</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">LEAD CONTROL PANEL</h1>
            <p className="text-muted text-sm mt-1">Stuur leadflows aan, beheer teams en stel automatisering in.</p>
          </div>
          <div className="flex gap-3 items-center">
             <button
               onClick={() => setShowImport(true)}
               className="btn btn-primary"
               style={{ padding: '14px 24px', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}
             >
                <Upload size={18} /> LEADS IMPORTEREN
             </button>
             <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', padding: '10px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Grid size={18} className="text-primary" />
                <div>
                   <div className="text-xs text-muted uppercase font-bold">Total Lists</div>
                   <div className="text-xl font-bold">{leadLists.length}</div>
                </div>
             </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 mb-8">
          <div className="flex gap-1 bg-dark-soft p-1.5 rounded-2xl border border-white/5 inline-flex">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all font-bold text-sm ${
                  activeTab === tab.id 
                    ? 'bg-primary text-white shadow-xl shadow-primary/20' 
                    : 'text-muted hover:text-white hover:bg-white/5'
                }`}
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
                       <h3 className="text-lg font-bold flex items-center gap-2"><Layers size={20} className="text-primary" /> Data Beheer</h3>
                       
                       <div className="flex bg-dark p-1 rounded-xl border border-white/5">
                          <button 
                            onClick={() => { setDataSubTab('active'); setSelectedList(null); }}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${dataSubTab === 'active' ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}
                          >Batches</button>
                          <button 
                            onClick={() => { setDataSubTab('flows'); setSelectedList(null); }}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${dataSubTab === 'flows' ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}
                          >Flows</button>
                          <button 
                            onClick={() => { setDataSubTab('archived'); setSelectedList(null); }}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${dataSubTab === 'archived' ? 'bg-white/10 text-white' : 'text-muted hover:text-white'}`}
                          >Archive</button>
                       </div>
                    </div>

                    <div className="flex flex-column gap-2" style={{ maxHeight: 'calc(100vh - 450px)', overflowY: 'auto' }}>
                      {dataSubTab === 'active' && leadLists.map(list => (
                        <button 
                          key={list.id}
                          onClick={() => setSelectedList(list)}
                          className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                            selectedList?.id === list.id 
                              ? 'bg-primary border-primary shadow-lg shadow-primary/20' 
                              : 'bg-dark-soft border-white/5 hover:border-white/20'
                          }`}
                        >
                          <div className="text-left font-bold text-sm">{list.name}</div>
                          <ChevronRight size={16} />
                        </button>
                      ))}

                      {dataSubTab === 'archived' && (
                        loadingDeleted ? <LoadingSpinner size="sm" /> : deletedLists.map(list => (
                          <div key={list.id} className="p-4 bg-dark-soft rounded-xl border border-white/5 flex items-center justify-between group">
                             <div>
                                <div className="font-bold text-sm text-muted">{list.name}</div>
                                <div className="text-[10px] text-error font-mono">Deleted {new Date(list.deleted_at).toLocaleDateString()}</div>
                             </div>
                             <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                <button onClick={() => handleRestore(list.id)} className="p-2 hover:bg-success/20 text-success rounded-lg"><RotateCcw size={14}/></button>
                                <button onClick={() => handlePermanentDelete(list.id)} className="p-2 hover:bg-error/20 text-error rounded-lg" style={confirmPermanentId === list.id ? { background: 'var(--error, #EF4444)', color: 'white' } : undefined}><Trash2 size={14}/></button>
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
                    <div className="glass-panel p-8">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="p-4 bg-primary/20 text-primary rounded-2xl shadow-inner"><FastForward size={28} /></div>
                        <div>
                          <h2 className="text-2xl font-black tracking-tight leading-none mb-1">Wat gebeurt er na een afboeking?</h2>
                          <p className="text-muted text-sm">Per afboekreden zie je hier precies wat het systeem doet.</p>
                        </div>
                      </div>

                      <div className="mb-8 p-5 bg-success/5 rounded-2xl border border-success/20 text-sm text-muted leading-relaxed">
                        <strong className="text-white">De basisregel is simpel:</strong> een lead blijft altijd in zijn eigen projectlijst.
                        Een afboeking verandert alleen de <strong className="text-white">status</strong> van de lead en wordt vastgelegd
                        in de gesprekshistorie (zichtbaar in Rapportage). Er worden dus nooit automatisch nieuwe lijsten aangemaakt.
                        Hieronder stel je per reden alleen nog in: <strong className="text-white">bij wie de lead komt te staan</strong> en of
                        de naam van de beller in de notities wordt gezet.
                      </div>

                      <div className="grid gap-4">
                        {flowSettings.map(flow => (
                          <div key={flow.id} className="p-6 bg-dark rounded-2xl border border-white/5 hover:border-primary/30 transition-all">
                             <div className="flex flex-wrap items-start justify-between gap-6">
                                <div className="flex-1 min-w-[260px]">
                                   <h4 className="font-black text-white text-lg tracking-tight mb-1">
                                     {getStatusDetails(flow.disposition_type).label}
                                   </h4>
                                   <p className="text-xs text-muted leading-relaxed">{flow.description || 'Lead blijft in de projectlijst; alleen de status verandert.'}</p>
                                </div>

                                <div className="flex items-center gap-6">
                                   <div>
                                      <label className="text-[10px] font-black text-muted uppercase tracking-widest block mb-2">Lead komt te staan bij</label>
                                      <select
                                        value={flow.auto_assign_to}
                                        onChange={(e) => handleUpdateFlow(flow.disposition_type, { auto_assign_to: e.target.value })}
                                        className="bg-dark-soft p-2.5 rounded-lg text-xs font-bold border border-white/10 text-white min-w-[170px]"
                                      >
                                        <option value="agent">De beller zelf</option>
                                        <option value="none">Niemand (pool)</option>
                                        <option value="keep">Niet aanpassen</option>
                                      </select>
                                   </div>

                                   <div>
                                      <label className="text-[10px] font-black text-muted uppercase tracking-widest block mb-2">Bellernaam in notitie</label>
                                      <button
                                        onClick={() => handleUpdateFlow(flow.disposition_type, { append_agent_note: !flow.append_agent_note })}
                                        className={`px-4 py-2.5 rounded-lg text-xs font-bold transition-all border w-[90px] ${flow.append_agent_note ? 'bg-success/20 border-success text-success' : 'bg-dark-soft text-muted border-white/10'}`}
                                      >
                                        {flow.append_agent_note ? 'Aan' : 'Uit'}
                                      </button>
                                   </div>
                                </div>
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : selectedList ? (
                    <div className="glass-panel p-0 overflow-hidden min-h-[600px] flex flex-col">
                      <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <div>
                           <h2 className="text-xl font-black text-white italic leading-none mb-1">{selectedList.name.toUpperCase()}</h2>
                           <p className="text-[10px] text-muted font-bold uppercase tracking-widest">{leads.length} Leads in Batch</p>
                        </div>
                        <div className="flex gap-2">
                          <div className="relative">
                             <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                             <input 
                               type="text" 
                               value={leadSearch} 
                               onChange={e => setLeadSearch(e.target.value)}
                               placeholder="Zoeken..." 
                               className="bg-dark border border-white/10 pl-8 pr-4 py-2 rounded-lg text-xs w-[200px] focus:w-[300px] transition-all focus:border-primary/50"
                             />
                          </div>
                          <button 
                            className="btn btn-sm btn-outline text-error hover:bg-error/10"
                            onClick={async () => { await deleteLeadList(selectedList.id); setSelectedList(null); fetchLeadLists(); }}
                          ><Trash2 size={14} /> Delete</button>
                        </div>
                      </div>

                      {/* Batch Intelligence Summary */}
                      <div className="grid grid-cols-4 border-b border-white/5">
                         <div className="p-4 border-r border-white/5 text-center">
                            <div className="text-[10px] font-black text-muted uppercase mb-1">Pijplijn Totaal</div>
                            <div className="text-xl font-black">{leads.length}</div>
                         </div>
                         <div className="p-4 border-r border-white/5 text-center bg-primary/5">
                            <div className="text-[10px] font-black text-primary uppercase mb-1">Nieuwe Leads</div>
                            <div className="text-xl font-black text-primary">{leads.filter(l => l.status === 'new').length}</div>
                         </div>
                         <div className="p-4 border-r border-white/5 text-center bg-info/5">
                            <div className="text-[10px] font-black text-info uppercase mb-1">Afspraken</div>
                            <div className="text-xl font-black text-info">{leads.filter(l => l.status === 'afspraak_gemaakt').length}</div>
                         </div>
                         <div className="p-4 text-center bg-success/5">
                            <div className="text-[10px] font-black text-success uppercase mb-1">Deals Verzorgd</div>
                            <div className="text-xl font-black text-success">{leads.filter(l => l.status === 'deal').length}</div>
                         </div>
                      </div>

                      <div className="p-0 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 400px)' }}>
                        {loadingLeads ? <div className="p-20"><LoadingSpinner /></div> : (
                          <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-dark z-10 text-[10px] font-black text-muted uppercase tracking-widest border-b border-white/10 shadow-sm">
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
                                <tr key={lead.id} className="border-b border-white/5 hover:bg-white/2 transition-all group">
                                  <td className="p-4 pl-8">
                                     <div className="font-bold text-white group-hover:text-primary transition-colors">{lead.name}</div>
                                     <div className="text-[10px] text-muted font-mono">{lead.phone}</div>
                                  </td>
                                  <td className="p-4"><StatusBadge status={lead.status} /></td>
                                  <td className="p-4">
                                     <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-bold text-muted">
                                           {(agents.find(a => a.id === lead.assigned_to)?.full_name || '-').charAt(0)}
                                        </div>
                                        <span className="text-xs text-muted">{agents.find(a => a.id === lead.assigned_to)?.full_name || 'Geen toewijzing'}</span>
                                     </div>
                                  </td>
                                  <td className="p-4 text-center font-bold text-muted">{lead.contact_attempts || 0}x</td>
                                  <td className="p-4 text-xs text-muted" style={{ maxWidth: '260px' }} title={lead.notes || ''}>
                                     <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {(lead.notes || '').split('\n').filter(Boolean).pop() || '—'}
                                     </div>
                                  </td>
                                  <td className="p-4 pr-8 text-right">
                                     <div className="text-[10px] font-black text-white/40 uppercase">{new Date(lead.updated_at).toLocaleDateString()}</div>
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
                       <h3 className="text-xl font-black italic">INTELLIGENT DATA CENTER</h3>
                       <p className="max-w-xs text-sm mt-2 font-bold text-muted">Selecteer een batch of pas de flow-automatisering aan via de menu's links.</p>
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
                         <h3 className="text-xl font-black text-white">{team.name}</h3>
                         <div className="text-xs text-muted font-bold flex items-center gap-2 mt-1">
                            <Users size={12} /> {team.team_members?.length || 0} Members
                         </div>
                      </div>
                      <button className="text-muted hover:text-error transition-colors"><Trash2 size={18} /></button>
                    </div>

                    <div className="flex flex-column gap-2">
                       <div className="text-xs text-muted uppercase font-black tracking-widest mb-1">Members</div>
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                          {agents.map(a => {
                            const isMember = team.team_members?.some(m => m.profile_id === a.id)
                            return (
                              <div key={a.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-all text-sm group">
                                 <span className={isMember ? 'text-white font-bold' : 'text-muted'}>{a.full_name}</span>
                                 <button 
                                   onClick={() => toggleTeamMember(team.id, a.id, isMember)}
                                   className={`w-6 h-6 rounded flex items-center justify-center transition-all ${isMember ? 'bg-primary text-white' : 'bg-white/5 text-transparent group-hover:text-muted'}`}
                                 >
                                    <CheckCircle size={14} />
                                 </button>
                              </div>
                            )
                          })}
                       </div>
                    </div>

                    <button className="btn btn-outline btn-block btn-sm py-3 mt-auto"><Share2 size={14} /> Manage Permissions</button>
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
                      className="w-full bg-dark border border-white/10 p-3 rounded-xl mb-4 focus:ring-1 focus:ring-primary"
                    />
                    <div className="flex gap-2">
                       <button className="btn btn-primary flex-1" onClick={createTeam}>Opslaan</button>
                       <button className="btn btn-outline flex-1" onClick={() => setShowAddTeam(false)}>Sluiten</button>
                    </div>
                  </div>
                ) : (
                  <button 
                    onClick={() => setShowAddTeam(true)}
                    className="glass-panel p-6 border-dashed border-white/20 flex flex-column items-center justify-center gap-3 hover:border-primary/50 transition-all text-muted hover:text-primary min-h-[300px]"
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
                                <label className="text-xs font-black uppercase tracking-widest text-white/60">Selecteer Bron-Batch</label>
                             </div>
                             <select 
                               className="bg-dark p-4 rounded-xl border border-white/10 w-full font-bold text-lg focus:border-secondary transition-all"
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
                                <label className="text-xs font-black uppercase tracking-widest text-white/60">Doel Toewijzing</label>
                             </div>
                             
                             <div className="bg-dark/50 p-6 rounded-2xl border border-white/5 space-y-6">
                                <div>
                                   <label className="text-[10px] text-muted font-black block mb-3 uppercase tracking-widest">Individuele Beller</label>
                                   <select 
                                     className="bg-dark p-3 rounded-lg border border-white/10 w-full text-sm font-bold"
                                     value={bulkTargetAgentId}
                                     onChange={e => { setBulkTargetAgentId(e.target.value); if(e.target.value) setBulkTargetTeamId(''); }}
                                   >
                                      <option value="">-- Geen beller --</option>
                                      {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                                   </select>
                                </div>

                                <div className="relative py-2">
                                   <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
                                   <div className="relative flex justify-center"><span className="bg-dark px-3 text-[10px] font-black text-white/20 uppercase tracking-widest">of</span></div>
                                </div>

                                <div>
                                   <label className="text-[10px] text-muted font-black block mb-3 uppercase tracking-widest">Beller Groep (Team)</label>
                                   <select 
                                     className="bg-dark p-3 rounded-lg border border-white/10 w-full text-sm font-bold"
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
                             <label className="text-xs font-black uppercase tracking-widest text-white/60">Actie Preview</label>
                          </div>
                          
                          <div className="flex-1 bg-gradient-to-br from-secondary/5 to-transparent border border-secondary/10 rounded-2xl p-8 flex flex-column items-center justify-center text-center">
                             {bulkListId ? (
                                <>
                                   <Zap size={48} className="text-secondary mb-6 animate-pulse" />
                                   <h3 className="text-xl font-black text-white mb-2 italic">READY TO SYNC</h3>
                                   <p className="text-sm text-muted leading-relaxed font-medium">
                                      Je staat op het punt om <span className="text-white font-bold">{leadLists.find(l => l.id === bulkListId)?.name}</span> toe te wijzen aan 
                                      <span className="text-white font-bold"> {bulkTargetAgentId ? agents.find(a => a.id === bulkTargetAgentId)?.full_name : bulkTargetTeamId ? teams.find(t => t.id === bulkTargetTeamId)?.name : '...'}</span>.
                                   </p>
                                   <div className="mt-8 pt-8 border-t border-white/5 w-full">
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
        onClose={() => setShowImport(false)}
        onImported={() => { fetchLeadLists(); if (selectedList) fetchLeads(selectedList.id) }}
      />

      <style>{`
        .container-wide { max-width: 1400px; margin: 0 auto; }
        .grid-cols-12 { display: grid; grid-template-columns: repeat(12, 1fr); }
        .col-span-12 { grid-column: span 12; }
        .lg\\:col-span-4 { grid-column: span 4; }
        .lg\\:col-span-8 { grid-column: span 8; }
        .glass-panel { background: rgba(255,255,255,0.03); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.05); border-radius: 24px; }
        .bg-dark-soft { background: rgba(255,255,255,0.02); }
        .text-secondary { color: var(--secondary); }
        .text-error { color: #ef4444; }
        .btn-secondary { background: var(--secondary); color: var(--primary-dark); }
        .btn-outline { border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); }
        .btn-outline:hover { background: rgba(255,255,255,0.05); color: white; }
        .hover-danger:hover { color: #ef4444; }
      `}</style>
    </div>
  )
}

function ListButton({ list, active, onClick }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center justify-between w-full p-4 rounded-xl transition-all ${
        active ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'bg-white/3 text-muted hover:bg-white/7'
      }`}
    >
      <div className="flex items-center gap-3">
        <List size={16} />
        <span className="text-sm font-bold truncate">{list.name}</span>
      </div>
      <ChevronRight size={14} />
    </button>
  )
}

