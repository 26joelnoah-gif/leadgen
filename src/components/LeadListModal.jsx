import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, List, Trash2, X, Check, UserPlus, Users, ChevronRight, ChevronDown } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { useLeadLists } from '../hooks/useLeadLists'
import LoadingSpinner from './LoadingSpinner'

export function LeadListModal({ isOpen, onClose }) {
  const { leads } = useLeads()
  const { leadLists, loading, createLeadList, addLeadsToList, deleteLeadList, assignListToAgent, getLeadsInList } = useLeadLists()
  const [newListName, setNewListName] = useState('')
  const [newListDescription, setNewListDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [users, setUsers] = useState([])
  const [selectedListId, setSelectedListId] = useState(null)
  const [selectedLeadIds, setSelectedLeadIds] = useState([])
  const [expandedListId, setExpandedListId] = useState(null)
  const [listLeads, setListLeads] = useState({})

  useEffect(() => {
    async function fetchUsers() {
      const { data } = await supabase.from('profiles').select('*').order('full_name')
      if (data) setUsers(data)
    }
    if (isOpen) fetchUsers()
  }, [isOpen])

  async function handleCreateList(e) {
    e.preventDefault()
    if (!newListName.trim()) return
    setCreating(true)
    await createLeadList(newListName.trim(), newListDescription.trim())
    setNewListName('')
    setNewListDescription('')
    setCreating(false)
  }

  async function handleAddLeads() {
    if (!selectedListId || selectedLeadIds.length === 0) return
    await addLeadsToList(selectedListId, selectedLeadIds)
    setSelectedLeadIds([])
    setSelectedListId(null)
  }

  async function toggleExpandList(listId) {
    if (expandedListId === listId) {
      setExpandedListId(null)
    } else {
      setExpandedListId(listId)
      const leadsInList = await getLeadsInList(listId)
      setListLeads(prev => ({ ...prev, [listId]: leadsInList }))
    }
  }

  async function handleAssignAgent(listId, agentId) {
    await assignListToAgent(listId, agentId)
  }

  function toggleLeadSelection(leadId) {
    setSelectedLeadIds(prev =>
      prev.includes(leadId) ? prev.filter(id => id !== leadId) : [...prev, leadId]
    )
  }

  function selectAllLeads() {
    if (selectedLeadIds.length === leads.length) {
      setSelectedLeadIds([])
    } else {
      setSelectedLeadIds(leads.map(l => l.id))
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="modal-overlay"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="modal glass-panel"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '700px', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-header">
              <h2><List size={18} /> Lead Lijsten Beheren</h2>
              <button className="modal-close" onClick={onClose}><X size={18} /></button>
            </div>

            {/* Create New List */}
            <form onSubmit={handleCreateList} className="flex flex-column gap-2 mb-4" style={{ padding: '0 20px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Lijst naam..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-dark)',
                  color: 'white'
                }}
              />
              <input
                type="text"
                value={newListDescription}
                onChange={(e) => setNewListDescription(e.target.value)}
                placeholder="Beschrijving (optioneel)..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-dark)',
                  color: 'white'
                }}
              />
              <button type="submit" className="btn btn-secondary" disabled={creating || !newListName.trim()}>
                <Plus size={16} /> {creating ? 'Aanmaken...' : 'Maak Lijst'}
              </button>
            </form>

            {/* Existing Lists */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Bestaande lijsten ({leadLists.length})
              </h4>

              {loading ? (
                <LoadingSpinner />
              ) : leadLists.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>
                  Nog geen lijsten aangemaakt
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {leadLists.map(list => (
                    <div key={list.id}>
                      <div
                        className="flex justify-between items-center p-3"
                        style={{
                          background: 'var(--bg-elevated)',
                          borderRadius: '8px',
                          border: selectedListId === list.id ? '2px solid var(--secondary)' : '1px solid transparent'
                        }}
                      >
                        <div className="flex items-center gap-2" style={{ flex: 1 }}>
                          <button
                            onClick={() => toggleExpandList(list.id)}
                            className="btn btn-sm btn-ghost"
                            style={{ padding: '4px' }}
                          >
                            {expandedListId === list.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                          <div style={{ flex: 1 }}>
                            <strong>{list.name}</strong>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                              {list.description || 'Geen beschrijving'}
                              {list.assigned_to && users.find(u => u.id === list.assigned_to) && (
                                <span className="ml-2" style={{ color: 'var(--secondary)' }}>
                                  • {users.find(u => u.id === list.assigned_to).full_name}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <select
                            value={list.assigned_to || ''}
                            onChange={(e) => handleAssignAgent(list.id, e.target.value)}
                            style={{ padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.8rem' }}
                          >
                            <option value="">Geen agent</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                          </select>
                          <button
                            onClick={() => setSelectedListId(list.id)}
                            className={`btn btn-sm ${selectedListId === list.id ? 'btn-secondary' : 'btn-outline'}`}
                          >
                            <UserPlus size={14} /> Leads
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Weet je zeker dat je deze lijst wilt verwijderen?')) {
                                deleteLeadList(list.id)
                              }
                            }}
                            className="btn btn-sm btn-outline"
                            style={{ color: 'var(--error)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded leads view */}
                      {expandedListId === list.id && (
                        <div style={{ padding: '8px 0 8px 40px' }}>
                          {listLeads[list.id] ? (
                            listLeads[list.id].length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {listLeads[list.id].map(lead => (
                                  <div key={lead.id} className="flex items-center gap-2 p-2" style={{ background: 'var(--bg-dark)', borderRadius: '6px', fontSize: '0.85rem' }}>
                                    <span style={{ fontWeight: 600 }}>{lead.name}</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{lead.phone}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Geen leads in deze lijst</p>
                            )
                          ) : (
                            <LoadingSpinner size="small" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Select Leads to Add */}
            {selectedListId && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '20px' }}>
                <div className="flex justify-between items-center mb-3">
                  <h4 style={{ fontSize: '0.9rem', margin: 0 }}>
                    <UserPlus size={14} /> Leads toevoegen
                  </h4>
                  <button
                    onClick={selectAllLeads}
                    className="btn btn-sm btn-outline"
                  >
                    {selectedLeadIds.length === leads.length ? 'Deselecteer alles' : 'Selecteer alles'}
                  </button>
                </div>

                <div style={{
                  maxHeight: '150px',
                  overflow: 'auto',
                  background: 'var(--bg-dark)',
                  borderRadius: '8px',
                  marginBottom: '12px'
                }}>
                  {leads.length === 0 ? (
                    <p style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Geen leads beschikbaar</p>
                  ) : (
                    leads.map(lead => (
                      <label
                        key={lead.id}
                        className="flex items-center gap-2 p-2"
                        style={{
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.includes(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          style={{ width: '16px', height: '16px' }}
                        />
                        <span style={{ fontWeight: 600 }}>{lead.name}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{lead.phone}</span>
                      </label>
                    ))
                  )}
                </div>

                <button
                  onClick={handleAddLeads}
                  disabled={selectedLeadIds.length === 0}
                  className="btn btn-secondary btn-block"
                >
                  <Check size={16} /> Voeg {selectedLeadIds.length} leads toe
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}