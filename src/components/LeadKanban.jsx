import { useState, useMemo } from 'react'

// v72: kaal kanban-bord. Weet niets van leads of statussen: het krijgt de
// kolommen, de items en een render-functie voor de kaart. Zo kan hetzelfde bord
// later ook onder de sollicitantenpagina (v36b) geschoven worden.
//
// v103 (strakker + robuuster):
// - Lege kolommen klappen in tot een smalle strook met verticale titel, zodat
//   de gevulde kolommen ruimte krijgen. Zodra je iets sleept klappen ze weer
//   open, zodat je er makkelijk op kunt loslaten.
// - Per kolom eerst PAGE kaarten, daarna "Toon meer". 800+ kaarten tegelijk
//   in beeld maakte het bord traag.
// - Opmaak in index.css (.kb-*), in beide thema's via tokens.
const PAGE = 40

export default function LeadKanban({
  columns,
  items,
  columnFor,
  onDropItem,
  renderCard,
  onCardClick,
  canDrag = () => true,
  emptyHint = 'Sleep hier naartoe',
  maxHeight = 'max(440px, calc(100vh - 300px))'
}) {
  const [draggingId, setDraggingId] = useState(null)
  const [overColumn, setOverColumn] = useState(null)
  const [shown, setShown] = useState({}) // kolom-id -> aantal zichtbare kaarten

  const perColumn = useMemo(() => {
    const map = {}
    columns.forEach(c => { map[c.id] = [] })
    items.forEach(item => {
      const id = columnFor(item)
      if (map[id]) map[id].push(item)
      else if (columns[0]) map[columns[0].id].push(item)
    })
    return map
  }, [columns, items, columnFor])

  const itemById = useMemo(() => {
    const m = {}
    items.forEach(i => { m[i.id] = i })
    return m
  }, [items])

  function endDrag() {
    setDraggingId(null)
    setOverColumn(null)
  }

  return (
    <div className={`kb-board${draggingId ? ' is-dragging' : ''}`} style={{ height: maxHeight }}>
      {columns.map(col => {
        const list = perColumn[col.id] || []
        const isOver = overColumn === col.id
        const limit = shown[col.id] || PAGE
        const zichtbaar = list.slice(0, limit)
        const empty = list.length === 0
        return (
          <div
            key={col.id}
            className={`kb-col${empty ? ' is-empty' : ''}${isOver ? ' is-over' : ''}`}
            style={{ '--col': col.color }}
            onDragOver={e => { e.preventDefault(); if (overColumn !== col.id) setOverColumn(col.id) }}
            onDragLeave={e => {
              // alleen resetten als je echt de kolom uit gaat, niet bij een kind-element
              if (!e.currentTarget.contains(e.relatedTarget)) setOverColumn(prev => (prev === col.id ? null : prev))
            }}
            onDrop={e => {
              e.preventDefault()
              const id = e.dataTransfer.getData('text/plain')
              endDrag()
              const item = itemById[id]
              if (item && columnFor(item) !== col.id) onDropItem(col, item)
            }}
            title={empty ? `${col.label} (leeg)` : undefined}
          >
            <div className="kb-col-head">
              <span className="kb-col-title">{col.label}</span>
              <span className="kb-count">{list.length}</span>
            </div>
            <div className="kb-col-body">
              {zichtbaar.map(item => {
                const draggable = canDrag(item)
                return (
                  <div
                    key={item.id}
                    className={`kb-card${draggable ? '' : ' is-disabled'}${draggingId === item.id ? ' is-dragging' : ''}`}
                    draggable={draggable}
                    onDragStart={e => {
                      if (!draggable) { e.preventDefault(); return }
                      e.dataTransfer.setData('text/plain', item.id)
                      e.dataTransfer.effectAllowed = 'move'
                      setDraggingId(item.id)
                    }}
                    onDragEnd={endDrag}
                    onClick={() => onCardClick && onCardClick(item)}
                  >
                    {renderCard(item)}
                  </div>
                )
              })}
              {list.length > limit && (
                <button
                  type="button"
                  className="kb-more"
                  onClick={() => setShown(s => ({ ...s, [col.id]: limit + PAGE }))}
                >
                  Toon meer ({list.length - limit})
                </button>
              )}
              {empty && <div className="kb-empty">{emptyHint}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
