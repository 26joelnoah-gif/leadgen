import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Phone, Zap, Plus, X, Layers } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { levelInfo } from '../utils/xpUtils'
import { effectiveSeconds } from '../utils/callTimeUtils'
import { useLeadLists } from '../hooks/useLeadLists'
import { STATUS_MAP } from '../utils/statusUtils'
import TeamLeaderboard from '../components/TeamLeaderboard'
import Chat from '../components/Chat'
import ActivityFeed from '../components/ActivityFeed'
import Header from '../components/Header'
import { useToast } from '../components/Toast'

function fmtSecs(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

export default function Dashboard() {
  const { user, profile, signOut, isWorking, toggleWorkingMode, startWorkingWithList, isDemoMode, sessionCallCount } = useAuth()
  const toast = useToast()
  const { leads, fetchLeads, createLead } = useLeads()
  const { leadLists, loading: leadListsLoading } = useLeadLists()
  const [showNewLeadModal, setShowNewLeadModal] = useState(false)
  const [newLead, setNewLead] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
    lead_source: 'cold',
    decision_maker: false,
    assigned_to: ''
  })
  const [creating, setCreating] = useState(false)
  const [users, setUsers] = useState([])
  const [selectedListId, setSelectedListId] = useState(null)



  const isAdmin = profile?.role === 'admin'
  const isManager = profile?.role === 'manager'
  const isBeller = !isAdmin && !isManager

  // v26: level/XP + eigen gespreksgeschiedenis voor de beller
  const [myXp, setMyXp] = useState(null)
  const [myHistory, setMyHistory] = useState([])
  useEffect(() => {
    if (!user?.id || isDemoMode || !isBeller) return
    supabase.rpc('xp_leaderboard').then(({ data }) => {
      const row = (data || []).find(r => r.agent_id === user.id)
      setMyXp(levelInfo(Number(row?.xp || 0)))
    })
    supabase
      .from('call_logs')
      .select('id, disposition, disposed_at, duration_seconds, lead:leads(name)')
      .eq('agent_id', user.id)
      .order('disposed_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setMyHistory(data || []))
  }, [user?.id, isDemoMode, isBeller])

  // Single-pass stats computation - must be defined before any useEffect that uses it
  const stats = useMemo(() => {
    let nieuweLeads = 0
    let terugbelacties = 0
    let hotLeads = 0
    let afspraken = 0
    let deals = 0

    if (!leads || !Array.isArray(leads)) return { nieuweLeads, terugbelacties, hotLeads, afspraken, deals }

    for (const lead of leads) {
      if (!lead || !lead.status) continue
      // v37: sollicitanten (campagne type='recruitment') zijn geen sales
      // leads - de dashboard-tellers gaan alleen over verkoop
      if (lead.lead_lists?.campaigns?.type === 'recruitment') continue
      if (lead.status === 'new') nieuweLeads++
      if (lead.status === 'terugbelafspraak') terugbelacties++
      if (['new', 'terugbelafspraak', 'later_bellen'].includes(lead.status)) hotLeads++
      if (lead.status === 'afspraak_gemaakt') afspraken++
      if (lead.status === 'deal') deals++
    }

    return { nieuweLeads, terugbelacties, hotLeads, afspraken, deals }
  }, [leads])



  useEffect(() => {
    async function fetchUsers() {
      const { data } = await supabase.from('profiles').select('*').order('full_name')
      if (data) setUsers(data)
    }
    fetchUsers()
  }, [])

  async function handleCreateLead(e) {
    e.preventDefault()
    if (!newLead.name || !newLead.phone) return
    setCreating(true)
    try {
      await createLead(newLead)
      setNewLead({
        name: '',
        phone: '',
        email: '',
        notes: '',
        lead_source: 'cold',
        decision_maker: false,
        assigned_to: ''
      })
      setShowNewLeadModal(false)
    } catch (err) {
      console.error('Failed to create lead:', err)
      toast(err.message, 'error')
      // Reset form on error too
      setNewLead({
        name: '',
        phone: '',
        email: '',
        notes: '',
        lead_source: 'cold',
        decision_maker: false,
        assigned_to: ''
      })
    } finally {
      setCreating(false)
    }
  }


  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="dashboard-page"
    >
      <Header />

      <main className="container">
        <motion.div 
          initial={{ y: -20, opacity: 0 }} 
          animate={{ y: 0, opacity: 1 }} 
          className="page-header flex justify-between items-end"
        >
          <div>
            <h1>Welkom terug, {profile?.full_name?.split(' ')[0] || 'Sales'}</h1>
            <p>
              {isAdmin
                ? `Je hebt vandaag ${stats.nieuweLeads} nieuwe leads om op te volgen.`
                : isManager
                ? 'Bekijk op Mijn Projecten hoe je bellers presteren.'
                : `Je hebt ${leads.filter(l => l.status === 'terugbelafspraak').length} terugbelopdrachten voor vandaag.`
              }
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isDemoMode && (
              <span style={{ fontSize: '0.75rem', color: 'var(--secondary)', fontWeight: 600, padding: '8px 12px', background: 'rgba(212, 175, 55, 0.1)', borderRadius: '6px' }}>
                DEMO DATA
              </span>
            )}
            {!isBeller && (
              <>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowNewLeadModal(true)}>
                  <Plus size={16} /> Nieuwe Lead
                </button>
                <button className="btn btn-outline btn-sm" onClick={fetchLeads}>
                  <RefreshCw size={16} /> Vernieuwen
                </button>
              </>
            )}
          </div>
        </motion.div>

        {/* Manager: direct door naar het eigen projectoverzicht */}
        {isManager && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="card mb-4 flex justify-between items-center"
            style={{ padding: '24px', border: '1px solid var(--primary)', background: 'linear-gradient(135deg, rgba(52, 152, 219, 0.08) 0%, rgba(0,0,0,0) 100%)', gap: '16px', flexWrap: 'wrap' }}
          >
            <div>
              <h2 style={{ fontSize: '1.3rem', fontWeight: 900, marginBottom: '4px' }}>Jouw projecten in één oogopslag</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                Live beltijd, pogingen per uur en resultaten van je bellers - plus bellers toevoegen en toewijzen.
              </p>
            </div>
            <Link to="/manager" className="btn btn-primary" style={{ padding: '14px 28px', fontWeight: 800, whiteSpace: 'nowrap' }}>
              <Layers size={18} /> Naar Mijn Projecten
            </Link>
          </motion.div>
        )}

        {/* Bellers: Bellen knoppen naast header stats */}
        {!isAdmin && !isManager && leadLists.length > 0 && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="card mb-4"
            style={{ 
              padding: '40px 24px', 
              textAlign: 'center', 
              border: '2px solid var(--primary)',
              background: 'linear-gradient(135deg, rgba(52, 152, 219, 0.1) 0%, rgba(0,0,0,0) 100%)',
              boxShadow: '0 0 40px rgba(52, 152, 219, 0.15)'
            }}
          >
            <div style={{ marginBottom: '24px' }}>
              <div style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '8px', 
                padding: '4px 12px', 
                background: 'var(--bg-elevated)', 
                borderRadius: '100px',
                marginBottom: '16px'
              }}>
                <div className="status-indicator status-online" style={{ margin: 0 }}></div>
                <span style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--text-muted)' }}>
                  {leadLists.length} Projecten Beschikbaar
                </span>
              </div>
              <h2 style={{ fontSize: '2.5rem', fontWeight: 900, letterSpacing: '-2px', fontStyle: 'italic', marginBottom: '8px' }}>
                READY TO <span className="text-primary">SYNC & DIAL?</span>
              </h2>
              <p style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Selecteer je batch en start direct met bellen.</p>
            </div>

            {myXp && (
              <div style={{ maxWidth: '420px', margin: '0 auto 28px' }}>
                <div className="flex justify-between items-center" style={{ marginBottom: '6px', gap: '12px' }}>
                  <span style={{ fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--secondary)' }}>
                    ⚡ Level {myXp.level} · {myXp.title}
                  </span>
                  <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700 }}>
                    {myXp.xp} XP · nog {myXp.toNext} naar level {myXp.level + 1}
                  </span>
                </div>
                <div style={{ height: '8px', borderRadius: '4px', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round(myXp.progress * 100)}%`, height: '100%', background: 'var(--secondary)', borderRadius: '4px', transition: 'width 0.4s' }} />
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              {leadLists.length === 1 ? (
                <button
                  onClick={() => startWorkingWithList(leadLists[0].id)}
                  className="btn btn-primary"
                  style={{ padding: '20px 60px', fontSize: '1.25rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px' }}
                >
                  <Phone size={24} /> START DIRECT MET BELLEN
                </button>
              ) : (
                <>
                  {/* Selecteer modus als er meerdere zijn */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '400px' }}>
                    <select 
                      onChange={(e) => setSelectedListId(e.target.value)}
                      value={selectedListId || ''}
                      style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.9rem', width: '100%' }}
                    >
                      <option value="" disabled>--- KIES JE PROJECT ---</option>
                      {leadLists.map(list => (
                        <option key={list.id} value={list.id}>{list.name.toUpperCase()}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => selectedListId && startWorkingWithList(selectedListId)}
                      disabled={!selectedListId}
                      className="btn btn-primary"
                      style={{ padding: '16px', fontSize: '1rem', fontWeight: 900, opacity: selectedListId ? 1 : 0.4 }}
                    >
                      <Phone size={20} /> START MET BELLEN
                    </button>
                  </div>
                  <p className="text-[10px] uppercase font-black tracking-widest text-muted opacity-40">Of selecteer een speciaal belflow via het menu</p>
                </>
              )}
            </div>
          </motion.div>
        )}

        {isBeller && leadLists.length === 0 && !leadListsLoading && (
          <div className="card mb-4" style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Er is nog geen project aan jou toegewezen. Vraag je manager om je aan een project te koppelen.
          </div>
        )}

        {isBeller && myHistory.length > 0 && (
          <div className="card mb-4" style={{ padding: '20px' }}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="card-title" style={{ fontSize: '1rem', margin: 0 }}>Jouw gesprekken</h3>
              <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 700 }}>laatste {myHistory.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '340px', overflowY: 'auto' }}>
              {myHistory.map(log => {
                const d = STATUS_MAP[log.disposition] || { label: log.disposition, color: 'var(--text-muted)', bg: 'var(--bg-elevated)' }
                return (
                  <div key={log.id} className="flex justify-between items-center" style={{ padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: '8px', gap: '10px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.lead?.name || 'Lead'}</div>
                      <div className="text-muted" style={{ fontSize: '0.72rem' }}>
                        {new Date(log.disposed_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        {' · '}{fmtSecs(effectiveSeconds(log.disposition, log.duration_seconds))}
                      </div>
                    </div>
                    <span style={{ background: d.bg, color: d.color, padding: '3px 8px', borderRadius: '6px', fontSize: '0.68rem', fontWeight: 800, whiteSpace: 'nowrap' }}>{d.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick Stats */}
        <div className="stats-grid mb-4" style={{ marginTop: '24px' }}>
          {[
            ...(isAdmin ? [{ label: 'Nieuwe Leads', val: stats.nieuweLeads, icon: '📬', color: 'var(--primary)' }] : []),
            { label: 'Terugbelacties', val: stats.terugbelacties, icon: '📞', color: 'var(--danger)', pulse: true },
            { label: 'Afspraken', val: stats.afspraken, icon: '📅', color: 'var(--success)' },
            { label: 'Deals', val: stats.deals, icon: '🏆', color: 'var(--secondary)' }
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: Math.min(i * 0.05, 0.2) }}
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

        {/* v27: geen leadoverzicht meer op het dashboard - ook niet voor
            admin/manager. Leads bekijk en beheer je in Lead Beheer.
            v30: Ervaring & Levels + Live Feed alleen voor admin - managers
            horen geen XP/levels van (andere) werknemers te zien. */}
        {isAdmin && (
          <div className="dashboard-content" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', alignItems: 'start' }}>
            <TeamLeaderboard />
            <ActivityFeed />
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
                    <label>Toewijzen aan</label>
                    <select value={newLead.assigned_to} onChange={e => setNewLead({...newLead, assigned_to: e.target.value})} style={{ padding: '14px 16px', fontSize: '1rem' }}>
                      <option value="">Niet toegewezen</option>
                      {users.filter(u => u.is_active !== false).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group flex justify-between items-center mb-3" style={{ background: 'var(--bg-elevated)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
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