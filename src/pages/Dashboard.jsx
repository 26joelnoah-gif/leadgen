import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Search, Filter, Phone, PhoneOff, Activity, Zap, Plus, X } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { STATUS_MAP } from '../utils/statusUtils'
import LeadCard from '../components/LeadCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import Logo from '../components/Logo'
import TeamLeaderboard from '../components/TeamLeaderboard'
import MobileNav from '../components/MobileNav'
import Chat from '../components/Chat'

export default function Dashboard() {
  const { user, profile, signOut, callEnabled, toggleCallEnabled, isDemoMode, sessionCallCount } = useAuth()
  const { leads, loading, refreshLeads, updateLeadStatus, createLead } = useLeads()
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showNewLeadModal, setShowNewLeadModal] = useState(false)
  const [newLead, setNewLead] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    lead_source: 'cold',
    company_size: '1-10',
    decision_maker: false,
    assigned_to: ''
  })
  const [creating, setCreating] = useState(false)
  const [users, setUsers] = useState([])

  useEffect(() => {
    async function fetchUsers() {
      const { data } = await supabase.from('profiles').select('*').order('full_name')
      if (data) setUsers(data)
    }
    fetchUsers()
  }, [])

  const filteredLeads = leads.filter(lead => {
    let matchesFilter = true
    if (filter === 'all') matchesFilter = true
    else if (filter === 'hot') matchesFilter = ['new', 'terugbelafspraak', 'later_bellen'].includes(lead.status)
    else if (filter === 'new') matchesFilter = lead.status === 'new'
    else matchesFilter = lead.status === filter

    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (lead.phone && lead.phone.includes(searchTerm))
    return matchesFilter && matchesSearch
  }).sort((a, b) => {
    // Hot leads first: new, callback, appointment
    const priority = { new: 0, terugbelafspraak: 1, afspraak_gemaakt: 2, later_bellen: 3, mailbox: 4, geen_interesse: 5, deal: 6, verkeerd_nummer: 7 }
    const aPriority = priority[a.status] ?? 9
    const bPriority = priority[b.status] ?? 9
    if (aPriority !== bPriority) return aPriority - bPriority
    // Then by date (newest first)
    return new Date(b.created_at) - new Date(a.created_at)
  })

  async function handleCreateLead(e) {
    e.preventDefault()
    if (!newLead.name || !newLead.phone) return
    setCreating(true)
    await createLead(newLead)
    setNewLead({
      name: '',
      phone: '',
      email: '',
      notes: '',
      lead_source: 'cold',
      company_size: '1-10',
      decision_maker: false,
      assigned_to: ''
    })
    setShowNewLeadModal(false)
    setCreating(false)
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="dashboard-page"
    >
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav" style={{ marginLeft: '40px', flex: 1 }}>
            <Link to="/" className="active">Dashboard</Link>
            {profile?.role !== 'admin' && <Link to="/focus">Focus Mode</Link>}
            <Link to="/earnings">Verdiensten</Link>
            <Link to="/admin/telemetry">Telemetrie</Link>
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            {profile?.role === 'admin' && <Link to="/admin/reports">Rapportage</Link>}
          </nav>
          <MobileNav profile={profile} />
          <div className="header-actions">
            <div className="flex items-center gap-2" style={{ background: 'rgba(232, 185, 35, 0.15)', padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--secondary)', marginRight: '16px' }}>
              <Zap size={18} style={{ color: 'var(--secondary)' }} />
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'white' }}>{sessionCallCount}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>calls</span>
            </div>
            <div className="user-profile flex items-center gap-2">
              <div className="avatar" style={{ width: '32px', height: '32px', background: 'var(--secondary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: 'var(--primary-dark)', fontSize: '0.8rem' }}>
                {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{profile?.full_name || user?.email}</span>
            </div>
            <button
              onClick={toggleCallEnabled}
              className={`btn btn-sm ${callEnabled ? 'btn-secondary' : 'btn-outline'}`}
              style={{ gap: '6px', minWidth: '80px' }}
              title={callEnabled ? 'Bellen ingeschakeld' : 'Bellen uitgeschakeld'}
            >
              {callEnabled ? <Phone size={14} /> : <PhoneOff size={14} />}
              <span>{callEnabled ? 'Aan' : 'Uit'}</span>
            </button>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

      <main className="container">
        <motion.div 
          initial={{ y: -20, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }} 
          className="page-header flex justify-between items-end"
        >
          <div>
            <h1>Welkom terug, {profile?.full_name?.split(' ')[0] || 'Sales'}</h1>
            <p>Je hebt vandaag {leads.filter(l => l.status === 'new').length} nieuwe leads om op te volgen.</p>
          </div>
          <div className="flex items-center gap-2">
            {isDemoMode && (
              <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', fontWeight: 600, padding: '8px 12px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px' }}>
                DEMO DATA
              </span>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNewLeadModal(true)}>
              <Plus size={16} /> Nieuwe Lead
            </button>
            <button className="btn btn-outline btn-sm" onClick={refreshLeads}>
              <RefreshCw size={16} /> Vernieuwen
            </button>
          </div>
        </motion.div>

        <div className="filter-bar glass-panel flex justify-between items-center" style={{ gap: '20px' }}>
          <div className="search-input" style={{ flex: 1, position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Zoek op naam..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-control"
              style={{ paddingLeft: '40px', width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 10px 10px 40px' }}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-muted" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ padding: '10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
            >
              <option value="all">Alle leads</option>
              <option value="hot">🔥 Hot Leads</option>
              <option value="new">Nieuwe leads</option>
              {Object.entries(STATUS_MAP).map(([key, details]) => (
                <option key={key} value={key}>{details.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="stats-grid mb-4" style={{ marginTop: '24px' }}>
          {[
            { label: 'Nieuwe Leads', val: leads.filter(l => l.status === 'new').length, icon: '📬', color: '#3B82F6' },
            { label: 'Hot Leads', val: leads.filter(l => ['new', 'terugbelafspraak', 'later_bellen'].includes(l.status)).length, icon: '🔥', color: '#EF4444', pulse: true },
            { label: 'Afspraken', val: leads.filter(l => l.status === 'afspraak_gemaakt').length, icon: '📅', color: '#10B981' },
            { label: 'Deals', val: leads.filter(l => l.status === 'deal').length, icon: '🏆', color: '#D4AF37' }
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: i * 0.1 }}
              className="stat-card glass-panel glow-hover"
              style={{ padding: '20px', borderLeft: `4px solid ${stat.color}` }}
            >
              <div className="flex justify-between items-center">
                <div>
                  <motion.div
                    animate={stat.pulse ? { scale: [1, 1.1, 1] } : {}}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    style={{ fontSize: '2rem', marginBottom: '4px' }}
                  >
                    {stat.icon}
                  </motion.div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 800, color: stat.color }}>{stat.val}</div>
                  <div className="label">{stat.label}</div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {loading ? (
          <div style={{ padding: '100px 0' }}>
            <LoadingSpinner size="large" />
          </div>
        ) : (
          <div className="dashboard-content" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', alignItems: 'start' }}>
            <div className="leads-list">
              <AnimatePresence>
                {filteredLeads.length === 0 ? (
                  <EmptyState key="empty" title="Geen leads gevonden" />
                ) : (
                  filteredLeads.map((lead, i) => (
                    <motion.div
                      key={lead.id}
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <LeadCard
                        lead={lead}
                        onStatusChange={updateLeadStatus}
                        callEnabled={callEnabled}
                      />
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
            <div className="dashboard-sidebar">
              <TeamLeaderboard />
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {showNewLeadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowNewLeadModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Nieuwe Lead Toevoegen</h2>
                <button className="modal-close" onClick={() => setShowNewLeadModal(false)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreateLead}>
                <div className="form-group">
                  <label>Naam *</label>
                  <input
                    type="text"
                    value={newLead.name}
                    onChange={e => setNewLead({ ...newLead, name: e.target.value })}
                    placeholder="Volledige naam"
                    required
                    style={{ padding: '14px 16px', fontSize: '1rem' }}
                  />
                </div>
                <div className="form-group">
                  <label>Telefoonnummer *</label>
                  <input
                    type="tel"
                    value={newLead.phone}
                    onChange={e => setNewLead({ ...newLead, phone: e.target.value })}
                    placeholder="06-12345678"
                    required
                    style={{ padding: '14px 16px', fontSize: '1rem' }}
                  />
                </div>
                <div className="form-group">
                  <label>Email (optioneel)</label>
                  <input
                    type="email"
                    value={newLead.email}
                    onChange={e => setNewLead({ ...newLead, email: e.target.value })}
                    placeholder="email@voorbeeld.nl"
                    style={{ padding: '14px 16px', fontSize: '1rem' }}
                  />
                </div>
                <div className="form-group">
                  <label>Notities</label>
                  <textarea
                    value={newLead.notes}
                    onChange={e => setNewLead({ ...newLead, notes: e.target.value })}
                    placeholder="Extra informatie over deze lead..."
                    rows={4}
                    style={{ padding: '14px 16px', fontSize: '1rem', resize: 'vertical' }}
                  />
                </div>
                <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Bron</label>
                    <select value={newLead.lead_source} onChange={e => setNewLead({...newLead, lead_source: e.target.value})} style={{ padding: '14px 16px', fontSize: '1rem' }}>
                      <option value="cold">Cold Call</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="referral">Referral</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Grootte</label>
                    <select value={newLead.company_size} onChange={e => setNewLead({...newLead, company_size: e.target.value})} style={{ padding: '14px 16px', fontSize: '1rem' }}>
                      <option value="1-10">1-10 medewerkers</option>
                      <option value="11-50">11-50 medewerkers</option>
                      <option value="51+">51+ medewerkers</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Toewijzen aan</label>
                  <select value={newLead.assigned_to} onChange={e => setNewLead({...newLead, assigned_to: e.target.value})} style={{ padding: '14px 16px', fontSize: '1rem' }}>
                    <option value="">Niet toegewezen</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div className="form-group flex justify-between items-center mb-3" style={{ background: 'rgba(15, 76, 54, 0.05)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <label style={{ margin: 0, cursor: 'pointer' }} className="flex items-center gap-2">
                     <Zap size={14} fill="currentColor" className="text-secondary" /> Beslisser?
                  </label>
                  <input
                    type="checkbox"
                    checked={newLead.decision_maker}
                    onChange={e => setNewLead({...newLead, decision_maker: e.target.checked})}
                    style={{ width: '22px', height: '22px', cursor: 'pointer' }}
                  />
                </div>
                <div className="flex gap-2" style={{ marginTop: '24px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowNewLeadModal(false)} style={{ flex: 1, padding: '14px' }}>
                    Annuleren
                  </button>
                  <button type="submit" className="btn btn-secondary" disabled={creating} style={{ flex: 1, padding: '14px' }}>
                    {creating ? 'Toevoegen...' : 'Lead Toevoegen'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Chat />
    </motion.div>
  )
}