// v97: popup voor één afspraak in de agenda.
// - Iedereen: klantgegevens, contactpersoon, bellen, adres met navigatie, sentiment.
// - Accountmanager van de afspraak (en admin/manager): afboeken als
//   Wil nadenken / Deal / Betaald.
// - Admin/manager: verplaatsen (datum/tijd en accountmanager) en verwijderen.
// v110: blok "Uitbetaling beller" - wie de afspraak inplande en wat hij ervoor
//   krijgt. Alleen admin/manager kan het bedrag zetten (DB-trigger bewaakt dat);
//   de beller ziet het terug op zijn pagina "Mijn afspraken" en krijgt een melding.
import { useState, useEffect } from 'react'
import { X, MapPin, Phone, Mail, User, Navigation, Trash2, CalendarClock, FileText, Euro } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import { APPOINTMENT_TYPES, appointmentMinutes, appointmentLabel, duurTekst } from '../lib/appointmentConfig'
import { OUTCOMES, sentimentInfo, outcomeInfo, leadAddressText, navigationUrl, findAppointmentConflict } from '../lib/appointments'
import PersonSelect from './PersonSelect' // v102

function pad(n) { return String(n).padStart(2, '0') }
function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function fmt(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' ' + `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AppointmentModal({ lead, accountmanagers = [], canManage, onClose, onChanged, onOpenContactCard }) {
  const { user } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [moveAt, setMoveAt] = useState('')
  const [moveAm, setMoveAm] = useState('')
  const [moveError, setMoveError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // v110: uitbetaling voor de beller die deze afspraak inplande
  const [bellerNaam, setBellerNaam] = useState('')
  const [commissie, setCommissie] = useState('')
  const [tariefTip, setTariefTip] = useState(null)
  const [commissieOpgeslagen, setCommissieOpgeslagen] = useState(false)

  useEffect(() => {
    if (!lead) return
    setMoveAt(toLocalInput(lead.appointment_at))
    setMoveAm(lead.assigned_to || '')
    setMoveError(null)
    setConfirmDelete(false)
    setCommissie(lead.appointment_commission != null ? String(lead.appointment_commission) : '')
    setCommissieOpgeslagen(false)
  }, [lead])

  // v110: naam van de beller die de afspraak inplande + het afspraaktarief van
  // de lijst als voorstel voor het bedrag.
  useEffect(() => {
    if (!lead) return
    let weg = false
    async function laden() {
      if (lead.appointment_by) {
        const { data } = await supabase.from('profiles').select('full_name').eq('id', lead.appointment_by).maybeSingle()
        if (!weg) setBellerNaam(data?.full_name || 'Onbekend')
      } else if (!weg) setBellerNaam('')
      if (lead.lead_list_id) {
        const { data } = await supabase.from('lead_lists').select('rate_per_appointment').eq('id', lead.lead_list_id).maybeSingle()
        if (!weg) setTariefTip(data?.rate_per_appointment ?? null)
      }
    }
    laden()
    return () => { weg = true }
  }, [lead?.id, lead?.appointment_by, lead?.lead_list_id])

  if (!lead) return null

  const amName = accountmanagers.find(a => a.id === lead.assigned_to)?.full_name || 'Onbekend'
  const adres = leadAddressText(lead)
  const navUrl = navigationUrl(lead)
  const sentiment = sentimentInfo(lead.appointment_sentiment)
  const outcome = outcomeInfo(lead.appointment_outcome)
  const canAfboeken = canManage || lead.assigned_to === user?.id
  const end = new Date(new Date(lead.appointment_at).getTime() + appointmentMinutes(lead) * 60000)

  async function logAct(action, notes) {
    try { await supabase.from('activities').insert({ lead_id: lead.id, user_id: user.id, action, notes }) } catch { /* niet blokkerend */ }
  }

  async function afboeken(o) {
    if (busy) return
    setBusy(true)
    const updates = {
      appointment_outcome: o.id,
      appointment_outcome_at: new Date().toISOString(),
      appointment_outcome_by: user.id,
      status: o.leadStatus,
      updated_at: new Date().toISOString(),
    }
    if (o.leadStatus === 'deal' && !lead.sale_date) updates.sale_date = new Date().toISOString()
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    setBusy(false)
    if (error) { toast(error.message || 'Afboeken mislukt', 'error'); return }
    logAct('afspraak_uitkomst', `Afspraak afgeboekt: ${o.label}`)
    toast(`Afspraak afgeboekt als "${o.label}"`, 'success')
    onChanged?.(lead.id, updates)
  }

  // v110: bedrag dat de beller voor deze afspraak krijgt. Leeg maken mag ook
  // (dan staat de uitbetaling weer op "nog niet vastgesteld").
  async function commissieOpslaan() {
    if (busy) return
    const tekst = String(commissie).replace(',', '.').trim()
    const bedrag = tekst === '' ? null : Number(tekst)
    if (bedrag !== null && (isNaN(bedrag) || bedrag < 0)) { toast('Vul een geldig bedrag in', 'error'); return }
    setBusy(true)
    const updates = { appointment_commission: bedrag, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    setBusy(false)
    if (error) { toast(error.message || 'Opslaan mislukt', 'error'); return }
    setCommissieOpgeslagen(true)
    logAct('afspraak_commissie', bedrag === null ? 'Uitbetaling beller leeggemaakt' : `Uitbetaling beller gezet op EUR ${bedrag}`)
    toast(bedrag === null ? 'Uitbetaling leeggemaakt' : `Uitbetaling van EUR ${bedrag} opgeslagen`, 'success')
    onChanged?.(lead.id, updates)
  }

  async function verplaatsen() {
    if (busy || !moveAt) return
    setMoveError(null)
    setBusy(true)
    const start = new Date(moveAt)
    const amId = moveAm || lead.assigned_to
    const conflict = await findAppointmentConflict({ amId, start, excludeLeadId: lead.id, type: lead.appointment_type })
    if (conflict) { setBusy(false); setMoveError(conflict + '. Kies een ander moment.'); return }
    const updates = { appointment_at: start.toISOString(), assigned_to: amId, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    setBusy(false)
    if (error) { toast(error.message || 'Verplaatsen mislukt', 'error'); return }
    const nieuweAm = accountmanagers.find(a => a.id === amId)?.full_name
    logAct('afspraak_verplaatst', `Afspraak verplaatst naar ${fmt(start.toISOString())}${amId !== lead.assigned_to && nieuweAm ? ` (${nieuweAm})` : ''}`)
    toast('Afspraak verplaatst', 'success')
    onChanged?.(lead.id, updates)
  }

  // v124: soort wijzigen (shoot <-> bezoek). De nieuwe duur moet nog passen
  // bij de accountmanager, dus dezelfde conflictcheck als bij verplaatsen.
  // appointment_at gaat (ongewijzigd) mee in de update zodat de Google
  // Agenda-trigger (v114, luistert op die kolom) het event ook bijwerkt.
  async function soortWijzigen(typeId) {
    if (busy || typeId === (lead.appointment_type || APPOINTMENT_TYPES[0].id)) return
    setMoveError(null)
    setBusy(true)
    const conflict = await findAppointmentConflict({ amId: lead.assigned_to, start: lead.appointment_at, excludeLeadId: lead.id, type: typeId })
    if (conflict) { setBusy(false); setMoveError(`${conflict}. Past niet als ${appointmentLabel(typeId).toLowerCase()}.`); return }
    const updates = { appointment_type: typeId, appointment_at: lead.appointment_at, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    setBusy(false)
    if (error) { toast(error.message || 'Soort niet gewijzigd', 'error'); return }
    logAct('afspraak_soort', `Soort afspraak gewijzigd naar ${appointmentLabel(typeId)} (${duurTekst(appointmentMinutes(typeId))})`)
    toast(`Afspraak is nu een ${appointmentLabel(typeId).toLowerCase()}`, 'success')
    onChanged?.(lead.id, updates)
  }

  // Verwijderen = afspraak eraf, lead terug in de belwachtrij (vrij voor iedereen)
  async function verwijderen() {
    if (busy) return
    if (!confirmDelete) { setConfirmDelete(true); return }
    setBusy(true)
    const updates = {
      appointment_at: null, status: 'later_bellen', next_contact_date: new Date().toISOString(),
      assigned_to: null, locked_by: null, appointment_outcome: null, appointment_outcome_at: null,
      appointment_outcome_by: null, updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    setBusy(false)
    if (error) { toast(error.message || 'Verwijderen mislukt', 'error'); return }
    logAct('afspraak_verwijderd', `Afspraak van ${fmt(lead.appointment_at)} verwijderd, lead terug naar "Later bellen"`)
    toast('Afspraak verwijderd, lead staat weer op "Later bellen"', 'success')
    onChanged?.(lead.id, updates, { removed: true })
    onClose()
  }

  const row = { display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.9rem', color: 'var(--text-primary)' }
  const sectionTitle = { fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: 'var(--text-muted)', margin: '18px 0 8px' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18, width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto', padding: 22, position: 'relative' }}>
        <button onClick={onClose} aria-label="Sluiten" style={{ position: 'absolute', top: 14, right: 14, background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>

        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>{appointmentLabel(lead)} · {duurTekst(appointmentMinutes(lead))}</div>
        <h2 style={{ margin: '2px 0 4px', fontSize: '1.2rem', paddingRight: 28 }}>{lead.name}</h2>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
          {fmt(lead.appointment_at)} - {pad(end.getHours())}:{pad(end.getMinutes())} · {amName}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {sentiment && (
            <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 9px', borderRadius: 6, color: sentiment.color, background: `${sentiment.color}22` }}>
              {sentiment.emoji} Klant {sentiment.label.toLowerCase()}
            </span>
          )}
          {outcome && (
            <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 9px', borderRadius: 6, color: '#fff', background: outcome.color }}>
              {outcome.label}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {lead.contact_person && <div style={row}><User size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {lead.contact_person}</div>}
          {lead.phone && (
            <a href={`tel:${lead.phone}`} style={{ ...row, color: 'var(--primary)', textDecoration: 'none', fontWeight: 700 }}>
              <Phone size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {lead.phone}
            </a>
          )}
          {lead.email && <a href={`mailto:${lead.email}`} style={{ ...row, color: 'var(--primary)', textDecoration: 'none' }}><Mail size={16} style={{ flexShrink: 0, marginTop: 2 }} /> {lead.email}</a>}
          {navUrl ? (
            <a
              href={navUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--primary)', background: 'rgba(59,130,246,0.1)', color: 'var(--text-primary)', textDecoration: 'none' }}
            >
              <MapPin size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontWeight: 700 }}>{adres}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', fontWeight: 800, color: 'var(--primary)' }}><Navigation size={14} /> Navigeer</span>
            </a>
          ) : (
            <div style={{ ...row, color: 'var(--text-muted)' }}><MapPin size={16} /> Geen adres opgegeven</div>
          )}
          {lead.notes && (
            <div style={{ ...row, fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}><FileText size={15} style={{ flexShrink: 0, marginTop: 2 }} /> {lead.notes}</div>
          )}
        </div>

        {canAfboeken && (
          <>
            <div style={sectionTitle}>Afspraak afboeken</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {OUTCOMES.map(o => {
                const actief = lead.appointment_outcome === o.id
                return (
                  <button
                    key={o.id}
                    type="button"
                    disabled={busy}
                    onClick={() => afboeken(o)}
                    style={{
                      flex: 1, padding: '12px 6px', borderRadius: 10, fontWeight: 800, fontSize: '0.85rem', cursor: busy ? 'wait' : 'pointer',
                      border: `2px solid ${o.color}`, background: actief ? o.color : 'transparent', color: actief ? '#fff' : o.color
                    }}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {lead.appointment_by && (
          <>
            <div style={sectionTitle}>Uitbetaling beller</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ ...row, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <User size={15} style={{ flexShrink: 0, marginTop: 2 }} /> Ingepland door <strong style={{ color: 'var(--text-primary)' }}>{bellerNaam || '...'}</strong>
              </div>
              {canManage ? (
                <>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, color: 'var(--text-muted)' }}>&euro;</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={commissie}
                      onChange={e => { setCommissie(e.target.value); setCommissieOpgeslagen(false) }}
                      placeholder={tariefTip != null ? String(tariefTip) : 'Bedrag'}
                      className="form-control"
                      style={{ flex: 1, fontSize: 16 }}
                    />
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={commissieOpslaan}>
                      <Euro size={15} /> {commissieOpgeslagen ? 'Opgeslagen' : 'Opslaan'}
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Wat {bellerNaam || 'de beller'} voor deze afspraak krijgt. Hij ziet dit direct terug bij "Mijn afspraken" en krijgt er een melding van.
                    {tariefTip != null ? ` Tarief van deze lijst: EUR ${tariefTip}.` : ''}
                  </div>
                </>
              ) : (
                <div style={{ ...row, fontSize: '0.85rem' }}>
                  <Euro size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                  {lead.appointment_commission != null ? `EUR ${lead.appointment_commission}` : 'Nog niet vastgesteld'}
                </div>
              )}
            </div>
          </>
        )}

        {canManage && (
          <>
            <div style={sectionTitle}>Soort afspraak</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {APPOINTMENT_TYPES.map(t => {
                const actief = (lead.appointment_type || APPOINTMENT_TYPES[0].id) === t.id
                return (
                  <button key={t.id} type="button" disabled={busy} title={t.uitleg} onClick={() => soortWijzigen(t.id)}
                    style={{ flex: 1, padding: '8px 4px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', fontWeight: 800, fontSize: '0.8rem',
                      border: `2px solid ${actief ? 'var(--primary)' : 'var(--border)'}`, background: actief ? 'var(--accent-soft)' : 'transparent',
                      color: actief ? 'var(--primary)' : 'var(--text-primary)' }}>
                    {t.label} <span style={{ fontWeight: 500, opacity: 0.8 }}>({duurTekst(t.minutes)})</span>
                  </button>
                )
              })}
            </div>

            <div style={sectionTitle}>Verplaatsen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input type="datetime-local" step="900" value={moveAt} onChange={e => { setMoveAt(e.target.value); setMoveError(null) }} className="form-control" style={{ width: '100%', fontSize: 16 }} />
              {accountmanagers.length > 1 && (
                <PersonSelect people={accountmanagers} value={moveAm || lead.assigned_to || ''} onChange={id => { setMoveAm(id); setMoveError(null) }} placeholder="Kies een accountmanager" className="form-control" style={{ width: '100%' }} />
              )}
              {moveError && <div style={{ color: 'var(--error, #EF4444)', fontSize: '0.82rem', fontWeight: 700 }}>{moveError}</div>}
              <button type="button" className="btn btn-primary" disabled={busy || !moveAt} onClick={verplaatsen}>
                <CalendarClock size={15} /> Verplaats afspraak
              </button>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Je kunt een afspraak ook in de weekagenda naar een ander moment slepen.</div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={verwijderen}
              className="btn btn-outline"
              style={{ width: '100%', marginTop: 16, color: 'var(--error, #EF4444)', borderColor: 'var(--error, #EF4444)' }}
            >
              <Trash2 size={15} /> {confirmDelete ? 'Zeker weten? Klik nogmaals' : 'Afspraak verwijderen'}
            </button>
          </>
        )}

        {onOpenContactCard && (
          <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 10 }} onClick={() => onOpenContactCard(lead)}>
            Open contactkaart
          </button>
        )}
      </div>
    </div>
  )
}
