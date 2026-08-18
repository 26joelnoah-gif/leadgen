import { useState, useEffect } from 'react'
import { Users, Save, Check } from 'lucide-react'

// Een lijst kon aan één beller of één team hangen. Hier kun je meerdere
// bellers tegelijk op dezelfde lijst zetten; ze werken dan samen de lijst
// af zonder elkaar te overlappen (zie claim_next_lead in migratie v15).

export default function ListAssigneesCard({
  leadLists,
  agents,
  getListAssignees,
  setListAssignees,
  toast,
}) {
  const [listId, setListId] = useState('')
  const [selected, setSelected] = useState([])
  const [initial, setInitial] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!listId) {
      setSelected([])
      setInitial([])
      return
    }
    setLoading(true)
    getListAssignees(listId).then(ids => {
      if (cancelled) return
      setSelected(ids)
      setInitial(ids)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [listId])

  const dirty =
    selected.length !== initial.length ||
    selected.some(id => !initial.includes(id))

  function toggle(agentId) {
    setSelected(prev =>
      prev.includes(agentId) ? prev.filter(id => id !== agentId) : [...prev, agentId]
    )
  }

  async function handleSave() {
    setSaving(true)
    const { error, added, removed } = await setListAssignees(listId, selected)
    setSaving(false)

    if (error) {
      toast(`Toewijzen mislukt: ${error.message}`, 'error')
      return
    }
    setInitial(selected)
    const parts = []
    if (added) parts.push(`${added} toegevoegd`)
    if (removed) parts.push(`${removed} verwijderd`)
    toast(parts.length ? `Bellers bijgewerkt: ${parts.join(', ')}` : 'Niets gewijzigd', 'success')
  }

  const listName = leadLists.find(l => l.id === listId)?.name

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Users size={18} style={{ color: 'var(--primary)' }} />
        <h2 className="text-xl font-bold">Bellers per lijst</h2>
      </div>
      <p className="text-sm text-muted mb-4">
        Zet meerdere bellers op dezelfde lijst. Ze krijgen ieder een andere
        lead, dus niemand belt hetzelfde bedrijf dubbel.
      </p>

      <label className="rates-field mb-4" style={{ maxWidth: '420px' }}>
        <span className="rates-field__label">Lijst</span>
        <select
          className="form-control"
          value={listId}
          onChange={e => setListId(e.target.value)}
        >
          <option value="">— Kies een lijst —</option>
          {leadLists.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </label>

      {!listId && (
        <p className="text-sm text-muted">Kies eerst een lijst.</p>
      )}

      {listId && loading && (
        <p className="text-sm text-muted">Bellers laden…</p>
      )}

      {listId && !loading && (
        <>
          {agents.length === 0 ? (
            <p className="text-sm text-muted">Nog geen medewerkers om toe te wijzen.</p>
          ) : (
            <div className="assignee-grid">
              {agents.map(a => {
                const on = selected.includes(a.id)
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => toggle(a.id)}
                    className={`assignee-chip${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                  >
                    <span className="assignee-chip__box">{on && <Check size={12} />}</span>
                    <span className="assignee-chip__name">{a.full_name || a.email}</span>
                    {a.role === 'admin' && <span className="assignee-chip__role">admin</span>}
                  </button>
                )
              })}
            </div>
          )}

          <div className="flex items-center gap-3 mt-4" style={{ flexWrap: 'wrap' }}>
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="btn btn-primary"
            >
              <Save size={16} /> {saving ? 'Opslaan…' : 'Toewijzing opslaan'}
            </button>
            <span className="text-sm text-muted">
              {selected.length === 0
                ? `Niemand toegewezen aan ${listName}`
                : `${selected.length} beller${selected.length === 1 ? '' : 's'} op ${listName}`}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
