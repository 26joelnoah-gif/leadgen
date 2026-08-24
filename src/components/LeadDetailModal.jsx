import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  X, Phone, Mail, Globe, MapPin, User, Briefcase, Calendar,
  History, StickyNote, ExternalLink, Star
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getStatusDetails } from '../utils/statusUtils'
import { formatDateTime } from '../utils/dateUtils'
import { normalizeWebsite, displayWebsite } from '../utils/urlUtils'
import CopyButton from './CopyButton'
import LoadingSpinner from './LoadingSpinner'

function fmtDuration(sec) {
  const s = Math.max(0, Math.round(sec || 0))
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m === 0) return `${rem}s`
  return `${m}m ${rem}s`
}

// v36: contactkaart voor een lead - opent als je in de leadlijst (Admin ->
// Projecten & Leads) op een rij klikt. Toont de volledige leadgegevens plus
// de afboek-geschiedenis (call_logs: wie, wanneer, welke dispositie, notitie
// bij dat specifieke gesprek) - dus per beller, niet alleen de ene lopende
// notitie die al in de tabel stond.
export default function LeadDetailModal({ isOpen, onClose, lead, assignedName }) {
  const [callLogs, setCallLogs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isOpen || !lead?.id) return
    let cancelled = false
    setLoading(true)
    setCallLogs([])
    supabase
      .from('call_logs')
      .select('id, disposition, disposed_at, duration_seconds, notes, agent:profiles!agent_id(full_name)')
      .eq('lead_id', lead.id)
      .order('disposed_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setCallLogs(data || [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [isOpen, lead?.id])

  if (!isOpen || !lead) return null

  const statusDetails = getStatusDetails(lead.status)
  const addressLine = [lead.address, lead.house_number].filter(Boolean).join(' ')
  const cityLine = [lead.postal_code, lead.city].filter(Boolean).join(' ')
  const extras = [
    ['Extra info 1', lead.extra_info1],
    ['Extra info 2', lead.extra_info2],
    ['Extra info 3', lead.extra_info3]
  ].filter(([, v]) => (v || '').trim())

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="modal glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '640px', width: '100%' }}
      >
        <div className="modal-header" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ overflowWrap: 'break-word' }}>{lead.name}</h2>
            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap', marginTop: '8px' }}>
              <span className="status" style={{ background: statusDetails.bg, color: statusDetails.color }}>
                {statusDetails.label}
              </span>
              {lead.decision_maker && (
                <span className="status" style={{ background: 'var(--secondary)', color: 'var(--primary-dark)' }}>
                  <Star size={11} fill="currentColor" /> Beslisser
                </span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ flexShrink: 0 }}><X size={18} /></button>
        </div>

        {/* Contactgegevens */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
          <div className="flex items-center gap-2 text-muted" style={{ minWidth: 0 }}>
            <Phone size={15} style={{ flexShrink: 0 }} />
            {lead.phone ? (
              <>
                <a href={`tel:${lead.phone}`} style={{ color: 'var(--text-main)', fontWeight: 600, overflowWrap: 'break-word' }}>{lead.phone}</a>
                <CopyButton text={lead.phone} label="Kopieer telefoonnummer" />
              </>
            ) : <span>Geen telefoon</span>}
          </div>
          <div className="flex items-center gap-2 text-muted" style={{ minWidth: 0 }}>
            <Mail size={15} style={{ flexShrink: 0 }} />
            {lead.email ? (
              <>
                <a href={`mailto:${lead.email}`} style={{ color: 'var(--text-main)', fontWeight: 600, overflowWrap: 'break-word', minWidth: 0 }}>{lead.email}</a>
                <CopyButton text={lead.email} label="Kopieer e-mailadres" />
              </>
            ) : <span>Geen e-mail</span>}
          </div>
          <div className="flex items-center gap-2 text-muted" style={{ minWidth: 0 }}>
            <Globe size={15} style={{ flexShrink: 0 }} />
            {lead.website ? (
              <a
                href={normalizeWebsite(lead.website) || lead.website}
                target="_blank" rel="nofollow noopener noreferrer" referrerPolicy="no-referrer"
                className="flex items-center gap-1"
                style={{ color: 'var(--text-main)', fontWeight: 600, overflowWrap: 'break-word', minWidth: 0 }}
              >
                {displayWebsite(lead.website)} <ExternalLink size={12} style={{ flexShrink: 0 }} />
              </a>
            ) : <span>Geen website</span>}
          </div>
          <div className="flex items-center gap-2 text-muted" style={{ minWidth: 0 }}>
            <MapPin size={15} style={{ flexShrink: 0 }} />
            <span style={{ overflowWrap: 'break-word' }}>{[addressLine, cityLine].filter(Boolean).join(', ') || 'Geen adres'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted" style={{ minWidth: 0 }}>
            <User size={15} style={{ flexShrink: 0 }} />
            <span style={{ overflowWrap: 'break-word' }}>{lead.contact_person || 'Geen contactpersoon'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted" style={{ minWidth: 0 }}>
            <Briefcase size={15} style={{ flexShrink: 0 }} />
            <span style={{ overflowWrap: 'break-word' }}>{lead.function || 'Geen functie bekend'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted" style={{ minWidth: 0 }}>
            <Calendar size={15} style={{ flexShrink: 0 }} />
            <span>Toegevoegd: {formatDateTime(lead.created_at)}</span>
          </div>
          <div className="flex items-center gap-2 text-muted" style={{ minWidth: 0 }}>
            <User size={15} style={{ flexShrink: 0 }} />
            <span>Toegewezen aan: {assignedName || 'Niemand'}</span>
          </div>
        </div>

        {extras.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '20px' }}>
            {extras.map(([label, value]) => (
              <div key={label} style={{ fontSize: '0.85rem' }}>
                <span className="text-muted">{label}:</span> <span style={{ overflowWrap: 'break-word' }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {(lead.notes || '').trim() && (
          <div style={{ marginBottom: '20px' }}>
            <div className="text-[10px] font-black uppercase text-muted tracking-widest mb-2" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <StickyNote size={12} /> Notities
            </div>
            <div style={{
              padding: '12px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', maxHeight: '160px', overflowY: 'auto'
            }}>
              {lead.notes}
            </div>
          </div>
        )}

        <div>
          <div className="text-[10px] font-black uppercase text-muted tracking-widest mb-2" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <History size={12} /> Afboek-geschiedenis ({callLogs.length})
          </div>
          {loading ? (
            <div style={{ padding: '20px 0' }}><LoadingSpinner /></div>
          ) : callLogs.length === 0 ? (
            <p className="text-muted" style={{ fontSize: '0.85rem', fontStyle: 'italic' }}>Nog geen gesprekken gelogd voor deze lead.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {callLogs.map(log => {
                const d = getStatusDetails(log.disposition)
                return (
                  <div key={log.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', borderRadius: '8px', borderLeft: `3px solid ${d.color}` }}>
                    <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{d.label}</span>
                      <span className="text-muted" style={{ fontSize: '0.72rem' }}>{formatDateTime(log.disposed_at)}</span>
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.75rem', marginTop: '2px' }}>
                      {log.agent?.full_name || 'Onbekende beller'}
                      {log.duration_seconds ? ` · ${fmtDuration(log.duration_seconds)}` : ''}
                    </div>
                    {log.notes && (
                      <div style={{ fontSize: '0.82rem', marginTop: '6px', overflowWrap: 'break-word' }}>{log.notes}</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
