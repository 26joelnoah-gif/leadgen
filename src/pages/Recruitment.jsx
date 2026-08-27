import { useState, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navigate, Link } from 'react-router-dom'
import {
  Plus, Phone, Search, X, UserPlus, Users, Clock, RefreshCw, ExternalLink,
  LayoutGrid, List as ListIcon, Download, Upload, AlertTriangle, Filter
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { useLeadLists } from '../hooks/useLeadLists'
import { supabase } from '../lib/supabase'
import { getStatusDetails } from '../utils/statusUtils'
import { formatDateTime } from '../utils/dateUtils'
import { exportToCSV } from '../utils/exportUtils'
import { parseApplicantCSV, normalizePhoneForDedup } from '../utils/importUtils'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'

// v36: recruiter-thuisbasis. Een sollicitant is gewoon een lead in het
// (automatisch aangemaakte) recruitment-project van deze recruiter -
// zelfde belwachtrij/TBA/call_logs-infrastructuur als sales, alleen
// hier verpakt met sollicitant-taal, een kanban-bord, vrije bronnen
// (filter + eigen "source" typen) en een eigen import/export.
const EMPTY_FORM = { name: '', phone: '', email: '', function: '', lead_source: '', notes: '', cv_link: '' }
const DEFAULT_SOURCE_SUGGESTIONS = ['Sollicitatie', 'Indeed', 'LinkedIn', 'Referral', 'Website']

// Kanban-kolommen. dropStatus = status die gezet wordt als je een kaart hier
// op laat vallen; needsDate = vraagt eerst om een terugbelmoment (TBA).
const BOARD_COLUMNS = [
  { id: 'new', label: 'Nieuw', statuses: ['new'], dropStatus: 'new', color: 'var(--info)' },
  { id: 'followup', label: 'Opvolgen', statuses: ['later_bellen', 'geen_gehoor', 'mailbox', 'onjuiste_timing'], dropStatus: 'later_bellen', color: 'var(--warning)' },
  { id: 'tba', label: 'TBA', statuses: ['terugbelafspraak'], dropStatus: 'terugbelafspraak', color: 'var(--secondary)', needsDate: true },
  { id: 'interview', label: 'Gesprek gepland', statuses: ['afspraak_gemaakt'], dropStatus: 'afspraak_gemaakt', color: 'var(--primary)' },
  { id: 'hired', label: 'Aangenomen', statuses: ['deal'], dropStatus: 'deal', color: 'var(--success)' },
  { id: 'cold', label: 'Koud', statuses: ['cold'], dropStatus: 'cold', color: 'var(--text-muted)' },
  { id: 'rejected', label: 'Afgewezen', statuses: ['geen_interesse', 'verkeerd_nummer', 'blacklist'], dropStatus: 'geen_interesse', color: 'var(--danger)' }
]

function defaultTbaDateTimeLocal() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function Recruitment() {
  const { user, profile, toggleWorkingMode, startWorkingWithList, logCall } = useAuth()
  const { leads, loading: leadsLoading, fetchLeads, updateLeadStatus, logActivity } = useLeads()
  const { leadLists, loading: listsLoading } = useLeadLists()
  const toast = useToast()

  const [view, setView] = useState('board') // 'board' | 'list'
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [creating, setCreating] = useState(false)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('')

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importSource, setImportSource] = useState('')
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef(null)

  const [draggingId, setDraggingId] = useState(null)
  const [dragOverColumn, setDragOverColumn] = useState(null)
  const [tbaPrompt, setTbaPrompt] = useState(null) // { leadId, value }

  const [editLead, setEditLead] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [savingEdit, setSavingEdit] = useState(false)

  // De recruiter heeft precies één lijst nodig om in te werken: die met
  // assigned_to = zichzelf (zo gezet bij het aanmaken van het account).
  // RLS scopet leadLists voor een recruiter al tot eigen lijsten, maar een
  // admin/manager ziet via dezelfde hook ALLE lijsten in de organisatie
  // (sales + recruitment door elkaar) - zonder deze filter viel de fallback
  // op leadLists[0] terug, oftewel de nieuwste lijst van de hele org, wat
  // sales-leads liet lekken in het sollicitanten-scherm. Filter daarom altijd
  // eerst op recruitment-campagnes voordat we een "thuislijst" kiezen.
  const recruitmentLists = useMemo(
    () => leadLists.filter(l => l.campaigns?.type === 'recruitment'),
    [leadLists]
  )
  const homeList = useMemo(
    () => recruitmentLists.find(l => l.assigned_to === user?.id) || recruitmentLists[0] || null,
    [recruitmentLists, user?.id]
  )

  const baseApplicants = useMemo(
    () => (homeList ? leads.filter(l => l.lead_list_id === homeList.id) : leads),
    [leads, homeList]
  )

  // Alle bronnen die deze recruiter ooit heeft gebruikt - basis voor het
  // filter-dropdown én de suggesties bij "Nieuwe sollicitant" / import.
  const sources = useMemo(() => {
    const byLower = new Map()
    baseApplicants.forEach(l => {
      const v = (l.lead_source || '').trim()
      if (v && !byLower.has(v.toLowerCase())) byLower.set(v.toLowerCase(), v)
    })
    DEFAULT_SOURCE_SUGGESTIONS.forEach(v => {
      if (!byLower.has(v.toLowerCase())) byLower.set(v.toLowerCase(), v)
    })
    return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b))
  }, [baseApplicants])

  const applicants = useMemo(() => {
    let list = baseApplicants
    if (sourceFilter) {
      list = list.filter(l => (l.lead_source || '').toLowerCase() === sourceFilter.toLowerCase())
    }
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
  }, [baseApplicants, sourceFilter, search])

  const stats = useMemo(() => ({
    totaal: baseApplicants.length,
    nieuw: baseApplicants.filter(l => l.status === 'new').length,
    gesprek: baseApplicants.filter(l => l.status === 'terugbelafspraak' || l.status === 'afspraak_gemaakt').length,
    aangenomen: baseApplicants.filter(l => l.status === 'deal').length,
    afgewezen: baseApplicants.filter(l => l.status === 'geen_interesse').length
  }), [baseApplicants])

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
        lead_source: form.lead_source.trim() || 'sollicitatie',
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

  // ---------- Sollicitant bewerken (klik op kaartje/naam) ----------
  function openEdit(lead) {
    setEditForm({
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      function: lead.function || '',
      lead_source: lead.lead_source || '',
      notes: lead.notes || '',
      cv_link: lead.extra_info1 || ''
    })
    setEditLead(lead)
  }

  async function handleSaveEdit(e) {
    e.preventDefault()
    if (!editLead || !editForm.name.trim() || !editForm.phone.trim()) return
    setSavingEdit(true)
    try {
      const { error } = await supabase.from('leads').update({
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim() || null,
        function: editForm.function.trim() || null,
        notes: editForm.notes.trim() || '',
        lead_source: editForm.lead_source.trim() || null,
        extra_info1: editForm.cv_link.trim() || null
      }).eq('id', editLead.id)
      if (error) throw error
      toast('Sollicitant bijgewerkt', 'success')
      logActivity(editLead.id, 'edit', 'Gegevens bijgewerkt')
      setEditLead(null)
      fetchLeads()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleCall(lead) {
    await logCall(lead.id, lead.name)
    toggleWorkingMode(lead)
  }

  function handleExportCSV() {
    if (!applicants.length) return
    const rows = applicants.map(l => ({
      Naam: l.name,
      Telefoon: l.phone,
      Email: l.email || '',
      Functie: l.function || '',
      Bron: l.lead_source || '',
      Status: getStatusDetails(l.status, true).label,
      Toegevoegd: formatDateTime(l.created_at),
      Terugbelmoment: l.status === 'terugbelafspraak' ? formatDateTime(l.next_contact_date) : '',
      Notities: (l.notes || '').replace(/\n/g, ' | ')
    }))
    const suffix = sourceFilter ? sourceFilter.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'alle_bronnen'
    exportToCSV(rows, `sollicitanten_${suffix}`)
  }

  // ---------- Kanban drag & drop ----------
  async function moveApplicant(leadId, status, extra = {}) {
    const error = await updateLeadStatus(leadId, status, extra)
    if (error) { toast(error.message || 'Verplaatsen mislukt', 'error'); return }
    const label = getStatusDetails(status, true).label
    logActivity(leadId, 'status_change', `Verplaatst naar "${label}" (bord)`)
  }

  function handleDrop(column, leadId) {
    setDragOverColumn(null)
    if (!leadId) return
    const lead = baseApplicants.find(l => l.id === leadId)
    if (!lead || column.statuses.includes(lead.status)) return
    if (column.needsDate) {
      setTbaPrompt({ leadId, value: defaultTbaDateTimeLocal() })
      return
    }
    moveApplicant(leadId, column.dropStatus)
  }

  function confirmTba() {
    if (!tbaPrompt?.value) return
    const iso = new Date(tbaPrompt.value).toISOString()
    moveApplicant(tbaPrompt.leadId, 'terugbelafspraak', { next_contact_date: iso })
    setTbaPrompt(null)
  }

  // ---------- Import ----------
  const existingPhones = useMemo(
    () => new Set(baseApplicants.map(l => normalizePhoneForDedup(l.phone)).filter(Boolean)),
    [baseApplicants]
  )

  const importPreview = useMemo(() => {
    if (!importText.trim()) return []
    const parsed = parseApplicantCSV(importText)
    const seen = new Set()
    return parsed.map(row => {
      const problems = []
      if (!row.name) problems.push('naam ontbreekt')
      if (!row.phone) problems.push('telefoon ontbreekt')
      const phoneKey = normalizePhoneForDedup(row.phone)
      let duplicate = false
      if (phoneKey) {
        if (existingPhones.has(phoneKey) || seen.has(phoneKey)) duplicate = true
        seen.add(phoneKey)
      }
      return { ...row, problems, duplicate, valid: problems.length === 0 && !duplicate }
    })
  }, [importText, existingPhones])

  const importValidRows = importPreview.filter(r => r.valid)

  function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setImportText(String(ev.target?.result || ''))
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImport() {
    if (!importValidRows.length || !homeList) return
    setImporting(true)
    try {
      const payload = importValidRows.map(r => ({
        name: r.name,
        phone: r.phone,
        email: r.email || null,
        function: r.function || null,
        notes: r.notes || '',
        lead_source: (r.lead_source || importSource || 'import').trim(),
        extra_info1: r.cv_link || null,
        status: 'new',
        assigned_to: user.id,
        created_by: user.id,
        lead_list_id: homeList.id,
        organization_id: profile?.organization_id || null
      }))
      const { error } = await supabase.from('leads').insert(payload)
      if (error) throw error
      toast(`${payload.length} sollicitant${payload.length === 1 ? '' : 'en'} geïmporteerd`, 'success')
      setImportText('')
      setImportSource('')
      setShowImport(false)
      fetchLeads()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const loading = leadsLoading || listsLoading

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="recruitment-page">
      <Header />

      <main className="container">
        <div className="page-header flex justify-between items-end" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1>Sollicitanten</h1>
            <p>Voeg sollicitanten toe of laad ze in, houd het bord bij en bel na - inclusief terugbelafspraken (TBA's).</p>
          </div>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={fetchLeads}>
              <RefreshCw size={16} /> Vernieuwen
            </button>
            <Link to="/tba" className="btn btn-outline btn-sm">
              <Clock size={16} /> Mijn TBA's
            </Link>
            <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)} disabled={!homeList}>
              <Upload size={16} /> Importeren
            </button>
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

            <div className="filter-bar glass-panel flex items-center mb-3" style={{ gap: '14px', flexWrap: 'wrap' }}>
              <div className="search-input" style={{ flex: '1 1 220px', position: 'relative', minWidth: '220px' }}>
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

              <div className="flex items-center gap-2" style={{ flex: '0 0 auto' }}>
                <Filter size={16} style={{ color: 'var(--text-muted)' }} />
                <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} style={{ padding: '9px 12px', minWidth: '160px' }}>
                  <option value="">Alle bronnen</option>
                  {sources.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div className="flex" style={{ background: 'var(--bg-elevated)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                <button
                  onClick={() => setView('board')}
                  className="btn btn-sm"
                  style={{ background: view === 'board' ? 'var(--primary)' : 'transparent', color: view === 'board' ? 'var(--text-on-accent)' : 'var(--text-muted)' }}
                  title="Bord-weergave"
                >
                  <LayoutGrid size={15} /> Bord
                </button>
                <button
                  onClick={() => setView('list')}
                  className="btn btn-sm"
                  style={{ background: view === 'list' ? 'var(--primary)' : 'transparent', color: view === 'list' ? 'var(--text-on-accent)' : 'var(--text-muted)' }}
                  title="Lijst-weergave"
                >
                  <ListIcon size={15} /> Lijst
                </button>
              </div>

              <button className="btn btn-outline btn-sm" onClick={handleExportCSV} disabled={!applicants.length}>
                <Download size={16} /> CSV {sourceFilter ? `(${sourceFilter})` : ''}
              </button>
            </div>

            {loading ? (
              <LoadingSpinner size="large" />
            ) : applicants.length === 0 ? (
              <EmptyState
                icon={Users}
                title="Nog geen sollicitanten"
                message={sourceFilter || search ? 'Geen sollicitanten gevonden met dit filter.' : 'Voeg je eerste sollicitant toe of importeer een lijst om te kunnen bellen.'}
              />
            ) : view === 'board' ? (
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${BOARD_COLUMNS.length}, minmax(120px, 1fr))`, gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
                {BOARD_COLUMNS.map(col => {
                  const items = applicants.filter(l => col.statuses.includes(l.status))
                  const isOver = dragOverColumn === col.id
                  return (
                    <div
                      key={col.id}
                      onDragOver={e => { e.preventDefault(); setDragOverColumn(col.id) }}
                      onDragLeave={() => setDragOverColumn(prev => (prev === col.id ? null : prev))}
                      onDrop={e => { e.preventDefault(); handleDrop(col, e.dataTransfer.getData('text/plain')) }}
                      style={{
                        minWidth: 0, background: isOver ? 'var(--accent-soft)' : 'var(--bg-card)',
                        border: `1px solid ${isOver ? col.color : 'var(--border)'}`, borderRadius: '10px', padding: '7px',
                        transition: 'background 0.15s, border-color 0.15s', maxHeight: 'calc(100vh - 380px)', minHeight: '160px',
                        display: 'flex', flexDirection: 'column'
                      }}
                    >
                      <div className="flex items-center justify-between" style={{ padding: '3px 4px 8px', borderBottom: `2px solid ${col.color}`, marginBottom: '6px', gap: '4px' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.72rem', color: col.color, lineHeight: 1.2 }}>{col.label}</span>
                        <span style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>{items.length}</span>
                      </div>
                      <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', flex: 1 }}>
                        {items.map(lead => (
                          <div
                            key={lead.id}
                            draggable
                            onDragStart={e => { e.dataTransfer.setData('text/plain', lead.id); setDraggingId(lead.id) }}
                            onDragEnd={() => setDraggingId(null)}
                            onClick={() => openEdit(lead)}
                            title="Klik om te bewerken"
                            style={{
                              background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '7px',
                              padding: '6px 7px', cursor: 'grab', opacity: draggingId === lead.id ? 0.4 : 1
                            }}
                          >
                            <div style={{ fontWeight: 700, fontSize: '0.74rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.name}</div>
                            {lead.function && <div className="text-muted" style={{ fontSize: '0.62rem', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.function}</div>}
                            <div className="text-muted" style={{ fontSize: '0.62rem', marginTop: '1px' }}>{lead.phone}</div>
                            {lead.lead_source && (
                              <span style={{ display: 'inline-block', marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '0px 5px', borderRadius: '5px', fontSize: '0.58rem', fontWeight: 700 }}>
                                {lead.lead_source}
                              </span>
                            )}
                            {lead.status === 'terugbelafspraak' && lead.next_contact_date && (
                              <div style={{ fontSize: '0.6rem', marginTop: '3px', color: 'var(--secondary)', fontWeight: 700 }}>
                                <Clock size={9} style={{ verticalAlign: '-1px', marginRight: '2px' }} />{formatDateTime(lead.next_contact_date)}
                              </div>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); handleCall(lead) }}
                              className="btn btn-success btn-sm"
                              style={{ marginTop: '5px', width: '100%', padding: '3px', fontSize: '0.62rem' }}
                            >
                              <Phone size={10} /> Bel
                            </button>
                          </div>
                        ))}
                        {items.length === 0 && (
                          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center', padding: '14px 4px', opacity: 0.6 }}>
                            Sleep hier naartoe
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
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
                            <strong
                              onClick={() => openEdit(lead)}
                              title="Klik om te bewerken"
                              style={{ fontSize: '1rem', cursor: 'pointer', textDecoration: 'underline', textDecorationColor: 'transparent', textUnderlineOffset: '3px' }}
                              onMouseEnter={e => { e.currentTarget.style.textDecorationColor = 'var(--text-muted)' }}
                              onMouseLeave={e => { e.currentTarget.style.textDecorationColor = 'transparent' }}
                            >
                              {lead.name}
                            </strong>
                            <span style={{ background: status.bg, color: status.color, padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 800 }}>{status.label}</span>
                            {lead.lead_source && (
                              <span style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700 }}>
                                {lead.lead_source}
                              </span>
                            )}
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

      {/* TBA-datum vragen bij het slepen van een kaart naar de TBA-kolom */}
      <AnimatePresence>
        {tbaPrompt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setTbaPrompt(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal" style={{ maxWidth: '380px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2><Clock size={18} /> Terugbelmoment</h2>
                <button className="modal-close" onClick={() => setTbaPrompt(null)}><X size={18} /></button>
              </div>
              <div className="form-group">
                <label>Wanneer terugbellen?</label>
                <input
                  type="datetime-local"
                  step="900"
                  value={tbaPrompt.value}
                  onChange={e => setTbaPrompt(prev => ({ ...prev, value: e.target.value }))}
                />
              </div>
              <div className="flex gap-2" style={{ marginTop: '16px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setTbaPrompt(null)} style={{ flex: 1 }}>Annuleren</button>
                <button type="button" className="btn btn-secondary" onClick={confirmTba} style={{ flex: 1 }}>TBA instellen</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nieuwe sollicitant */}
      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowNew(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2><UserPlus size={18} /> Nieuwe sollicitant</h2>
                <button className="modal-close" onClick={() => setShowNew(false)}><X size={18} /></button>
              </div>
              <form onSubmit={handleCreateApplicant} autoComplete="off">
                <div className="form-group">
                  <label>Naam *</label>
                  <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Volledige naam" required />
                </div>
                <div className="form-group">
                  <label>Telefoonnummer *</label>
                  <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="06-12345678" required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@voorbeeld.nl" />
                </div>
                <div className="form-group">
                  <label>Functie / vacature</label>
                  <input type="text" value={form.function} onChange={e => setForm({ ...form, function: e.target.value })} placeholder="Waar heeft hij/zij op gesolliciteerd?" />
                </div>
                <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Bron</label>
                    <input
                      type="text"
                      list="recruiter-sources"
                      value={form.lead_source}
                      onChange={e => setForm({ ...form, lead_source: e.target.value })}
                      placeholder="Typ of kies een bron..."
                    />
                    <datalist id="recruiter-sources">
                      {sources.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>CV / LinkedIn-link</label>
                    <input type="text" value={form.cv_link} onChange={e => setForm({ ...form, cv_link: e.target.value })} placeholder="https://..." />
                  </div>
                </div>
                <div className="form-group">
                  <label>Motivatie / notities</label>
                  <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Extra informatie over deze sollicitant..." rows={4} />
                </div>
                <div className="flex gap-2" style={{ marginTop: '20px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setShowNew(false)} style={{ flex: 1 }}>Annuleren</button>
                  <button type="submit" className="btn btn-secondary" disabled={creating} style={{ flex: 1 }}>
                    {creating ? 'Toevoegen...' : 'Sollicitant toevoegen'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sollicitant bewerken (klik op kaartje in het bord, of op naam in de lijst) */}
      <AnimatePresence>
        {editLead && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setEditLead(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2><UserPlus size={18} /> Sollicitant bewerken</h2>
                <button className="modal-close" onClick={() => setEditLead(null)}><X size={18} /></button>
              </div>
              <form onSubmit={handleSaveEdit} autoComplete="off">
                <div className="form-group">
                  <label>Naam *</label>
                  <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="Volledige naam" required />
                </div>
                <div className="form-group">
                  <label>Telefoonnummer *</label>
                  <input type="tel" value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} placeholder="06-12345678" required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} placeholder="email@voorbeeld.nl" />
                </div>
                <div className="form-group">
                  <label>Functie / vacature</label>
                  <input type="text" value={editForm.function} onChange={e => setEditForm({ ...editForm, function: e.target.value })} placeholder="Waar heeft hij/zij op gesolliciteerd?" />
                </div>
                <div className="grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group">
                    <label>Bron</label>
                    <input
                      type="text"
                      list="recruiter-sources-edit"
                      value={editForm.lead_source}
                      onChange={e => setEditForm({ ...editForm, lead_source: e.target.value })}
                      placeholder="Typ of kies een bron..."
                    />
                    <datalist id="recruiter-sources-edit">
                      {sources.map(s => <option key={s} value={s} />)}
                    </datalist>
                  </div>
                  <div className="form-group">
                    <label>CV / LinkedIn-link</label>
                    <input type="text" value={editForm.cv_link} onChange={e => setEditForm({ ...editForm, cv_link: e.target.value })} placeholder="https://..." />
                  </div>
                </div>
                <div className="form-group">
                  <label>Motivatie / notities</label>
                  <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Extra informatie over deze sollicitant..." rows={4} />
                </div>
                <div className="flex gap-2" style={{ marginTop: '20px' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setEditLead(null)} style={{ flex: 1 }}>Annuleren</button>
                  <button type="submit" className="btn btn-secondary" disabled={savingEdit} style={{ flex: 1 }}>
                    {savingEdit ? 'Opslaan...' : 'Wijzigingen opslaan'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sollicitanten inladen (plak/upload CSV) */}
      <AnimatePresence>
        {showImport && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={() => setShowImport(false)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal" style={{ maxWidth: '640px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2><Upload size={18} /> Sollicitanten inladen</h2>
                <button className="modal-close" onClick={() => setShowImport(false)}><X size={18} /></button>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
                Plak een lijst (bv. vanuit Excel/Sheets of een export van een vacaturesite) of upload een CSV-bestand.
                Eerste rij = kolomnamen. Herkend: naam, telefoon, email, functie, bron, cv/linkedin, notities.
              </p>

              <div className="flex gap-2 mb-3">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={14} /> CSV-bestand kiezen
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
              </div>

              <div className="form-group">
                <textarea
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                  placeholder={'naam,telefoon,email,functie,bron\nJan Jansen,0612345678,jan@mail.nl,Sales,Indeed'}
                  rows={6}
                  style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              </div>

              <div className="form-group">
                <label>Standaardbron (als een rij geen bron heeft)</label>
                <input
                  type="text"
                  list="recruiter-sources"
                  value={importSource}
                  onChange={e => setImportSource(e.target.value)}
                  placeholder="bv. Indeed-bulkimport"
                />
              </div>

              {importText.trim() && (
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', marginTop: '8px' }}>
                  <div className="flex items-center gap-2" style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                    {importValidRows.length} van {importPreview.length} rijen klaar om te importeren
                  </div>
                  {importPreview.length > importValidRows.length && (
                    <div className="flex items-center gap-1" style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '4px' }}>
                      <AlertTriangle size={12} /> {importPreview.length - importValidRows.length} overgeslagen (ontbrekende gegevens of al bestaand telefoonnummer)
                    </div>
                  )}
                  <div style={{ maxHeight: '160px', overflowY: 'auto', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {importPreview.slice(0, 25).map((r, i) => (
                      <div key={i} style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', gap: '8px', opacity: r.valid ? 1 : 0.5 }}>
                        <span>{r.name || '(geen naam)'} · {r.phone || '(geen telefoon)'}</span>
                        <span style={{ color: r.valid ? 'var(--success)' : 'var(--danger)' }}>
                          {r.valid ? 'ok' : r.duplicate ? 'dubbel' : r.problems.join(', ')}
                        </span>
                      </div>
                    ))}
                    {importPreview.length > 25 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>+ {importPreview.length - 25} meer...</div>}
                  </div>
                </div>
              )}

              <div className="flex gap-2" style={{ marginTop: '20px' }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowImport(false)} style={{ flex: 1 }}>Annuleren</button>
                <button type="button" className="btn btn-secondary" onClick={handleImport} disabled={importing || !importValidRows.length} style={{ flex: 1 }}>
                  {importing ? 'Importeren...' : `Importeer ${importValidRows.length || ''} sollicitant${importValidRows.length === 1 ? '' : 'en'}`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
