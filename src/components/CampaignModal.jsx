import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Zap, Play, Pause, Trash2, ExternalLink } from 'lucide-react'
import { CAMPAIGN_TYPES, CAMPAIGN_STATUS } from '../utils/campaignUtils'

export default function CampaignModal({ isOpen, onClose, onStartCampaign }) {
  const [selectedType, setSelectedType] = useState(null)
  const [campaignName, setCampaignName] = useState('')

  function handleStart() {
    if (!selectedType || !campaignName) return
    onStartCampaign({ type: selectedType, name: campaignName })
    onClose()
    setSelectedType(null)
    setCampaignName('')
  }

  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
      >
        <div className="modal-header">
          <h2><Zap size={18} /> Nieuwe Campagne</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="form-group">
          <label>Campagne Naam</label>
          <input
            type="text"
            value={campaignName}
            onChange={e => setCampaignName(e.target.value)}
            placeholder="Bijv. Q2 LinkedIn Outreach"
          />
        </div>

        <div className="form-group">
          <label>Campagne Type</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {Object.values(CAMPAIGN_TYPES).map(type => (
              <button
                key={type.id}
                onClick={() => setSelectedType(type.id)}
                style={{
                  padding: '16px',
                  border: selectedType === type.id ? `2px solid ${type.color}` : '2px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  background: selectedType === type.id ? `${type.color}10` : 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '4px' }}>{type.icon}</div>
                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{type.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{type.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2" style={{ marginTop: '24px' }}>
          <button className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
            Annuleren
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleStart}
            disabled={!selectedType || !campaignName}
            style={{ flex: 1 }}
          >
            <Play size={16} /> Start Campagne
          </button>
        </div>

        <div style={{ marginTop: '16px', padding: '12px', background: 'var(--bg-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          <strong>Let op:</strong> Campagnes worden gekoppeld aan Apify voor geautomatiseerde lead extractie.
        </div>
      </motion.div>
    </motion.div>
  )
}

export function CampaignCard({ campaign, onPause, onResume, onDelete }) {
  const type = CAMPAIGN_TYPES[campaign.type]
  const status = CAMPAIGN_STATUS[campaign.status] || CAMPAIGN_STATUS.draft

  return (
    <div className="card" style={{ padding: '16px', borderLeft: `4px solid ${type?.color || 'var(--border)'}` }}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: '1.2rem' }}>{type?.icon}</span>
          <strong>{campaign.name}</strong>
        </div>
        <span
          className="status"
          style={{ background: status.bg, color: status.color, fontSize: '0.75rem' }}
        >
          {status.label}
        </span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        {type?.name} • Gestart op {new Date(campaign.created_at).toLocaleDateString('nl-NL')}
      </div>
      <div className="flex gap-2 mt-2">
        {campaign.status === 'active' ? (
          <button className="btn btn-sm btn-outline" onClick={() => onPause(campaign.id)}>
            <Pause size={14} /> Pauzeer
          </button>
        ) : campaign.status === 'paused' ? (
          <button className="btn btn-sm btn-secondary" onClick={() => onResume(campaign.id)}>
            <Play size={14} /> Hervat
          </button>
        ) : null}
        <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={() => onDelete(campaign.id)}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}