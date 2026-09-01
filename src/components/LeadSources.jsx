import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Tag, Pencil, Trash2, Check } from 'lucide-react'
import { useToast } from './Toast'

// v56: beheerde bronnen. Twee bouwstenen die overal hetzelfde werken:
//  - <SourceSelect>: dropdown met de beheerde bronnen + "Nieuwe bron..." om er
//    ter plekke een aan te maken (nieuwe lead, nieuwe sollicitant, import).
//  - <ManageSourcesModal>: lijst met toevoegen / hernoemen / verwijderen en het
//    aantal leads per bron.
// Data komt uit useLeadSources (src/hooks/useLeadSources.js).

const NEW_VALUE = '__new_source__'

export function SourceSelect({
  value,
  onChange,
  sources = [],
  onAdd,
  allowEmpty = false,
  emptyLabel = 'Geen bron',
  extraValues = [],
  className,
  style,
  disabled = false
}) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  // Waarden die in de data voorkomen maar (nog) geen beheerde bron zijn -
  // of de huidige waarde zelf - blijven kiesbaar, anders "verdwijnt" een
  // bestaande bron uit een bewerk-formulier.
  const known = new Set(sources.map(s => s.name.trim().toLowerCase()))
  const extras = []
  const pushExtra = v => {
    const t = (v || '').trim()
    if (t && !known.has(t.toLowerCase()) && !extras.some(e => e.toLowerCase() === t.toLowerCase())) extras.push(t)
  }
  extraValues.forEach(pushExtra)
  pushExtra(value)

  // Match hoofdletter-ongevoelig op een beheerde bron, zodat "indeed" uit een
  // oudere lead netjes op "Indeed" in de lijst valt.
  const current = (() => {
    const t = (value || '').trim()
    if (!t) return ''
    const hit = sources.find(s => s.name.trim().toLowerCase() === t.toLowerCase())
    if (hit) return hit.name
    return extras.find(e => e.toLowerCase() === t.toLowerCase()) || t
  })()

  async function confirmAdd() {
    const name = draft.trim()
    if (!name) return
    setBusy(true)
    try {
      const created = onAdd ? await onAdd(name) : { name }
      onChange(created?.name || name)
      setAdding(false)
      setDraft('')
    } catch (err) {
      toast(err.message || 'Bron aanmaken mislukt', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (adding) {
    return (
      <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch' }}>
        <input
          type="text"
          autoFocus
          className={className}
          style={{ ...style, flex: 1, minWidth: 0 }}
          value={draft}
          maxLength={60}
          placeholder="Naam van de nieuwe bron..."
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); confirmAdd() }
            if (e.key === 'Escape') { e.preventDefault(); setAdding(false); setDraft('') }
          }}
        />
        <button type="button" className="btn btn-secondary btn-sm" onClick={confirmAdd} disabled={busy || !draft.trim()} title="Bron toevoegen" style={{ flexShrink: 0 }}>
          <Check size={14} />
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => { setAdding(false); setDraft('') }} title="Annuleren" style={{ flexShrink: 0 }}>
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <select
      className={className}
      style={style}
      value={current}
      disabled={disabled}
      onChange={e => {
        if (e.target.value === NEW_VALUE) { setAdding(true); return }
        onChange(e.target.value)
      }}
    >
      {(allowEmpty || !current) && <option value="">{allowEmpty ? emptyLabel : 'Kies een bron...'}</option>}
      {sources.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
      {extras.map(v => <option key={`extra-${v}`} value={v}>{v}</option>)}
      <option value={NEW_VALUE}>+ Nieuwe bron aanmaken...</option>
    </select>
  )
}

export function ManageSourcesModal({ isOpen, onClose, sources = [], counts, onAdd, onRename, onRemove, title = 'Bronnen beheren' }) {
  const toast = useToast()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [confirmId, setConfirmId] = useState(null)

  useEffect(() => {
    if (!isOpen) { setDraft(''); setEditingId(null); setEditName(''); setConfirmId(null) }
  }, [isOpen])

  const countFor = s => {
    if (!counts) return null
    const n = counts.get ? counts.get(s.name.trim().toLowerCase()) : counts[s.name.trim().toLowerCase()]
    return n || 0
  }

  async function run(fn, okMsg) {
    setBusy(true)
    try {
      await fn()
      if (okMsg) toast(okMsg, 'success')
      return true
    } catch (err) {
      toast(err.message || 'Er ging iets mis', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleAdd(e) {
    e?.preventDefault()
    const name = draft.trim()
    if (!name) return
    const ok = await run(() => onAdd(name), `Bron "${name}" toegevoegd`)
    if (ok) setDraft('')
  }

  async function handleRename(id) {
    const name = editName.trim()
    if (!name) return
    const ok = await run(() => onRename(id, name), 'Bron hernoemd')
    if (ok) { setEditingId(null); setEditName('') }
  }

  async function handleRemove(id) {
    const ok = await run(() => onRemove(id), 'Bron verwijderd')
    if (ok) setConfirmId(null)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="modal" style={{ maxWidth: '520px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2><Tag size={18} /> {title}</h2>
              <button className="modal-close" onClick={onClose}><X size={18} /></button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 0 }}>
              Bronnen geven aan waar een lead of sollicitant vandaan komt (bv. Indeed, LinkedIn, referral).
              Ze zijn te kiezen bij het aanmaken en importeren, en je kunt erop filteren.
            </p>

            <form onSubmit={handleAdd} autoComplete="off" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                value={draft}
                maxLength={60}
                onChange={e => setDraft(e.target.value)}
                placeholder="Nieuwe bron, bv. Indeed"
                className="form-control"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !draft.trim()} style={{ flexShrink: 0 }}>
                <Plus size={15} /> Toevoegen
              </button>
            </form>

            {sources.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Nog geen bronnen. Voeg hierboven de eerste toe.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '50vh', overflowY: 'auto' }}>
                {sources.map(s => {
                  const n = countFor(s)
                  const isEditing = editingId === s.id
                  const isConfirming = confirmId === s.id
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                      {isEditing ? (
                        <input
                          type="text"
                          autoFocus
                          value={editName}
                          maxLength={60}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') { e.preventDefault(); handleRename(s.id) }
                            if (e.key === 'Escape') { e.preventDefault(); setEditingId(null) }
                          }}
                          className="form-control"
                          style={{ flex: 1, minWidth: 0, padding: '6px 10px' }}
                        />
                      ) : (
                        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      )}

                      {n !== null && !isEditing && (
                        <span title="Aantal leads/sollicitanten met deze bron" style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '999px', padding: '2px 8px', flexShrink: 0 }}>
                          {n}
                        </span>
                      )}

                      {isEditing ? (
                        <>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => handleRename(s.id)} disabled={busy || !editName.trim()} title="Opslaan"><Check size={14} /></button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditingId(null)} title="Annuleren"><X size={14} /></button>
                        </>
                      ) : isConfirming ? (
                        <>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {n ? `${n} lead${n === 1 ? '' : 's'} houden hun bron-tekst.` : 'Verwijderen?'}
                          </span>
                          <button type="button" className="btn btn-sm" onClick={() => handleRemove(s.id)} disabled={busy} style={{ background: '#EF4444', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }} title="Definitief verwijderen"><Trash2 size={14} /> Ja, verwijderen</button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmId(null)} title="Annuleren"><X size={14} /></button>
                        </>
                      ) : (
                        <>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setEditingId(s.id); setEditName(s.name); setConfirmId(null) }} title="Hernoemen"><Pencil size={14} /></button>
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => { setConfirmId(s.id); setEditingId(null) }} title="Verwijderen" style={{ color: '#EF4444' }}><Trash2 size={14} /></button>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '14px', marginBottom: 0 }}>
              Hernoemen neemt de leads met die bron mee (voor zover je die mag bewerken). Verwijderen haalt alleen de bron uit de lijst; bestaande leads houden hun bron-tekst.
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
