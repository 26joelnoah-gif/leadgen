import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { createClient } from '@supabase/supabase-js'
import { X, Layers, UserCheck, Phone, Check, ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

// Wizard voor de admin: in één flow een project (campagne) aanmaken,
// een manager eraan koppelen en een team of beller toewijzen.
// v21: een project = een campagne met daaronder één of meer lijsten.
// Het TEAM hangt aan het project - zonder project kan een team niet bellen.
// Stap 2 en 3 zijn optioneel en kunnen later alsnog.
export default function NewProjectWizard({ isOpen, onClose, onCreated }) {
  const { profile } = useAuth()
  const toast = useToast()

  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [managers, setManagers] = useState([])
  const [bellers, setBellers] = useState([])
  const [teams, setTeams] = useState([])

  // Stap 1: project
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rates, setRates] = useState({ appointment: '', deal: '', hour: '' })

  // Stap 2: manager(s) - v23: meerdere managers per project mogelijk
  const [managerMode, setManagerMode] = useState('none') // 'none' | 'existing' | 'new'
  const [managerIds, setManagerIds] = useState([])
  const [newManager, setNewManager] = useState({ name: '', email: '', password: '' })

  // Stap 3: team of beller
  const [bellerMode, setBellerMode] = useState('none') // 'none' | 'team' | 'existing' | 'new'
  const [bellerId, setBellerId] = useState('')
  const [teamIds, setTeamIds] = useState([]) // v23: meerdere teams per project
  const [newBeller, setNewBeller] = useState({ name: '', email: '', password: '' })

  useEffect(() => {
    if (!isOpen) return
    setStep(1); setBusy(false)
    setName(''); setDescription(''); setRates({ appointment: '', deal: '', hour: '' })
    setManagerMode('none'); setManagerIds([]); setNewManager({ name: '', email: '', password: '' })
    setBellerMode('none'); setBellerId(''); setTeamIds([]); setNewBeller({ name: '', email: '', password: '' })
    supabase.from('profiles').select('id, full_name, email, role').order('full_name').then(({ data }) => {
      setManagers((data || []).filter(p => p.role === 'manager'))
      setBellers((data || []).filter(p => p.role === 'employee'))
    })
    supabase.from('teams').select('id, name').order('name').then(({ data }) => setTeams(data || []))
  }, [isOpen])

  if (!isOpen) return null

  const canNext1 = name.trim().length > 0
  const canNext2 = managerMode === 'none' || (managerMode === 'existing' && managerIds.length > 0) ||
    (managerMode === 'new' && newManager.name && newManager.email && newManager.password.length >= 6)
  const canFinish = bellerMode === 'none' || (bellerMode === 'team' && teamIds.length > 0) ||
    (bellerMode === 'existing' && bellerId) ||
    (bellerMode === 'new' && newBeller.name && newBeller.email && newBeller.password.length >= 6)

  // Account aanmaken zonder de admin-sessie te vervangen
  async function createAccount({ name, email, password }, role) {
    const tempClient = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const { data, error } = await tempClient.auth.signUp({
      email, password,
      options: { data: { full_name: name } }
    })
    if (error) throw error
    const userId = data?.user?.id
    if (!userId) throw new Error('Account aangemaakt, maar geen gebruikers-id ontvangen')
    if (role !== 'employee') {
      const { error: roleErr } = await supabase.from('profiles').update({ role }).eq('id', userId)
      if (roleErr) throw roleErr
    }
    return userId
  }

  async function handleFinish() {
    setBusy(true)
    try {
      // 1a. Campagne (het project) aanmaken - hier hangt straks het team aan
      const toNum = v => (v === '' || v === null) ? null : (parseFloat(v) || 0)
      const { data: campaign, error: campErr } = await supabase
        .from('campaigns')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          created_by: profile?.id,
          organization_id: profile?.organization_id ?? null
        })
        .select()
        .single()
      if (campErr) throw campErr

      // 1b. Eerste lijst binnen het project (met optionele eigen tarieven);
      // hier komen de geïmporteerde leads in terecht
      const { data: list, error: listErr } = await supabase
        .from('lead_lists')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          campaign_id: campaign.id,
          created_by: profile?.id,
          organization_id: profile?.organization_id ?? null,
          rate_per_appointment: toNum(rates.appointment),
          rate_per_deal: toNum(rates.deal),
          rate_per_hour: toNum(rates.hour)
        })
        .select()
        .single()
      if (listErr) throw listErr

      // 2. Manager(s) koppelen aan het PROJECT (v23: campaign_managers,
      // geldt dus ook voor lijsten die later binnen dit project komen)
      let managerName = null
      if (managerMode !== 'none') {
        let mIds = managerIds
        if (managerMode === 'new') {
          mIds = [await createAccount(newManager, 'manager')]
          managerName = newManager.name
        } else {
          managerName = managers.filter(m => mIds.includes(m.id)).map(m => m.full_name).join(', ')
        }
        const { error: pmErr } = await supabase
          .from('campaign_managers')
          .insert(mIds.map(id => ({ campaign_id: campaign.id, manager_id: id })))
        if (pmErr) throw pmErr
      }

      // 3. Team koppelen aan het project, of individuele beller toewijzen
      let bellerName = null
      let teamName = null
      if (bellerMode === 'team') {
        // v23: meerdere teams per project via campaign_teams
        const { error: teamErr } = await supabase
          .from('campaign_teams')
          .insert(teamIds.map(id => ({ campaign_id: campaign.id, team_id: id })))
        if (teamErr) throw teamErr
        teamName = teams.filter(t => teamIds.includes(t.id)).map(t => t.name).join(', ')
      } else if (bellerMode !== 'none') {
        let bId = bellerId
        if (bellerMode === 'new') {
          bId = await createAccount(newBeller, 'employee')
          bellerName = newBeller.name
        } else {
          bellerName = bellers.find(b => b.id === bId)?.full_name
        }
        const { error: asErr } = await supabase
          .from('lead_lists')
          .update({ assigned_to: bId })
          .eq('id', list.id)
        if (asErr) throw asErr
      }

      const parts = [`Project "${campaign.name}" aangemaakt`]
      if (managerName) parts.push(`manager ${managerName} gekoppeld`)
      if (teamName) parts.push(`team(s) ${teamName} gekoppeld`)
      if (bellerName) parts.push(`beller ${bellerName} toegewezen`)
      toast(parts.join(', ') + '. Importeer nu leads in dit project!', 'success')
      onCreated?.(list)
      onClose()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const labelStyle = 'text-[10px] font-black uppercase text-muted tracking-widest mb-2 block'
  const inputStyle = 'form-dark w-full'

  const STEPS = [
    { n: 1, label: 'Project', Icon: Layers },
    { n: 2, label: 'Manager', Icon: UserCheck },
    { n: 3, label: 'Team / Beller', Icon: Phone }
  ]

  function ModeButtons({ mode, setMode, labels }) {
    return (
      <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
        {Object.entries(labels).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`btn btn-sm ${mode === key ? 'btn-primary' : 'btn-outline'}`}
          >
            {mode === key && <Check size={14} />} {label}
          </button>
        ))}
      </div>
    )
  }

  function CheckList({ items, selected, onToggle }) {
    return (
      <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map(it => {
          const checked = selected.includes(it.id)
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onToggle(it.id)}
              className={`btn btn-sm ${checked ? 'btn-primary' : 'btn-outline'}`}
              style={{ justifyContent: 'flex-start' }}
            >
              {checked && <Check size={14} />} {it.label}
            </button>
          )
        })}
      </div>
    )
  }

  function AccountFields({ value, onChange }) {
    return (
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className={labelStyle}>Naam</label>
          <input className={inputStyle} value={value.name} onChange={e => onChange({ ...value, name: e.target.value })} placeholder="Volledige naam" />
        </div>
        <div>
          <label className={labelStyle}>E-mail</label>
          <input className={inputStyle} type="email" value={value.email} onChange={e => onChange({ ...value, email: e.target.value })} placeholder="email@voorbeeld.nl" />
        </div>
        <div>
          <label className={labelStyle}>Wachtwoord (min. 6 tekens)</label>
          <input className={inputStyle} type="password" value={value.password} onChange={e => onChange({ ...value, password: e.target.value })} placeholder="••••••" />
        </div>
      </div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="modal glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '560px', width: '100%' }}
      >
        <div className="modal-header">
          <h2><Layers size={18} /> Nieuw project</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Stappen-indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2" style={{ flex: i < STEPS.length - 1 ? 1 : 'none' }}>
              <div className="flex items-center gap-2">
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: '0.8rem',
                  background: step > s.n ? 'var(--success)' : step === s.n ? 'var(--primary)' : 'var(--bg-elevated)',
                  color: step >= s.n ? 'var(--text-on-accent)' : 'var(--text-muted)'
                }}>
                  {step > s.n ? <Check size={14} /> : s.n}
                </div>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: step === s.n ? 'var(--text-primary)' : 'var(--text-muted)' }}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div style={{ flex: 1, height: '2px', background: step > s.n ? 'var(--success)' : 'var(--border)', borderRadius: '1px' }} />}
            </div>
          ))}
        </div>

        {/* STAP 1: PROJECT */}
        {step === 1 && (
          <div>
            <div className="mb-4">
              <label className={labelStyle}>Projectnaam *</label>
              <input className={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Bijv. Zorg & Welzijn Q3" autoFocus />
            </div>
            <div className="mb-4">
              <label className={labelStyle}>Omschrijving (optioneel)</label>
              <textarea className={inputStyle} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Waar gaat dit project over?" />
            </div>
            <div className="mb-2">
              <label className={labelStyle}>Tarieven voor dit project (leeg = standaardtarief)</label>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <input type="number" min="0" step="0.5" className={inputStyle} placeholder="€ / afspraak"
                    value={rates.appointment} onChange={e => setRates({ ...rates, appointment: e.target.value })} />
                </div>
                <div>
                  <input type="number" min="0" step="0.5" className={inputStyle} placeholder="€ / deal"
                    value={rates.deal} onChange={e => setRates({ ...rates, deal: e.target.value })} />
                </div>
                <div>
                  <input type="number" min="0" step="0.5" className={inputStyle} placeholder="€ / uur beltijd"
                    value={rates.hour} onChange={e => setRates({ ...rates, hour: e.target.value })} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STAP 2: MANAGER */}
        {step === 2 && (
          <div>
            <p className="text-muted mb-4" style={{ fontSize: '0.85rem' }}>
              Managers zien alleen dít project: de bellers, gesprekken en resultaten. Je kunt er meerdere koppelen - vink ze aan.
            </p>
            <ModeButtons
              mode={managerMode}
              setMode={setManagerMode}
              labels={{ none: 'Geen manager (later)', existing: 'Bestaande manager(s)', new: 'Nieuwe manager aanmaken' }}
            />
            {managerMode === 'existing' && (
              managers.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Er zijn nog geen managers - kies "Nieuwe manager aanmaken".</p>
              ) : (
                <CheckList
                  items={managers.map(m => ({ id: m.id, label: `${m.full_name} (${m.email})` }))}
                  selected={managerIds}
                  onToggle={id => setManagerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                />
              )
            )}
            {managerMode === 'new' && <AccountFields value={newManager} onChange={setNewManager} />}
          </div>
        )}

        {/* STAP 3: BELLER */}
        {step === 3 && (
          <div>
            <p className="text-muted mb-4" style={{ fontSize: '0.85rem' }}>
              Koppel één of meer teams aan dit project: alle bellers in die teams kunnen dan op de lijsten van dit project bellen. Zonder project kan een team nergens op bellen. Je kunt ook één individuele beller toewijzen.
            </p>
            <ModeButtons
              mode={bellerMode}
              setMode={setBellerMode}
              labels={{ none: 'Later koppelen', team: 'Team(s) koppelen', existing: 'Eén beller', new: 'Nieuwe beller aanmaken' }}
            />
            {bellerMode === 'team' && (
              teams.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Er zijn nog geen teams - maak eerst een team aan via Team, of wijs één beller toe.</p>
              ) : (
                <CheckList
                  items={teams.map(t => ({ id: t.id, label: t.name }))}
                  selected={teamIds}
                  onToggle={id => setTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                />
              )
            )}
            {bellerMode === 'existing' && (
              bellers.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.85rem' }}>Er zijn nog geen bellers - kies "Nieuwe beller aanmaken".</p>
              ) : (
                <select className={inputStyle} value={bellerId} onChange={e => setBellerId(e.target.value)}>
                  <option value="">- Kies een beller -</option>
                  {bellers.map(b => <option key={b.id} value={b.id}>{b.full_name} ({b.email})</option>)}
                </select>
              )
            )}
            {bellerMode === 'new' && <AccountFields value={newBeller} onChange={setNewBeller} />}
          </div>
        )}

        {/* NAVIGATIE */}
        <div className="flex gap-2 mt-6">
          {step > 1 ? (
            <button type="button" className="btn btn-outline" onClick={() => setStep(step - 1)} disabled={busy} style={{ flex: 1 }}>
              <ChevronLeft size={16} /> Terug
            </button>
          ) : (
            <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
          )}
          {step < 3 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
              style={{ flex: 1 }}
            >
              Volgende <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleFinish}
              disabled={busy || !canFinish}
              style={{ flex: 1 }}
            >
              {busy ? 'Aanmaken...' : 'Project aanmaken'}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
