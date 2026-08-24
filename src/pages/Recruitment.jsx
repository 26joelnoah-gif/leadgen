import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navigate, Link } from 'react-router-dom'
import { Plus, Phone, Search, X, UserPlus, Users, Clock, CheckCircle2, XCircle, RefreshCw, ExternalLink } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { useLeadLists } from '../hooks/useLeadLists'
import { supabase } from '../lib/supabase'
import { getStatusDetails } from '../utils/statusUtils'
import { formatDateTime } from '../utils/dateUtils'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'

// v36: recruiter-thuisbasis. Een sollicitant is gewoon een lead in het
// (automatisch aangemaakte) recruitment-project van deze recruiter -
// zelfde belwachtrij/TBA/call_logs-infrastructuur als sales, alleen
// hier verpakt met sollicitant-taal en een eigen "voeg toe"-formulier.
const EMPTY_FORM = { name: '', phone: '', email: '', function: '', lead_source: 'sollicitatie', notes: '', cv_link: '' }

export default function Recruitment() {
  const { user, profile, toggleWorkingMode, startWorkingWithList, logCall } = useAuth()
  const { leads, loading: leadsLoading, fetchLeads } = useLeads()
  const { leadLists, loading: listsLoading } = useLeadLists()
  const toast = useToast()

  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')

  // De recruiter heeft precies één lijst nodig om in te werken: die met
  // assigned_to = zichzelf (zo gezet bij het aanmaken van het account).
  // RLS zorgt er sowieso al voor dat leadLists alleen eigen lijsten bevat.
  const homeList = useMemo(
    () => leadLists.find(l => l.assigned_to === user?.id) || leadLists[0] || null,
    [leadLists, user?.id]
  )

  const applicants = useMemo(() => {
    let list = homeList ? leads.filter(l => l.lead_list_id === homeList.id) : leads
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        (l.function || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [leads, homeList, search])

  const stats = useMemo(() => {
    const base = homeList ? leads.filter(l => l.lead_list_id === homeList.id) : leads
    return {
      totaal: base.length,
      nieuw: base.filter(l => l.status === 'new').length,
      gesprek: base.filter(l => l.status === 'terugbelafspraak' || l.status === 'afspraak_gemaakt').length,
      aangenomen: base.filter(l => l.status === 'deal').length,
      afgewezen: base.filter(l => l.status === 'geen_interesse').length
    }
  }, [leads, homeList])

  if (profile && profile.role !== 'recruiter' && profile.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  async function handleCreateApplicant(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.phone.trim() || !homeList) return
    setCreating(true)
    try {
      const { error } = await supabase.from('leads').insert({
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        function: form.function.trim() || null,
        notes: form.notes.trim() || '',
        lead_source: form.lead_source || 'sollicitatie',
        extra_info1: form.cv_link.trim() || null,
        status: 'new',
        assigned_to: user.id,
        created_by: user.id,
        lead_list_id: homeList.id,
        organization_id: profile?.organization_id || null
      })
      if (error) throw error
      toast('Sollicitant toegevoegd', 'success')
      setForm(EMPTY_FORM)
      setShowNew(false)
      fetchLeads()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  async function handleCall(lead) {
    await logCall(lead.id, lead.name)
    toggleWorkingMode(lead)
  }

  const loading = leadsLoading || listsLoading

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="recruitment-page">
      <Header />

      <main className="container">
        <div className="page-header flex justify-between items-end">
          <div>
            <h1>Sollicitanten</h1>
            <p>Voeg sollicitanten toe en bel ze na - inclusief terugbelafspraken (TBA's).</p>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-outline btn-sm" onClick={fetchLeads}>
              <RefreshCw size={16} /> Vernieuwen
            </button>
            <Link to="/tba" className="btn btn-outline btn-sm">
              <Clock size={16} /> Mijn TBA's
            </Link>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowNew(true)} disabled={!homeList}>
              <Plus size={16} /> Nieuwe sollicitant
            </button>
          </div>
        </div>

        {!loading && !homeList && (
          <div className="card mb-4" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Er is nog geen sollicitatieproject aan jouw account gekoppeld. Vraag de beheerder om dit in te stellen.
          </div>
        )}

        {homeList && (
          <>
            <div className="stats-grid mb-4" style={{ marginTop: '16px' }}>
              {[
                { label: 'Totaal', val: stats.totaal, icon: '🗂️', color: 'var(--primary)' },
                { label: 'Nieuw', val: stats.nieuw, icon: '🆕', color: 'var(--info)' },
                { label: 'Gesprek / TBA', val: stats.gesprek, icon: '📞', color: 'var(--secondary)' },
                { label: 'Aangenomen', val: stats.aangenomen, icon: '✅', color: 'var(--success)' },
                { label: 'Afgewezen', val: stats.afgewezen, icon: '✖️', color: 'var(--danger)' }
              ].map(s => (
                <div key={s.label} className="stat-card glass-panel" style={{ padding: '18px', borderLeft: `4px solid ${s.color}` }}>
                  <div style={{ fontSize: '1.6rem', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.val}</div>
                  <div className="label">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="card mb-4 flex justify-between items-center" style={{ padding: '20px', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Belwachtrij</h3>
                <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Start de wachtrij en bel je sollicitanten één voor één na, met dispositie-knoppen (incl. TBA) per gesprek.
                </p>
              </div>
              <button className="btn btn-primary" onClick={() => startWorkingWithList(homeList.id)} style={{ padding: '12px 24px', fontWeight: 800 }}>
                <Phone size={18} /> Start bellen
              </button>
            </div>

            <div className="filter-bar glass-panel flex justify-between items-center mb-3" style={{ gap: '20px' }}>
              <div className="search-input" style={{ flex: 1, position: 'relative' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Zoek op naam, telefoon, functie of email..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '40px', width: '100%' }}
                />
              </div>
            </div>

            {loading ? (
              <LoadingSpinner size="large" />
            ) : applicants.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nog geen sollicitanten"
                message="Voeg je eerste sollicitant toe om te kunnen bellen."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <AnimatePresence>
                  {applicants.map((lead, i) => {
                    const status = getStatusDetails(lead.status, true)
                    return (
                      <motion.div
                        key={lead.id}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: Math.min(i * 0.02, 0.2) }}
                        className="card glow-hover"
                        style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}
                      >
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '1rem' }}>{lead.name}</strong>
                            <span style={{ background: status.bg, color: status.color, padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800 }}>{status.label}</span>
                          </div>
                          <div className="text-muted" style={{ fontSize: '0.82rem', marginTop: '2px' }}>
                            {lead.function ? `${lead.function} · ` : ''}{lead.phone}{lead.email ? ` · ${lead.email}` : ''}
                          </div>
                          {lead.notes && (
                            <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: '4px', maxWidth: '520px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {lead.notes.split('\n').pop()}
                            </div>
                          )}
                          {lead.next_contact_date && lead.status === 'terugbelafspraak' && (
                            <div style={{ fontSize: '0.78rem', marginTop: '4px', color: 'var(--secondary)', fontWeight: 700 }}>
                              <Clock size={12} style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                              Terugbellen: {formatDateTime(lead.next_contact_date)}
                            </div>
                          )}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                          Toegevoegd {formatDateTime(lead.created_at)}
                        </div>
                        {lead.extra_info1 && (
                          <a href={lead.extra_info1} target="_blank" rel="nofollow noopener noreferrer" referrerPolicy="no-referrer" className="btn btn-outline btn-sm" title="CV / LinkedIn">
                            <ExternalLink size={14} /> CV
                          </a>
                        )}
                        <button className="btn btn-success btn-sm" onClick={() => handleCall(lead)}>
                          <Phone size={16} /> Bel
                        </button>
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </main>

      <AnimatePresence>
        {showNew && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={() => setShowNew(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="modal"
              onClick={e => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2><UserPlus size={18} /> Nieuwe sollicitant</h2>
                <button className="modal-close" onClick={() => setShowNew(false)}>
                  <X size={18} />
                </button>
              </div>
              <form onSubmit={handleCreateApplicant} autoComplete="off">
                <div className="form-group">
                  <label>Naam *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Volledige naam"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Telefoonnummer *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                    placeholder="06-12345678"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="email@voorbeeld.nl"
                  />
                </div>
                <div className="form-group">
                  <label>Functie / vacature</label>
                  <input
                    type="text"
                    value={form.function}
                    onChange={e => setForm({ ...form, function: e.target.value })}
                    placeholder="Waar heeft hij/zij op gesolliciteerd?"
                  />
                </div>
                <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Bron</label>
                    <select value={form.lead_source} onChange={e => setForm({ ...form, lead_source: e.target.value })}>
                      <option value="sollicitatie">Sollicitatie</option>
                      <option value="indeed">Indeed</option>
                      <option value="linkedin">LinkedIn</option>
                      <option value="referral">Referral</option>
                      <option value="website">Website</option>
                      <option value="overig">Overig</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>CV / LinkedIn-link</label>
                    <input
                      type="text"
                      value={form.cv_link}
                      onChange={e => setForm({ ...form, cv_link: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label>Motivatie / notities</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Extra informatie over deze sollicitant..."
                    rows={4}
                  />
                </div>
                <div className="flex gap-2" style={{ marginTop: '20px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowNew(false)} style={{ flex: 1 }}>
                    Annuleren
                  </button>
                  <button type="submit" className="btn btn-secondary" disabled={creating} style={{ flex: 1 }}>
                    {creating ? 'Toevoegen...' : 'Sollicitant toevoegen'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
