import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, BookOpen, Info, Save } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

// v29: briefing per project (campagne) - het belscript en de projectinfo
// die de beller als inklapbare tabs in het belscherm ziet.
// Schrijven mag de admin en managers die aan de campagne gekoppeld zijn (RLS).
export default function CampaignBriefingModal({ isOpen, onClose, campaign, onSaved }) {
  const { user } = useAuth()
  const toast = useToast()
  const [callScript, setCallScript] = useState('')
  const [projectInfo, setProjectInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !campaign?.id) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('campaign_briefings')
      .select('call_script, project_info')
      .eq('campaign_id', campaign.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        setCallScript(data?.call_script || '')
        setProjectInfo(data?.project_info || '')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [isOpen, campaign?.id])

  if (!isOpen || !campaign) return null

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('campaign_briefings')
        .upsert({
          campaign_id: campaign.id,
          call_script: callScript,
          project_info: projectInfo,
          updated_by: user?.id || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'campaign_id' })
      if (error) throw error
      toast('Briefing opgeslagen - bellers zien dit direct in het belscherm', 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const areaStyle = {
    width: '100%', padding: '12px', borderRadius: '10px',
    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
    color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.5, resize: 'vertical'
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="modal glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '640px' }}
      >
        <div className="modal-header">
          <h2><BookOpen size={18} /> Briefing: {campaign.name}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          De beller ziet dit in het belscherm als twee inklapbare tabs: het belscript en
          de projectinfo. Denk aan de pitch, kwalificatie-eisen ("wanneer is een afspraak
          goed?") en antwoorden op veelgehoorde bezwaren.
        </p>

        {loading ? (
          <p className="text-muted" style={{ padding: '20px 0' }}>Laden...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <BookOpen size={14} /> Belscript
              </label>
              <textarea
                value={callScript}
                onChange={e => setCallScript(e.target.value)}
                placeholder={'Bijv.\nOpening: "Goedemiddag, u spreekt met ... van ..."\nPitch: ...\nBezwaar "geen tijd": ...'}
                rows={8}
                style={areaStyle}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Info size={14} /> Projectinfo
              </label>
              <textarea
                value={projectInfo}
                onChange={e => setProjectInfo(e.target.value)}
                placeholder={'Bijv. over de opdrachtgever, de doelgroep, wat een goede afspraak is en praktische afspraken.'}
                rows={6}
                style={areaStyle}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2" style={{ marginTop: '20px' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || loading} style={{ flex: 1 }}>
            <Save size={16} /> {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
