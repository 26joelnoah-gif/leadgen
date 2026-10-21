// v152: startscherm voor bellers in een project met werkwijze "lead voor lead"
// (campaigns.werkwijze = 'lvl' of profiles.werkwijze = 'lvl'). Geen bord of
// lijst om uit te kiezen: de beller drukt op Start bellen en krijgt steeds de
// volgende lead uit de wachtrij (WorkInterface in belmodus, claim_next_lead).
import { PhoneCall, ListOrdered } from 'lucide-react'

export default function LvlStart({ projects, projectId, onProject, lists, onStart, isWorking }) {
  const enkel = lists.length === 1
  return (
    <div style={{ maxWidth: 560, margin: '24px auto 0' }}>
      {projects.length > 1 && (
        <select
          className="form-control"
          value={projectId || ''}
          onChange={e => onProject(e.target.value)}
          style={{ marginBottom: 16, width: '100%' }}
          title="Project"
        >
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      )}
      <div className="card" style={{ padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-soft)', color: 'var(--primary)' }}>
          <ListOrdered size={28} />
        </div>
        <h2 style={{ margin: '0 0 6px', fontSize: '1.25rem' }}>Lead voor lead</h2>
        <p className="text-muted" style={{ margin: '0 auto 20px', maxWidth: 420, fontSize: '0.9rem' }}>
          In dit project kies je niet zelf. Druk op Start bellen en je krijgt steeds de volgende lead.
          Je eigen terugbelafspraken komen als eerste.
        </p>
        {enkel ? (
          <button type="button" className="btn btn-primary" style={{ padding: '12px 28px', fontWeight: 800 }} onClick={() => onStart(lists[0].id)} disabled={isWorking}>
            <PhoneCall size={18} /> {isWorking ? 'Je bent al aan het bellen' : 'Start bellen'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lists.map(l => (
              <button
                key={l.id}
                type="button"
                className="btn btn-outline"
                style={{ justifyContent: 'space-between', padding: '12px 16px' }}
                onClick={() => onStart(l.id)}
                disabled={isWorking}
              >
                <span style={{ fontWeight: 700, overflowWrap: 'anywhere', textAlign: 'left' }}>{l.name}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800, color: 'var(--primary)', flexShrink: 0 }}>
                  <PhoneCall size={16} /> Start bellen
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
