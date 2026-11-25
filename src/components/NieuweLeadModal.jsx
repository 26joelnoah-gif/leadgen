import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, UserPlus, AlertCircle, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import PersonSelect from './PersonSelect'
import { useLeadSources } from '../hooks/useLeadSources'
import { SourceSelect } from './LeadSources'
import { cleanPhone, normalizePhoneForDedup } from '../utils/importUtils'

// v161: los 1 lead aanmaken in een project, zonder import.
// - Project en lijst zijn vooraf te kiezen (props), anders kies je ze hier.
// - Heeft het project nog geen lijst, dan maakt hij de lijst "Losse leads" aan.
// - Dubbel nummer: eerst een waarschuwing, met een tweede klik toch opslaan.
// - Backoffice-project = status bruto_deal (net als de import), anders new.
// - Alleen admin of manager (popup rendert niets voor andere rollen).
// - Recruitment doet niet mee: sollicitanten voeg je toe op /recruitment.
// - created_by = jij (RLS leads_insert eist dat), rechtsvorm komt uit de
//   naam via de DB-trigger.

const NIEUWE_LIJST = '__losse_leads__'
const LOSSE_LEADS = 'Losse leads'

const LEEG = { name: '', phone: '', contact_person: '', email: '', website: '', city: '', notes: '', lead_source: 'Handmatig', assigned_to: '' }

export default function NieuweLeadModal({ isOpen, onClose, campaignId = null, listId = null, onCreated }) {
  const { user, profile } = useAuth()
  const toast = useToast()
  const { sources, addSource } = useLeadSources()
  const isStaff = profile?.role === 'admin' || profile?.role === 'manager'

  const [campaigns, setCampaigns] = useState([])
  const [lists, setLists] = useState([])
  const [mensen, setMensen] = useState([])
  const [projectId, setProjectId] = useState('')
  const [lijstId, setLijstId] = useState('')
  const [form, setForm] = useState(LEEG)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState('')
  const [dubbel, setDubbel] = useState(null) // { name, phone } van een bestaande lead

  // Data laden bij openen
  useEffect(() => {
    if (!isOpen) return
    setForm(LEEG); setFout(''); setDubbel(null)
    let weg = false
    ;(async () => {
      const [{ data: c }, { data: l }] = await Promise.all([
        supabase.from('campaigns').select('id, name, type, is_active').is('deleted_at', null).order('name'),
        supabase.from('lead_lists').select('id, name, campaign_id').is('deleted_at', null).order('name')
      ])
      if (weg) return
      const projecten = (c || []).filter(x => x.type !== 'recruitment')
      setCampaigns(projecten)
      setLists(l || [])
      const startProject = campaignId && projecten.some(p => p.id === campaignId) ? campaignId : (projecten[0]?.id || '')
      setProjectId(startProject)
    })()
    if (isStaff) {
      supabase.from('profiles').select('id, full_name, email, role, is_active').is('deleted_at', null).eq('is_active', true).order('full_name')
        .then(({ data }) => { if (!weg) setMensen((data || []).filter(p => !['planning', 'extern', 'aanbrenger'].includes(p.role))) })
    }
    return () => { weg = true }
  }, [isOpen, campaignId, isStaff])

  const project = campaigns.find(c => c.id === projectId) || null
  const projectLijsten = useMemo(() => lists.filter(l => l.campaign_id === projectId), [lists, projectId])
  const heeftLosseLeads = projectLijsten.some(l => l.name.trim().toLowerCase() === LOSSE_LEADS.toLowerCase())

  // Lijst kiezen zodra het project bekend is
  useEffect(() => {
    if (!projectId) { setLijstId(''); return }
    if (listId && projectLijsten.some(l => l.id === listId)) setLijstId(listId)
    else if (projectLijsten.length > 0) setLijstId(projectLijsten[0].id)
    else setLijstId(NIEUWE_LIJST)
  }, [projectId, listId, projectLijsten])

  const isBackoffice = project?.type === 'backoffice'
  const naamLabel = isBackoffice ? 'Naam klant' : 'Bedrijfsnaam'

  function zet(veld, waarde) {
    setForm(f => ({ ...f, [veld]: waarde }))
    if (veld === 'phone') setDubbel(null)
    setFout('')
  }

  async function lijstVoorOpslaan() {
    if (lijstId !== NIEUWE_LIJST) return lijstId
    const { data, error } = await supabase.from('lead_lists').insert({
      name: LOSSE_LEADS,
      campaign_id: projectId,
      created_by: user.id,
      organization_id: profile?.organization_id ?? null
    }).select('id, name, campaign_id').single()
    if (error) throw error
    setLists(prev => [...prev, data])
    setLijstId(data.id)
    return data.id
  }

  async function opslaan(nogEen) {
    const naam = form.name.trim()
    const tel = cleanPhone(form.phone)
    if (!projectId) { setFout('Kies een project.'); return }
    if (!naam) { setFout(`Vul de ${naamLabel.toLowerCase()} in.`); return }
    if (tel.replace(/\D/g, '').length < 8) { setFout('Vul een geldig telefoonnummer in.'); return }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setFout('Dit e-mailadres klopt niet.'); return }

    setBezig(true); setFout('')
    try {
      // Dubbel nummer? Eerst waarschuwen, tweede klik = toch opslaan.
      if (!dubbel) {
        const laatste9 = normalizePhoneForDedup(tel)
        const { data: bestaand } = await supabase.from('leads').select('id, name, phone').like('phone', `%${laatste9}`).is('deleted_at', null).limit(1)
        if (bestaand?.length) {
          setDubbel(bestaand[0])
          setBezig(false)
          return
        }
      }

      const doelLijst = await lijstVoorOpslaan()
      const nu = new Date().toISOString()
      const { error } = await supabase.from('leads').insert({
        name: naam,
        phone: tel,
        contact_person: form.contact_person.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        city: form.city.trim() || null,
        notes: form.notes.trim(),
        lead_source: (form.lead_source || '').trim() || 'Handmatig',
        assigned_to: isStaff && form.assigned_to ? form.assigned_to : null,
        status: isBackoffice ? 'bruto_deal' : 'new',
        sale_date: isBackoffice ? nu : null,
        lead_list_id: doelLijst,
        created_by: user.id,
        organization_id: profile?.organization_id ?? null
      })
      if (error) throw error

      const lijstNaam = lists.find(l => l.id === doelLijst)?.name || LOSSE_LEADS
      toast(`${naam} toegevoegd aan ${project?.name} / ${lijstNaam}`, 'success')
      onCreated?.()
      if (nogEen) {
        setForm(f => ({ ...LEEG, lead_source: f.lead_source, assigned_to: f.assigned_to }))
        setDubbel(null)
      } else {
        onClose()
      }
    } catch (err) {
      setFout(err.message || 'Opslaan is niet gelukt.')
    } finally {
      setBezig(false)
    }
  }

  const label = { fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }
  const twee = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 12 }

  // Alleen admin of manager mag een losse lead aanmaken
  if (!isStaff) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={onClose} style={{ zIndex: 11000 }}>
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
            className="modal glass-panel"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 560, width: '94%', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                <UserPlus size={18} className="text-primary" /> Nieuwe lead
              </h2>
              <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }} aria-label="Sluiten">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={e => { e.preventDefault(); opslaan(false) }}>
              <div style={twee}>
                <div>
                  <label style={label}>Project *</label>
                  <select className="form-control w-full" value={projectId} onChange={e => setProjectId(e.target.value)} required>
                    {campaigns.length === 0 && <option value="">Geen project</option>}
                    {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_active === false ? ' (gepauzeerd)' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label style={label}>Lijst *</label>
                  <select className="form-control w-full" value={lijstId} onChange={e => setLijstId(e.target.value)} disabled={!projectId}>
                    {projectLijsten.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    {!heeftLosseLeads && <option value={NIEUWE_LIJST}>+ Nieuwe lijst "{LOSSE_LEADS}"</option>}
                  </select>
                </div>
              </div>

              <div style={twee}>
                <div>
                  <label style={label}>{naamLabel} *</label>
                  <input className="form-control w-full" value={form.name} onChange={e => zet('name', e.target.value)} placeholder={isBackoffice ? 'Bijv. Jan Jansen' : 'Bijv. Jansen Installatie BV'} autoFocus />
                </div>
                <div>
                  <label style={label}>Telefoonnummer *</label>
                  <input className="form-control w-full" value={form.phone} onChange={e => zet('phone', e.target.value)} placeholder="06..." inputMode="tel" />
                </div>
              </div>

              <div style={twee}>
                <div>
                  <label style={label}>Contactpersoon</label>
                  <input className="form-control w-full" value={form.contact_person} onChange={e => zet('contact_person', e.target.value)} />
                </div>
                <div>
                  <label style={label}>E-mail</label>
                  <input className="form-control w-full" type="email" value={form.email} onChange={e => zet('email', e.target.value)} placeholder="info@..." />
                </div>
              </div>

              <div style={twee}>
                <div>
                  <label style={label}>Website</label>
                  <input className="form-control w-full" value={form.website} onChange={e => zet('website', e.target.value)} placeholder="www..." />
                </div>
                <div>
                  <label style={label}>Plaats</label>
                  <input className="form-control w-full" value={form.city} onChange={e => zet('city', e.target.value)} />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={label}>Notitie voor de beller</label>
                <textarea className="form-control w-full" rows={2} value={form.notes} onChange={e => zet('notes', e.target.value)} />
              </div>

              <div style={twee}>
                <div>
                  <label style={label}>Bron</label>
                  <SourceSelect className="form-control w-full" value={form.lead_source} onChange={v => zet('lead_source', v)} sources={sources} onAdd={addSource} extraValues={['Handmatig']} />
                </div>
                {isStaff && (
                  <div>
                    <label style={label}>Toewijzen aan</label>
                    <PersonSelect people={mensen} value={form.assigned_to} onChange={id => zet('assigned_to', id)} emptyLabel="Niemand (in de lijst)" showRole className="form-control w-full" />
                  </div>
                )}
              </div>

              {dubbel && (
                <div style={{ background: 'var(--warning-soft, rgba(245,158,11,0.12))', border: '1px solid var(--warning)', color: 'var(--warning)', borderRadius: 8, padding: '10px 12px', fontSize: '0.8rem', display: 'flex', gap: 8, marginBottom: 12 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Dit nummer staat al bij <strong>{dubbel.name || 'een lead'}</strong> ({dubbel.phone}). Klik nog een keer op opslaan om toch een nieuwe lead te maken.</span>
                </div>
              )}
              {fout && (
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid var(--error, #EF4444)', color: 'var(--error, #EF4444)', borderRadius: 8, padding: '10px 12px', fontSize: '0.8rem', display: 'flex', gap: 8, marginBottom: 12 }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{fout}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-outline" onClick={() => opslaan(true)} disabled={bezig || !projectId}>
                  <Plus size={14} /> Opslaan + nog een
                </button>
                <button type="submit" className="btn btn-primary" disabled={bezig || !projectId}>
                  {bezig ? 'Bezig...' : dubbel ? 'Toch opslaan' : 'Lead opslaan'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
