import { useState, useEffect, useRef, useCallback } from 'react'

// v64: "Locatie aan" voor accountmanagers. Volgt de positie van de browser
// (watchPosition) zolang de gebruiker het aan heeft; de keuze wordt per
// apparaat onthouden zodat de knop op de telefoon aan blijft staan.
const STORAGE_KEY = 'leadgen-location-on'

export function useGeolocation() {
  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })
  const [position, setPosition] = useState(null) // { lat, lng, accuracy, at }
  const [error, setError] = useState(null)
  const [locating, setLocating] = useState(false)
  const watchRef = useRef(null)

  const stop = useCallback(() => {
    if (watchRef.current != null && navigator.geolocation) navigator.geolocation.clearWatch(watchRef.current)
    watchRef.current = null
    setLocating(false)
  }, [])

  useEffect(() => {
    if (!enabled || !supported) { stop(); setPosition(null); return }
    setLocating(true)
    setError(null)
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        setPosition({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: Date.now() })
        setLocating(false)
        setError(null)
      },
      (e) => {
        setLocating(false)
        // 1 = geweigerd, 2 = niet beschikbaar, 3 = timeout
        setError(e.code === 1 ? 'Locatie geweigerd. Zet locatietoegang aan in je browser/telefoon.' : 'Locatie kon niet bepaald worden.')
        if (e.code === 1) setEnabled(false)
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
    )
    return stop
  }, [enabled, supported, stop])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0') } catch { /* privémodus */ }
  }, [enabled])

  const toggle = useCallback(() => setEnabled(v => !v), [])

  return { supported, enabled, toggle, setEnabled, position, error, locating }
}
