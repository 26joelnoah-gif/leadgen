// v105 (DESIGN_UITROL_PLAN fase 0): plak dit in de browserconsole op elke
// pagina die je na een design-stap test. Geeft elementen die breder zijn dan
// hun vak (zijwaarts scrollen of afgesneden tekst). Leeg resultaat = goed.
// Tabellen en borden met bewust eigen scroll staan in `bewust`.
(() => {
  const bewust = ['kb-board', 'tab-bar', 'table-container', 'kb-col-body', 'lb-seg']
  const W = document.documentElement.clientWidth
  const fout = []
  document.querySelectorAll('#root *').forEach(el => {
    const cls = String(el.className || '')
    if (bewust.some(b => cls.includes(b))) return
    const r = el.getBoundingClientRect()
    if (r.width === 0) return
    const cs = getComputedStyle(el)
    const scrolt = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
    if (r.right > W + 1) fout.push(['buiten scherm', el.tagName, cls.slice(0, 60), Math.round(r.right)])
    else if (scrolt && el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 50) fout.push(['scrollt zijwaarts', el.tagName, cls.slice(0, 60), el.scrollWidth + '/' + el.clientWidth])
  })
  console.table(fout)
  return fout.length
})()
