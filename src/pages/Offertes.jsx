// v112 (30-09-2026): pagina /offertes - alle offertes op een rij, per project,
// met wat er mee gebeurt: verstuurd, geopend (hoe vaak en wanneer), herinnerd,
// getekend of afgewezen. Bedoeld als het overzicht dat je bij Salesdock of een
// dealplatform verwacht, maar dan op onze eigen tabel public.offertes.
//
// Niets nieuws in de database: de statussen en tijdstippen worden al bijgehouden
// sinds v65 (Edge Functions offerte-send en offerte-sign). Wat hier bijkomt is
// het filteren per project (offertes.campaign_id, v112) en het in een keer zien
// van alle offertes in plaats van alleen die van een lead.
//
// Realtime: offertes zit in de publicatie supabase_realtime, dus een offerte die
// de klant opent of tekent springt hier vanzelf van kleur.
import { useEffect, useMemo, useState } from 'react'
import { FileSignature, Send, Ban, RefreshCw, Search, Trash2, ExternalLink, Filter } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import PersonSelect from '../components/PersonSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { OFFERTE_STATUS, OfferteChip } from '../components/OfferteStatus'
import { offerteHrefVoorBestaande } from '../hooks/useProjectTools'

const SELECT = `id, nummer, soort, status, zaak_naam, contact_naam, email, accountmanager, user_id,
  campaign_id, lead_id, eenmalig_ex, eenmalig_incl, maandbedrag_ex, created_at, updated_at,
  verzonden_op, verzonden_naar, sign_token_expires_at, geopend_op, geopend_aantal,
  herinnering_op, getekend_op, afgewezen_reden, akkoord`

const STATUS_GROEPEN = [
  { id: 'alles', label: 'Alles', statussen: null },
  { id: 'open', label: 'Open', statussen: ['verzonden', 'geopend'] },
  { id: 'concept', label: 'Concept', statussen: ['concept'] },
  { id: 'getekend', label: 'Getekend', statussen: ['getekend'] },
  { id: 'niets', label: 'Niet doorgegaan', statussen: ['afgewezen', 'verlopen', 'geannuleerd'] },
]

const euro = (n) => '€ ' + Number(n || 0).toLocaleString('nl-NL', { maximumFractionDigits: 0 })
const dt = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null
const dd = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : null

// Hoe lang staat een verstuurde offerte al stil? Dat is het getal waar je op
// stuurt: niet geopend na 2 dagen = bellen, wel geopend en niet getekend = bellen.
function stilte(o) {
  const ijk = o.geopend_op || o.verzonden_op
  if (!ijk || !['verzonden', 'geopend'].includes(o.status)) return null
  const dagen = Math.floor((Date.now() - new Date(ijk).getTime()) / 86400000)
  return dagen
}

export default function Offertes() {
  const { user, profile, isDemoMode } = useAuth()
  const toast = useToast()
  const isBeheer = profile?.role === 'admin' || profile?.role === 'manager'

  const [rows, setRows] = useState([])
  const [projecten, setProjecten] = useState([])
  const [mensen, setMensen] = useState([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState(null)
  const [busy, setBusy] = useState(null)

  const [projectId, setProjectId] = useState('')
  const [groep, setGroep] = useState('alles')
  const [wieId, setWieId] = useState('')
  const [zoek, setZoek] = useState('')

  async function laad() {
    if (!user?.id || isDemoMode) { setLaden(false); return }
    setFout(null)
    try {
      const { data, error } = await supabase
        .from('offertes').select(SELECT).order('created_at', { ascending: false }).limit(1000)
      if (error) throw error
      setRows(data || [])
    } catch (e) {
      setFout(e.message || 'Laden mislukt')
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => {
    laad()
    const ch = supabase
      .channel('offertes-overzicht')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'offertes' }, laad)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isDemoMode])

  useEffect(() => {
    let weg = false
    supabase.from('campaigns').select('id, name').is('deleted_at', null).order('name')
      .then(({ data }) => { if (!weg) setProjecten(data || []) })
    if (isBeheer) {
      supabase.from('profiles').select('id, full_name, email, role').is('deleted_at', null).order('full_name')
        .then(({ data }) => { if (!weg) setMensen(data || []) })
    }
    return () => { weg = true }
  }, [isBeheer])

  const projectNaam = useMemo(() => {
    const m = {}
    projecten.forEach(p => { m[p.id] = p.name })
    return m
  }, [projecten])

  const zichtbaar = useMemo(() => {
    const g = STATUS_GROEPEN.find(x => x.id === groep)
    const q = zoek.trim().toLowerCase()
    return rows.filter(o => {
      if (projectId && o.campaign_id !== projectId) return false
      if (g?.statussen && !g.statussen.includes(o.status)) return false
      if (wieId && o.user_id !== wieId) return false
      if (q && !`${o.nummer} ${o.zaak_naam || ''} ${o.contact_naam || ''} ${o.email || ''}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [rows, projectId, groep, wieId, zoek])

  // Cijfers over wat er nu zichtbaar is, zodat de filters ook de tellers sturen.
  const kpi = useMemo(() => {
    const open = zichtbaar.filter(o => ['verzonden', 'geopend'].includes(o.status))
    const getekend = zichtbaar.filter(o => o.status === 'getekend')
    const verstuurd = zichtbaar.filter(o => o.verzonden_op)
    const geopend = verstuurd.filter(o => o.geopend_op)
    return {
      open: open.length,
      openWaarde: open.reduce((a, o) => a + Number(o.eenmalig_ex || 0), 0),
      openMaand: open.reduce((a, o) => a + Number(o.maandbedrag_ex || 0), 0),
      getekend: getekend.length,
      getekendWaarde: getekend.reduce((a, o) => a + Number(o.eenmalig_ex || 0), 0),
      getekendMaand: getekend.reduce((a, o) => a + Number(o.maandbedrag_ex || 0), 0),
      openPct: verstuurd.length ? Math.round(geopend.length / verstuurd.length * 100) : 0,
      tekenPct: verstuurd.length ? Math.round(getekend.length / verstuurd.length * 100) : 0,
      verstuurd: verstuurd.length,
    }
  }, [zichtbaar])

  async function actie(o, wat) {
    if (wat === 'intrekken' && !confirm(`Offerte ${o.nummer} intrekken? De link van de klant werkt daarna niet meer.`)) return
    setBusy(o.id)
    try {
      const { data, error } = await supabase.functions.invoke('offerte-send', { body: { offerteId: o.id, actie: wat } })
      if (error) {
        let msg = error.message || 'Aanroep mislukt'
        try { const b = await error.context?.json?.(); if (b?.error) msg = b.error } catch { /* geen json */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      if (wat === 'herinneren') {
        toast(`Herinnering gemaild naar ${o.verzonden_naar || o.email}`, 'success')
        if (data?.url) { try { await navigator.clipboard.writeText(data.url) } catch { /* geen clipboard */ } }
      } else if (wat === 'versturen') {
        toast(`Nieuwe link gemaild, geldig tot ${data.geldigTot}`, 'success')
      } else {
        toast('Offerte ingetrokken', 'success')
      }
      laad()
    } catch (e) {
      toast(e.message, 'error')
    } finally { setBusy(null) }
  }

  async function verwijder(o) {
    if (!confirm(`Offerte ${o.nummer} van ${o.zaak_naam || 'onbekend'} definitief verwijderen?`)) return
    const { error } = await supabase.from('offertes').delete().eq('id', o.id)
    if (error) { toast(error.message, 'error'); return }
    setRows(prev => prev.filter(x => x.id !== o.id))
    toast('Offerte verwijderd', 'success')
  }

  const mag = (o) => isBeheer || o.user_id === profile?.id

  if (laden) return (<><Header /><main className="container pb-12"><LoadingSpinner /></main></>)

  return (
    <>
      <Header />
      <main className="container pb-12" style={{ maxWidth: '1280px' }}>
        <div className="flex justify-between items-center mb-4 pt-4" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title flex items-center gap-2" style={{ margin: 0 }}>
              <FileSignature size={26} className="text-primary" /> Offertes
            </h1>
            <p className="page-subtitle text-xs" style={{ margin: '4px 0 0' }}>
              Wat er met elke offerte gebeurt: verstuurd, geopend, herinnerd, getekend. Ververst zichzelf.
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={laad}><RefreshCw size={14} /> Verversen</button>
        </div>

        {fout && (
          <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 12px', borderRadius: 10, marginBottom: 12, fontSize: '0.85rem' }}>
            {fout}
          </div>
        )}

        {/* cijfers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Kaart k="Staat open" v={kpi.open} sub={`${euro(kpi.openWaarde)} eenmalig · ${euro(kpi.openMaand)}/mnd`} />
          <Kaart k="Getekend" v={kpi.getekend} sub={`${euro(kpi.getekendWaarde)} eenmalig · ${euro(kpi.getekendMaand)}/mnd`} accent />
          <Kaart k="Wordt geopend" v={`${kpi.openPct}%`} sub={`van ${kpi.verstuurd} verstuurde offertes`} />
          <Kaart k="Wordt getekend" v={`${kpi.tekenPct}%`} sub={`van ${kpi.verstuurd} verstuurde offertes`} />
        </div>

        {/* filters */}
        <div className="bg-elevated border border-border rounded-lg" style={{ padding: 10, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_GROEPEN.map(g => (
              <button key={g.id} className={`btn btn-sm ${groep === g.id ? '' : 'btn-outline'}`} onClick={() => setGroep(g.id)}
                style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                {g.label} ({g.statussen ? rows.filter(o => g.statussen.includes(o.status) && (!projectId || o.campaign_id === projectId)).length : rows.filter(o => !projectId || o.campaign_id === projectId).length})
              </button>
            ))}
          </div>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            style={{ background: 'var(--bg-input, var(--bg-elevated))', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 8, padding: '7px 10px', fontSize: '0.85rem' }}>
            <option value="">Alle projecten</option>
            {projecten.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {isBeheer && mensen.length > 0 && (
            <div className="flex items-center gap-2" style={{ minWidth: 200 }}>
              <Filter size={14} className="text-muted" />
              <PersonSelect people={mensen} value={wieId} onChange={setWieId} emptyLabel="Iedereen" showRole />
            </div>
          )}
          <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 180 }}>
            <Search size={14} className="text-muted" />
            <input type="text" value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoek op nummer, bedrijf of e-mail"
              style={{ width: '100%', background: 'transparent', border: 0, color: 'var(--text-primary)', outline: 'none', fontSize: '0.85rem' }} />
          </div>
        </div>

        {zichtbaar.length === 0 ? (
          <EmptyState title="Geen offertes" message={rows.length === 0 ? 'Er is nog geen offerte gemaakt. Dat doe je vanaf de contactkaart van een lead.' : 'Geen offertes in dit filter.'} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {zichtbaar.map(o => {
              const s = OFFERTE_STATUS[o.status] || OFFERTE_STATUS.concept
              const openStatus = ['verzonden', 'geopend'].includes(o.status)
              const dagen = stilte(o)
              const href = offerteHrefVoorBestaande(o)
              return (
                <div key={o.id} className="bg-elevated border border-border rounded-lg"
                  style={{ padding: '12px 14px', borderLeft: `3px solid ${s.color}`, opacity: ['verlopen', 'geannuleerd'].includes(o.status) ? 0.72 : 1 }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 200, flex: 1 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700 }}>{o.zaak_naam || 'Zonder naam'}</span>
                        <OfferteChip status={o.status} />
                        {dagen !== null && dagen >= 2 && (
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--warning)', background: 'var(--warning-bg)', padding: '2px 8px', borderRadius: 999 }}>
                            {dagen} dagen stil
                          </span>
                        )}
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.78rem', marginTop: 2 }}>
                        <span className="mono-num">{href ? <a href={href} target="_blank" rel="noopener" title="Offerte openen">{o.nummer}</a> : o.nummer}</span>
                        {o.campaign_id && projectNaam[o.campaign_id] ? ` · ${projectNaam[o.campaign_id]}` : ''}
                        {o.accountmanager ? ` · ${o.accountmanager}` : ''}
                        {o.contact_naam ? ` · ${o.contact_naam}` : ''}
                      </div>
                    </div>
                    <div style={{ minWidth: 150 }}>
                      <div style={{ fontWeight: 700 }}>{euro(o.eenmalig_ex)}<span className="text-muted" style={{ fontWeight: 400, fontSize: '0.75rem' }}> eenmalig</span></div>
                      {Number(o.maandbedrag_ex) > 0 && (
                        <div style={{ fontWeight: 700 }}>{euro(o.maandbedrag_ex)}<span className="text-muted" style={{ fontWeight: 400, fontSize: '0.75rem' }}> per maand</span></div>
                      )}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.75rem', minWidth: 230, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '1px 10px' }}>
                      {o.verzonden_op
                        ? <><span>Verstuurd</span><span>{dt(o.verzonden_op)}{o.verzonden_naar ? ` naar ${o.verzonden_naar}` : ''}</span></>
                        : <><span>Concept</span><span>nog niet verstuurd</span></>}
                      {o.verzonden_op && (o.geopend_op
                        ? <><span>Geopend</span><span style={{ color: 'var(--warning)' }}>{dt(o.geopend_op)}{o.geopend_aantal > 1 ? ` (${o.geopend_aantal}×)` : ''}</span></>
                        : <><span>Geopend</span><span>nog niet</span></>)}
                      {o.herinnering_op && <><span>Herinnerd</span><span>{dt(o.herinnering_op)}</span></>}
                      {openStatus && o.sign_token_expires_at && <><span>Geldig tot</span><span>{dd(o.sign_token_expires_at)}</span></>}
                      {o.getekend_op && <><span>Getekend</span><span style={{ color: 'var(--success)' }}>{dt(o.getekend_op)}{o.akkoord?.door ? ` door ${o.akkoord.door}` : ''}{o.akkoord?.methode === 'op_afstand' ? ' (via link)' : o.akkoord ? ' (op locatie)' : ''}</span></>}
                      {o.afgewezen_reden && <><span>Afgewezen</span><span style={{ color: 'var(--danger)' }}>{o.afgewezen_reden}</span></>}
                    </div>
                  </div>
                  {mag(o) && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                      {openStatus && (
                        <button className="btn btn-outline btn-sm" disabled={busy === o.id} onClick={() => actie(o, 'herinneren')} title="Mailt de klant opnieuw de link; de link wordt ook gekopieerd">
                          <Send size={12} /> Herinnering
                        </button>
                      )}
                      {o.status === 'verlopen' && (
                        <button className="btn btn-outline btn-sm" disabled={busy === o.id} onClick={() => actie(o, 'versturen')}>
                          <Send size={12} /> Nieuwe link mailen
                        </button>
                      )}
                      {href && (
                        <a className="btn btn-outline btn-sm" href={href} target="_blank" rel="noopener" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                          <ExternalLink size={12} /> {o.status === 'getekend' ? 'Getekende offerte (pdf)' : 'Offerte openen'}
                        </a>
                      )}
                      {(openStatus || o.status === 'verlopen') && (
                        <button className="btn btn-outline btn-sm" disabled={busy === o.id} onClick={() => actie(o, 'intrekken')} style={{ color: 'var(--danger)' }}>
                          <Ban size={12} /> Intrekken
                        </button>
                      )}
                      {(profile?.role === 'admin' || o.user_id === profile?.id) && o.status !== 'getekend' && (
                        <button className="btn btn-outline btn-sm" onClick={() => verwijder(o)} style={{ color: 'var(--danger)' }} title="Offerte verwijderen">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}

function Kaart({ k, v, sub, accent }) {
  return (
    <div className="bg-elevated border border-border rounded-lg" style={{ padding: '12px 14px' }}>
      <div className="text-muted" style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 700 }}>{k}</div>
      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: accent ? 'var(--success)' : 'var(--text-primary)', lineHeight: 1.1, marginTop: 2 }}>{v}</div>
      <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>{sub}</div>
    </div>
  )
}
