import { User, PhoneOff, Mail, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { getTimeAgo, formatDateTime } from '../utils/dateUtils';

const ActionIcon = ({ action }) => {
  const actionLower = action.toLowerCase();
  if (actionLower.includes('status')) return <Clock size={16} className="text-muted" />;
  if (actionLower.includes('afspraak')) return <CheckCircle size={16} style={{ color: 'var(--success)' }} />;
  if (actionLower.includes('interesse')) return <PhoneOff size={16} style={{ color: 'var(--danger)' }} />;
  if (actionLower.includes('mail')) return <Mail size={16} style={{ color: 'var(--info)' }} />;
  return <AlertCircle size={16} className="text-muted" />;
};

export default function ActivityFeed({ activities = [] }) {
  if (activities.length === 0) {
    return <div className="text-muted text-center p-8">Geen recente activiteiten</div>;
  }

  return (
    <div className="activity-feed">
      {activities.map((activity, index) => (
        <div 
          key={activity.id} 
          className="activity-item" 
          style={{ 
            display: 'flex', 
            gap: '16px', 
            padding: '16px 0', 
            borderBottom: index === activities.length - 1 ? 'none' : '1px solid var(--border)',
            position: 'relative'
          }}
        >
          <div className="activity-icon-wrapper" style={{ 
            width: '32px', 
            height: '32px', 
            borderRadius: '50%', 
            background: 'var(--bg-light)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <ActionIcon action={activity.action} />
          </div>
          
          <div className="activity-content" style={{ flex: 1 }}>
            <div className="flex justify-between items-start">
              <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>
                {activity.user?.full_name || 'Systeem'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }} title={formatDateTime(activity.created_at)}>
                {getTimeAgo(activity.created_at)}
              </span>
            </div>
            <p style={{ fontSize: '0.9rem', margin: '4px 0', color: 'var(--text-main)' }}>
              {activity.action} voor <strong>{activity.lead?.name || 'onbekende lead'}</strong>
            </p>
            {activity.notes && (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', background: 'rgba(0,0,0,0.02)', padding: '4px 8px', borderRadius: '4px', marginTop: '4px' }}>
                "{activity.notes}"
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
