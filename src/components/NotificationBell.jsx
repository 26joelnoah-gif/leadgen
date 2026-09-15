import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '../hooks/useNotifications'
import { useToast } from './Toast'

// v75: belletje in de header met je eigen meldingen. Nu vooral: "X heeft een
// lead van je overgenomen". Komt er live een melding binnen, dan zie je hem
// ook meteen als toast, want juist dat moment wil je niet missen.
const tijd = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const min = Math.round((Date.now() - d.getTime()) / 60000)
  if (min < 1) return 'net'
  if (min < 60) return `${min} min geleden`
  if (min < 60 * 24) return `${Math.round(min / 60)} uur geleden`
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export default function NotificationBell() {
  const { items, unread, markAllRead, onNieuw } = useNotifications()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => { onNieuw((n) => toast(n.title, 'info', 8000)) }, [onNieuw]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const klik = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', klik)
    return () => document.removeEventListener('mousedown', klik)
  }, [open])

  function toggle() {
    const nieuw = !open
    setOpen(nieuw)
    if (nieuw && unread > 0) markAllRead()
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={toggle}
        aria-label={unread > 0 ? `${unread} nieuwe meldingen` : 'Meldingen'}
        title="Meldingen"
        style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '6px', position: 'relative', display: 'flex' }}
      >
        <Bell size={18} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0, minWidth: 15, height: 15, borderRadius: 8,
            background: 'var(--danger, #EF4444)', color: '#fff', fontSize: '0.6rem', fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px'
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 300, maxHeight: 360, overflowY: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, zIndex: 3000,
          boxShadow: '0 12px 30px rgba(0,0,0,0.35)'
        }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 800, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
            MELDINGEN
          </div>
          {items.length === 0 ? (
            <p className="text-muted" style={{ padding: '16px 14px', margin: 0, fontSize: '0.85rem' }}>Nog geen meldingen.</p>
          ) : items.map(n => (
            <div key={n.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
              <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-primary)', fontWeight: 600 }}>{n.title}</p>
              {n.body && <p className="text-muted" style={{ margin: '2px 0 0', fontSize: '0.78rem' }}>{n.body}</p>}
              <p className="text-muted" style={{ margin: '2px 0 0', fontSize: '0.7rem' }}>{tijd(n.created_at)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
