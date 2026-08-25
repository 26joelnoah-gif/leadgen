import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Settings, Check, Trash2, Pause, Play, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

// Uitgebreid instellingenpaneel per project (campagne) - vervangt de krappe
// inline chip-rijtjes op de projectkaart in Projecten & Leads. Hier kan een
// admin alles in één overzicht regelen: naam, actief/pauze, wachtrij-modus,
// managers en teams (vrij toevoegen én weer verwijderen), en verwijderen.
// Alleen bereikbaar voor admins (LeadManagement.jsx is requireAdmin).
function CheckList({ items, selected, onToggle, emptyText }) {
  if (items.length === 0) return <p className="text-muted" style={{ fontSize: '0.85rem', padding: '8px 0' }}>{emptyText}</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto' }}>
      {items.map(it => {
        const checked = selected.includes(it.id)
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onToggle(it.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
              borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%',
              background: checked ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
              border: checked ? '1px solid var(--primary)' : '1px solid var(--border)',
              color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.85rem'
            }}
          >
            <span style={{
              width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: checked ? 'var(--primary)' : 'transparent',
              border: checked ? 'none' : '1px solid var(--border-strong)'
            }}>
              {checked && <Check size={12} />}
            </span>
            <span className="break-words">{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function ProjectSettingsModal({ isOpen, onClose, campaign, agents, teams, leadLists, onSaved }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [queueMode, setQueueMode] = useState('fifo')
  // v42: projectsoort - bepaalt in ImportLeadsModal automatisch het naamveld-label
  // (Bedrijfsnaam/Naam klant) en of nieuwe leads als 'new' of als 'deal' binnenkomen.
  // Recruitment-projecten (sollicitanten) blijven via hun eigen pagina lopen - niet hier wijzigen.
  const [projectType, setProjectType] = useState('sales')
  const [selectedManagers, setSelectedManagers] = useState([])
  const [selectedTeams, setSelectedTeams] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const allManagers = (agents || []).filter(a => a.role === 'manager')

  useEffect(() => {
    if (!isOpen || !campaign) return
    setName(campaign.name || '')
    setQueueMode(campaign.queue_mode || 'fifo')
    setProjectType(campaign.type || 'sales')
    setConfirmDelete(false)
    setLoading(true)
    Promise.all([
      supabase.from('campaign_managers').select('manager_id').eq('campaign_id', campaign.id),
      supabase.from('campaign_teams').select('team_id').eq('campaign_id', campaign.id)
    ]).then(([mRes, tRes]) => {
      setSelectedManagers((mRes.data || []).map(r => r.manager_id))
      setSelectedTeams((tRes.data || []).map(r => r.team_id))
      setLoading(false)
    })
  }, [isOpen, campaign?.id])

  if (!isOpen || !campaign) return null

  const projectLists = (leadLists || []).filter(l => l.campaign_id === campaign.id)

  function toggleManager(id) {
    setSelectedManagers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }
  function toggleTeam(id) {
    setSelectedTeams(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  async function handleSave() {
    if (!name.trim()) { toast('Projectnaam mag niet leeg zijn', 'error'); return }
    setSaving(true)
    try {
      if (name.trim() !== campaign.name) {
        const { error } = await supabase.from('campaigns').update({ name: name.trim() }).eq('id', campaign.id)
        if (error) throw error
      }
      if (queueMode !== (campaign.queue_mode || 'fifo')) {
        const { error } = await supabase.rpc('set_campaign_queue_mode', { p_campaign_id: campaign.id, p_mode: queueMode })
        if (error) throw error
      }
      if (campaign.type !== 'recruitment' && projectType !== (campaign.type || 'sales')) {
        const { error } = await supabase.from('campaigns').update({ type: projectType }).eq('id', campaign.id)
        if (error) throw error
      }

      // Managers: verschil met huidige koppelingen wegschrijven
      const { data: curM } = await supabase.from('campaign_managers').select('manager_id').eq('campaign_id', campaign.id)
      const curManagerIds = new Set((curM || []).map(r => r.manager_id))
      const addManagers = selectedManagers.filter(id => !curManagerIds.has(id))
      const removeManagers = [...curManagerIds].filter(id => !selectedManagers.includes(id))
      if (addManagers.length) {
        const { error } = await supabase.from('campaign_managers').insert(addManagers.map(id => ({ campaign_id: campaign.id, manager_id: id })))
        if (error) throw error
      }
      if (removeManagers.length) {
        const { error } = await supabase.from('campaign_managers').delete().eq('campaign_id', campaign.id).in('manager_id', removeManagers)
        if (error) throw error
        // Legacy: ook oude lijst-koppelingen opruimen, anders houdt de manager alsnog toegang
        const listIds = projectLists.map(l => l.id)
        if (listIds.length) {
          await supabase.from('project_managers').delete().in('manager_id', removeManagers).in('lead_list_id', listIds)
        }
      }

      // Teams: zelfde verschil-logica
      const { data: curT } = await supabase.from('campaign_teams').select('team_id').eq('campaign_id', campaign.id)
      const curTeamIds = new Set((curT || []).map(r => r.team_id))
      const addTeams = selectedTeams.filter(id => !curTeamIds.has(id))
      const removeTeams = [...curTeamIds].filter(id => !selectedTeams.includes(id))
      if (addTeams.length) {
        const { error } = await supabase.from('campaign_teams').insert(addTeams.map(id => ({ campaign_id: campaign.id, team_id: id })))
        if (error) throw error
      }
      if (removeTeams.length) {
        const { error } = await supabase.from('campaign_teams').delete().eq('campaign_id', campaign.id).in('team_id', removeTeams)
        if (error) throw error
      }

      toast('Projectinstellingen opgeslagen', 'success')
      onSaved?.()
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive() {
    const nieuweStatus = campaign.is_active === false
    const { error } = await supabase.from('campaigns').update({ is_active: nieuweStatus }).eq('id', campaign.id)
    if (error) { toast(error.message, 'error'); return }
    toast(nieuweStatus ? 'Project geactiveerd' : 'Project gepauzeerd', 'success')
    onSaved?.()
  }

  async function handleDelete() {
    if (projectLists.length > 0) {
      toast('Dit project heeft nog lijsten. Verwijder of verplaats die eerst.', 'error')
      return
    }
    if (!confirmDelete) {
      setConfirmDelete(true)
      toast('Klik nogmaals om dit project definitief te verwijderen', 'info')
      return
    }
    const { error } = await supabase.from('campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', campaign.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Project verwijderd', 'success')
    onSaved?.()
    onClose()
  }

  const labelStyle = 'text-[10px] font-black uppercase text-muted tracking-widest mb-2 block'

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="modal glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '540px', width: '100%' }}
      >
        <div className="modal-header">
          <h2><Settings size={18} /> Projectinstellingen</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <p className="text-muted" style={{ padding: '20px 0' }}>Laden...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label className={labelStyle}>Projectnaam</label>
              <input className="form-dark w-full" value={name} onChange={e => setName(e.target.value)} placeholder="Projectnaam" />
            </div>

            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-elevated">
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{campaign.is_active === false ? 'Gepauzeerd' : 'Actief'}</div>
                <div className="text-muted" style={{ fontSize: '0.75rem' }}>Gepauzeerd betekent: bellers zien de lijsten van dit project niet meer.</div>
              </div>
              <button type="button" className="btn btn-sm btn-outline" onClick={handleToggleActive}>
                {campaign.is_active === false ? <><Play size={14} /> Activeren</> : <><Pause size={14} /> Pauzeren</>}
              </button>
            </div>

            <div>
              <label className={labelStyle}>Wachtrij-volgorde</label>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                <button type="button" onClick={() => setQueueMode('fifo')} className={`btn btn-sm ${queueMode === 'fifo' ? 'btn-primary' : 'btn-outline'}`}>Import-volgorde</button>
                <button type="button" onClick={() => setQueueMode('score')} className={`btn btn-sm ${queueMode === 'score' ? 'btn-primary' : 'btn-outline'}`}>Beste leads eerst</button>
              </div>
            </div>

            <div>
              <label className={labelStyle}>Projectsoort</label>
              {campaign.type === 'recruitment' ? (
                <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>Recruitment-project (sollicitanten) - loopt via de wervingspagina, hier niet te wijzigen.</p>
              ) : (
                <>
                  <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setProjectType('sales')} className={`btn btn-sm ${projectType === 'sales' ? 'btn-primary' : 'btn-outline'}`}>Uitbellen / acquisitie</button>
                    <button type="button" onClick={() => setProjectType('backoffice')} className={`btn btn-sm ${projectType === 'backoffice' ? 'btn-primary' : 'btn-outline'}`}>Backoffice (al gemaakte sales)</button>
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>Bepaalt bij het importeren automatisch het naamveld-label en of nieuwe leads als "Nieuw" of meteen als "Deal" (backoffice) binnenkomen.</p>
                </>
              )}
            </div>

            <div>
              <label className={labelStyle}>Managers - meerdere per project kan</label>
              <CheckList
                items={allManagers.map(m => ({ id: m.id, label: m.full_name || m.email }))}
                selected={selectedManagers}
                onToggle={toggleManager}
                emptyText="Nog geen manager-accounts. Maak er een aan via Admin of de projectwizard."
              />
            </div>

            <div>
              <label className={labelStyle}>Teams - meerdere per project kan</label>
              <CheckList
                items={(teams || []).map(t => ({ id: t.id, label: t.name }))}
                selected={selectedTeams}
                onToggle={toggleTeam}
                emptyText="Nog geen teams aangemaakt."
              />
            </div>

            <div className="text-muted" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Layers size={12} /> Tarieven per project stel je in bij Uitbetaling - dit paneel raakt ze niet aan.
            </div>

            <div className="flex gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <button
                type="button"
                onClick={handleDelete}
                disabled={projectLists.length > 0}
                title={projectLists.length > 0 ? 'Kan pas verwijderd worden als het project geen lijsten meer heeft' : 'Project verwijderen'}
                className={`btn btn-sm ${confirmDelete ? '' : 'btn-outline'}`}
                style={{
                  color: projectLists.length > 0 ? undefined : 'var(--danger)',
                  background: confirmDelete ? 'rgba(239,68,68,0.15)' : undefined,
                  border: confirmDelete ? '1px solid var(--danger)' : undefined
                }}
              >
                <Trash2 size={14} /> {confirmDelete ? 'Klik nogmaals om te bevestigen' : 'Project verwijderen'}
              </button>
            </div>
          </div>
        )}

        <div className="flex gap-2" style={{ marginTop: '20px' }}>
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving || loading} style={{ flex: 1 }}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
