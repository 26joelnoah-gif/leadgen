import { motion } from 'framer-motion';
import { Phone, Globe, MapPin, Calendar, ExternalLink, Zap, Flame, Clock, PhoneCall } from 'lucide-react';
import { getStatusDetails } from '../utils/statusUtils';
import { formatDate } from '../utils/dateUtils';
import StatusSelector from './StatusSelector';
import { useAuth } from '../context/AuthContext';

export default function LeadCard({ lead, onStatusChange, loading = false, callEnabled = true }) {
  const { logCall } = useAuth();
  const statusDetails = getStatusDetails(lead.status);

  // Lead scoring based on status
  const isHot = lead.status === 'new' || lead.status === 'terugbelafspraak';
  const isWarm = lead.status === 'afspraak_gemaakt' || lead.status === 'later_bellen';

  const contactAttempts = lead.contact_attempts || 0;
  const lastCalled = lead.last_called_at ? formatDate(lead.last_called_at) : null;

  return (
    <div className="card mb-2 glow-hover" style={{ position: 'relative' }}>
      {isHot && (
        <div style={{
          position: 'absolute',
          top: -8,
          right: 16,
          background: 'linear-gradient(135deg, #EF4444 0%, #F97316 100%)',
          color: 'white',
          padding: '4px 12px',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.7rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          <Flame size={12} /> HOT
        </div>
      )}
      {isWarm && !isHot && (
        <div style={{
          position: 'absolute',
          top: -8,
          right: 16,
          background: 'linear-gradient(135deg, #F59E0B 0%, #FBBF24 100%)',
          color: 'white',
          padding: '4px 12px',
          borderRadius: 'var(--radius-full)',
          fontSize: '0.7rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}>
          <Zap size={12} /> WARM
        </div>
      )}
      <div className="flex justify-between items-center mb-2">
        <h3 className="lead-name" style={{ fontSize: '1.2rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {lead.name}
          {lead.lead_score > 0 && (
            <span style={{ background: 'var(--secondary)', color: 'var(--primary-dark)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Zap size={10} fill="currentColor" /> {lead.lead_score}
            </span>
          )}
        </h3>
        <div className="flex items-center gap-2">
          <StatusSelector
            currentStatus={lead.status}
            onStatusChange={(newStatus) => onStatusChange(lead.id, newStatus)}
            loading={loading}
          />
          {callEnabled && (
            <motion.a
              whileHover={{ scale: 1.1, boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)' }}
              whileTap={{ scale: 0.9 }}
              href={`tel:${lead.phone}`}
              onClick={() => logCall(lead.id, lead.name)}
              className="btn btn-success btn-sm"
              style={{
                textDecoration: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--success)',
                color: 'white',
                border: 'none',
                boxShadow: '0 4px 10px rgba(16, 185, 129, 0.2)'
              }}
              title="Bel deze lead"
            >
              <Phone size={14} />
            </motion.a>
          )}
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '16px', marginTop: '16px' }}>
        <div className="flex items-center gap-2 text-muted">
          <Phone size={16} />
          <span className="lead-phone">{lead.phone || 'Geen telefoon'}</span>
        </div>
        <div className="flex items-center gap-2 text-muted">
          <Globe size={16} />
          {lead.website ? (
            <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
              Website <ExternalLink size={12} />
            </a>
          ) : (
            <span>Geen website</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted">
          <MapPin size={16} />
          <span style={{ fontSize: '0.85rem' }}>{lead.city || 'Onbekende stad'}</span>
        </div>
        <div className="flex items-center gap-2 text-muted">
          <Calendar size={16} />
          <span style={{ fontSize: '0.85rem' }}>Toegevoegd: {formatDate(lead.created_at)}</span>
        </div>
      </div>

      {/* Contact attempts and last called */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', padding: '10px', background: contactAttempts > 0 ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)', borderRadius: '8px' }}>
        <div className="flex items-center gap-2" style={{ fontSize: '0.85rem' }}>
          <PhoneCall size={14} style={{ color: contactAttempts > 2 ? '#EF4444' : '#6B7280' }} />
          <span className="text-muted">Gebeld:</span>
          <span style={{ fontWeight: 700 }}>{contactAttempts}x</span>
          {contactAttempts >= 3 && <span style={{ fontSize: '0.7rem', color: '#EF4444', fontWeight: 600 }}>(koud)</span>}
        </div>
        {lastCalled && (
          <div className="flex items-center gap-2" style={{ fontSize: '0.85rem' }}>
            <Clock size={14} className="text-muted" />
            <span className="text-muted">Laatst:</span>
            <span style={{ fontWeight: 600 }}>{lastCalled}</span>
          </div>
        )}
      </div>

      {lead.notes && (
        <div style={{ padding: '12px', background: 'var(--bg-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', borderLeft: '4px solid var(--secondary)' }}>
          <strong>Laatste notitie:</strong> {lead.notes}
        </div>
      )}
    </div>
  );
}