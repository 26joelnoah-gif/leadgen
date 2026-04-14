import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Clock, AlertCircle, Phone, Calendar as CalendarIcon, Upload, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { useLeadLists } from '../hooks/useLeadLists'
import { supabase } from '../lib/supabase'
import LoadingSpinner from './LoadingSpinner'

export default function WorkInterface() {
  const { isWorking, toggleWorkingMode, workingListId, setWorkingListId, profile, logCall, sessionCallCount } = useAuth()
  const { leadLists } = useLeadLists()
  const { handleLeadDisposition } = useLeads()
  
  const [leads, setLeads] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [callbackDate, setCallbackDate] = useState('')
  const [loading, setLoading] = useState(false)
  
  const currentLead = leads[currentIndex]
  const [editableLead, setEditableLead] = useState({})

  useEffect(() => {
    if (currentLead) {
      setEditableLead(currentLead)
    }
  }, [currentLead])
  const listName = leadLists.find(l => l.id === workingListId)?.name || 'Onbekende lijst'

  // Zorg dat medewerkers alleen hun eigen lijsten zien
  const availableLists = profile?.role === 'admin' 
    ? leadLists 
    : leadLists.filter(l => l.assigned_to === profile?.id || l.created_by === profile?.id)

  useEffect(() => {
    if (workingListId && isWorking) {
      loadLeadsForList(workingListId)
    }
  }, [workingListId, isWorking])

  async function loadLeadsForList(listId) {
    setLoading(true)
    try {
      let query = supabase
        .from('leads')
        .select('*')
        .eq('lead_list_id', listId)
        
      if (profile?.role !== 'admin') {
        query = query.eq('assigned_to', profile?.id)
      }
      
      const { data, error } = await query
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (error) throw error
      setLeads(data || [])
      setCurrentIndex(0)
    } catch (err) {
      console.error('Error loading leads:', err)
    } finally {
      setLoading(false)
    }
  }

  function closeAll() {
    setWorkingListId(null)
    setLeads([])
    setCurrentIndex(0)
    setShowDatePicker(false)
    toggleWorkingMode()
  }

  async function handleAfboeken(reason) {
    if (!currentLead) return

    if (reason === 'terugbelopdracht') {
      setShowDatePicker(true)
      return
    }

    setLoading(true)
    // Synchronous backend logic via de krachtige hook
    await handleLeadDisposition(currentLead.id, listName, reason, 'Afgeboekt via CRM UI')
    await logCall(currentLead.id, currentLead.name)

    // Shift array
    const updated = leads.filter((_, i) => i !== currentIndex)
    setLeads(updated)
    if (currentIndex >= updated.length && updated.length > 0) {
      setCurrentIndex(updated.length - 1)
    }
    setShowDatePicker(false)
    setLoading(false)
  }

  async function handleCallbackScheduled() {
    if (!currentLead || !callbackDate) return
    setLoading(true)
    await handleLeadDisposition(currentLead.id, listName, 'terugbelopdracht', 'Afgeboekt via CRM UI', callbackDate)
    await logCall(currentLead.id, currentLead.name)

    const updated = leads.filter((_, i) => i !== currentIndex)
    setLeads(updated)
    if (currentIndex >= updated.length && updated.length > 0) {
      setCurrentIndex(updated.length - 1)
    }
    setShowDatePicker(false)
    setCallbackDate('')
    setLoading(false)
  }

  async function saveLeadEdits() {
    if (!editableLead?.id) return
    setLoading(true)
    const { error } = await supabase.from('leads').update({
      name: editableLead.name,
      phone: editableLead.phone,
      email: editableLead.email,
      website: editableLead.website,
      city: editableLead.city,
      address: editableLead.address,
      notes: editableLead.notes
    }).eq('id', editableLead.id)
    
    if (!error) {
      await logCall(editableLead.id, 'Bedrijfsgegevens bewerkt')
      // Update local leads array
      setLeads(leads.map(l => l.id === editableLead.id ? editableLead : l))
    }
    setLoading(false)
  }

  if (!isWorking) return null

  // STADIUM 1: PROJECT KIEZEN (Indien geen project gekozen)
  if (!workingListId) {
    return (
      <AnimatePresence>
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--bg-light)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
          
          <header style={{ background: 'var(--primary-dark)', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white', borderBottom: '4px solid var(--secondary)' }}>
            <div className="flex items-center gap-3">
              <div style={{ background: 'var(--secondary)', padding: '8px', borderRadius: '8px', color: 'var(--primary-dark)' }}><Phone size={20} /></div>
              <div><h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>Werk Modus: Project Kiezen</h2></div>
            </div>
            <button onClick={toggleWorkingMode} style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer' }}><X size={20} /></button>
          </header>

          <main style={{ flex: 1, padding: '40px 20px', background: 'var(--bg-dark)', overflow: 'auto' }}>
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h3 style={{ color: 'white', marginBottom: '20px' }}>Beschikbare Projecten ({availableLists.length})</h3>
              {availableLists.length === 0 ? <p className="text-muted">Geen projecten toegewezen.</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {availableLists.map(list => (
                    <button key={list.id} onClick={() => setWorkingListId(list.id)} style={{ padding: '24px', background: 'var(--bg-elevated)', border: 'none', borderLeft: '4px solid var(--secondary)', borderRadius: '8px', color: 'white', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{list.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </main>
        </motion.div>
      </AnimatePresence>
    )
  }

  // STADIUM 2: LADEN OF KLAAR
  if (loading) return <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--bg-dark)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LoadingSpinner /></div>
  if (!currentLead && !loading) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'var(--bg-dark)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <h2 style={{ fontSize: '2rem', marginBottom: '16px' }}>Project Afgerond! 🎉</h2>
        <p className="text-muted">Je hebt alle leads in dit project gebeld.</p>
        <button onClick={() => setWorkingListId(null)} className="btn btn-secondary mt-4">Kies ander project</button>
      </div>
    )
  }

  // STADIUM 3: DE CRM INTERFACE UIT DE AFBEELDING
  return (
    <AnimatePresence>
      <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: '#f3f4f6', zIndex: 9999, display: 'flex', flexDirection: 'column', color: '#1f2937', overflow: 'hidden' }}>
        
        {/* Top Header */}
        <header style={{ background: 'var(--primary-dark)', color: 'white', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="flex items-center gap-4">
             <h2 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', gap: '8px', alignItems: 'center' }}><Phone size={18}/> Acquisitiegemak Beller</h2>
             <span style={{ background: 'var(--secondary)', color: 'var(--primary-dark)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>Live Counter: {sessionCallCount}</span>
          </div>
          <button onClick={closeAll} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.3)', color: 'white', padding: '4px 12px', borderRadius: '4px', cursor: 'pointer' }}><X size={16} /> Sluiten</button>
        </header>
        
        {/* Sub Header */}
        <div style={{ background: 'white', borderBottom: '1px solid #e5e7eb', padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
             <h1 style={{ margin: '0 0 8px 0', fontSize: '1.4rem' }}>{currentLead.name}</h1>
             <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--primary)' }}>Tel: {currentLead.phone}</p>
          </div>
          <div style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '6px 12px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-dark)' }}>
             &gt; Project {listName}
          </div>
        </div>

        <main style={{ flex: 1, padding: '24px 40px', overflowY: 'auto' }}>
          
          {/* Sectie: Bedrijfsgegevens */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ background: '#e5e7eb', color: '#374151', padding: '8px 12px', margin: '0 0 16px 0', borderRadius: '4px', fontSize: '1rem' }}>&gt; Bedrijfsgegevens</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '20px' }}>
              
              {/* Adres Blok */}
              <div style={{ background: 'white', border: '1px solid var(--primary)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: 'var(--primary)', color: 'white', padding: '10px 16px', fontWeight: 600 }}>Adres</div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div className="crm-input-group">
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Bedrijfsnaam</label>
                    <input type="text" value={editableLead.name || ''} onChange={e => setEditableLead({...editableLead, name: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 2 }}>
                       <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Straat</label>
                       <input type="text" value={editableLead.address || ''} onChange={e => setEditableLead({...editableLead, address: e.target.value})} placeholder="..." style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                    </div>
                    <div style={{ flex: 1 }}>
                       <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Huisnummer</label>
                       <input type="text" placeholder="..." style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1 }}>
                       <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Postcode</label>
                       <input type="text" placeholder="..." style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                    </div>
                    <div style={{ flex: 2 }}>
                       <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Plaats</label>
                       <input type="text" value={editableLead.city || ''} onChange={e => setEditableLead({...editableLead, city: e.target.value})} placeholder="..." style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contactpersoon Blok */}
              <div style={{ background: 'white', border: '1px solid var(--primary)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: 'var(--primary)', color: 'white', padding: '10px 16px', fontWeight: 600 }}>Contactpersoon</div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Contact personen</label>
                    <input type="text" placeholder="..." style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Geslacht</label>
                    <select style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px', background: 'white' }}>
                      <option>Onbekend</option><option>M</option><option>V</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Functie</label>
                    <input type="text" placeholder="..." style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                  </div>
                </div>
              </div>

              {/* Contact Blok */}
              <div style={{ background: 'white', border: '1px solid var(--primary)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ background: 'var(--primary)', color: 'white', padding: '10px 16px', fontWeight: 600 }}>Contact</div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Email</label>
                    <input type="text" value={editableLead.email || ''} onChange={e => setEditableLead({...editableLead, email: e.target.value})} placeholder="xx@hotmail.com" style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Telefoonnummer</label>
                    <input type="text" value={editableLead.phone || ''} onChange={e => setEditableLead({...editableLead, phone: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                  </div>
                  <div>
                    <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Website</label>
                    <input type="text" value={editableLead.website || ''} onChange={e => setEditableLead({...editableLead, website: e.target.value})} placeholder="www..." style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }}/>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sectie: Extra velden */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ background: 'var(--primary)', color: 'white', padding: '10px 16px', fontWeight: 600, borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>Extra velden</div>
            <div style={{ background: 'white', border: '1px solid var(--primary)', borderTop: 'none', borderBottomLeftRadius: '8px', borderBottomRightRadius: '8px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                 <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Notities / Doel</label>
                 <textarea value={editableLead.notes || ''} onChange={e => setEditableLead({...editableLead, notes: e.target.value})} rows={3} style={{ width: '100%', padding: '12px', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
              </div>
              <div>
                 <label style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block', marginBottom: '2px' }}>Datum opname</label>
                 <input type="text" value={new Date(currentLead.created_at).toLocaleDateString()} readOnly style={{ width: '100%', padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px', background: '#f9fafb' }}/>
              </div>
              <button onClick={saveLeadEdits} style={{ alignSelf: 'flex-start', background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', marginTop: '8px' }}>
                Bedrijf bewerken opslaan
              </button>
            </div>
          </div>

          {/* Sectie: Uploads */}
          <div style={{ marginBottom: '24px' }}>
             <h3 style={{ background: '#e5e7eb', color: '#374151', padding: '8px 12px', margin: '0 0 16px 0', borderRadius: '4px', fontSize: '1rem' }}>&gt; Uploads</h3>
             <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px' }}>
                <table style={{ width: '100%', textAlign: 'left', marginBottom: '20px' }}>
                   <thead><tr style={{ borderBottom: '2px solid #e5e7eb' }}><th style={{ paddingBottom: '8px', fontSize: '0.8rem', color: '#6b7280' }}>BESTANDSNAAM</th><th style={{ paddingBottom: '8px', fontSize: '0.8rem', color: '#6b7280' }}>DATUM UPLOAD</th><th style={{ paddingBottom: '8px', fontSize: '0.8rem', color: '#6b7280' }}>ACTIES</th></tr></thead>
                   <tbody><tr><td colSpan={3} style={{ paddingTop: '16px', fontSize: '0.9rem', color: '#374151' }}>Er zijn nog geen uploads.</td></tr></tbody>
                </table>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                   <input type="file" style={{ fontSize: '0.9rem' }} />
                   <button style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '4px' }}>Upload</button>
                </div>
             </div>
          </div>

        </main>

        {/* Action Bar Bottom (Afboeken) */}
        <div style={{ background: 'white', borderTop: '2px solid #e5e7eb', padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           
           {showDatePicker ? (
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%' }}>
                <strong style={{ color: 'var(--primary)' }}>TBA Inplannen:</strong>
                <input type="datetime-local" value={callbackDate} onChange={e=>setCallbackDate(e.target.value)} style={{ padding: '8px', border: '1px solid #e5e7eb', borderRadius: '4px' }} />
                <button onClick={handleCallbackScheduled} className="btn btn-secondary">Inplannen</button>
                <button onClick={()=>setShowDatePicker(false)} className="btn btn-outline">Annuleer</button>
              </div>
           ) : (
              <>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <button onClick={() => handleAfboeken('deal')} style={{ background: 'var(--success)', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'white' }}>
                     🏆 BRUTO Deal
                  </button>
                  <button onClick={() => handleAfboeken('afspraak_gemaakt')} style={{ background: 'var(--info)', border: 'none', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'white' }}>
                     📅 BRUTO Afspraak
                  </button>
                  <button onClick={() => handleAfboeken('later_bellen')} style={{ background: 'white', border: '1px solid #d1d5db', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#374151' }}>
                     <Clock size={16}/> Later bellen
                  </button>
                  <button onClick={() => handleAfboeken('geen_interesse')} style={{ background: '#fef2f2', border: '1px solid #fca5a5', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}>
                     Geen interesse
                  </button>
                  <button onClick={() => handleAfboeken('terugbelopdracht')} style={{ background: '#fef9c3', border: '1px solid #fde047', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#ca8a04' }}>
                     <CalendarIcon size={16}/> Terugbelopdracht
                  </button>
                  <button onClick={() => handleAfboeken('niet_bereikbaar')} style={{ background: '#fffbeb', border: '1px solid #fcd34d', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#d97706' }}>
                     Niet bereikbaar
                  </button>
                  <button onClick={() => handleAfboeken('verkeerde_info')} style={{ background: '#f3e8ff', border: '1px solid #d8b4fe', padding: '10px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: '#9333ea' }}>
                     Verkeerde info
                  </button>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>Leads: {currentIndex+1}/{leads.length}</div>
              </>
           )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
