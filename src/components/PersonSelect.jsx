// v102: zoekbare medewerker-kiezer. Vervangt <select> met alle medewerkers,
// zodat het ook werkt met 100+ mensen. Typ een naam, e-mail of rol om te filteren.
// Gebruik: <PersonSelect people={users} value={id} onChange={id => ...} emptyLabel="Niemand" />
import { useState, useEffect, useRef, useMemo, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search, Check } from 'lucide-react'

export const ROLE_LABELS = {
  employee: 'Beller',
  accountmanager: 'Accountmanager',
  backoffice: 'Backoffice',
  manager: 'Manager',
  recruiter: 'Recruiter',
  planning: 'Planning',
  extern: 'Extern',
  admin: 'Admin',
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || ''
}

const MAX_ROWS = 200

export default function PersonSelect({
  people = [],
  value,
  onChange,
  placeholder = 'Kies een medewerker',
  emptyLabel,          // tekst voor de lege keuze (value ''), bijv. "Niemand" of "Alle bellers"
  extraOptions = [],   // extra vaste keuzes bovenaan, bijv. [{ value: 'all', label: 'Alle bellers' }]
  disabled = false,
  className = 'form-dark',
  style,
  showEmail = true,
  showRole = false,
  renderLabel,         // optioneel: p => tekst in de lijst en op de knop
  title,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  const labelOf = p => (renderLabel ? renderLabel(p) : (p.full_name || p.name || p.email || 'Naamloos'))
  const selected = people.find(p => p.id === value) || null
  const specials = [
    ...(emptyLabel !== undefined ? [{ value: '', label: emptyLabel }] : []),
    ...extraOptions,
  ]
  const selectedSpecial = !selected ? specials.find(o => o.value === (value ?? '')) : null

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? people.filter(p => [labelOf(p), p.email, roleLabel(p.role)].filter(Boolean).some(t => String(t).toLowerCase().includes(q)))
      : people
    const sorted = [...list].sort((a, b) => String(labelOf(a)).localeCompare(String(labelOf(b)), 'nl'))
    const rows = sorted.map(p => ({ id: p.id, p }))
    const sp = specials.filter(o => !q || String(o.label).toLowerCase().includes(q)).map(o => ({ id: o.value, p: null, label: o.label }))
    return [...sp, ...rows]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, query, emptyLabel, extraOptions])

  function place() {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const width = Math.max(r.width, 260)
    const left = Math.min(r.left, window.innerWidth - width - 8)
    const below = window.innerHeight - r.bottom
    const up = below < 280 && r.top > below
    setPos({ left: Math.max(8, left), width, top: up ? undefined : r.bottom + 4, bottom: up ? window.innerHeight - r.top + 4 : undefined })
  }

  useLayoutEffect(() => { if (open) place() }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = e => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onMove = e => { if (!panelRef.current?.contains(e.target)) place() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onMove, true)
    setTimeout(() => inputRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  function choose(id) {
    onChange?.(id)
    setOpen(false)
    setQuery('')
    btnRef.current?.focus()
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, Math.min(options.length, MAX_ROWS) - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const o = options[active]; if (o) choose(o.id) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus() }
  }

  const buttonText = selected ? labelOf(selected) : selectedSpecial ? selectedSpecial.label : (value ? 'Onbekende medewerker' : placeholder)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        disabled={disabled}
        title={title}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true) } }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer', minWidth: 0, ...style }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: selected || selectedSpecial ? 1 : 0.6 }}>{buttonText}</span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, zIndex: 10000,
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 12px 32px rgba(0,0,0,0.35)', overflow: 'hidden', color: 'var(--text-main)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
            <Search size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKey}
              placeholder="Zoek op naam, e-mail of rol"
              style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: '0.85rem' }}
            />
            <span style={{ fontSize: '0.7rem', opacity: 0.6, whiteSpace: 'nowrap' }}>{people.length > 0 && `${options.filter(o => o.p).length}/${people.length}`}</span>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {options.length === 0 && (
              <div style={{ padding: '12px', fontSize: '0.8rem', opacity: 0.7 }}>Niemand gevonden</div>
            )}
            {options.slice(0, MAX_ROWS).map((o, i) => {
              const isSel = (o.id ?? '') === (value ?? '')
              return (
                <div
                  key={o.p ? o.id : `__special_${o.id}`}
                  onMouseDown={e => { e.preventDefault(); choose(o.id) }}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    background: i === active ? 'var(--accent-soft)' : 'transparent',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.p ? labelOf(o.p) : o.label}
                    </div>
                    {o.p && (showEmail || showRole) && (o.p.email || o.p.role) && (
                      <div style={{ fontSize: '0.7rem', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {[showRole && roleLabel(o.p.role), showEmail && o.p.email].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                  {isSel && <Check size={14} style={{ flexShrink: 0, color: 'var(--primary)' }} />}
                </div>
              )
            })}
            {options.length > MAX_ROWS && (
              <div style={{ padding: '8px 12px', fontSize: '0.72rem', opacity: 0.6 }}>
                Nog {options.length - MAX_ROWS} meer. Typ verder om te verfijnen.
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

// v102: zoekveld boven een lijst met vinkjes (managers, teams, tools). Verschijnt pas
// vanaf 7 items; gekozen items staan altijd bovenaan zodat je ze niet kwijtraakt.
export function useChecklistSearch(items, selected, min = 7) {
  const [q, setQ] = useState('')
  const show = items.length >= min
  const needle = q.trim().toLowerCase()
  const visible = !needle ? items : items.filter(it => selected.includes(it.id) || String(it.label).toLowerCase().includes(needle))
  const sorted = show ? [...visible].sort((a, b) => (selected.includes(b.id) ? 1 : 0) - (selected.includes(a.id) ? 1 : 0)) : visible
  const input = show ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 6, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
      <Search size={14} style={{ opacity: 0.6, flexShrink: 0 }} />
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={`Zoek in ${items.length}...`}
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'inherit', fontSize: '0.85rem' }}
      />
      {selected.length > 0 && <span style={{ fontSize: '0.72rem', opacity: 0.7, whiteSpace: 'nowrap' }}>{selected.length} gekozen</span>}
    </div>
  ) : null
  return { items: sorted, input, empty: show && sorted.length === 0 }
}
