import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, List, Trash2, X, Check, UserPlus } from 'lucide-react'
import { useLeads } from '../hooks/useLeads'
import { useLeadLists } from '../hooks/useLeadLists'

export function LeadListModal({ isOpen, onClose, onAddToList }) {
  const { leads } = useLeads()
  const { leadLists, createLeadList, addLeadsToList, deleteLeadList } = useLeadLists()
  const [newListName, setNewListName] = useState('')
  const [selectedListId, setSelectedListId] = useState(null)
  const [selectedLeadIds, setSelectedLeadIds] = useState([])

  async function handleCreateList(e) {
    e.preventDefault()
    if (!newListName.trim()) return

    await createLeadList(newListName.trim())
    setNewListName('')
  }

  async function handleAddLeads() {
    if (!selectedListId || selectedLeadIds.length === 0) return

    await addLeadsToList(selectedListId, selectedLeadIds)
    setSelectedLeadIds([])
    setSelectedListId(null)
    alert(`${selectedLeadIds.length} leads toegevoegd aan lijst!`)
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
            style={{ maxWidth: '700px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
          >
            <div className="modal-header">
              <h2><List size={18} /> Lead Lijsten Beheren</h2>
              <button className="modal-close" onClick={onClose}><X size={18} /></button>
            </div>

            {/* Create New List */}
            <form onSubmit={handleCreateList} className="flex gap-2 mb-4" style={{ padding: '0 20px' }}>
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="Nieuwe lijst naam..."
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-dark)',
                  color: 'white'
                }}
              />
              <button type="submit" className="btn btn-primary">
                <Plus size={16} /> Maak Lijst
              </button>
            </form>

            {/* Existing Lists */}
            <div style={{ flex: 1, overflow: 'auto', padding: '0 20px' }}>
              <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                Bestaande lijsten ({leadLists.length})
              </h4>

              {leadLists.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', padding: '20px' }}>
                  Nog geen lijsten aangemaakt
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                  {leadLists.map(list => (
                    <div
                      key={list.id}
                      className="flex justify-between items-center p-3"
                      style={{
                        background: 'var(--bg-elevated)',
                        borderRadius: '8px',
                        border: selectedListId === list.id ? '2px solid var(--secondary)' : '1px solid transparent'
                      }}
                    >
                      <div>
                        <strong>{list.name}</strong>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                          {list.description || 'Geen beschrijving'}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setSelectedListId(list.id)}
                          className={`btn btn-sm ${selectedListId === list.id ? 'btn-secondary' : 'btn-outline'}`}
                        >
                          <UserPlus size={14} /> Selecteer
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
                  ))}
                </div>
              )}
            </div>

            {/* Select Leads to Add */}
            {selectedListId && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '20px' }}>
                <div className="flex justify-between items-center mb-3">
                  <h4 style={{ fontSize: '0.9rem', margin: 0 }}>
                    <UserPlus size={14} /> Leads toevoegen aan geselecteerde lijst
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
                  {leads.map(lead => (
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
                  ))}
                </div>

                <button
                  onClick={handleAddLeads}
                  disabled={selectedLeadIds.length === 0}
                  className="btn btn-primary btn-block"
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