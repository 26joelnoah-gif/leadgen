import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Users, Settings, UserPlus, Phone, PhoneOff, Mail, UserCheck, Shield, Activity, Download } from 'lucide-react'
import { STATUS_MAP } from '../utils/statusUtils'
import { exportToCSV } from '../utils/exportUtils'
import LoadingSpinner from '../components/LoadingSpinner'
import StatusSelector from '../components/StatusSelector'

export default function Admin() {
  const { user, profile, signOut, callEnabled, toggleCallEnabled, isDemoMode } = useAuth()
  const [leads, setLeads] = useState([])
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAddLead, setShowAddLead] = useState(false)
  const [newLead, setNewLead] = useState({ name: '', phone: '', email: '', notes: '', assigned_to: '' })

  useEffect(() => {
    fetchData()
  }, [isDemoMode])

  async function fetchData() {
    setLoading(true)
    try {
      const [leadsRes, usersRes] = await Promise.all([
        supabase.from('leads').select('*, assigned_to_profile:profiles!assigned_to(full_name), created_by_profile:profiles!created_by(full_name)').order('created_at', { ascending: false }),
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
      Toegewezen: l.assigned_to_profile?.full_name || 'Niemand',
      Datum: new Date(l.created_at).toLocaleDateString()
    }))
    exportToCSV(data, 'LeadGen_Alle_Leads')
  }

  async function addLead(e) {
    e.preventDefault()
    const { error } = await supabase.from('leads').insert({
      ...newLead,
      created_by: user.id,
      status: 'new'
    })
    if (!error) {
      setShowAddLead(false)
      setNewLead({ name: '', phone: '', email: '', notes: '', assigned_to: '' })
      fetchData()
    }
  }

  async function assignLead(leadId, userId) {
    await supabase.from('leads').update({ assigned_to: userId || null }).eq('id', leadId)
    setLeads(leads.map(l => l.id === leadId ? { ...l, assigned_to: userId } : l))
  }

  async function updateStatus(leadId, status) {
    await supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', leadId)
    setLeads(leads.map(l => l.id === leadId ? { ...l, status } : l))
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="admin-page"
    >
      <header className="header">
        <div className="container header-content">
          <div className="logo">
            <Settings className="text-secondary" />
            LEADGEN Admin
          </div>
          <nav className="nav">
            <Link to="/">Mijn Leads</Link>
            <Link to="/admin" className="active">Admin</Link>
            <Link to="/admin/reports">Rapportage</Link>
          </nav>
          <div className="header-actions">
            <span>{profile?.full_name || user?.email}</span>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

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
          <div className="flex items-center gap-2">
            {isDemoMode && (
              <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', fontWeight: 600, padding: '8px 12px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px' }}>
                DEMO DATA
              </span>
            )}
            <button 
              className={`btn btn-sm ${callEnabled ? 'btn-secondary' : 'btn-outline'}`} 
              onClick={toggleCallEnabled}
              title={callEnabled ? 'Bellen ingeschakeld' : 'Bellen uitgeschakeld'}
            >
              {callEnabled ? <Phone size={18} /> : <PhoneOff size={18} />}
              <span className="ml-1">{callEnabled ? 'Aan' : 'Uit'}</span>
            </button>
            <button className="btn btn-outline" onClick={handleExportAll}>
              <Download size={18} /> Export Leads
            </button>
            <button className="btn btn-primary" onClick={() => setShowAddLead(true)}>
              <Plus size={18} /> Nieuwe Lead
            </button>
          </div>
        </motion.div>

        <AnimatePresence>
          {showAddLead && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="modal-overlay" 
              onClick={() => setShowAddLead(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="modal glass-panel" 
                onClick={e => e.stopPropagation()}
              >
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
                    <textarea value={newLead.notes} onChange={e => setNewLead({...newLead, notes: e.target.value})} rows={3} />
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

        <div className="grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', marginBottom: '32px' }}>
          <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="card glow-hover">
            <div className="card-header">
              <span className="card-title"><UserPlus size={18} /> Medewerkers</span>
            </div>
            <table className="table">
              <thead><tr><th>Naam</th><th>Status</th><th>Leads</th></tr></thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td><strong>{u.full_name}</strong><br/><small className="text-muted">{u.email}</small></td>
                    <td><span className={`status status-${u.role === 'admin' ? 'afspraak_gemaakt' : 'new'}`}>{u.role}</span></td>
                    <td className="text-secondary" style={{ fontWeight: 700 }}>{leads.filter(l => l.assigned_to === u.id).length}</td>
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

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="card">
          <div className="card-header">
            <span className="card-title"><Activity size={18} /> Alle Leads</span>
          </div>
          {loading ? <LoadingSpinner /> : (
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Details</th><th>Contact</th><th>Status</th><th>Toegewezen aan</th></tr></thead>
                <tbody>
                  {leads.map(lead => (
                    <tr key={lead.id}>
                      <td><strong>{lead.name}</strong></td>
                      <td>
                        <div className="flex items-center gap-1">
                          {callEnabled && <Phone size={14} className="text-success" />}
                          {lead.phone}
                        </div>
                      </td>
                      <td><StatusSelector currentStatus={lead.status} onStatusChange={(s) => updateStatus(lead.id, s)} /></td>
                      <td>
                        <select 
                          value={lead.assigned_to || ''} 
                          onChange={(e) => assignLead(lead.id, e.target.value)}
                          style={{ padding: '6px', borderRadius: '4px', border: '1px solid var(--border)' }}
                        >
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