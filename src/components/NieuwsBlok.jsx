import { useState, useEffect } from 'react'
import { Newspaper, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// v108: het nieuwsoverzicht (Admin > Nieuws, tabel news_items) stond op de
// publieke homepage. Die is nu een kale inlog/aanmeld-pagina, dus het nieuws
// staat hier: op het dashboard van ingelogde medewerkers.
// Toont de laatste 3 berichten, met "Toon alles" tot maximaal 20.
// Is er niets gepubliceerd, dan laat het blok zichzelf niet zien.
const EERST = 3
const MAX = 20

export default function NieuwsBlok() {
  const { isDemoMode } = useAuth()
  const [items, setItems] = useState([])
  const [alles, setAlles] = useState(false)

  useEffect(() => {
    if (isDemoMode) return
    let alive = true
    supabase
      .from('news_items')
      .select('id, title, body, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(MAX)
      .then(({ data, error }) => { if (alive && !error) setItems(data || []) })
    return () => { alive = false }
  }, [isDemoMode])

  if (!items.length) return null

  const zichtbaar = alles ? items : items.slice(0, EERST)

  return (
    <div className="card" style={{ marginTop: '24px' }}>
      <div className="card-header">
        <span className="card-title"><Newspaper size={18} /> Nieuws</span>
      </div>
      <div style={{ display: 'grid', gap: '10px' }}>
        {zichtbaar.map(item => (
          <div key={item.id} style={{ padding: '12px 14px', borderRadius: '10px', background: 'var(--bg-elevated)', borderLeft: '3px solid var(--primary)' }}>
            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>{item.title}</div>
            <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: '2px' }}>
              {new Date(item.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: '6px', lineHeight: 1.55, whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{item.body}</div>
          </div>
        ))}
      </div>
      {items.length > EERST && (
        <button
          type="button"
          onClick={() => setAlles(a => !a)}
          className="btn btn-sm btn-outline"
          style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {alles ? <><ChevronUp size={14} /> Minder tonen</> : <><ChevronDown size={14} /> Toon alles ({items.length})</>}
        </button>
      )}
    </div>
  )
}
