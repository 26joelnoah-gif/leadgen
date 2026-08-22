import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Layers, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

// Admin koppelt een manager aan projecten (campagnes, v23: campaign_managers -
// meerdere managers per project kan) en bepaalt per manager wat hij mag
// zien en doen (rechten-kolommen op profiles, v20).
const PERMISSIONS = [
  { key: 'can_view_rates', label: 'Tarieven & kosten zien', hint: 'Ziet de projecttarieven en wat elke beller kost in zijn dashboard.' },
  { key: 'can_manage_leads', label: 'Leads beheren', hint: 'Mag leads importeren en bewerken binnen zijn eigen projecten.' },
  { key: 'can_manage_team', label: 'Bellers aanmaken & toewijzen', hint: 'Mag nieuwe bellers aanmaken en aan zijn projecten koppelen.' },
  { key: 'can_export_data', label: 'Exporteren (CSV)', hint: 'Mag statistieken en gesprekken als CSV downloaden.' },
  { key: 'can_edit_flows', label: 'Flows aanpassen', hint: 'Mag instellen wat er na een afboeking gebeurt. Let op: flows gelden voor alle projecten.' },
  { key: 'can_manage_queue', label: 'Wachtrij-volgorde aanpassen', hint: 'Mag per project kiezen of de wachtrij op import-volgorde staat of warme leads en beslissers eerst aanbiedt.' },
  { key: 'kpi_only', label: "Alleen KPI's & uitkomsten", hint: 'Ziet alleen totalen en trends (afspraken, belletjes per uur/dag/week/maand) - geen individuele gesprekken of leadgegevens.' }
]

// v31: presets - één klik zet alle toggles goed, daarna nog per recht bij te stellen.
const PRESETS = [
  {
    id: 'meekijken',
    label: 'Alleen meekijken',
    hint: "Klant die alleen resultaten wil zien: KPI's en trends, verder niets.",
    perms: { can_view_rates: false, can_manage_leads: false, can_manage_team: false, can_export_data: false, can_edit_flows: false, can_manage_queue: false, kpi_only: true }
  },
  {
    id: 'standaard',
    label: 'Standaard manager',
    hint: 'Ziet gesprekken en bellers, mag bellers aanmaken/toewijzen en exporteren. Geen tarieven of flows.',
    perms: { can_view_rates: false, can_manage_leads: false, can_manage_team: true, can_export_data: true, can_edit_flows: false, can_manage_queue: false, kpi_only: false }
  },
  {
    id: 'volledig',
    label: 'Volledig beheer',
    hint: 'Alles: tarieven, leads, team, export, flows en wachtrij.',
    perms: { can_view_rates: true, can_manage_leads: true, can_manage_team: true, can_export_data: true, can_edit_flows: true, can_manage_queue: true, kpi_only: false }
  }
]

const presetMatches = (perms, preset) => PERMISSIONS.every(p => !!perms[p.key] === !!preset.perms[p.key])

function PermToggle({ on, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      style={{
        width: '44px', height: '24px', borderRadius: '12px', position: 'relative',
        background: on ? 'var(--success)' : 'var(--border-strong)',
        transition: 'background 0.15s', flexShrink: 0
      }}
    >
      <span style={{
        position: 'absolute', top: '3px', left: on ? '23px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: 'white', transition: 'left 0.15s'
      }} />
    </button>
  )
}
export default function ManagerProjectsModal({ isOpen, onClose, manager, onSaved }) {
  const toast = useToast()
  const [projects, setProjects] = useState([]) // campagnes
  const [selected, setSelected] = useState(new Set())
  const [perms, setPerms] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isOpen || !manager) return
    setPerms({
      can_manage_leads: !!manager.can_manage_leads,
      can_view_rates: !!manager.can_view_rates,
      can_manage_team: manager.can_manage_team !== false,
      can_export_data: manager.can_export_data !== false,
      can_edit_flows: !!manager.can_edit_flows,
      can_manage_queue: !!manager.can_manage_queue,
      kpi_only: !!manager.kpi_only
    })
    setLoading(true)
    Promise.all([
      supabase.from('campaigns').select('id, name').is('deleted_at', null).order('name'),
      supabase.from('campaign_managers').select('campaign_id').eq('manager_id', manager.id)
    ]).then(([campRes, linkRes]) => {
      setProjects(campRes.data || [])
      if (!linkRes.error) setSelected(new Set((linkRes.data || []).map(r => r.campaign_id)))
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
      // Bestaande koppelingen ophalen en het verschil wegschrijven (v23: per campagne)
      const { data: current, error: curErr } = await supabase
        .from('campaign_managers')
        .select('campaign_id')
        .eq('manager_id', manager.id)
      if (curErr) throw curErr

      const currentIds = new Set((current || []).map(r => r.campaign_id))
      const toAdd = [...selected].filter(id => !currentIds.has(id))
      const toRemove = [...currentIds].filter(id => !selected.has(id))

      if (toAdd.length) {
        const { error } = await supabase
          .from('campaign_managers')
          .insert(toAdd.map(id => ({ campaign_id: id, manager_id: manager.id })))
        if (error) throw error
      }
      if (toRemove.length) {
        const { error } = await supabase
          .from('campaign_managers')
          .delete()
          .eq('manager_id', manager.id)
          .in('campaign_id', toRemove)
        if (error) throw error
        // Legacy: ook oude lijst-koppelingen van deze campagnes opruimen,
        // anders houdt de manager via project_managers alsnog toegang
        const { data: oldLists } = await supabase
          .from('lead_lists')
          .select('id')
          .in('campaign_id', toRemove)
        const oldIds = (oldLists || []).map(l => l.id)
        if (oldIds.length) {
          await supabase
            .from('project_managers')
            .delete()
            .eq('manager_id', manager.id)
            .in('lead_list_id', oldIds)
        }
      }

      const permsChanged = PERMISSIONS.some(perm => {
        const before = perm.key === 'can_manage_team' || perm.key === 'can_export_data'
          ? manager[perm.key] !== false
          : !!manager[perm.key]
        return before !== !!perms[perm.key]
      })
      if (permsChanged) {
        const { error } = await supabase
          .from('profiles')
          .update(perms)
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
          <h2><Layers size={18} /> Projecten &amp; rechten - {manager.full_name}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="text-muted" style={{ fontSize: '0.85rem', marginBottom: '16px' }}>
          Vink aan welke projecten deze manager mag zien en beheren - inclusief alle
          lijsten die later binnen zo'n project worden aangemaakt. Meerdere managers
          per project kan gewoon. Onderaan stel je in wat deze manager precies mag
          (tarieven, team, export, flows, wachtrij) - dit kun je altijd achteraf wijzigen.
        </p>

        {loading ? (
          <p className="text-muted" style={{ padding: '20px 0' }}>Laden...</p>
        ) : projects.length === 0 ? (
          <p className="text-muted" style={{ padding: '20px 0' }}>Er zijn nog geen projecten. Maak eerst een project aan.</p>
        ) : (
          <div style={{ maxHeight: '300px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
            {projects.map(list => {
              const checked = selected.has(list.id)
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => toggle(list.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
                    borderRadius: '10px', cursor: 'pointer', textAlign: 'left', width: '100%',
                    background: checked ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                    border: checked ? '1px solid var(--primary)' : '1px solid var(--border)',
                    color: 'var(--text-primary)', fontWeight: 600
                  }}
                >
                  <span style={{
                    width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: checked ? 'var(--primary)' : 'transparent',
                    border: checked ? 'none' : '1px solid var(--border-strong)'
                  }}>
                    {checked && <Check size={14} />}
                  </span>
                  {list.name}
                </button>
              )
            })}
          </div>
        )}

        <div style={{ marginBottom: '20px' }}>
          <div className="text-[10px] font-black uppercase text-muted tracking-widest" style={{ marginBottom: '8px' }}>
            Wat mag deze manager?
          </div>
          {/* v31: presets - kies een profiel, stel daarna eventueel per recht bij */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {PRESETS.map(preset => {
              const active = presetMatches(perms, preset)
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPerms({ ...preset.perms })}
                  title={preset.hint}
                  style={{
                    flex: '1 1 130px', padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                    color: active ? 'var(--primary)' : 'var(--text-primary)',
                    fontWeight: 800, fontSize: '0.8rem', textAlign: 'center'
                  }}
                >
                  {preset.label}
                  <div style={{ fontWeight: 600, fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.35 }}>{preset.hint}</div>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {PERMISSIONS.map(perm => (
              <div key={perm.key} style={{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: '10px'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{perm.label}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>{perm.hint}</div>
                </div>
                <PermToggle
                  on={!!perms[perm.key]}
                  onClick={() => setPerms(prev => ({ ...prev, [perm.key]: !prev[perm.key] }))}
                />
              </div>
            ))}
          </div>
        </div>

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
