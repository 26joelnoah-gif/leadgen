import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ArrowRightLeft, Copy, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

const NEW_LIST = '__new__'

// v39: leads handmatig verplaatsen of kopieren naar een andere lijst.
// v42: kies je geen doellijst, dan wordt er een nieuwe lijst aangemaakt
// (optioneel gekoppeld aan een project + optioneel pas automatisch actief
// vanaf een datum). Gebeurt NOOIT automatisch (v17-regel) - dit is altijd
// een expliciete selectie + klik van een manager/admin. Server-side
// afgedwongen via de RPC move_or_copy_leads (autorisatie + welke velden
// gereset worden + rechten op het project van de nieuwe lijst).
export default function MoveCopyLeadsModal({ isOpen, onClose, leadIds = [], targetLists = [], campaigns = [], sourceCampaignId = '', onDone }) {
  const toast = useToast()
  const [mode, setMode] = useState('move') // 'move' | 'copy'
  const [targetListId, setTargetListId] = useState('')
  const [newListName, setNewListName] = useState('')
  const [newListCampaignId, setNewListCampaignId] = useState('')
  const [newListActivateAt, setNewListActivateAt] = useState('') // datetime-local, leeg = meteen actief
  const [resetStatus, setResetStatus] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMode('move')
      setTargetListId('')
      setNewListName('')
      setNewListCampaignId(sourceCampaignId || '')
      setNewListActivateAt('')
      setResetStatus(true)
    }
  }, [isOpen, sourceCampaignId])

  const isNewList = targetListId === NEW_LIST

  async function run() {
    if (!targetListId) { toast('Kies een doellijst of maak een nieuwe lijst aan', 'error'); return }
    if (isNewList && !newListName.trim()) { toast('Geef de nieuwe lijst een naam', 'error'); return }

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('move_or_copy_leads', {
        p_lead_ids: leadIds,
        p_target_list_id: isNewList ? null : targetListId,
        p_mode: mode,
        p_reset: resetStatus,
        p_new_list_name: isNewList ? newListName.trim() : null,
        p_new_list_campaign_id: isNewList ? (newListCampaignId || null) : null,
        // datetime-local heeft geen tijdzone; new Date() interpreteert 'm lokaal, .toISOString() zet 'm om naar UTC voor de server
        p_new_list_activate_at: isNewList && newListActivateAt ? new Date(newListActivateAt).toISOString() : null
      })
      if (error) throw error
      const movedCount = data?.moved_count ?? leadIds.length
      const listMsg = isNewList
        ? ` naar de nieuwe lijst "${newListName.trim()}"${newListActivateAt ? ' (wordt pas zichtbaar voor bellers vanaf de gekozen datum)' : ''}`
        : ' naar de nieuwe lijst'
      toast(
        mode === 'move'
          ? `${movedCount} lead(s) verplaatst${listMsg}`
          : `${movedCount} lead(s) gekopieerd${listMsg}`,
        'success'
      )
      onDone?.(data?.target_list_id)
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="modal-overlay"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            className="glass-panel"
            style={{ width: '100%', maxWidth: '480px', padding: '28px' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-black flex items-center gap-2">
                <ArrowRightLeft size={18} /> Leads verplaatsen / kopieren
              </h3>
              <button onClick={onClose} className="text-muted hover:text-body"><X size={20} /></button>
            </div>

            <p className="text-sm text-muted mb-5">
              {leadIds.length} lead{leadIds.length === 1 ? '' : 's'} geselecteerd. Dit gebeurt alleen als jij nu op de knop klikt - er verandert niets automatisch.
            </p>

            <div className="flex gap-2 mb-5">
              <button
                onClick={() => setMode('move')}
                className={`btn btn-sm flex-1 ${mode === 'move' ? 'btn-primary' : 'btn-outline'}`}
              ><ArrowRightLeft size={14} /> Verplaatsen</button>
              <button
                onClick={() => setMode('copy')}
                className={`btn btn-sm flex-1 ${mode === 'copy' ? 'btn-primary' : 'btn-outline'}`}
              ><Copy size={14} /> Kopieren</button>
            </div>
            <p className="text-[11px] text-muted mb-5">
              {mode === 'move'
                ? 'De leads verdwijnen uit de huidige lijst en komen alleen nog in de doellijst te staan.'
                : 'De leads blijven ook in de huidige lijst staan - er komt een kopie bij in de doellijst.'}
            </p>

            <label className="text-xs font-black uppercase tracking-widest text-muted block mb-2">Doellijst</label>
            <select
              value={targetListId}
              onChange={e => setTargetListId(e.target.value)}
              className="form-dark w-full mb-3"
              style={{ padding: '12px' }}
            >
              <option value="">-- Kies een lijst --</option>
              <option value={NEW_LIST}>+ Nieuwe lijst aanmaken...</option>
              {targetLists.map(l => (
                <option key={l.id} value={l.id}>{l.groupLabel ? `${l.groupLabel} - ${l.name}` : l.name}</option>
              ))}
            </select>

            {isNewList && (
              <div style={{ padding: '14px', marginBottom: '20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-dark)' }}>
                <label className="text-xs font-black uppercase tracking-widest text-muted flex items-center gap-1 mb-2">
                  <Plus size={12} /> Naam nieuwe lijst
                </label>
                <input
                  type="text"
                  value={newListName}
                  onChange={e => setNewListName(e.target.value)}
                  placeholder="Bijv. Annuleringen augustus"
                  className="form-dark w-full mb-3"
                  style={{ padding: '10px' }}
                  autoFocus
                />

                {campaigns.length > 0 && (
                  <>
                    <label className="text-xs font-black uppercase tracking-widest text-muted block mb-2">Project</label>
                    <select
                      value={newListCampaignId}
                      onChange={e => setNewListCampaignId(e.target.value)}
                      className="form-dark w-full mb-3"
                      style={{ padding: '10px' }}
                    >
                      <option value="">-- Zonder project --</option>
                      {campaigns.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </>
                )}

                <label className="text-xs font-black uppercase tracking-widest text-muted block mb-2">Automatisch actief vanaf (optioneel)</label>
                <input
                  type="datetime-local"
                  value={newListActivateAt}
                  onChange={e => setNewListActivateAt(e.target.value)}
                  className="form-dark w-full"
                  style={{ padding: '10px' }}
                />
                <p className="text-[11px] text-muted" style={{ marginTop: '6px' }}>
                  Leeg = de lijst is meteen actief. Kies je een datum, dan blijft de lijst (met de leads erin) verborgen voor bellers tot dat moment - jij en managers kunnen 'm ondertussen wel alvast voorbereiden.
                </p>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm mb-6 cursor-pointer">
              <input
                type="checkbox"
                checked={resetStatus}
                onChange={e => setResetStatus(e.target.checked)}
                style={{ width: '16px', height: '16px' }}
              />
              Status resetten naar "Nieuw" in de doellijst (ook toewijzing, reden en pogingen worden dan gewist)
            </label>

            <button
              onClick={run}
              disabled={submitting || !targetListId || (isNewList && !newListName.trim())}
              className="btn btn-primary w-full py-3"
            >
              {submitting ? 'Bezig...' : mode === 'move' ? `${leadIds.length} lead(s) verplaatsen` : `${leadIds.length} lead(s) kopieren`}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
