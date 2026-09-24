import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, Settings, Check, Trash2, Pause, Play, Layers } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import { TOOLS } from '../lib/tools'
import { MAIL_SOURCES } from '../lib/mailSources'
import ComplianceChecklist, { checklistCompleet } from './ComplianceChecklist'
import { useChecklistSearch } from './PersonSelect' // v102
import { SALES_DISPOSITION_KEYS } from '../lib/dispositions' // v104

// Uitgebreid instellingenpaneel per project (campagne) - vervangt de krappe
// inline chip-rijtjes op de projectkaart in Projecten & Leads. Hier kan een
// admin alles in één overzicht regelen: naam, actief/pauze, wachtrij-modus,
// managers en teams (vrij toevoegen én weer verwijderen), en verwijderen.
// Alleen bereikbaar voor admins (LeadManagement.jsx is requireAdmin).
function CheckList({ items: allItems, selected, onToggle, emptyText }) {
  const { items, input, empty } = useChecklistSearch(allItems, selected) // v102
  if (allItems.length === 0) return <p className="text-muted" style={{ fontSize: '0.85rem', padding: '8px 0' }}>{emptyText}</p>
  return (
    <>
    {input}
    {empty && <p className="text-muted" style={{ fontSize: '0.8rem', padding: '4px 0' }}>Niets gevonden</p>}
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
    </>
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
  // v60: tools per project (campaign_tools) - wie aan het project hangt ziet ze in de tab Tools
  const [selectedTools, setSelectedTools] = useState([])
  // v69: Mailingservice per project (campaign_mail_services)
  const [mailEnabled, setMailEnabled] = useState(false)
  const [mailSource, setMailSource] = useState(MAIL_SOURCES[0]?.key || '')
  const [mailFollowUpDays, setMailFollowUpDays] = useState(5)
  const [mailRowExists, setMailRowExists] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // v62: planning-accounts (alleen rooster) mogen in DIT project toch leads
  // zien en verwerken via de Leadlijst-pagina, als hun team eraan hangt.
  const [planningLeads, setPlanningLeads] = useState(false)
  // v72: bordweergave (kanban) als extra manier om de leads van dit project te
  // bekijken op /leads. Geen aparte data: dezelfde leads, andere weergave.
  const [boardView, setBoardView] = useState(false)
  const [autoEnrich, setAutoEnrich] = useState(false) // v82
  // v91: afspraken met een echt datum/tijd-moment (accountmanager-agenda),
  // niet alleen bij recruitment. Beller vult bij "Afspraak gemaakt" een
  // moment in (leads.appointment_at), zichtbaar op het bord/de agenda.
  const [appointmentScheduling, setAppointmentScheduling] = useState(false)
  const [kwartaalBellen, setKwartaalBellen] = useState(false) // v99
  // v104: afboekknoppen die in dit project NIET in het belscherm staan
  const [hiddenDisp, setHiddenDisp] = useState([])
  const [customReasons, setCustomReasons] = useState([])
  // v98: compliance-checklist (doelgroep, rechtsvorm-modus, afspraken met het team)
  const [compliance, setCompliance] = useState({ doelgroep: null, rechtsvorm_modus: 'waarschuwen', checklist: {} })
  const [complianceOrig, setComplianceOrig] = useState(null)

  const allManagers = (agents || []).filter(a => a.role === 'manager')

  useEffect(() => {
    if (!isOpen || !campaign) return
    setName(campaign.name || '')
    setQueueMode(campaign.queue_mode || 'fifo')
    setProjectType(campaign.type || 'sales')
    setPlanningLeads(campaign.planning_can_view_leads === true)
    setBoardView(campaign.board_view_enabled === true)
    setAutoEnrich(campaign.auto_enrich === true)
    setAppointmentScheduling(campaign.appointment_scheduling_enabled === true)
    setKwartaalBellen(campaign.kwartaal_bellen_enabled === true)
    setHiddenDisp(Array.isArray(campaign.hidden_dispositions) ? campaign.hidden_dispositions : [])
    supabase.from('custom_dispositions').select('id, label, base_status').eq('is_active', true).order('sort_order').order('created_at')
      .then(({ data }) => setCustomReasons(data || []))
    setConfirmDelete(false)
    setLoading(true)
    Promise.all([
      supabase.from('campaign_managers').select('manager_id').eq('campaign_id', campaign.id),
      supabase.from('campaign_teams').select('team_id').eq('campaign_id', campaign.id),
      supabase.from('campaign_tools').select('tool_key').eq('campaign_id', campaign.id),
      supabase.from('campaign_mail_services').select('enabled, source, follow_up_days').eq('campaign_id', campaign.id).maybeSingle(),
      supabase.from('campaigns').select('doelgroep, rechtsvorm_modus, compliance_checklist, compliance_ok_at').eq('id', campaign.id).maybeSingle()
    ]).then(([mRes, tRes, toolRes, mailRes, compRes]) => {
      const comp = {
        doelgroep: compRes.data?.doelgroep || null,
        rechtsvorm_modus: compRes.data?.rechtsvorm_modus || 'waarschuwen',
        checklist: compRes.data?.compliance_checklist || {},
      }
      setCompliance(comp)
      setComplianceOrig({ ...comp, ok_at: compRes.data?.compliance_ok_at || null })
      setSelectedManagers((mRes.data || []).map(r => r.manager_id))
      setSelectedTeams((tRes.data || []).map(r => r.team_id))
      setSelectedTools((toolRes.data || []).map(r => r.tool_key))
      const svc = mailRes.data
      setMailRowExists(!!svc)
      setMailEnabled(svc?.enabled === true)
      setMailSource(svc?.source || MAIL_SOURCES[0]?.key || '')
      setMailFollowUpDays(svc?.follow_up_days || 5)
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
  function toggleTool(key) {
    setSelectedTools(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key])
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
      if (planningLeads !== (campaign.planning_can_view_leads === true)) {
        const { error } = await supabase.from('campaigns').update({ planning_can_view_leads: planningLeads }).eq('id', campaign.id)
        if (error) throw error
      }
      if (boardView !== (campaign.board_view_enabled === true)) {
        const { error } = await supabase.from('campaigns').update({ board_view_enabled: boardView }).eq('id', campaign.id)
        if (error) throw error
      }
      if (autoEnrich !== (campaign.auto_enrich === true)) {
        const { error } = await supabase.from('campaigns').update({ auto_enrich: autoEnrich }).eq('id', campaign.id)
        if (error) throw error
      }
      if (appointmentScheduling !== (campaign.appointment_scheduling_enabled === true)) {
        const { error } = await supabase.from('campaigns').update({ appointment_scheduling_enabled: appointmentScheduling }).eq('id', campaign.id)
        if (error) throw error
      }
      if (kwartaalBellen !== (campaign.kwartaal_bellen_enabled === true)) {
        const { error } = await supabase.from('campaigns').update({ kwartaal_bellen_enabled: kwartaalBellen }).eq('id', campaign.id)
        if (error) throw error
      }
      // v104: afboekknoppen per project
      const oudHidden = Array.isArray(campaign.hidden_dispositions) ? campaign.hidden_dispositions : []
      if ([...hiddenDisp].sort().join('|') !== [...oudHidden].sort().join('|')) {
        const { error } = await supabase.from('campaigns').update({ hidden_dispositions: hiddenDisp }).eq('id', campaign.id)
        if (error) throw error
      }

      // v98: compliance-checklist
      if (complianceOrig && JSON.stringify({ d: compliance.doelgroep, m: compliance.rechtsvorm_modus, c: compliance.checklist })
          !== JSON.stringify({ d: complianceOrig.doelgroep, m: complianceOrig.rechtsvorm_modus, c: complianceOrig.checklist })) {
        const compleet = checklistCompleet(compliance, mailEnabled)
        const { data: { user: ik } } = await supabase.auth.getUser()
        const { error } = await supabase.from('campaigns').update({
          doelgroep: compliance.doelgroep,
          rechtsvorm_modus: compliance.rechtsvorm_modus || 'waarschuwen',
          compliance_checklist: compliance.checklist || {},
          compliance_ok_at: compleet ? (complianceOrig.ok_at || new Date().toISOString()) : null,
          compliance_ok_by: compleet ? (ik?.id || null) : null,
        }).eq('id', campaign.id)
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

      // v60: tools - zelfde verschil-logica
      const { data: curTools } = await supabase.from('campaign_tools').select('tool_key').eq('campaign_id', campaign.id)
      const curToolKeys = new Set((curTools || []).map(r => r.tool_key))
      const addTools = selectedTools.filter(k => !curToolKeys.has(k))
      const removeTools = [...curToolKeys].filter(k => !selectedTools.includes(k))
      if (addTools.length) {
        const { error } = await supabase.from('campaign_tools').insert(addTools.map(k => ({ campaign_id: campaign.id, tool_key: k })))
        if (error) throw error
      }
      if (removeTools.length) {
        const { error } = await supabase.from('campaign_tools').delete().eq('campaign_id', campaign.id).in('tool_key', removeTools)
        if (error) throw error
      }

      // v69: Mailingservice - alleen wegschrijven als hij aan staat of al bestond
      if (mailEnabled || mailRowExists) {
        if (mailEnabled && !mailSource) throw new Error('Kies een bron voor de Mailingservice')
        const days = Math.min(60, Math.max(1, Number(mailFollowUpDays) || 5))
        const { data: { user } } = await supabase.auth.getUser()
        const { error } = await supabase.from('campaign_mail_services').upsert({
          campaign_id: campaign.id,
          enabled: mailEnabled,
          source: mailSource || MAIL_SOURCES[0]?.key,
          follow_up_days: days,
          updated_at: new Date().toISOString(),
          updated_by: user?.id || null
        }, { onConflict: 'campaign_id' })
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
                    <button type="button" onClick={() => setProjectType('accountmanagement')} className={`btn btn-sm ${projectType === 'accountmanagement' ? 'btn-primary' : 'btn-outline'}`}>Accountmanagement (eigen leads opvolgen)</button>
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>Bepaalt bij het importeren automatisch het naamveld-label en of nieuwe leads als "Nieuw" of meteen als "Deal" (backoffice) binnenkomen. Bij accountmanagement (v68) werken teamleden als accountmanager: geen belwachtrij, maar eigen leads met pipeline, opvolgdatum en "Offerte sturen"; leads zonder actie vallen na een instelbaar aantal dagen terug in de pool.</p>
                </>
              )}
            </div>

            {/* v98: AVG / art. 11.7 Tw - per project doorlopen */}
            <ComplianceChecklist value={compliance} onChange={setCompliance} campaignId={campaign.id} mailEnabled={mailEnabled} />

            <div>
              <label className={labelStyle}>Leadlijst voor planning-accounts</label>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={planningLeads} onChange={e => setPlanningLeads(e.target.checked)} />
                Planning-accounts in de gekoppelde teams mogen de leads van dit project zien en verwerken
              </label>
              <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>Standaard uit: planning-accounts zien alleen hun rooster. Aan = iedereen in het project ziet alle leads op de pagina Leads; wie een lead opent, vergrendelt hem tijdelijk voor de rest.</p>
            </div>

            <div>
              <label className={labelStyle}>Bordweergave voor de leads</label>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={boardView} onChange={e => setBoardView(e.target.checked)} />
                Leads van dit project zijn ook als bord (kanban) te bekijken op de pagina Leads
              </label>
              <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>Zelfde soort bord als bij sollicitanten: kolommen van nieuw tot klant, slepen zet de status. Staat de Mailingservice aan, dan opent de kolom "Mail verstuurd" de mailpopup - de mail gaat pas weg als je hem bevestigt.</p>
            </div>

            <div>
              <label className={labelStyle}>Afspraken met datum en tijd</label>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={appointmentScheduling} onChange={e => setAppointmentScheduling(e.target.checked)} />
                Bij de afboekreden "Afspraak gemaakt" vraagt het belscherm om een datum en tijd
              </label>
              <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>Zelfde datumveld als bij sollicitatiegesprekken, maar dan voor een afspraak met de klant. Die momenten zijn te zien op het bord in de kolom Agenda, zodat degene die de afspraken nabelt of nakomt weet wanneer.</p>
            </div>

            <div>
              <label className={labelStyle}>In nieuw kwartaal bellen</label>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={kwartaalBellen} onChange={e => setKwartaalBellen(e.target.checked)} />
                Knop "Nieuw kwartaal" in het belscherm
              </label>
              <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>De beller kiest een kwartaal. De lead gaat dan naar de lijst "Q1 2027" (of Q2, Q3, Q4) in dit project. Bestaat die lijst nog niet, dan wordt hij gemaakt. Op de eerste werkdag van dat kwartaal komt de lead vanzelf terug om te bellen.</p>
            </div>

            {/* v104: per project kiezen welke afboekknoppen de beller ziet */}
            {projectType !== 'backoffice' && projectType !== 'recruitment' && (
              <div>
                <label className={labelStyle}>Afboekknoppen in het belscherm</label>
                <p className="text-muted" style={{ fontSize: '0.72rem', margin: '0 0 8px' }}>Vinkje uit = de beller ziet die knop niet in dit project. Zo blijft het belscherm rustig. Staat alles uit, dan toont het belscherm toch alle knoppen.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '6px 12px' }}>
                  {[...SALES_DISPOSITION_KEYS, ...customReasons.map(c => ({ key: `custom:${c.id}`, label: c.label, note: 'eigen reden' }))]
                    .filter(d => d.key !== 'nieuw_kwartaal' || kwartaalBellen)
                    .map(d => {
                      const aan = !hiddenDisp.includes(d.key)
                      return (
                        <label key={d.key} className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '0.85rem', opacity: aan ? 1 : 0.6 }} title={d.note || undefined}>
                          <input
                            type="checkbox"
                            checked={aan}
                            onChange={e => setHiddenDisp(prev => e.target.checked ? prev.filter(k => k !== d.key) : [...new Set([...prev, d.key])])}
                          />
                          {d.label}{d.note === 'eigen reden' && <span className="text-muted" style={{ fontSize: '0.7rem' }}>(eigen)</span>}
                        </label>
                      )
                    })}
                </div>
              </div>
            )}

            <div>
              <label className={labelStyle}>Website-scan na import</label>
              <label className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: '0.85rem' }}>
                <input type="checkbox" checked={autoEnrich} onChange={e => setAutoEnrich(e.target.checked)} />
                Na een import automatisch de website van elke lead scannen op een e-mailadres
              </label>
              <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>Gratis. Alleen voor leads met een website en zonder e-mail of contactpersoon; vult alleen lege velden. Zo hoeven bellers minder zelf op te zoeken voordat ze kunnen mailen.</p>
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

            <div>
              <label className={labelStyle}>Tools - zichtbaar in de tab Tools voor iedereen aan dit project</label>
              <CheckList
                items={TOOLS.map(t => ({ id: t.key, label: t.label }))}
                selected={selectedTools}
                onToggle={toggleTool}
                emptyText="Nog geen tools beschikbaar."
              />
              <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>Geldt voor de managers en de teamleden van dit project; admin ziet altijd alle tools.</p>
            </div>

            {campaign.type !== 'recruitment' && (
              <div>
                <label className={labelStyle}>Mailingservice - knop bij de afboekingen</label>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  <button type="button" onClick={() => setMailEnabled(false)} className={`btn btn-sm ${!mailEnabled ? 'btn-primary' : 'btn-outline'}`}>Uit</button>
                  <button type="button" onClick={() => setMailEnabled(true)} className={`btn btn-sm ${mailEnabled ? 'btn-primary' : 'btn-outline'}`}>Aan</button>
                </div>
                {mailEnabled && (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                    <div style={{ flex: '1 1 200px' }}>
                      <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Bron (waar de mail vandaan komt)</span>
                      <select value={mailSource} onChange={e => setMailSource(e.target.value)} className="form-dark w-full">
                        {MAIL_SOURCES.map(src => <option key={src.key} value={src.key}>{src.label}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: '0 1 140px' }}>
                      <span className="text-muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: '4px' }}>Opvolgen na (dagen)</span>
                      <input type="number" min={1} max={60} value={mailFollowUpDays} onChange={e => setMailFollowUpDays(e.target.value)} className="form-dark w-full" />
                    </div>
                  </div>
                )}
                <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0' }}>
                  {mailEnabled
                    ? `${MAIL_SOURCES.find(m => m.key === mailSource)?.description || ''} De beller vult het e-mailadres in; de lead gaat daarna op Mail verstuurd en komt na het aantal dagen terug in de wachtrij.`
                    : 'Aan = bellers in dit project zien bij de afboekingen een knop Mailingservice.'}
                </p>
              </div>
            )}

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
