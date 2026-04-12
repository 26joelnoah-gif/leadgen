import { Phone, Globe, MapPin, Calendar, ExternalLink } from 'lucide-react';
import { getStatusDetails } from '../utils/statusUtils';
import { formatDate } from '../utils/dateUtils';
import StatusSelector from './StatusSelector';

export default function LeadCard({ lead, onStatusChange, loading = false, callEnabled = true }) {
  const statusDetails = getStatusDetails(lead.status);

  return (
    <div className="card mb-2 glow-hover">
      <div className="flex justify-between items-center mb-2">
        <h3 className="lead-name" style={{ fontSize: '1.2rem', color: 'var(--primary)' }}>
          {lead.name}
        </h3>
        <div className="flex items-center gap-2">
          <StatusSelector
            currentStatus={lead.status}
            onStatusChange={(newStatus) => onStatusChange(lead.id, newStatus)}
            loading={loading}
          />
          {callEnabled && (
            <a
              href={`tel:${lead.phone}`}
              className="btn btn-success btn-sm"
              style={{ textDecoration: 'none' }}
              title="Bel deze lead"
            >
              <Phone size={14} />
            </a>
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

      {lead.notes && (
        <div style={{ padding: '12px', background: 'var(--bg-light)', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', borderLeft: '4px solid var(--secondary)' }}>
          <strong>Laatste notitie:</strong> {lead.notes}
        </div>
      )}
    </div>
  );
}