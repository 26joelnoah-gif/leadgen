// v64: hulpjes voor de Outside-pagina (src/pages/Outside.jsx): afstand,
// vijf statuscategorieën, groeperen per straat, route-link.
// (src/utils/geoUtils.js is van de kaartweergave op /leads; bewust apart gehouden.)

export function distanceMeters(a, b) {
  if (!a || !b || a.lat == null || b.lat == null || a.lng == null || b.lng == null) return null
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function formatDistance(m) {
  if (m == null) return ''
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`
  return `${Math.round(m / 1000)} km`
}

export function leadAddressLine(lead) {
  const street = [lead.address, lead.house_number].filter(Boolean).join(' ').trim()
  const place = [lead.postal_code, lead.city].filter(Boolean).join(' ').trim()
  return [street, place].filter(Boolean).join(', ')
}

export function leadHasAddress(lead) {
  return Boolean((lead.address || '').trim() && ((lead.city || '').trim() || (lead.postal_code || '').trim()))
}

// Vaste vijf Outside-categorieën (OUTSIDE_STYLEGUIDE.md), gemapt op STATUS_MAP-keys
export const OUTSIDE_CATEGORIES = {
  new: { label: 'Nieuw', hex: '#2F80ED' },
  open: { label: 'Open', hex: '#F2C94C' },
  appointment: { label: 'Afspraak', hex: '#9B51E0' },
  sale: { label: 'Sale', hex: '#27AE60' },
  closed: { label: 'Gesloten', hex: '#BDC7C3' },
}

export function outsideCategory(status) {
  switch (status) {
    case 'new': case undefined: case null: return 'new'
    case 'deal': case 'bruto_deal': case 'monteur_ingepland': return 'sale'
    case 'afspraak_gemaakt': return 'appointment'
    case 'geen_interesse': case 'verkeerd_nummer': case 'blacklist': case 'wil_annuleren': case 'cold': return 'closed'
    default: return 'open'
  }
}

export function houseNumberSort(a, b) {
  const na = parseInt(String(a.house_number || '').replace(/\D.*$/, ''), 10)
  const nb = parseInt(String(b.house_number || '').replace(/\D.*$/, ''), 10)
  if (Number.isNaN(na) && Number.isNaN(nb)) return String(a.house_number || '').localeCompare(String(b.house_number || ''))
  if (Number.isNaN(na)) return 1
  if (Number.isNaN(nb)) return -1
  if (na !== nb) return na - nb
  return String(a.house_number || '').localeCompare(String(b.house_number || ''))
}

// Groepeer per straat + plaats; groepen op dichtstbijzijnde lead (met locatie), anders op naam
export function groupByStreet(leads, userPos) {
  const groups = new Map()
  for (const l of leads) {
    const street = (l.address || '').trim() || 'Zonder adres'
    const city = (l.city || '').trim()
    const key = `${street.toLowerCase()}|${city.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, { key, street, city, postal_code: (l.postal_code || '').trim(), leads: [], minDistance: null })
    const g = groups.get(key)
    g.leads.push(l)
    if (l._distance != null && (g.minDistance == null || l._distance < g.minDistance)) g.minDistance = l._distance
  }
  const arr = [...groups.values()]
  for (const g of arr) g.leads.sort(houseNumberSort)
  arr.sort((a, b) => {
    if (userPos) {
      if (a.minDistance == null && b.minDistance == null) return a.street.localeCompare(b.street)
      if (a.minDistance == null) return 1
      if (b.minDistance == null) return -1
      return a.minDistance - b.minDistance
    }
    return a.street.localeCompare(b.street) || a.city.localeCompare(b.city)
  })
  return arr
}

// Navigatie: Google Maps universal link (opent de app op iOS/Android als die er is)
export function routeUrl(lead) {
  if (lead.lat != null && lead.lng != null) return `https://www.google.com/maps/dir/?api=1&destination=${lead.lat},${lead.lng}&travelmode=walking`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(leadAddressLine(lead))}&travelmode=walking`
}
