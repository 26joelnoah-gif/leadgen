import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLeadLists } from '../hooks/useLeadLists'
import Header from '../components/Header'
import { 
  Settings, Users, Shield, Layout, List, 
  Search, Download, Trash2, Edit, Save, Plus,
  DollarSign, PhoneOff, AlertTriangle, UserMinus,
  CheckCircle, Briefcase, BarChart, ChevronRight,
  X, Clock, Calendar, ArrowRight, UserCheck, FastForward,
  Filter, Layers, RotateCcw, Share2, Grid
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingSpinner from '../components/LoadingSpinner'

const TABS = [
  { id: 'data', label: 'Data & Configuration', icon: <Layers size={18} /> },
  { id: 'teams', label: 'Team Setup', icon: <Users size={18} /> },
  { id: 'mass', label: 'Mass Actions', icon: <RotateCcw size={18} /> }
]

export default function LeadManagement() {
  const { profile, user } = useAuth()
  const { 
    leadLists, loading: listsLoading, fetchLeadLists, deleteLeadList, 
    restoreLeadList, permanentDeleteLeadList 
  } = useLeadLists()
  const [activeTab, setActiveTab] = useState('data')
  
  // Data View State
  const [selectedList, setSelectedList] = useState(null)
  const [leads, setLeads] = useState([])
  const [loadingLeads, setLoadingLeads] = useState(false)
  const [dataSubTab, setDataSubTab] = useState('active') // 'active', 'archived', 'flows'
  const [deletedLists, setDeletedLists] = useState([])
  const [loadingDeleted, setLoadingDeleted] = useState(false)
  
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
    const { data: profiles } = await supabase.from('profiles').select('*').order('full_name')
    setAgents(profiles || [])
    
    const { data: flows } = await supabase.from('flow_settings').select('*')
    setFlowSettings(flows || [])

    const { data: teamsRes } = await supabase.from('teams').select('*, team_members(*)').order('name')
    setTeams(teamsRes || [])
  }

  async function fetchLeads(listId) {
    setLoadingLeads(true)
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('lead_list_id', listId)
      .is('deleted_at', null) // Only active leads
      .order('updated_at', { ascending: false })
    
    if (!error) setLeads(data || [])
    setLoadingLeads(false)
  }

  async function fetchDeletedLists() {
    setLoadingDeleted(true)
    const { data } = await supabase
      .from('lead_lists')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
    setDeletedLists(data || [])
    setLoadingDeleted(false)
  }

  async function handleRestore(id) {
    await restoreLeadList(id)
    fetchLeadLists()
    fetchDeletedLists()
  }

  async function handlePermanentDelete(id) {
    if (confirm('Lijst definitief verwijderen? Dit kan niet ongedaan worden gemaakt.')) {
      await permanentDeleteLeadList(id)
      fetchDeletedLists()
    }
  }

  async function handleUpdateFlow(disposition, updates) {
    setSavingFlow(true)
    const { error } = await supabase
      .from('flow_settings')
      .update(updates)
      .eq('disposition_type', disposition)
    
    if (!error) {
      setFlowSettings(prev => prev.map(f => f.disposition_type === disposition ? { ...f, ...updates } : f))
    }
    setSavingFlow(false)
  }

  async function createTeam() {
    if (!newTeamName) return
    const { data, error } = await supabase.from('teams').insert({
      name: newTeamName,
      created_by: user?.id
    }).select().single()

    if (!error) {
      setTeams([...teams, { ...data, team_members: [] }])
      setNewTeamName('')
      setShowAddTeam(false)
    }
  }

  async function toggleTeamMember(teamId, profileId, isMember) {
    if (isMember) {
      await supabase.from('team_members').delete().eq('team_id', teamId).eq('profile_id', profileId)
    } else {
      await supabase.from('team_members').insert({ team_id: teamId, profile_id: profileId })
    }
    fetchData() // Refresh to get updated membership info
  }

  async function runBulkAssignment() {
    if (!bulkListId || (!bulkTargetAgentId && !bulkTargetTeamId)) {
      alert('Selecteer een lijst en een doel (Agent of Team)')
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
      alert('Bulk-toewijzing voltooid!')
      fetchLeadLists()
    } catch (err) {
      alert(`Fout: ${err.message}`)
    } finally {
      setProcessingBulk(false)
    }
  }

  if (!profile || profile.role !== 'admin') {
    return <div className="p-8 text-center bg-dark text-white min-h-screen">Toegang geweigerd.</div>
  }

  return (
    <div className="min-h-screen bg-dark text-white">
      <Header />
      
      <main className="container-wide py-8">
        <div className="flex justify-between items-center mb-10 px-6">
          <div>
            <div className="flex items-center gap-2 text-secondary mb-1">
               <Shield size={14} /> <span className="text-xs font-bold uppercase tracking-widest">Administrator</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight">LEAD CONTROL PANEL</h1>
            <p className="text-muted text-sm mt-1">Stuur leadflows aan, beheer teams en stel automatisering in.</p>
          </div>
          <div className="flex gap-3">
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
                                <button onClick={() => handlePermanentDelete(list.id)} className="p-2 hover:bg-error/20 text-error rounded-lg"><Trash2 size={14}/></button>
                             </div>
                          </div>
                        ))
                      )}

                      {dataSubTab === 'flows' && (
                         <div className="text-center py-10">
                            <FastForward size={32} className="mx-auto mb-4 opacity-20 text-primary" />
                            <p className="text-xs text-muted font-bold px-4 leading-relaxed">Selecteer een flow-regel aan de rechterkant om de automatisering te wijzigen.</p>
                         </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-span-12 lg:col-span-8">
                  {dataSubTab === 'flows' ? (
                    <div className="glass-panel p-8">
                      <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-primary/20 text-primary rounded-2xl"><FastForward size={24} /></div>
                        <div>
                          <h2 className="text-2xl font-black italic tracking-tighter">FLOW ARCHITECTURE</h2>
                          <p className="text-muted text-sm">Configureer leadrouting op basis van beller-afboekingen.</p>
                        </div>
                      </div>
                      <div className="grid gap-4">
                        {flowSettings.map(flow => (
                          <div key={flow.id} className="p-6 bg-dark-soft rounded-2xl border border-white/5 flex items-center justify-between gap-6 hover:border-primary/30 transition-all">
                             <div>
                                <h4 className="font-black text-primary text-lg tracking-tight mb-1">{flow.disposition_type.toUpperCase().replace('_', ' ')}</h4>
                                <div className="flex items-center gap-2 text-xs text-muted">
                                   <ArrowRight size={12} /> Target: <span className="text-white font-bold">{flow.target_list_name}</span>
                                </div>
                             </div>
                             <div className="flex gap-4">
                                <select 
                                  value={flow.auto_assign_to} 
                                  onChange={(e) => handleUpdateFlow(flow.disposition_type, { auto_assign_to: e.target.value })}
                                  className="bg-dark p-2 rounded-lg text-[10px] font-bold border border-white/5"
                                >
                                  <option value="none">None</option>
                                  <option value="agent">Caller</option>
                                </select>
                                <button 
                                  onClick={() => handleUpdateFlow(flow.disposition_type, { append_agent_note: !flow.append_agent_note })}
                                  className={`px-4 py-2 rounded-lg text-[10px] font-bold ${flow.append_agent_note ? 'bg-success text-white' : 'bg-dark text-muted border border-white/5'}`}
                                >Tag Agent?</button>
                             </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : selectedList ? (
                    <div className="glass-panel p-0 overflow-hidden min-h-[600px]">
                      <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                        <h2 className="text-xl font-black text-white italic">{selectedList.name.toUpperCase()}</h2>
                        <div className="flex gap-2">
                          <button 
                            className="btn btn-sm btn-outline text-error"
                            onClick={async () => { if(confirm('Verplaatsen naar prullenbak?')) { await deleteLeadList(selectedList.id); setSelectedList(null); fetchLeadLists(); } }}
                          ><Trash2 size={14} /> Delete</button>
                        </div>
                      </div>
                      <div className="p-6">
                        {loadingLeads ? <LoadingSpinner /> : (
                          <table className="w-full text-left">
                            <thead className="text-[10px] font-black text-muted uppercase tracking-widest border-b border-white/5">
                              <tr><th className="pb-4">Lead</th><th className="pb-4">Status</th><th className="pb-4">Assigned</th><th className="pb-4">Updated</th></tr>
                            </thead>
                            <tbody>
                              {leads.map(lead => (
                                <tr key={lead.id} className="border-b border-white/5 hover:bg-white/2 transition-all">
                                  <td className="py-4 font-bold">{lead.name}</td>
                                  <td className="py-4"><StatusBadge status={lead.status} /></td>
                                  <td className="py-4 text-xs text-muted">{agents.find(a => a.id === lead.assigned_to)?.full_name || '-'}</td>
                                  <td className="py-4 text-[10px] font-mono opacity-50">{new Date(lead.updated_at).toLocaleDateString()}</td>
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

            {/* VIEW: AUTOMATED FLOWS */}
            {activeTab === 'flows' && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="max-w-4xl mx-auto">
                <div className="glass-panel p-8">
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-primary/20 text-primary rounded-2xl"><FastForward size={24} /></div>
                    <div>
                      <h2 className="text-2xl font-black">Post-Call Lead Flows</h2>
                      <p className="text-muted text-sm">Stel in waar leads naartoe gaan na de afboeking door een beller.</p>
                    </div>
                  </div>

                  <div className="flex flex-column gap-6">
                    {flowSettings.map(flow => (
                      <div key={flow.id} className="p-6 bg-dark-soft rounded-2xl border border-white/5 flex items-center justify-between gap-6 group">
                         <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                               <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold uppercase tracking-wider text-muted">Disposition</span>
                               <h4 className="font-black text-lg text-primary">{flow.disposition_type.toUpperCase().replace('_', ' ')}</h4>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted">
                               <ArrowRight size={14} /> 
                               Moving to: <span className="text-white font-bold">{flow.target_list_name}</span>
                            </div>
                         </div>

                         <div className="flex items-center gap-8">
                            <div className="text-right">
                               <div className="text-xs text-muted uppercase font-bold mb-2">Auto-Assign to</div>
                               <select 
                                 value={flow.auto_assign_to} 
                                 onChange={(e) => handleUpdateFlow(flow.disposition_type, { auto_assign_to: e.target.value })}
                                 className="bg-dark border border-white/10 text-xs px-3 py-2 rounded-lg font-bold w-[120px]"
                               >
                                 <option value="none">None</option>
                                 <option value="agent">Caller</option>
                                 <option value="admin">Admin Only</option>
                                 <option value="team">Team Group</option>
                               </select>
                            </div>

                            <div className="text-right">
                               <div className="text-xs text-muted uppercase font-bold mb-2">Notes</div>
                               <div className="flex gap-2">
                                  <button 
                                    onClick={() => handleUpdateFlow(flow.disposition_type, { append_agent_note: !flow.append_agent_note })}
                                    className={`px-3 py-2 rounded-lg text-xs font-bold transition-all ${flow.append_agent_note ? 'bg-success text-white' : 'bg-dark border border-white/10 text-muted'}`}
                                  >
                                    Agent Tag? {flow.append_agent_note ? 'Yes' : 'No'}
                                  </button>
                               </div>
                            </div>
                         </div>
                      </div>
                    ))}
                  </div>
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
            {activeTab === 'mass' && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="max-w-3xl mx-auto">
                 <div className="glass-panel p-8">
                    <div className="flex items-center gap-4 mb-8">
                       <div className="p-3 bg-secondary/20 text-secondary rounded-2xl"><FastForward size={24} /></div>
                       <div>
                          <h2 className="text-2xl font-black">Mass Selection & Assignment</h2>
                          <p className="text-muted text-sm">Wijs volledige lijsten toe aan bellers of teams in één klik.</p>
                       </div>
                    </div>

                    <div className="flex flex-column gap-8">
                       
                       <div className="flex flex-column gap-3">
                          <label className="text-xs font-bold uppercase tracking-widest text-muted">Stap 1: Selecteer de lead lijst (Batch)</label>
                          <select 
                            className="bg-dark p-4 rounded-xl border border-white/10 w-full font-bold text-lg"
                            value={bulkListId}
                            onChange={e => setBulkListId(e.target.value)}
                          >
                             <option value="">-- Kies een lijst --</option>
                             {leadLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                       </div>

                       <div className="flex flex-column gap-3">
                          <label className="text-xs font-bold uppercase tracking-widest text-muted">Stap 2: Kies Doel-toewijzing</label>
                          <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-[10px] text-muted font-bold block mb-2 uppercase">Individuele Beller</label>
                                <select 
                                  className="bg-dark p-3 rounded-lg border border-white/10 w-full text-sm"
                                  value={bulkTargetAgentId}
                                  onChange={e => { setBulkTargetAgentId(e.target.value); if(e.target.value) setBulkTargetTeamId(''); }}
                                >
                                   <option value="">-- Geen beller --</option>
                                   {agents.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="text-[10px] text-muted font-bold block mb-2 uppercase">Beller Groep (Team)</label>
                                <select 
                                  className="bg-dark p-3 rounded-lg border border-white/10 w-full text-sm"
                                  value={bulkTargetTeamId}
                                  onChange={e => { setBulkTargetTeamId(e.target.value); if(e.target.value) setBulkTargetAgentId(''); }}
                                >
                                   <option value="">-- Geen team --</option>
                                   {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                             </div>
                          </div>
                       </div>

                       <div className="pt-6 border-t border-white/5">
                          <button 
                            onClick={runBulkAssignment}
                            disabled={processingBulk || !bulkListId}
                            className="btn btn-secondary btn-block py-5 text-lg font-black tracking-widest shadow-xl shadow-secondary/10"
                          >
                             {processingBulk ? <LoadingSpinner size="sm" /> : <>VOER MASSA TOEPASSING UIT <FastForward size={20} /></>}
                          </button>
                       </div>

                    </div>
                 </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>

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

function StatusBadge({ status }) {
  const configs = {
    deal: { color: 'var(--success)', icon: <CheckCircle size={12} />, label: 'DEAL' },
    afspraak_gemaakt: { color: 'var(--success)', icon: <Calendar size={12} />, label: 'AFSPRAAK' },
    later_bellen: { color: 'var(--warning)', icon: <Clock size={12} />, label: 'LATER' },
    verkeerd_nummer: { color: 'var(--danger)', icon: <PhoneOff size={12} />, label: 'WRONG' },
    geen_interesse: { color: '#71717A', icon: <UserMinus size={12} />, label: 'LOST' },
  }

  const config = configs[status] || { color: 'var(--primary)', icon: <Shield size={12} />, label: status?.toUpperCase() }

  return (
    <span style={{ 
      display: 'inline-flex', 
      alignItems: 'center', 
      gap: '6px', 
      background: `${config.color}20`, 
      color: config.color, 
      padding: '4px 10px', 
      borderRadius: '20px', 
      fontSize: '0.65rem', 
      fontWeight: 900,
      border: `1px solid ${config.color}40`,
      letterSpacing: '0.5px'
    }}>
      {config.icon} {config.label}
    </span>
  )
}
