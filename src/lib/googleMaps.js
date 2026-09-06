// v64: Google Maps JavaScript API één keer laden (kaart + Geocoder voor Outside).
// Sleutel komt uit VITE_GOOGLE_MAPS_KEY (Netlify env / .env). Zonder sleutel
// resolve't loadGoogleMaps() naar null en toont Outside alleen de lijst.
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY || ''

let loader = null

export function loadGoogleMaps() {
  if (!GOOGLE_MAPS_KEY) return Promise.resolve(null)
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps)
  if (loader) return loader
  loader = new Promise((resolve, reject) => {
    const cb = '__leadgenGmapsReady'
    window[cb] = () => { delete window[cb]; resolve(window.google.maps) }
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_KEY)}&callback=${cb}&loading=async&language=nl&region=NL`
    s.async = true
    s.onerror = () => { loader = null; reject(new Error('Google Maps kon niet laden')) }
    document.head.appendChild(s)
  })
  return loader
}

// Adres van een lead -> { lat, lng } via google.maps.Geocoder, of null.
// Gooit bij quota/sleutelfouten zodat de aanroeper kan stoppen.
export async function geocodeAddress(maps, addressLine) {
  const geocoder = new maps.Geocoder()
  try {
    const { results } = await geocoder.geocode({ address: addressLine, region: 'NL' })
    const loc = results?.[0]?.geometry?.location
    if (!loc) return null
    return { lat: loc.lat(), lng: loc.lng() }
  } catch (err) {
    // ZERO_RESULTS komt als exception binnen met code; dat is gewoon "niet gevonden"
    if (err?.code === 'ZERO_RESULTS' || /ZERO_RESULTS/.test(String(err?.message || err))) return null
    throw err
  }
}
