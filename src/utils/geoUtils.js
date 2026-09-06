// v64: afstand & locatie voor de Leads-pagina / Outside.
// Kleuren volgens OUTSIDE_STYLEGUIDE.md (vaste vijf statuskleuren voor kaart + lijst).

export const OUTSIDE_STATUS_COLORS = {
  new: '#2F80ED',          // Nieuw
  open: '#F2C94C',         // Open / bezig
  appointment: '#9B51E0',  // Afspraak
  sale: '#27AE60',         // Sale / deal
  closed: '#BDC7C3'        // Eindstatus zonder resultaat
}

const OPEN = ['later_bellen', 'mailen', 'voicemail', 'terugbelafspraak', 'geen_gehoor', 'onjuiste_timing', 'ptfu', 'goed_op_weg', 'verbetering_nodig']
const SALE = ['deal', 'bruto_deal', 'monteur_ingepland']
const CLOSED = ['geen_interesse', 'verkeerd_nummer', 'blacklist', 'cold', 'wil_annuleren']

export function outsideStatusKey(status) {
  if (!status || status === 'new') return 'new'
  if (status === 'afspraak_gemaakt') return 'appointment'
  if (SALE.includes(status)) return 'sale'
  if (CLOSED.includes(status)) return 'closed'
  if (OPEN.includes(status)) return 'open'
  return 'open'
}

export const outsideStatusColor = (status) => OUTSIDE_STATUS_COLORS[outsideStatusKey(status)]

// Haversine, meters. Zelfde formule als public.lead_distance_m in de DB.
export function distanceM(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(v => v == null || Number.isNaN(Number(v)))) return null
  const R = 6371000
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function formatDistance(m) {
  if (m == null) return ''
  if (m < 1000) return `${Math.round(m / 10) * 10} m`
  if (m < 10000) return `${(m / 1000).toFixed(1).replace('.', ',')} km`
  return `${Math.round(m / 1000)} km`
}

// Ruwe indeling voor de "ver weg"-badge in de lijst
export function distanceBand(m) {
  if (m == null) return null
  if (m < 2000) return 'near'      // loop-/fietsafstand
  if (m < 10000) return 'mid'
  return 'far'
}
