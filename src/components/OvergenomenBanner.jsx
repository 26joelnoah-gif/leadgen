// v145: banner in het belscherm als een lead is overgenomen van een collega
// die gestopt is (leads.overgenomen_van). Er was al contact, dus eerst de
// notitie lezen. Verdwijnt zodra de lead een nieuwe status krijgt.
import { useState, useEffect } from 'react'
import { UserRoundCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function OvergenomenBanner({ lead }) {
  const [naam, setNaam] = useState(null)
  const van = lead?.overgenomen_van

  useEffect(() => {
    if (!van) { setNaam(null); return }
    let alive = true
    supabase.from('profiles').select('full_name').eq('id', van).maybeSingle()
      .then(({ data }) => { if (alive) setNaam(data?.full_name || null) })
    return () => { alive = false }
  }, [van])

  if (!van) return null
  const op = lead.overgenomen_op ? new Date(lead.overgenomen_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : null

  return (
    <div className="wi-briefing-item" style={{
      marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12,
      background: 'var(--info-bg)', border: '1px solid color-mix(in srgb, var(--info) 40%, transparent)', fontSize: '0.88rem'
    }}>
      <UserRoundCheck size={18} style={{ color: 'var(--info)', flexShrink: 0 }} />
      <div>
        <strong style={{ color: 'var(--info)' }}>Overgenomen van {naam || 'een collega'}</strong>
        <span style={{ color: 'var(--text-primary)' }}>
          {op ? ` (sinds ${op})` : ''}. Er was al contact. Lees eerst de notitie.
        </span>
      </div>
    </div>
  )
}
