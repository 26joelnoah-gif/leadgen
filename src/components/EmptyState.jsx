import { Inbox } from 'lucide-react';

export default function EmptyState({ 
  title = 'Geen gegevens gevonden', 
  message = 'Er zijn op dit moment geen items om weer te geven.',
  icon: Icon = Inbox
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon size={48} strokeWidth={1} />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}