import { useEffect, useRef, useState } from 'react'
import { LocateFixed } from 'lucide-react'
import { outsideStatusColor, OUTSIDE_STATUS_COLORS, formatDistance } from '../utils/geoUtils'

// v64: kaartweergave van leads (eerste stuk van Outside).
// Leaflet + OpenStreetMap-tegels, geladen vanaf CDN op het moment dat de kaart
// voor het eerst opengaat (geen npm-dependency, geen extra bundlegewicht).
// Bolletjes in de vijf Outside-statuskleuren; blauwe stip = eigen locatie.
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

let leafletPromise = null
function loadLeaflet() {
  if (typeof window !== 'undefined' && window.L) return Promise.resolve(window.L)
  if (leafletPromise) return leafletPromise
  leafletPromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      document.head.appendChild(link)
    }
    const s = document.createElement('script')
    s.src = LEAFLET_JS
    s.async = true
    s.onload = () => resolve(window.L)
    s.onerror = () => { leafletPromise = null; reject(new Error('Leaflet kon niet geladen worden')) }
    document.head.appendChild(s)
  })
  return leafletPromise
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export default function LeadMap({ leads, position, lockNames = {}, isLockedByOther, onOpen, height = 520 }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const meRef = useRef(null)
  const fittedRef = useRef(false)
  const openIdRef = useRef(null)
  const redrawingRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState(null)

  // Kaart aanmaken
  useEffect(() => {
    let cancelled = false
    loadLeaflet().then(L => {
      if (cancelled || !containerRef.current || mapRef.current) return
      const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        // v103: OSM weigert tegels zonder Referer ("osm.wiki/Blocked"). De app
        // staat op no-referrer (privacy bij prospect-links); voor de tegels
        // sturen we alleen ons eigen domein mee, geen pad.
        referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer nofollow" target="_blank">OpenStreetMap</a>'
      }).addTo(map)
      map.setView([52.1, 5.3], 8)
      layerRef.current = L.layerGroup().addTo(map)
      mapRef.current = map
      setReady(true)
    }).catch(e => setError(e.message))
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } }, [])

  // Leads tekenen
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!ready || !L || !map || !layerRef.current) return
    // De lijst ververst elke 8s; open popup niet laten wegklappen tijdens het hertekenen
    redrawingRef.current = true
    layerRef.current.clearLayers()
    const pts = []
    let reopen = null
    leads.forEach(lead => {
      if (lead.lat == null || lead.lng == null) return
      const busy = isLockedByOther ? isLockedByOther(lead) : false
      const color = outsideStatusColor(lead.status)
      const m = L.circleMarker([lead.lat, lead.lng], {
        radius: 11, color: '#fff', weight: 2, fillColor: color, fillOpacity: busy ? 0.45 : 0.95
      })
      const place = [lead.address && `${lead.address} ${lead.house_number || ''}`.trim(), lead.city].filter(Boolean).join(', ')
      const dist = lead._distance != null ? `<div style="color:#6B7A80;font-size:13px">${formatDistance(lead._distance)} van jou</div>` : ''
      const who = busy ? `<div style="color:#E6A100;font-size:13px;font-weight:600">In behandeling${lockNames[lead.id] ? ` bij ${esc(lockNames[lead.id])}` : ''}</div>` : ''
      const btn = busy ? '' : `<button type="button" data-open="${lead.id}" style="margin-top:8px;width:100%;height:40px;border:0;border-radius:10px;background:#2F8FDB;color:#fff;font-weight:600;font-size:14px;cursor:pointer">Openen</button>`
      m.bindPopup(
        `<div style="min-width:200px;font-family:inherit;color:#1F2A2E">
          <div style="font-weight:700;font-size:15px">${esc(lead.name || 'Naam onbekend')}</div>
          <div style="font-size:13px;color:#6B7A80">${esc(place)}</div>
          ${lead.phone ? `<div style="font-size:13px"><a href="tel:${esc(lead.phone)}" style="color:#2F8FDB">${esc(lead.phone)}</a></div>` : ''}
          ${dist}${who}${btn}
        </div>`,
        { closeButton: true, maxWidth: 280 }
      )
      m.on('popupopen', (e) => {
        openIdRef.current = lead.id
        const el = e.popup.getElement()?.querySelector('button[data-open]')
        if (el) el.onclick = () => { map.closePopup(); onOpen && onOpen(lead) }
      })
      m.on('popupclose', () => { if (!redrawingRef.current) openIdRef.current = null })
      m.addTo(layerRef.current)
      if (openIdRef.current === lead.id) reopen = m
      pts.push([lead.lat, lead.lng])
    })
    redrawingRef.current = false
    if (reopen) reopen.openPopup()
    if (!fittedRef.current && pts.length > 0) {
      if (position) pts.push([position.lat, position.lng])
      map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 15 })
      fittedRef.current = true
    }
    setTimeout(() => map.invalidateSize(), 50)
  }, [ready, leads, lockNames, isLockedByOther, onOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // Eigen locatie
  useEffect(() => {
    const L = window.L
    const map = mapRef.current
    if (!ready || !L || !map) return
    if (meRef.current) { map.removeLayer(meRef.current); meRef.current = null }
    if (!position) return
    const g = L.layerGroup()
    L.circle([position.lat, position.lng], { radius: Math.min(position.accuracy || 0, 300), color: '#2F8FDB', weight: 1, fillColor: '#2F8FDB', fillOpacity: 0.12 }).addTo(g)
    L.circleMarker([position.lat, position.lng], { radius: 8, color: '#fff', weight: 3, fillColor: '#2F8FDB', fillOpacity: 1 }).addTo(g)
    g.addTo(map)
    meRef.current = g
  }, [ready, position])

  const centerOnMe = () => {
    if (mapRef.current && position) mapRef.current.setView([position.lat, position.lng], Math.max(mapRef.current.getZoom(), 14))
  }

  const legend = [['new', 'Nieuw'], ['open', 'Open'], ['appointment', 'Afspraak'], ['sale', 'Sale'], ['closed', 'Gesloten']]

  return (
    <div style={{ position: 'relative', borderRadius: 'var(--radius-lg, 16px)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
      <div ref={containerRef} style={{ height, width: '100%', background: '#EEF5F2' }} />
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', background: 'var(--bg-card)' }}>
          {error}
        </div>
      )}
      {position && (
        <button
          type="button"
          onClick={centerOnMe}
          title="Naar mijn locatie"
          style={{ position: 'absolute', top: 12, right: 12, zIndex: 500, width: 44, height: 44, borderRadius: 10, border: 0, background: '#fff', color: '#2F8FDB', boxShadow: '0 2px 8px rgba(31,42,46,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <LocateFixed size={20} />
        </button>
      )}
      <div style={{ position: 'absolute', left: 12, bottom: 12, zIndex: 500, background: 'rgba(255,255,255,0.94)', borderRadius: 10, padding: '6px 10px', display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: '#1F2A2E', boxShadow: '0 1px 2px rgba(31,42,46,0.1)' }}>
        {legend.map(([k, label]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: OUTSIDE_STATUS_COLORS[k], border: '1px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.08)' }} />{label}
          </span>
        ))}
      </div>
    </div>
  )
}
