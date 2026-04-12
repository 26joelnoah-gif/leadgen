import { STATUS_MAP } from '../utils/statusUtils';

export default function StatusSelector({ currentStatus, onStatusChange, loading = false }) {
  return (
    <select 
      className="status-select"
      value={currentStatus}
      onChange={(e) => onStatusChange(e.target.value)}
      disabled={loading}
      style={{
        background: STATUS_MAP[currentStatus]?.bg || '#fff',
        color: STATUS_MAP[currentStatus]?.color || '#000',
        fontWeight: '700',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        padding: '8px 12px',
        fontSize: '0.8rem',
        textTransform: 'uppercase',
        transition: 'all 0.2s',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      {Object.entries(STATUS_MAP).map(([key, details]) => (
        <option key={key} value={key} style={{ background: '#fff', color: '#000', fontWeight: 'normal' }}>
          {details.label}
        </option>
      ))}
    </select>
  );
}