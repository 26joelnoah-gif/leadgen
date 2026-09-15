import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Wrench, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { TOOLS } from '../lib/tools'

// v77: tools per medewerker (public.profile_tools). Los van de tools die via
// een project (campaign_tools) binnenkomen: wat hier aangevinkt staat ziet
// deze persoon altijd onder Tools, ook zonder project. Bedoeld voor de rol
// 'extern' (bv. een installateur die alleen de offerte-tool nodig heeft),
// maar werkt voor elke rol. my_tool_keys() telt beide bronnen op.
export default function UserToolsModal({ isOpen, onClose, targetUser, onSaved }) {
  const toast = useToast()
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !targetUser) return
    setLoading(true)
    supabase.from('profile_tools').select('tool_key').eq('profile_id', targetUser.id).then(({ data }) => {
      setSelected(new Set((data || []).map(r => r.tool_key)))
      setLoading(false)
    })
  }, [isOpen, targetUser?.id])

  if (!isOpen || !targetUser) return null

  const toggle = (key) => setSelected(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })

  async function save() {
    setSaving(true)
    try {
      const { data: cur } = await supabase.from('profile_tools').select('tool_key').eq('profile_id', targetUser.id)
      const curKeys = new Set((cur || []).map(r => r.tool_key))
      const add = [...selected].filter(k => !curKeys.has(k))
      const remove = [...curKeys].filter(k => !selected.has(k))
      if (add.length) {
        const { error } = await supabase.from('profile_tools').insert(add.map(k => ({ profile_id: targetUser.id, tool_key: k })))
        if (error) throw error
      }
      if (remove.length) {
        const { error } = await supabase.from('profile_tools').delete().eq('profile_id', targetUser.id).in('tool_key', remove)
        if (error) throw error
      }
      toast(`Tools van ${targetUser.full_name} opgeslagen`, 'success')
      onSaved?.()
      onClose()
    } catch (e) {
      toast(e.message, 'error')
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
          <h2><Wrench size={18} /> Tools - {targetUser.full_name}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          Vink aan welke tools deze persoon altijd ziet onder Tools, los van projecten.
          Tools die via een project binnenkomen blijven daarnaast gewoon gelden.
        </p>
        {loading ? (
          <p className="text-muted">Laden…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {TOOLS.map(t => {
              const on = selected.has(t.key)
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggle(t.key)}
                  className="glass-panel"
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 12px', textAlign: 'left', cursor: 'pointer', border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'rgba(59,130,246,0.08)' : undefined }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: 6, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--primary)' : 'var(--bg-elevated)', color: '#fff', border: on ? 'none' : '1px solid var(--border)' }}>
                    {on && <Check size={14} />}
                  </span>
                  <span>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{t.label}</div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>{t.description}</div>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || loading} style={{ flex: 1 }}>{saving ? 'Opslaan…' : 'Opslaan'}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
