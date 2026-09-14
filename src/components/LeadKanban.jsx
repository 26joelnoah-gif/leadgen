import { useState } from 'react'

// v72: kaal kanban-bord. Weet niets van leads of statussen: het krijgt de
// kolommen, de items en een render-functie voor de kaart. Zo kan hetzelfde bord
// later ook onder de sollicitantenpagina (v36b) geschoven worden.
export default function LeadKanban({
  columns,
  items,
  columnFor,
  onDropItem,
  renderCard,
  onCardClick,
  canDrag = () => true,
  emptyHint = 'Sleep hier naartoe',
  maxHeight = 'calc(100vh - 330px)'
}) {
  const [draggingId, setDraggingId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)

  const perColumn = {}
  columns.forEach(c => { perColumn[c.id] = [] })
  items.forEach(item => {
    const id = columnFor(item)
    if (perColumn[id]) perColumn[id].push(item)
    else perColumn[columns[0].id].push(item)
  })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length}, minmax(140px, 1fr))`, gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
      {columns.map(col => {
        const list = perColumn[col.id] || []
        const isOver = overColumn === col.id
        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); setOverColumn(col.id) }}
            onDragLeave={() => setOverColumn(prev => (prev === col.id ? null : prev))}
            onDrop={e => {
              e.preventDefault()
              setOverColumn(null)
              const id = e.dataTransfer.getData('text/plain')
              setDraggingId(null)
              const item = items.find(i => i.id === id)
              if (item && columnFor(item) !== col.id) onDropItem(col, item)
            }}
            style={{
              minWidth: 0, background: isOver ? 'var(--accent-soft)' : 'var(--bg-card)',
              border: `1px solid ${isOver ? col.color : 'var(--border)'}`, borderRadius: 10, padding: 7,
              transition: 'background 0.15s, border-color 0.15s', maxHeight, minHeight: 160,
              display: 'flex', flexDirection: 'column'
            }}
          >
            <div className="flex items-center justify-between" style={{ padding: '3px 4px 8px', borderBottom: `2px solid ${col.color}`, marginBottom: 6, gap: 4 }}>
              <span style={{ fontWeight: 800, fontSize: '0.72rem', color: col.color, lineHeight: 1.2 }}>{col.label}</span>
              <span style={{ background: 'var(--bg-elevated)', padding: '1px 6px', borderRadius: 10, fontSize: '0.68rem', fontWeight: 700, flexShrink: 0 }}>{list.length}</span>
            </div>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
              {list.map(item => {
                const draggable = canDrag(item)
                return (
                  <div
                    key={item.id}
                    draggable={draggable}
                    onDragStart={e => {
                      if (!draggable) { e.preventDefault(); return }
                      e.dataTransfer.setData('text/plain', item.id)
                      setDraggingId(item.id)
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => onCardClick && onCardClick(item)}
                    style={{
                      background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 7,
                      padding: '6px 7px', cursor: draggable ? 'grab' : 'not-allowed',
                      opacity: draggingId === item.id ? 0.4 : (draggable ? 1 : 0.55)
                    }}
                  >
                    {renderCard(item)}
                  </div>
                )
              })}
              {list.length === 0 && (
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textAlign: 'center', padding: '14px 4px', opacity: 0.6 }}>
                  {emptyHint}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
