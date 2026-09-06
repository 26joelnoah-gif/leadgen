import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Map as MapIcon, List, Search, LocateFixed, Phone, Navigation, ChevronRight, ChevronDown, FileSignature, User, DoorClosed, XCircle, RotateCcw, CalendarCheck, Layers, PhoneIncoming, X, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { loadGoogleMaps, geocodeAddress, GOOGLE_MAPS_KEY } from '../lib/googleMaps'
import { getStatusDetails } from '../utils/statusUtils'
import {
  distanceMeters, formatDistance, leadAddressLine, leadHasAddress,
  OUTSIDE_CATEGORIES, outsideCategory, groupByStreet, routeUrl
} from '../utils/outsideUtils'
import LeadDetailModal from '../components/LeadDetailModal'

// v64: Outside - buitendienst/deur-aan-deur. Zelfde leads als de rest van
// LeadGen (routing v17: lead blijft in zijn lijst, afboeking = status +
// call_log via handleLeadDisposition). Dit scherm is alleen een andere
// ingang: kaart + lijst per straat met afstand vanaf de telefoon.
// Styling: OUTSIDE_STYLEGUIDE.md, tokens in src/styles/outside.css.

const GEOCODE_BATCH = 150   // max adressen per keer koppelen (Google-quota sparen)
const GEOCODE_GAP_MS = 80

// Afboek-knoppen aan de deur -> bestaande STATUS_MAP-keys (geen nieuwe statussen)
const DOOR_DISPOSITIONS = [
  { key: 'geen_gehoor', label: 'Niet thuis', icon: DoorClosed },
  { key: 'geen_interesse', label: 'Geen interesse', icon: XCircle },
  { key: 'later_bellen', label: 'Terugkomen', icon: RotateCcw },
  { key: 'afspraak_gemaakt', label: 'Afspraak', icon: CalendarCheck },
]

// v65: opt-in aan de deur - bewoner geeft toestemming om gebeld te worden.
// Gegevens (naam/telefoon/e-mail/voorkeurstijd) gaan op de lead, toestemming
// wordt vastgelegd (leads.opt_in_at/opt_in_by/opt_in_source) en de lead
// gaat als terugbelafspraak (TBA) de belwachtrij van het project in.
const OPT_IN_SLOTS = [
  { key: 'morning', label: 'Ochtend (10:00)', hour: 10 },
  { key: 'afternoon', label: 'Middag (14:00)', hour: 14 },
  { key: 'evening', label: 'Begin avond (18:30)', hour: 18, minute: 30 },
  { key: 'any', label: 'Geen voorkeur (11:00)', hour: 11 },
]
function nextWorkdayAt(hour, minute = 0) {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  d.setHours(hour, minute, 0, 0)
  return d
}

function initials(name) {
  return (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?'
}

export default function Outside() {
  const { user, profile, isDemoMode } = useAuth()
  const { leads, loading, handleLeadDisposition, fetchLeads } = useLeads()
  const showToast = useToast()
  // v66: "Offerte maken" alleen als de offerte-tool in het GEKOZEN project aanstaat
  // (admin altijd), niet meer op de union van al je projecten.
  const [offerteCampaignIds, setOfferteCampaignIds] = useState(new Set())

  const [view, setView] = useState('map')          // 'map' | 'list'
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [campaignId, setCampaignId] = useState('')
  const [campaigns, setCampaigns] = useState([])   // { id, name, hasOutside }
  const [listCampaign, setListCampaign] = useState({}) // lead_list_id -> campaign_id
  const [profiles, setProfiles] = useState({})     // id -> full_name
  const [userPos, setUserPos] = useState(null)
  const [coords, setCoords] = useState({})         // lead_id -> { lat, lng } (lokaal na geocoding)
  const [geoProgress, setGeoProgress] = useState(null) // { done, total }
  const [selectedId, setSelectedId] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [optIn, setOptIn] = useState(null)          // formulierstate zolang het opt-in-formulier open is
  const [mapsReady, setMapsReady] = useState(false)
  const [mapsError, setMapsError] = useState(null)
  const [mapType, setMapType] = useState('roadmap')

  const mapEl = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef(new Map())
  const userMarkerRef = useRef(null)
  const geocodingRef = useRef(false)

  // ---------- Projecten (campagnes) + welke hebben de Outside-tool ----------
  useEffect(() => {
    if (isDemoMode || !user?.id) return
    const listIds = [...new Set(leads.map(l => l.lead_list_id).filter(Boolean))]
    if (listIds.length === 0) return
    let alive = true
    ;(async () => {
      const { data: lists } = await supabase.from('lead_lists').select('id, campaign_id, campaigns(id, name, type)').in('id', listIds)
      const { data: tools } = await supabase.from('campaign_tools').select('campaign_id, tool_key').in('tool_key', ['outside', 'offerte_bestelplatform'])
      if (!alive) return
      const outsideIds = new Set((tools || []).filter(t => t.tool_key === 'outside').map(t => t.campaign_id))
      setOfferteCampaignIds(new Set((tools || []).filter(t => t.tool_key === 'offerte_bestelplatform').map(t => t.campaign_id)))
      const map = {}
      const camps = new Map()
      for (const l of lists || []) {
        if (!l.campaigns || l.campaigns.type === 'recruitment') continue
        map[l.id] = l.campaign_id
        camps.set(l.campaign_id, { id: l.campaign_id, name: l.campaigns.name, hasOutside: outsideIds.has(l.campaign_id) })
      }
      const arr = [...camps.values()].sort((a, b) => (b.hasOutside - a.hasOutside) || a.name.localeCompare(b.name))
      setListCampaign(map)
      setCampaigns(arr)
      setCampaignId(prev => prev && arr.some(c => c.id === prev) ? prev : (arr[0]?.id || ''))
    })()
    return () => { alive = false }
  }, [leads, isDemoMode, user?.id])

  // Namen van toegewezen verkopers (initialen in de rij)
  useEffect(() => {
    if (isDemoMode) return
    const ids = [...new Set(leads.map(l => l.assigned_to).filter(Boolean))]
    if (ids.length === 0) return
    supabase.from('profiles').select('id, full_name').in('id', ids).then(({ data }) => {
      const m = {}
      for (const p of data || []) m[p.id] = p.full_name
      setProfiles(m)
    })
  }, [leads, isDemoMode])

  // ---------- Locatie van de telefoon ----------
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      pos => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // ---------- Leads van het gekozen project, met coördinaten + afstand ----------
  const projectLeads = useMemo(() => {
    return leads
      .filter(l => !campaignId || listCampaign[l.lead_list_id] === campaignId)
      .map(l => {
        const c = coords[l.id]
        const lat = c?.lat ?? l.lat
        const lng = c?.lng ?? l.lng
        const withCoords = { ...l, lat, lng }
        withCoords._category = outsideCategory(l.status)
        withCoords._distance = (lat != null && userPos) ? distanceMeters(userPos, { lat, lng }) : null
        return withCoords
      })
  }, [leads, campaignId, listCampaign, coords, userPos])

  const visibleLeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return projectLeads.filter(l => {
      if (catFilter !== 'all' && l._category !== catFilter) return false
      if (!q) return true
      return [l.name, l.contact_person, l.address, l.house_number, l.postal_code, l.city].some(v => (v || '').toLowerCase().includes(q))
    })
  }, [projectLeads, search, catFilter])

  const groups = useMemo(() => groupByStreet(visibleLeads, userPos), [visibleLeads, userPos])
  const selected = useMemo(() => projectLeads.find(l => l.id === selectedId) || null, [projectLeads, selectedId])
  const hasOfferte = profile?.role === 'admin' || (!!campaignId && offerteCampaignIds.has(campaignId))
  useEffect(() => { setOptIn(null) }, [selectedId])

  const counts = useMemo(() => {
    const c = { all: projectLeads.length }
    for (const k of Object.keys(OUTSIDE_CATEGORIES)) c[k] = 0
    for (const l of projectLeads) c[l._category]++
    return c
  }, [projectLeads])

  // ---------- Google Maps laden ----------
  useEffect(() => {
    let alive = true
    loadGoogleMaps().then(maps => { if (alive) setMapsReady(Boolean(maps)) }).catch(err => { if (alive) setMapsError(err.message) })
    return () => { alive = false }
  }, [])

  // Kaart aanmaken zodra de container er is
  useEffect(() => {
    if (!mapsReady || view !== 'map' || !mapEl.current || mapRef.current) return
    const maps = window.google.maps
    mapRef.current = new maps.Map(mapEl.current, {
      center: userPos || { lat: 52.37, lng: 4.9 },
      zoom: userPos ? 15 : 8,
      disableDefaultUI: true,
      clickableIcons: false,
      gestureHandling: 'greedy',
      mapTypeId: mapType,
    })
    mapRef.current.addListener('click', () => setSelectedId(null))
  }, [mapsReady, view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Bij wisselen naar lijst raakt de kaart-container weg; markers opnieuw opbouwen bij terugkomst
  useEffect(() => {
    if (view === 'list' && mapRef.current) {
      markersRef.current.forEach(m => m.setMap(null))
      markersRef.current.clear()
      if (userMarkerRef.current) { userMarkerRef.current.setMap(null); userMarkerRef.current = null }
      mapRef.current = null
    }
  }, [view])

  useEffect(() => {
    if (mapRef.current) mapRef.current.setMapTypeId(mapType)
  }, [mapType])

  // Markers synchroniseren met de zichtbare leads
  useEffect(() => {
    if (!mapRef.current || !mapsReady) return
    const maps = window.google.maps
    const map = mapRef.current
    const keep = new Set()
    let first = markersRef.current.size === 0
    const bounds = new maps.LatLngBounds()
    for (const l of visibleLeads) {
      if (l.lat == null || l.lng == null) continue
      keep.add(l.id)
      const isSel = l.id === selectedId
      const icon = {
        path: maps.SymbolPath.CIRCLE,
        scale: isSel ? 14 : 10,
        fillColor: OUTSIDE_CATEGORIES[l._category].hex,
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
      }
      let m = markersRef.current.get(l.id)
      if (!m) {
        m = new maps.Marker({ position: { lat: l.lat, lng: l.lng }, map, icon, title: leadAddressLine(l) })
        m.addListener('click', () => setSelectedId(l.id))
        markersRef.current.set(l.id, m)
      } else {
        m.setIcon(icon)
        m.setZIndex(isSel ? 1000 : undefined)
      }
      bounds.extend({ lat: l.lat, lng: l.lng })
    }
    for (const [id, m] of markersRef.current) {
      if (!keep.has(id)) { m.setMap(null); markersRef.current.delete(id) }
    }
    if (first && keep.size > 0) {
      if (userPos) bounds.extend(userPos)
      map.fitBounds(bounds, 48)
    }
  }, [visibleLeads, selectedId, mapsReady, view]) // eslint-disable-line react-hooks/exhaustive-deps

  // Eigen locatie als blauwe stip
  useEffect(() => {
    if (!mapRef.current || !mapsReady || !userPos) return
    const maps = window.google.maps
    if (!userMarkerRef.current) {
      userMarkerRef.current = new maps.Marker({
        position: userPos, map: mapRef.current, zIndex: 2000, clickable: false,
        icon: { path: maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#2F8FDB', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 3 },
      })
    } else {
      userMarkerRef.current.setPosition(userPos)
    }
  }, [userPos, mapsReady, view])

  // Geselecteerde lead in beeld brengen
  useEffect(() => {
    if (!mapRef.current || !selected || selected.lat == null) return
    mapRef.current.panTo({ lat: selected.lat, lng: selected.lng })
  }, [selectedId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Geocoding: adressen zonder coördinaten koppelen ----------
  const runGeocoding = useCallback(async () => {
    if (!mapsReady || geocodingRef.current || isDemoMode) return
    const pending = projectLeads.filter(l => l.lat == null && !l.geocode_status && !coords[l.id]).slice(0, GEOCODE_BATCH)
    if (pending.length === 0) return
    geocodingRef.current = true
    const maps = window.google.maps
    let done = 0
    setGeoProgress({ done, total: pending.length })
    try {
      for (const l of pending) {
        if (!leadHasAddress(l)) {
          await supabase.from('leads').update({ geocode_status: 'no_address', geocoded_at: new Date().toISOString() }).eq('id', l.id)
          setCoords(prev => ({ ...prev, [l.id]: { lat: null, lng: null } }))
        } else {
          const pos = await geocodeAddress(maps, leadAddressLine(l))
          if (pos) {
            await supabase.from('leads').update({ lat: pos.lat, lng: pos.lng, geocode_status: 'ok', geocoded_at: new Date().toISOString() }).eq('id', l.id)
            setCoords(prev => ({ ...prev, [l.id]: pos }))
          } else {
            await supabase.from('leads').update({ geocode_status: 'failed', geocoded_at: new Date().toISOString() }).eq('id', l.id)
            setCoords(prev => ({ ...prev, [l.id]: { lat: null, lng: null } }))
          }
          await new Promise(r => setTimeout(r, GEOCODE_GAP_MS))
        }
        done++
        setGeoProgress({ done, total: pending.length })
      }
    } catch (err) {
      console.error('geocoding gestopt:', err)
      showToast?.('Adressen koppelen gestopt: ' + (err?.message || 'Google-fout'), 'error')
    } finally {
      geocodingRef.current = false
      setGeoProgress(null)
    }
  }, [mapsReady, projectLeads, coords, isDemoMode, showToast])

  useEffect(() => { runGeocoding() }, [mapsReady, campaignId, leads.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Acties ----------
  async function dispose(lead, key) {
    if (busy) return
    setBusy(true)
    try {
      await handleLeadDisposition(lead.id, null, key, 'Outside: aan de deur', null, { startedAt: new Date().toISOString() })
      showToast?.(`${lead.name || leadAddressLine(lead)}: ${getStatusDetails(key).label}`, 'success')
      setSelectedId(null)
    } finally {
      setBusy(false)
    }
  }

  function openOptIn(lead) {
    setOptIn({ name: lead.contact_person || lead.name || '', phone: lead.phone || '', email: lead.email || '', slot: 'any', consent: false })
  }

  async function saveOptIn(lead) {
    if (busy || !optIn) return
    const phone = optIn.phone.replace(/[^\d+]/g, '')
    if (!optIn.consent) { showToast?.('Vink aan dat de bewoner toestemming geeft.', 'error'); return }
    if (phone.length < 8) { showToast?.('Vul een geldig telefoonnummer in.', 'error'); return }
    setBusy(true)
    try {
      const slot = OPT_IN_SLOTS.find(s => s.key === optIn.slot) || OPT_IN_SLOTS[3]
      const when = nextWorkdayAt(slot.hour, slot.minute || 0)
      const nameIn = optIn.name.trim()
      const fields = {
        phone,
        email: optIn.email.trim() || lead.email || null,
        opt_in_at: new Date().toISOString(),
        opt_in_by: user?.id || null,
        opt_in_source: 'door',
        opt_in_slot: slot.key,
      }
      if (nameIn) {
        if (!(lead.name || '').trim()) fields.name = nameIn
        else if (nameIn !== lead.name) fields.contact_person = nameIn
      }
      const { error } = await supabase.from('leads').update(fields).eq('id', lead.id)
      if (error) throw error
      const note = `Opt-in aan de deur: ${nameIn || 'bewoner'} geeft toestemming om gebeld te worden, voorkeur ${slot.label.toLowerCase()}`
      await handleLeadDisposition(lead.id, null, 'terugbelafspraak', note, when.toISOString(), { startedAt: new Date().toISOString() })
      showToast?.('Opt-in vastgelegd, lead staat klaar voor het belteam', 'success')
      setOptIn(null)
      setSelectedId(null)
    } catch (err) {
      console.error('opt-in mislukt:', err)
      showToast?.('Opslaan mislukt: ' + (err?.message || 'onbekende fout'), 'error')
    } finally {
      setBusy(false)
    }
  }

  function centerOnMe() {
    if (!userPos) { showToast?.('Locatie nog niet bekend. Sta locatie toe in je browser.', 'error'); return }
    if (mapRef.current) { mapRef.current.panTo(userPos); mapRef.current.setZoom(16) }
  }

  const offerteHref = selected ? `/tools/offerte-tool.html?lead=${encodeURIComponent(selected.id)}&zaak=${encodeURIComponent(selected.name || '')}` : '#'
  const withoutCoords = projectLeads.filter(l => l.lat == null).length

  return (
    <div data-tool="outside">
      <header className="os-header">
        <Link to="/tools" className="os-iconbtn" aria-label="Terug"><ArrowLeft size={24} /></Link>
        <div className="os-title">Outside</div>
        {campaigns.length > 0 && (
          <select value={campaignId} onChange={e => { setCampaignId(e.target.value); setSelectedId(null) }} aria-label="Project">
            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.hasOutside ? '' : ' (zonder Outside)'}</option>)}
          </select>
        )}
        <button className={`os-iconbtn ${view === 'list' ? 'is-active' : ''}`} onClick={() => setView(v => v === 'map' ? 'list' : 'map')} aria-label={view === 'map' ? 'Lijst' : 'Kaart'}>
          {view === 'map' ? <List size={24} /> : <MapIcon size={24} />}
        </button>
      </header>
      <div className="os-legend"><i /><i /><i /><i /></div>

      <div className="os-toolbar">
        <label className="os-search">
          <Search size={18} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Zoek straat, naam of plaats" inputMode="search" />
        </label>
        <button className="os-neutral" onClick={centerOnMe} aria-label="Mijn locatie"><LocateFixed size={20} /></button>
      </div>
      <div className="os-chips">
        <button className={`os-chip ${catFilter === 'all' ? 'is-active' : ''}`} onClick={() => setCatFilter('all')}>Alles {counts.all}</button>
        {Object.entries(OUTSIDE_CATEGORIES).map(([k, c]) => (
          <button key={k} className={`os-chip ${catFilter === k ? 'is-active' : ''}`} onClick={() => setCatFilter(k)}>
            <span className="os-dot" style={{ background: c.hex }} />{c.label} {counts[k]}
          </button>
        ))}
      </div>
      {geoProgress && <div className="os-progress">Adressen koppelen… {geoProgress.done} van {geoProgress.total}</div>}

      <div className="os-body">
        {view === 'map' ? (
          <>
            {!GOOGLE_MAPS_KEY ? (
              <div className="os-notice">De kaart heeft een Google Maps-sleutel nodig (omgevingsvariabele <b>VITE_GOOGLE_MAPS_KEY</b> in Netlify en in .env). Tot die tijd werkt alleen de lijst.</div>
            ) : mapsError ? (
              <div className="os-notice">Google Maps kon niet laden: {mapsError}</div>
            ) : null}
            <div ref={mapEl} className="os-map" />
            {mapsReady && (
              <>
                <button className="os-mapbtn" style={{ top: 12, right: 12 }} onClick={centerOnMe} aria-label="Mijn locatie"><LocateFixed size={22} /></button>
                <button className={`os-mapbtn ${mapType === 'hybrid' ? 'is-active' : ''}`} style={{ bottom: selected ? 'auto' : 12, top: selected ? 68 : 'auto', left: 12 }} onClick={() => setMapType(t => t === 'roadmap' ? 'hybrid' : 'roadmap')} aria-label="Kaart of satelliet"><Layers size={22} /></button>
              </>
            )}
            {mapsReady && !loading && withoutCoords > 0 && !geoProgress && (
              <div className="os-notice" style={{ position: 'absolute', left: 0, right: 0, top: 0, margin: 12 }}>
                {withoutCoords} van {projectLeads.length} adressen staan (nog) niet op de kaart{withoutCoords > GEOCODE_BATCH ? '; ze worden in porties gekoppeld, open het scherm straks nog eens' : ''}.
              </div>
            )}
          </>
        ) : (
          <div className="os-list">
            {loading ? (
              <div className="os-empty">Laden…</div>
            ) : groups.length === 0 ? (
              <div className="os-empty">Geen adressen in dit project{search ? ' voor deze zoekopdracht' : ''}.</div>
            ) : groups.map(g => (
              <div key={g.key}>
                <div className="os-group-head">
                  <span>{g.street}{g.city ? `, ${g.city}` : ''}{g.postal_code ? `  ${g.postal_code}` : ''}</span>
                  {g.minDistance != null && <span>{formatDistance(g.minDistance)}</span>}
                </div>
                {g.leads.map(l => {
                  const cat = OUTSIDE_CATEGORIES[l._category]
                  const label = getStatusDetails(l.status).label
                  return (
                    <button key={l.id} className={`os-row ${l.id === selectedId ? 'is-selected' : ''}`} onClick={() => setSelectedId(l.id)}>
                      <span className="os-nr">{l.house_number || '–'}</span>
                      <span className="os-main">
                        <span className={`os-name ${l.name ? '' : 'is-unknown'}`}>{l.name || 'Naam onbekend'}</span>
                        <span className="os-meta">
                          <span className="os-dot" style={{ background: cat.hex }} />
                          {label}
                          {l._distance != null && <> • {formatDistance(l._distance)}</>}
                          {l.lat == null && l.geocode_status && <> • niet op kaart</>}
                        </span>
                      </span>
                      {l.assigned_to && <span className="os-avatar" title={profiles[l.assigned_to] || ''}>{initials(profiles[l.assigned_to])}</span>}
                      <ChevronRight size={20} style={{ color: 'var(--text-secondary)', flex: 'none' }} />
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {selected && (
          <div className="os-sheet">
            <div className="os-handle" onClick={() => setSelectedId(null)} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3>{[selected.address, selected.house_number].filter(Boolean).join(' ') || selected.name || 'Adres onbekend'}</h3>
                <div className="os-sub">
                  {[selected.postal_code, selected.city].filter(Boolean).join(' ')}
                  {selected.name && selected.address ? ` • ${selected.name}` : ''}
                  {selected._distance != null ? ` • ${formatDistance(selected._distance)}` : ''}
                </div>
              </div>
              <span className="os-statuschip" style={{ background: OUTSIDE_CATEGORIES[selected._category].hex + '22', color: OUTSIDE_CATEGORIES[selected._category].hex }}>
                <span className="os-dot" style={{ background: OUTSIDE_CATEGORIES[selected._category].hex }} />{getStatusDetails(selected.status).label}
              </span>
              <button className="os-iconbtn" style={{ color: 'var(--text-secondary)', width: 36, height: 36 }} onClick={() => setSelectedId(null)} aria-label="Sluiten"><ChevronDown size={22} /></button>
            </div>

            <div className="os-actions">
              <a className="os-secondary" href={selected.phone ? `tel:${selected.phone}` : undefined} aria-disabled={!selected.phone} style={!selected.phone ? { opacity: 0.4, pointerEvents: 'none' } : undefined}><Phone size={18} /> Bel</a>
              <a className="os-secondary" href={routeUrl(selected)} target="_blank" rel="noopener noreferrer"><Navigation size={18} /> Route</a>
              <button className="os-secondary" onClick={() => setDetailOpen(true)}><User size={18} /> Kaart</button>
            </div>

            {optIn ? (
              <div className="os-optin">
                <div className="os-optin-head">
                  <strong>Mag gebeld worden</strong>
                  <button className="os-iconbtn" style={{ color: 'var(--text-secondary)', width: 36, height: 36 }} onClick={() => setOptIn(null)} aria-label="Annuleren"><X size={20} /></button>
                </div>
                <label>Naam bewoner<input value={optIn.name} onChange={e => setOptIn(o => ({ ...o, name: e.target.value }))} placeholder="Voor- en achternaam" autoComplete="off" /></label>
                <label>Telefoonnummer *<input value={optIn.phone} onChange={e => setOptIn(o => ({ ...o, phone: e.target.value }))} inputMode="tel" placeholder="06 12345678" autoComplete="off" /></label>
                <label>E-mail (optioneel)<input value={optIn.email} onChange={e => setOptIn(o => ({ ...o, email: e.target.value }))} inputMode="email" placeholder="naam@voorbeeld.nl" autoComplete="off" /></label>
                <label>Wanneer bellen?
                  <select value={optIn.slot} onChange={e => setOptIn(o => ({ ...o, slot: e.target.value }))}>
                    {OPT_IN_SLOTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </label>
                <label className={`os-consent ${optIn.consent ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={optIn.consent} onChange={e => setOptIn(o => ({ ...o, consent: e.target.checked }))} />
                  <span>De bewoner geeft toestemming dat wij hem/haar telefonisch benaderen over ons aanbod. Dit is mondeling aan de deur bevestigd.</span>
                </label>
                <button className="os-primary" disabled={busy || !optIn.consent} onClick={() => saveOptIn(selected)}><Check size={20} /> Opt-in vastleggen</button>
              </div>
            ) : (
              <div className="os-dispo">
                {DOOR_DISPOSITIONS.map(d => {
                  const Icon = d.icon
                  return <button key={d.key} disabled={busy} onClick={() => dispose(selected, d.key)}><Icon size={18} /> {d.label}</button>
                })}
                <button className="is-optin" disabled={busy} onClick={() => openOptIn(selected)}><PhoneIncoming size={18} /> Mag gebeld worden</button>
              </div>
            )}

            {hasOfferte && !optIn && (
              <a className="os-primary" href={offerteHref}><FileSignature size={20} /> Offerte maken</a>
            )}
          </div>
        )}
      </div>

      <LeadDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        lead={selected}
        assignedName={selected?.assigned_to ? profiles[selected.assigned_to] : null}
        onUpdated={() => fetchLeads()}
      />
    </div>
  )
}
