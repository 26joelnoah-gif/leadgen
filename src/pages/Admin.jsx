import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLeadLists } from '../hooks/useLeadLists'
import Header from '../components/Header'
import { Link, Navigate } from 'react-router-dom'
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
import LoadingSpinner from '../components/LoadingSpinner'
import StatusSelector from '../components/StatusSelector'
import PipelineFunnel from '../components/PipelineFunnel'
import CampaignModal, { CampaignCard } from '../components/CampaignModal'
import BriefingModal, { BriefingCard } from '../components/BriefingModal'
import { LeadListModal } from '../components/LeadListModal'
import EmployeeModal from '../components/EmployeeModal'
import LeadManagement from './LeadManagement' // IMPORT THE MANAGEMENT COMPONENT

export default function Admin() {
  const { user, profile, isWorking, toggleWorkingMode, isDemoMode } = useAuth()
  const { leadLists, fetchLeadLists } = useLeadLists()

  const [activeTab, setActiveTab] = useState('dashboard')
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
  const [editingUser, setEditingUser] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showEmployee, setShowEmployee] = useState(false)
  const [showLeadList, setShowLeadList] = useState(false)
  const [systemSettings, setSystemSettings] = useState(getSettings)

  useEffect(() => {
    fetchData()
    fetchLeadLists()
  }, [isDemoMode])

  if (profile && profile.role !== 'admin') return <Navigate to="/dashboard" />

  async function fetchData() {
    setLoading(true)
    const { data: l } = await supabase.from('leads').select('*').order('created_at', { ascending: false })
    const { data: u } = await supabase.from('profiles').select('*').order('full_name')
    setLeads(l || [])
    setUsers(u || [])
    setLoading(false)
  }

  async function handleDeleteEmployee(userId) {
    if (confirm('Verwijderen?')) {
      await supabase.from('profiles').delete().eq('id', userId)
      setUsers(users.filter(u => u.id !== userId))
    }
  }

  async function addLead(e) {
    e.preventDefault()
    if (!newLead.lead_list_id) {
       alert('Selecteer een lijst (Batch) om de lead aan toe te voegen!')
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
        decision_maker: newLead.decision_maker
      })
      if (error) throw error
      setShowAddLead(false)
      fetchData()
      alert('Lead toegevoegd!')
    } catch (err) {
      alert(`Fout: ${err.message}`)
    }
  }

  // Support functions...
  const handleUpdateFlow = async (id, updates) => {
    await supabase.from('profiles').update(updates).eq('id', id)
    fetchData()
  }

  return (
    <div className="min-h-screen bg-dark text-white">
      <Header onOpenSettings={() => setShowSettings(true)} />

      <main className="container-wide py-6 px-8">
        {/* TABS MENU */}
        <div className="flex gap-4 mb-8 bg-white/5 p-2 rounded-2xl w-fit">
           {['dashboard', 'medewerkers', 'DATA'].map(t => (
             <button 
               key={t}
               onClick={() => setActiveTab(t.toLowerCase())}
               className={`px-8 py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${
                 activeTab === t.toLowerCase() ? 'bg-primary text-white shadow-xl shadow-primary/20' : 'text-muted hover:text-white'
               }`}
             >
               {t === 'DATA' ? <Layers size={16} className="inline mr-2" /> : t === 'medewerkers' ? <Users size={16} className="inline mr-2" /> : <Activity size={16} className="inline mr-2" />}
               {t}
             </button>
           ))}
        </div>

        {activeTab === 'dashboard' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
             <div className="flex justify-between items-center mb-10">
                <div>
                   <h1 className="text-4xl font-black italic tracking-tighter text-white">ADMIN COMMAND</h1>
                   <p className="text-muted font-bold">Welkom terug, {profile?.full_name}. Systeem is 100% operationeel.</p>
                </div>
                <div className="flex gap-3">
                   <button className="btn btn-primary px-8 py-4" onClick={() => setShowAddLead(true)}><Plus size={20} /> NIEUWE LEAD</button>
                   <button className="btn btn-secondary px-8 py-4 text-dark font-black shadow-lg shadow-secondary/20" onClick={() => setShowCampaign(true)}><Megaphone size={20}/> CAMPAGNE</button>
                </div>
             </div>

             <PipelineFunnel leads={leads} isDemoMode={isDemoMode} />

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
                <div className="glass-panel p-8 bg-gradient-to-br from-primary/20 to-transparent border border-white/5">
                   <h2 className="text-2xl font-black italic mb-4">QUICK EXPORT</h2>
                   <button onClick={() => exportToCSV(leads, 'LeadGen_Backup')} className="btn btn-primary btn-block py-4 shadow-xl shadow-primary/30 font-black tracking-widest">DOWNLOAD ALLE DATA (.CSV)</button>
                   <Link to="/admin/telemetry" className="btn btn-outline btn-block mt-4 border-white/10 text-muted hover:text-white">Open Telemetry Dashboard</Link>
                </div>
             </div>
          </motion.div>
        )}

        {activeTab === 'medewerkers' && (
          <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
             <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-black italic tracking-tight">TEAM OVERVIEW</h2>
                <button onClick={() => setShowEmployee(true)} className="btn btn-primary px-6"><UserPlus size={18} /> Nieuwe Medewerker</button>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {users.map(u => (
                  <div key={u.id} className="glass-panel p-6 group hover:border-primary/50 transition-all border border-white/5">
                     <div className="flex justify-between">
                        <div className="flex items-center gap-4">
                           <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center font-black text-primary border border-white/5">{u.full_name?.charAt(0)}</div>
                           <div>
                              <div className="font-bold text-white tracking-tight">{u.full_name}</div>
                              <div className="text-[10px] text-muted opacity-50 uppercase font-black">{u.email}</div>
                           </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${u.role === 'admin' ? 'bg-secondary/20 text-secondary' : 'bg-success/20 text-success'}`}>{u.role}</span>
                     </div>
                     <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center">
                        <div>
                           <div className="text-xs text-muted font-bold uppercase tracking-tight">Actieve Leads</div>
                           <div className="text-2xl font-black text-white">{leads.filter(l => l.assigned_to === u.id).length}</div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                           <button onClick={() => setEditingUser(u)} className="p-2 hover:bg-white/10 rounded-lg text-muted hover:text-white"><Settings size={18}/></button>
                           {u.id !== user.id && (
                             <button onClick={() => handleDeleteEmployee(u.id)} className="p-2 hover:bg-error/20 rounded-lg text-muted hover:text-error"><Trash2 size={18}/></button>
                           )}
                        </div>
                     </div>
                  </div>
                ))}
             </div>
          </motion.div>
        )}

        {activeTab === 'data' && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <LeadManagement />
           </motion.div>
        )}

        {/* MODAL: ADD LEAD */}
        <AnimatePresence>
          {showAddLead && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowAddLead(false)}>
              <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} className="modal glass-panel p-8 max-w-xl w-full" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-8">
                  <h2 className="text-2xl font-black italic tracking-tighter">LEAD HANDMATIG TOEVOEGEN</h2>
                  <button onClick={() => setShowAddLead(false)} className="text-muted hover:text-white"><X size={24}/></button>
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
                    <label className="text-[10px] font-black uppercase text-primary tracking-widest mb-2 block">Lead Lijst (Batch Selection) *</label>
                    <div className="flex gap-2">
                       <select 
                         className="form-dark w-full border-primary/30 text-secondary font-bold"
                         value={newLead.lead_list_id} 
                         onChange={e => setNewLead({...newLead, lead_list_id: e.target.value})}
                         required
                       >
                          <option value="">-- SELECTEER EEN LIJST --</option>
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

                  <button type="submit" className="btn btn-primary btn-block py-5 text-lg font-black tracking-widest shadow-2xl shadow-primary/30 mt-4 uppercase">Opslaan & Publiceren</button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      <EmployeeModal isOpen={showEmployee} onClose={() => setShowEmployee(false)} />
      <BriefingModal isOpen={showBriefing} onClose={() => setShowBriefing(false)} />
      <CampaignModal isOpen={showCampaign} onClose={() => setShowCampaign(false)} />
      <LeadListModal isOpen={showLeadList} onClose={() => setShowLeadList(false)} />

      <style jsx>{`
        .form-dark { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.05); padding: 12px 16px; border-radius: 12px; color: white; transition: all 0.2s; }
        .form-dark:focus { border-color: var(--primary); outline: none; box-shadow: 0 0 0 2px rgba(var(--primary-rgb), 0.2); }
        .container-wide { max-width: 1400px; margin: 0 auto; }
        .glass-panel { background: rgba(255,255,255,0.02); backdrop-filter: blur(20px); border-radius: 20px; }
      `}</style>
    </div>
  )
}