import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Layers, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

// Admin koppelt een manager aan projecten (lead_lists) en zet
// optioneel "mag leads beheren" aan (profiles.can_manage_leads).
export default function ManagerProjectsModal({ isOpen, onClose, manager, leadLists = [], onSaved }) {
  const toast = useToast()
  const [selected, setSelected] = useState(new Set())
  const [canManageLeads, setCanManageLeads] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !manager) return
    setCanManageLeads(!!manager.can_manage_leads)
    setLoading(true)
    supabase
      .from('project_managers')
      .select('lead_list_id')
      .eq('manager_id', manager.id)
      .then(({ data, error }) => {
        if (!error) setSelected(new Set((data || []).map(r => r.lead_list_id)))
        setLoading(false)
      })
  }, [isOpen, manager?.id])

  if (!isOpen || !manager) return null

  function toggle(listId) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(listId) ? next.delete(listId) : next.add(listId)
      return next
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Bestaande koppelingen ophalen en het verschil wegschrijven
      const { data: current, error: curErr } = await supabase
        .from('project_managers')
        .select('lead_list_id')
        .eq('manager_id', manager.id)
      if (curErr) throw curErr

      const currentIds = new Set((current || []).map(r => r.lead_list_id))
      const toAdd = [...selected].filter(id => !currentIds.has(id))
      const toRemove = [...currentIds].filter(id => !selected.has(id))

      if (toAdd.length) {
        const { error } = await supabase
          .from('project_managers')
          .insert(toAdd.map(id => ({ lead_list_id: id, manager_id: manager.id })))
        if (error) throw error
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from('project_managers')
          .delete()
          .eq('manager_id', manager.id)
          .in('lead_list_id', toRemove)
        if (error) throw error
      }

      if (!!manager.can_manage_leads !== canManageLeads) {
        const { error } = await supabase
          .from('profiles')
          .update({ can_manage_leads: canManageLeads })
          .eq('id', manager.id)
        if (error) throw error
      }

      toast('Projecten van de manager opgeslagen', 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="modal glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        <div className="modal-header">
          <h2><Layers size={18} /> Projecten van {manager.full_name}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          Vink aan welke projecten (leadlijsten) deze manager mag zien en beheren.
          De manager ziet alleen de bellers en gesprekken van deze projecten.
        </p>

        {loading ? (
          <p className="text-muted" style={{ padding: '20px 0' }}>Laden...</p>
        ) : leadLists.length === 0 ? (
          <p className="text-muted" style={{ padding: '20px 0' }}>Er zijn nog geen projecten. Maak eerst een leadlijst aan.</p>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {leadLists.map(list => {
              const checked = selected.has(list.id)
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => toggle(list.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                    borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%',
                    background: checked ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                    border: checked ? '1px solid var(--primary)' : '1px solid rgba(255,255,255,0.08)',
                    color: 'white', fontWeight: 600
                  }}
                >
                  <span style={{
                    width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: checked ? 'var(--primary)' : 'transparent',
                    border: checked ? 'none' : '1px solid rgba(255,255,255,0.25)'
                  }}>
                    {checked && <Check size={14} />}
                  </span>
                  {list.name}
                </button>
              )
            })}
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '12px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', marginBottom: '20px' }}>
          <input type="checkbox" checked={canManageLeads} onChange={e => setCanManageLeads(e.target.checked)} />
          <span style={{ fontSize: '0.85rem' }}>
            <strong>Leads beheren toestaan</strong><br />
            <span className="text-muted">De manager mag dan ook leads importeren en bewerken binnen zijn eigen projecten.</span>
          </span>
        </label>

        <div className="flex gap-2">
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || loading} style={{ flex: 1 }}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
