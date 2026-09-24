// v105: schakelaar oud/nieuw design (docs/DESIGN_UITROL_PLAN.md, fase 0).
// <html data-design="v1|v2">. Alle nieuwe opmaak staat in src/styles/design-v2.css
// onder [data-design="v2"], dus v1 = de app precies zoals hij was.
// Bron van waarheid: profiles.ui_design. localStorage is alleen een snelle
// kopie zodat er bij het laden geen flits van het verkeerde design is.
const STORAGE_KEY = 'leadgen-design'
const FONT_ID = 'leadgen-v2-fonts'
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Manrope:wght@600;700;800&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap'

export function normalizeDesign(v) {
  return v === 'v2' ? 'v2' : 'v1'
}

export function applyDesign(value) {
  const v = normalizeDesign(value)
  try { document.documentElement.setAttribute('data-design', v) } catch { /* geen DOM */ }
  try { localStorage.setItem(STORAGE_KEY, v) } catch { /* privemodus */ }
  if (v === 'v2' && typeof document !== 'undefined' && !document.getElementById(FONT_ID)) {
    const link = document.createElement('link')
    link.id = FONT_ID
    link.rel = 'stylesheet'
    link.href = FONT_HREF
    document.head.appendChild(link)
  }
  return v
}
