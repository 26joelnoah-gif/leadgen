import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutDashboard, RefreshCw, Search, Filter, Phone, PhoneOff } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { STATUS_MAP } from '../utils/statusUtils'
import LeadCard from '../components/LeadCard'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

export default function Dashboard() {
  const { user, profile, signOut, callEnabled, toggleCallEnabled, isDemoMode } = useAuth()
  const { leads, loading, refreshLeads, updateLeadStatus } = useLeads()
  const [filter, setFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredLeads = leads.filter(lead => {
    const matchesFilter = filter === 'all' || lead.status === filter
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (lead.phone && lead.phone.includes(searchTerm))
    return matchesFilter && matchesSearch
  })

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="dashboard-page"
    >
      <header className="header">
        <div className="container header-content">
          <div className="logo">
            <LayoutDashboard className="text-secondary" />
            LEADGEN
          </div>
          <nav className="nav">
            <Link to="/" className="active">Mijn Leads</Link>
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            {profile?.role === 'admin' && <Link to="/admin/reports">Rapportage</Link>}
          </nav>
          <div className="header-actions">
            <div className="user-profile flex items-center gap-2">
              <div className="avatar" style={{ width: '32px', height: '32px', background: 'var(--secondary)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', color: 'var(--primary-dark)', fontSize: '0.8rem' }}>
                {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>{profile?.full_name || user?.email}</span>
            </div>
            <button
              onClick={toggleCallEnabled}
              className={`btn btn-sm ${callEnabled ? 'btn-secondary' : 'btn-outline'}`}
              style={{ gap: '6px' }}
              title={callEnabled ? 'Bellen ingeschakeld' : 'Bellen uitgeschakeld'}
            >
              {callEnabled ? <Phone size={14} /> : <PhoneOff size={14} />}
              <span className="ml-1">{callEnabled ? 'Aan' : 'Uit'}</span>
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
              <option value="all">Alle statussen</option>
              {Object.entries(STATUS_MAP).map(([key, details]) => (
                <option key={key} value={key}>{details.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '100px 0' }}>
            <LoadingSpinner size="large" />
          </div>
        ) : (
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
        )}
      </main>
    </motion.div>
  )
}