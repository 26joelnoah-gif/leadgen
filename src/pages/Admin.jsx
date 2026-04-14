import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Header from '../components/Header'
import { Link, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Users, Settings, UserPlus, Phone, PhoneOff, Mail, UserCheck, Shield, Activity, Download, Play, Zap, Upload, X, CheckCircle, AlertTriangle, Bell, Megaphone, Target, DollarSign, Calendar, List } from 'lucide-react'
import { STATUS_MAP } from '../utils/statusUtils'
import { exportToCSV } from '../utils/exportUtils'
import { parseCSV, validateLeads } from '../utils/importUtils'
import { CAMPAIGN_TYPES } from '../utils/campaignUtils'
import { getSettings, saveSettings } from '../utils/settingsUtils'
import LoadingSpinner from '../components/LoadingSpinner'
import StatusSelector from '../components/StatusSelector'
import Logo from '../components/Logo'
import MobileNav from '../components/MobileNav'
import CampaignModal, { CampaignCard } from '../components/CampaignModal'
import BriefingModal, { BriefingCard } from '../components/BriefingModal'
import { LeadListModal } from '../components/LeadListModal'
import PipelineFunnel from '../components/PipelineFunnel'
import EmployeeModal from '../components/EmployeeModal'

export default function Admin() {
  const { user, profile, signOut, isWorking, toggleWorkingMode, isDemoMode, sessionCallCount } = useAuth()
  const [leads, setLeads] = useState([])
  const [users, setUsers] = useState([])

  if (profile && profile.role !== 'admin') {
    return <Navigate to="/dashboard" />
  }
  const [loading, setLoading] = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)
  const [newLead, setNewLead] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    assigned_to: '',
    lead_source: 'cold',
    decision_maker: false
  })
  const [showImport, setShowImport] = useState(false)
  const [importData, setImportData] = useState(null)
  const [importErrors, setImportErrors] = useState([])
  const [showCampaign, setShowCampaign] = useState(false)
  const [showBriefing, setShowBriefing] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const [briefings, setBriefings] = useState([])
  const [editingUser, setEditingUser] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [showEmployee, setShowEmployee] = useState(false)
  const [showLeadList, setShowLeadList] = useState(false)
  const [selectedLeads, setSelectedLeads] = useState([])
  const [systemSettings, setSystemSettings] = useState(getSettings)

  useEffect(() => {
    fetchData()
  }, [isDemoMode])

  async function fetchData() {
    setLoading(true)
    try {
      const [leadsRes, usersRes] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').order('full_name')
      ])
      setLeads(leadsRes.data || [])
      setUsers(usersRes.data || [])
    } catch (err) {
      console.error('Error fetching admin data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleExportAll = () => {
    const data = leads.map(l => ({
      Naam: l.name,
      Telefoon: l.phone,
      Email: l.email || '-',
      Status: STATUS_MAP[l.status]?.label || l.status,
      Toegewezen: users.find(u => u.id === l.assigned_to)?.full_name || 'Niemand',
      Datum: new Date(l.created_at).toLocaleDateString()
    }))
    exportToCSV(data, 'LeadGen_Alle_Leads')
  }

  function handleFileUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const csv = event.target.result
      const parsed = parseCSV(csv)
      const { valid, errors } = validateLeads(parsed)
      setImportData(valid)
      setImportErrors(errors)
      setShowImport(true)
    }
    reader.readAsText(file)
  }

  async function confirmImport() {
    if (!importData || importData.length === 0) return

    for (const lead of importData) {
      await supabase.from('leads').insert({
        name: lead.name,
        phone: lead.phone,
        email: lead.email || null,
        notes: lead.notes || '',
        status: 'new',
        assigned_to: user.id,
        created_by: user.id
      })
    }

    setShowImport(false)
    setImportData(null)
    setImportErrors([])
    fetchData()
  }

  function handleStartCampaign(campaign) {
    const newCampaign = {
      ...campaign,
      id: Date.now(),
      status: 'active',
      created_at: new Date().toISOString()
    }
    setCampaigns([newCampaign, ...campaigns])
    alert(`${CAMPAIGN_TYPES[campaign.type]?.name} campagne "${campaign.name}" is gestart!`)
  }

  function handlePauseCampaign(id) {
    setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: 'paused' } : c))
  }

  function handleResumeCampaign(id) {
    setCampaigns(campaigns.map(c => c.id === id ? { ...c, status: 'active' } : c))
  }

  function handleDeleteCampaign(id) {
    if (confirm('Weet je zeker dat je deze campagne wilt verwijderen?')) {
      setCampaigns(campaigns.filter(c => c.id !== id))
    }
  }

  function handleSendBriefing(briefing) {
    const newBriefing = {
      ...briefing,
      id: Date.now(),
      created_at: new Date().toISOString()
    }
    setBriefings([newBriefing, ...briefings])
    alert('Briefing verstuurd naar alle medewerkers!')
  }

  async function handleAddEmployee(employee) {
    if (isDemoMode) {
      const newUser = {
        id: Date.now().toString(),
        email: employee.email,
        full_name: employee.name,
        role: employee.role,
        show_appointments_in_earnings: true,
        show_deals_in_earnings: true
      }
      setUsers([newUser, ...users])
      return
    }

    // Use signUp (works with anon key, no service_role needed)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: employee.email,
      password: employee.password,
      options: {
        data: { full_name: employee.name, role: employee.role }
      }
    })

    if (authError) {
      alert(`Fout bij aanmaken: ${authError.message}`)
      return
    }

    // Update the profile role (trigger creates the profile with role='employee' by default)
    if (authData?.user?.id) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: authData.user.id,
        email: employee.email,
        full_name: employee.name,
        role: employee.role,
        show_appointments_in_earnings: true,
        show_deals_in_earnings: true
      })
      if (profileError) {
        console.error('Profile upsert failed:', profileError)
        alert(`Gebruiker aangemaakt maar profiel kon niet worden bijgewerkt: ${profileError.message}`)
      }
    }

    alert(`Medewerker ${employee.name} is toegevoegd!`)
    fetchData()
  }

  async function addLead(e) {
    e.preventDefault()
    try {
      const leadData = {
        ...newLead,
        created_by: user.id,
        status: 'new',
        assigned_to: newLead.assigned_to || null
      }
      const { error } = await supabase.from('leads').insert(leadData)
      if (error) throw error
      setShowAddLead(false)
      setNewLead({
        name: '',
        phone: '',
        email: '',
        notes: '',
        assigned_to: '',
        lead_source: 'cold',
        decision_maker: false
      })
      fetchData()
    } catch (err) {
      console.error('addLead error:', err)
      alert(`Fout bij aanmaken lead: ${err.message}`)
    }
  }

  async function assignLead(leadId, userId) {
    await supabase.from('leads').update({ assigned_to: userId || null }).eq('id', leadId)
    setLeads(leads.map(l => l.id === leadId ? { ...l, assigned_to: userId } : l))
  }

  async function bulkAssignLeads(userId) {
    if (selectedLeads.length === 0) return
    for (const leadId of selectedLeads) {
      await supabase.from('leads').update({ assigned_to: userId }).eq('id', leadId)
    }
    setLeads(leads.map(l => selectedLeads.includes(l.id) ? { ...l, assigned_to: userId } : l))
    setSelectedLeads([])
    alert(`${selectedLeads.length} leads toegewezen!`)
  }

  function toggleLeadSelection(leadId) {
    setSelectedLeads(prev =>
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    )
  }

  function selectAllLeads() {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([])
    } else {
      setSelectedLeads(leads.map(l => l.id))
    }
  }

  async function updateStatus(leadId, status) {
    await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', leadId)
    setLeads(leads.map(l => l.id === leadId ? { ...l, status } : l))
  }

  async function updateUserSettings(userId, settings) {
    if (isDemoMode) {
      setUsers(users.map(u => u.id === userId ? { ...u, ...settings } : u))
      return
    }
    const { error } = await supabase.from('profiles').update(settings).eq('id', userId)
    if (!error) {
       setUsers(users.map(u => u.id === userId ? { ...u, ...settings } : u))
    }
  }

  function handleSaveSystemSettings(newSettings) {
    saveSettings(newSettings)
    setSystemSettings(newSettings)
    setShowSettings(false)
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="admin-page"
    >
      <Header onOpenSettings={() => setShowSettings(true)} />

      <main className="container">
        <motion.div 
          initial={{ y: -20, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }} 
          className="page-header flex justify-between items-center"
        >
          <div>
            <h1>Admin Panel</h1>
            <p>Beheer alle leads, gebruikers en toewijzingen</p>
          </div>
          <div className="flex gap-2">
            {isDemoMode && (
              <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', fontWeight: 600, padding: '8px 12px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px', alignSelf: 'center' }}>
                DEMO DATA
              </span>
            )}
            <button className="btn btn-primary" onClick={() => setShowBriefing(true)} style={{ background: 'var(--secondary)', color: 'var(--primary-dark)' }}>
              <Bell size={18} /> BRIEFING
            </button>
            <button className="btn btn-secondary" onClick={() => setShowCampaign(true)}>
              <Megaphone size={18} /> CAMPAGNE
            </button>
            <label className="btn btn-outline" style={{ cursor: 'pointer' }}>
              <Upload size={18} /> Import CSV
              <input type="file" accept=".csv" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>
            <button 
              className={`btn btn-sm ${isWorking ? 'btn-secondary' : 'btn-outline'}`} 
              onClick={toggleWorkingMode}
              title={isWorking ? 'Bellen ingeschakeld' : 'Bellen uitgeschakeld'}
            >
              {isWorking ? <Phone size={18} /> : <PhoneOff size={18} />}
              <span className="ml-1">{isWorking ? 'Aan' : 'Uit'}</span>
            </button>
            <button className="btn btn-outline" onClick={handleExportAll}>
              <Download size={18} /> Export Leads
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddLead(true)}>
              <Plus size={18} /> Nieuwe Lead
            </button>
            <button className="btn btn-secondary" onClick={() => setShowLeadList(true)}>
              <List size={18} /> Lead Lijsten
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {showAddLead && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowAddLead(false)}>
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="modal glass-panel" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Nieuwe Lead Toevoegen</h2>
                  <button className="modal-close" onClick={() => setShowAddLead(false)}>×</button>
                </div>
                <form onSubmit={addLead}>
                  <div className="form-group">
                    <label><Users size={14} /> Naam *</label>
                    <input value={newLead.name} onChange={e => setNewLead({...newLead, name: e.target.value})} required placeholder="Bedrijfsnaam" />
                  </div>
                  <div className="form-group">
                    <label><Phone size={14} /> Telefoon *</label>
                    <input value={newLead.phone} onChange={e => setNewLead({...newLead, phone: e.target.value})} required placeholder="06..." />
                  </div>
                  <div className="form-group">
                    <label><Mail size={14} /> Email</label>
                    <input type="email" value={newLead.email} onChange={e => setNewLead({...newLead, email: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Notities</label>
                    <textarea value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} rows={2} />
                  </div>
                  <div className="form-group">
                      <label>Bron</label>
                      <select value={newLead.lead_source} onChange={e => setNewLead({...newLead, lead_source: e.target.value})}>
                        <option value="cold">Cold Call</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="referral">Referral</option>
                      </select>
                    </div>
                  <div className="form-group flex justify-between items-center" style={{ background: 'var(--bg-elevated)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <label style={{ margin: 0, cursor: 'pointer' }} className="flex items-center gap-2">
                       <Shield size={14} /> Beslisser?
                    </label>
                    <input type="checkbox" checked={newLead.decision_maker} onChange={e => setNewLead({...newLead, decision_maker: e.target.checked})} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                  </div>
                  <div className="form-group">
                    <label><UserCheck size={14} /> Toewijzen</label>
                    <select value={newLead.assigned_to} onChange={e => setNewLead({...newLead, assigned_to: e.target.value})}>
                      <option value="">Niet toegewezen</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                  <button type="submit" className="btn btn-primary btn-block mt-3">Lead Toevoegen</button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <CampaignModal
          isOpen={showCampaign}
          onClose={() => setShowCampaign(false)}
          onStartCampaign={handleStartCampaign}
        />

        <BriefingModal
          isOpen={showBriefing}
          onClose={() => setShowBriefing(false)}
          onSend={handleSendBriefing}
          userName={profile?.full_name || user?.email}
          users={users}
        />

        <EmployeeModal
          isOpen={showEmployee}
          onClose={() => setShowEmployee(false)}
          onAdd={handleAddEmployee}
        />

        <LeadListModal
          isOpen={showLeadList}
          onClose={() => setShowLeadList(false)}
        />

        <PipelineFunnel leads={leads} isDemoMode={isDemoMode} />

        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="card glow-hover">
            <div className="card-header">
              <span className="card-title"><UserPlus size={18} /> Medewerkers</span>
              <button onClick={() => setShowEmployee(true)} className="btn btn-sm btn-primary">
                <UserPlus size={14} /> Toevoegen
              </button>
            </div>
            <table className="table">
              <thead><tr><th>Naam</th><th>Status</th><th>Leads</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.full_name}</strong><br/><small className="text-muted">{u.email}</small></td>
                    <td><span className={`status status-${u.role === 'admin' ? 'afspraak_gemaakt' : 'new'}`}>{u.role}</span></td>
                    <td>
                      <div className="flex items-center justify-between">
                         <span className="text-secondary" style={{ fontWeight: 700 }}>{leads.filter(l => l.assigned_to === u.id).length}</span>
                         <button onClick={() => setEditingUser(u)} className="btn btn-sm btn-ghost" title="Instellingen">
                            <Settings size={14} />
                         </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          <motion.div initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="card glass-panel glow-hover" style={{ background: 'var(--primary)', color: 'white' }}>
            <h3 className="card-title" style={{ color: 'white' }}><Shield size={20} /> Systeem Status</h3>
            <div className="mt-3">
              <p>Database: <span className="text-secondary">Connected</span></p>
              <p>API: <span className="text-secondary">v2.1.0</span></p>
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {editingUser && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setEditingUser(null)}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="modal glass-panel" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2><Settings size={18} /> Instellingen: {editingUser.full_name}</h2>
                  <button className="modal-close" onClick={() => setEditingUser(null)}><X size={18} /></button>
                </div>
                <div className="flex flex-column gap-3 mt-3">
                   <div className="flex justify-between items-center p-3 glass-panel" style={{ background: 'var(--bg-elevated)' }}>
                      <div>
                        <strong>Toon afspraken in verdiensten</strong>
                        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Mag deze medewerker zijn afspraken zien?</p>
                      </div>
                      <input type="checkbox" checked={editingUser.show_appointments_in_earnings} onChange={(e) => {
                        const newUser = {...editingUser, show_appointments_in_earnings: e.target.checked};
                        setEditingUser(newUser);
                        updateUserSettings(newUser.id, { show_appointments_in_earnings: e.target.checked });
                      }} style={{ width: '20px', height: '20px' }} />
                   </div>
                   <div className="flex justify-between items-center p-3 glass-panel" style={{ background: 'var(--bg-elevated)' }}>
                      <div>
                        <strong>Toon deals in verdiensten</strong>
                        <p className="text-muted" style={{ fontSize: '0.8rem' }}>Mag deze medewerker zijn deals zien?</p>
                      </div>
                      <input type="checkbox" checked={editingUser.show_deals_in_earnings} onChange={(e) => {
                        const newUser = {...editingUser, show_deals_in_earnings: e.target.checked};
                        setEditingUser(newUser);
                        updateUserSettings(newUser.id, { show_deals_in_earnings: e.target.checked });
                      }} style={{ width: '20px', height: '20px' }} />
                   </div>
                </div>
                <button className="btn btn-primary btn-block mt-4" onClick={() => setEditingUser(null)}>Opslaan</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSettings && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowSettings(false)}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="modal glass-panel" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h2><Settings size={18} /> Systeem Instellingen</h2>
                  <button className="modal-close" onClick={() => setShowSettings(false)}><X size={18} /></button>
                </div>
                <div className="flex flex-column gap-4 mt-4">
                  <div className="form-group">
                    <label><Target size={14} /> Maandelijkse Deal Target</label>
                    <input
                      type="number"
                      min="1"
                      value={systemSettings.monthlyTarget}
                      onChange={e => setSystemSettings({ ...systemSettings, monthlyTarget: parseInt(e.target.value) || 1 })}
                      style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                    />
                    <small className="text-muted">Aantal deals dat medewerkers per maand moeten behalen</small>
                  </div>
                  <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label><DollarSign size={14} /> Deal Waarde (&euro;)</label>
                      <input
                        type="number"
                        min="0"
                        value={systemSettings.dealValue}
                        onChange={e => setSystemSettings({ ...systemSettings, dealValue: parseInt(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                      />
                    </div>
                    <div className="form-group">
                      <label><Calendar size={14} /> Afspraak Waarde (&euro;)</label>
                      <input
                        type="number"
                        min="0"
                        value={systemSettings.appointmentValue}
                        onChange={e => setSystemSettings({ ...systemSettings, appointmentValue: parseInt(e.target.value) || 0 })}
                        style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button className="btn btn-outline" onClick={() => setShowSettings(false)} style={{ flex: 1 }}>Annuleren</button>
                  <button className="btn btn-primary" onClick={() => handleSaveSystemSettings(systemSettings)} style={{ flex: 1, background: 'var(--secondary)', color: 'var(--primary-dark)' }}>Opslaan</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {(campaigns.length > 0 || briefings.length > 0) && (
          <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px', marginBottom: '32px' }}>
            {campaigns.length > 0 && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card">
                <div className="card-header"><span className="card-title"><Megaphone size={18} /> Campagnes</span></div>
                <div className="flex flex-column gap-2">
                  {campaigns.map(c => <CampaignCard key={c.id} campaign={c} onPause={handlePauseCampaign} onResume={handleResumeCampaign} onDelete={handleDeleteCampaign} />)}
                </div>
              </motion.div>
            )}
            {briefings.length > 0 && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="card">
                <div className="card-header"><span className="card-title"><Bell size={18} /> Briefings</span></div>
                <div className="flex flex-column gap-2">
                  {briefings.map(b => <BriefingCard key={b.id} briefing={b} />)}
                </div>
              </motion.div>
            )}
          </div>
        )}

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="card">
          <div className="card-header">
            <span className="card-title"><Activity size={18} /> Alle Leads ({leads.length})</span>
            {selectedLeads.length > 0 && (
              <div className="flex items-center gap-2">
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selectedLeads.length} geselecteerd</span>
                <select
                  onChange={(e) => bulkAssignLeads(e.target.value)}
                  defaultValue=""
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)' }}
                >
                  <option value="">Toewijzen aan...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
                <button onClick={() => setSelectedLeads([])} className="btn btn-sm btn-outline">Wissen</button>
              </div>
            )}
          </div>
          {loading ? <LoadingSpinner /> : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th style={{ width: '40px' }}><input type="checkbox" checked={selectedLeads.length === leads.length && leads.length > 0} onChange={selectAllLeads} /></th><th>Details</th><th>Contact</th><th>Status</th><th>Toegewezen aan</th></tr></thead>
                <tbody>
                  {leads.map(lead => (
                    <tr key={lead.id} style={{ background: selectedLeads.includes(lead.id) ? 'rgba(245, 158, 11, 0.1)' : 'transparent' }}>
                      <td><input type="checkbox" checked={selectedLeads.includes(lead.id)} onChange={() => toggleLeadSelection(lead.id)} /></td>
                      <td><strong>{lead.name}</strong></td>
                      <td><div className="flex items-center gap-1">{isWorking && <Phone size={14} className="text-success" />}{lead.phone}</div></td>
                      <td><StatusSelector currentStatus={lead.status} onStatusChange={(s) => updateStatus(lead.id, s)} /></td>
                      <td>
                        <select value={lead.assigned_to || ''} onChange={(e) => assignLead(lead.id, e.target.value)} style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                          <option value="">Niemand</option>
                          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </main>
    </motion.div>
  )
}