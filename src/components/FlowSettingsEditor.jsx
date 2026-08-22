import { useState, useEffect } from 'react'
import { FastForward } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getStatusDetails } from '../utils/statusUtils'
import { useToast } from './Toast'

// Aanbevolen flow-instellingen: resultaten en opvolgacties blijven bij de
// beller (voor verdiensten en TBA's); afgevallen leads gaan terug naar de pool.
export const FLOW_RECOMMENDED = {
  deal: { auto_assign_to: 'agent', append_agent_note: true },
  afspraak_gemaakt: { auto_assign_to: 'agent', append_agent_note: true },
  terugbelafspraak: { auto_assign_to: 'agent', append_agent_note: false },
  later_bellen: { auto_assign_to: 'agent', append_agent_note: false },
  geen_gehoor: { auto_assign_to: 'keep', append_agent_note: false },
  onjuiste_timing: { auto_assign_to: 'none', append_agent_note: false },
  geen_interesse: { auto_assign_to: 'none', append_agent_note: false },
  verkeerd_nummer: { auto_assign_to: 'none', append_agent_note: false },
  blacklist: { auto_assign_to: 'none', append_agent_note: false }
}

export const FLOW_GROUPS = [
  { title: 'Resultaat', hint: 'De lead blijft bij de beller - zo tellen verdiensten goed mee.', color: 'var(--success)', types: ['deal', 'afspraak_gemaakt'] },
  { title: 'Opvolgen', hint: 'De beller houdt de lead vast en krijgt hem terug in zijn wachtrij of TBA-lijst.', color: 'var(--secondary)', types: ['terugbelafspraak', 'later_bellen'] },
  { title: 'Geen succes', hint: 'Kies of de lead blijft staan of terug naar de pool gaat voor een volgende poging.', color: 'var(--danger)', types: ['geen_gehoor', 'onjuiste_timing', 'geen_interesse', 'verkeerd_nummer', 'blacklist'] }
]

// Gedeelde flows-editor: gebruikt door Projecten & Leads (admin) en het
// manager-dashboard (alleen met het recht "Flows aanpassen").
// Wijzigingen gelden voor ALLE projecten - dat staat ook onderaan het paneel.
export default function FlowSettingsEditor() {
  const toast = useToast()
  const [flowSettings, setFlowSettings] = useState([])
  const [savingFlow, setSavingFlow] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('flow_settings').select('*').then(({ data, error }) => {
      if (error) toast(error.message, 'error')
      setFlowSettings(data || [])
      setLoading(false)
    })
  }, [])

  async function handleUpdateFlow(disposition, updates) {
    setSavingFlow(true)
    try {
      const { error } = await supabase
        .from('flow_settings')
        .update(updates)
        .eq('disposition_type', disposition)

      if (error) throw error
      setFlowSettings(prev => prev.map(f => f.disposition_type === disposition ? { ...f, ...updates } : f))
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingFlow(false)
    }
  }

  async function applyRecommendedFlows() {
    setSavingFlow(true)
    try {
      for (const flow of flowSettings) {
        const rec = FLOW_RECOMMENDED[flow.disposition_type]
        if (!rec) continue
        if (flow.auto_assign_to === rec.auto_assign_to && flow.append_agent_note === rec.append_agent_note) continue
        const { error } = await supabase.from('flow_settings').update(rec).eq('disposition_type', flow.disposition_type)
        if (error) throw error
      }
      setFlowSettings(prev => prev.map(f => FLOW_RECOMMENDED[f.disposition_type] ? { ...f, ...FLOW_RECOMMENDED[f.disposition_type] } : f))
      toast('Aanbevolen instellingen toegepast', 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingFlow(false)
    }
  }

  return (
    <div className="glass-panel p-8">
      <div className="flex items-start justify-between gap-4 mb-4" style={{ flexWrap: 'wrap' }}>
        <div>
          <h2 className="text-2xl font-black tracking-tight leading-none mb-1">Wat gebeurt er na een afboeking?</h2>
          <p className="text-muted text-sm">
            Een lead blijft altijd in zijn projectlijst; alleen de status verandert en het gesprek komt in Rapportage.
            Hier stel je per reden in <strong className="text-body">bij wie de lead komt te staan</strong>.
          </p>
        </div>
        <button onClick={applyRecommendedFlows} disabled={savingFlow || loading} className="btn btn-outline btn-sm" style={{ whiteSpace: 'nowrap' }}>
          <FastForward size={14} /> Herstel aanbevolen instellingen
        </button>
      </div>

      {/* Eén legenda voor alle rijen */}
      <div className="grid items-center gap-4 px-4 py-2 mb-1" style={{ gridTemplateColumns: 'minmax(0,1fr) 190px 150px' }}>
        <span className="text-[10px] font-black text-muted uppercase tracking-widest">Afboekreden</span>
        <span className="text-[10px] font-black text-muted uppercase tracking-widest">Lead komt te staan bij</span>
        <span className="text-[10px] font-black text-muted uppercase tracking-widest" style={{ textAlign: 'center' }}>Naam beller in notitie</span>
      </div>

      {loading ? (
        <p className="text-muted px-4 py-6">Laden...</p>
      ) : FLOW_GROUPS.map(group => {
        const rows = group.types
          .map(t => flowSettings.find(f => f.disposition_type === t))
          .filter(Boolean)
        if (rows.length === 0) return null
        return (
          <div key={group.title} className="mb-5">
            <div className="flex items-center gap-2 px-4 py-2">
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: group.color, display: 'inline-block' }} />
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: group.color }}>{group.title}</span>
              <span className="text-[11px] text-muted">- {group.hint}</span>
            </div>
            <div className="rounded-2xl border border-border overflow-hidden">
              {rows.map((flow, i) => (
                <div
                  key={flow.id}
                  className="grid items-center gap-4 px-4 py-3 bg-dark hover:bg-elevated transition-all"
                  style={{ gridTemplateColumns: 'minmax(0,1fr) 190px 150px', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-body text-sm">{getStatusDetails(flow.disposition_type).label}</div>
                    <div className="text-[11px] text-muted leading-snug">{flow.description || 'Lead blijft in de projectlijst; alleen de status verandert.'}</div>
                    {flow.disposition_type === 'onjuiste_timing' && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-muted">Cooldown:</span>
                        <input
                          type="number" min="1" max="365"
                          value={flow.cooldown_days ?? 30}
                          onChange={e => handleUpdateFlow('onjuiste_timing', { cooldown_days: Math.min(365, Math.max(1, parseInt(e.target.value) || 30)) })}
                          className="text-xs font-bold"
                          style={{ width: '64px', padding: '4px 6px' }}
                        />
                        <span className="text-[11px] text-muted">dagen - daarna komt de lead terug in de belwachtrij</span>
                      </div>
                    )}
                  </div>
                  <select
                    value={flow.auto_assign_to}
                    onChange={(e) => handleUpdateFlow(flow.disposition_type, { auto_assign_to: e.target.value })}
                    className="text-xs font-bold"
                    style={{ width: '100%' }}
                  >
                    <option value="agent">Blijft bij de beller</option>
                    <option value="none">Terug naar de pool</option>
                    <option value="keep">Niet aanpassen</option>
                  </select>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button
                      role="switch"
                      aria-checked={flow.append_agent_note}
                      onClick={() => handleUpdateFlow(flow.disposition_type, { append_agent_note: !flow.append_agent_note })}
                      title={flow.append_agent_note ? 'Naam van de beller wordt in de notitie gezet' : 'Geen bellernaam in de notitie'}
                      style={{
                        width: '44px', height: '24px', borderRadius: '12px', position: 'relative',
                        background: flow.append_agent_note ? 'var(--success)' : 'var(--border-strong)',
                        transition: 'background 0.15s', flexShrink: 0
                      }}
                    >
                      <span style={{
                        position: 'absolute', top: '3px',
                        left: flow.append_agent_note ? '23px' : '3px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'white', transition: 'left 0.15s'
                      }} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <p className="text-[11px] text-muted px-4">
        Wijzigingen worden direct opgeslagen en gelden voor alle projecten.
        "Terug naar de pool" betekent: de lead is niet meer aan een beller gekoppeld en kan opnieuw verdeeld worden.
      </p>
    </div>
  )
}
