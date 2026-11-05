import { useEffect, useMemo, useState } from 'react'
import { Search, Download, Users, Wallet, MapPin, CheckCircle, LayoutGrid, List } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'
import PersonSelect, { roleLabel } from './PersonSelect'
import { SOORTEN } from './Plaatsingen'
import { exportToCSV } from '../utils/exportUtils'
import { formatDate } from '../utils/dateUtils'

// v155: tabblad "Personeel" in Admin.
// 1. Wie werkt waar: per persoon functie, projecten (via team of als manager),
//    plek (lopende plaatsing uit v153) en door welke recruiter geplaatst.
// 2. Recruiter-verdiensten: een recruiter verdient per sale van de mensen die
//    hij/zij plaatste. Bedrag per sale staat per geplaatste persoon
//    (plaatsingen.bedrag_per_sale), het aantal sales vult de admin per maand in
//    (plaatsing_sales). Een maandregel bewaart bedrag + recruiter van dat moment,
//    zodat oude maanden niet veranderen als het bedrag later anders wordt.
// Migratie: supabase/migrations/migration_v155_recruiter_verdiensten.sql.
// Haalt zijn eigen gegevens op, zodat hij zowel in Admin als op /manager werkt.
// Een manager ziet alleen de projecten die hij via RLS mag zien (standaard filter
// "Mijn projecten") en geen verdiensten (canEarnings = alleen admin).

const NIET_IN_OVERZICHT = ['admin', 'aanbrenger', 'extern']
const RECRUITER_ROLLEN = ['recruiter', 'manager', 'admin']

function huidigeMaand() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function maandStart(m) { return `${m}-01` }
function maandEind(m) {
  const [j, mm] = m.split('-').map(Number)
  const d = new Date(Date.UTC(j, mm, 0))
  return d.toISOString().slice(0, 10)
}
function maandLabel(m) {
  const [j, mm] = m.split('-').map(Number)
  return new Date(j, mm - 1, 1).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
}
function vandaag() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}
const euro = n => `€ ${(Number(n) || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const naarGetal = v => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

const chip = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '999px', background: 'var(--bg-elevated)', fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap' }
const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 800, whiteSpace: 'nowrap' }
const td = { padding: '8px 10px', verticalAlign: 'middle', borderTop: '1px solid var(--border)', fontSize: '0.85rem' }

export default function PersoneelOverzicht({ canEarnings = false, isManager = false }) {
  const toast = useToast()
  const [weergave, setWeergave] = useState('personeel')
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [teams, setTeams] = useState([])
  const [campaignTeams, setCampaignTeams] = useState([])
  const [managerLinks, setManagerLinks] = useState([])
  const [locaties, setLocaties] = useState([])
  const [plaatsingen, setPlaatsingen] = useState([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState(null)

  async function laadPlaatsingen() {
    const [l, p] = await Promise.all([
      supabase.from('plaatsing_locaties').select('*').order('volgorde').order('naam'),
      supabase.from('plaatsingen').select('*').order('start_op', { ascending: false })
    ])
    // Plaatsingen zijn een extraatje: een fout hier sloopt het overzicht niet
    if (!l.error) setLocaties(l.data || [])
    if (!p.error) setPlaatsingen(p.data || [])
  }

  async function laad() {
    try {
      const [u, c, t, ct, cm] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, role, is_active, deleted_at').is('deleted_at', null).order('full_name'),
        supabase.from('campaigns').select('id, name, type, is_active').is('deleted_at', null).order('name'),
        supabase.from('teams').select('id, name, team_members(profile_id)'),
        supabase.from('campaign_teams').select('campaign_id, team_id'),
        supabase.from('campaign_managers').select('campaign_id, manager_id')
      ])
      const e = u.error || c.error || t.error || ct.error || cm.error
      if (e) throw e
      setUsers(u.data || [])
      setProjects((c.data || []).filter(x => x.type !== 'recruitment'))
      setTeams(t.data || [])
      setCampaignTeams(ct.data || [])
      setManagerLinks(cm.data || [])
      setFout(null)
    } catch (err) {
      setFout(err.message)
    }
    await laadPlaatsingen()
    setLaden(false)
  }
  useEffect(() => { laad() }, [])

  // Projecten per persoon: zelfde route als my_list_ids() - team -> campaign_teams,
  // plus campaign_managers. Alleen projecten die deze kijker mag zien.
  const projectenVan = useMemo(() => {
    const projById = new Map(projects.map(p => [p.id, p]))
    const teamsVan = new Map()
    for (const t of teams) for (const m of (t.team_members || [])) {
      if (!teamsVan.has(m.profile_id)) teamsVan.set(m.profile_id, [])
      teamsVan.get(m.profile_id).push(t.id)
    }
    const projVanTeam = new Map()
    for (const ct of campaignTeams) {
      if (!projVanTeam.has(ct.team_id)) projVanTeam.set(ct.team_id, [])
      projVanTeam.get(ct.team_id).push(ct.campaign_id)
    }
    const uit = new Map()
    for (const u of users) {
      const ids = new Set()
      for (const tid of (teamsVan.get(u.id) || [])) for (const cid of (projVanTeam.get(tid) || [])) ids.add(cid)
      for (const pm of managerLinks) if (pm.manager_id === u.id) ids.add(pm.campaign_id)
      uit.set(u.id, [...ids].map(id => projById.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)))
    }
    return uit
  }, [users, projects, teams, campaignTeams, managerLinks])

  const locById = useMemo(() => new Map(locaties.map(l => [l.id, l])), [locaties])
  const userById = useMemo(() => new Map(users.map(u => [u.id, u])), [users])
  const recruiters = useMemo(() => users.filter(u => RECRUITER_ROLLEN.includes(u.role)), [users])

  if (laden) return <div className="card" style={{ padding: '24px', textAlign: 'center' }}>Laden...</div>
  if (fout) return <div className="card" style={{ padding: '18px', color: 'var(--warning)' }}>{fout}</div>

  const toonVerdiensten = canEarnings && weergave === 'verdiensten'

  return (
    <div>
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 className="page-title">Personeel</h2>
          <p className="page-subtitle">
            {canEarnings
              ? 'Wie werkt waar, en wat recruiters verdienen aan de mensen die ze plaatsten.'
              : 'Wie werkt waar: projecten en plek per persoon.'}
          </p>
        </div>
        {canEarnings && (
          <div className="lb-pills">
            <button className={`lb-pill ${weergave === 'personeel' ? 'is-active' : ''}`} onClick={() => setWeergave('personeel')}>
              <Users size={14} /> Wie werkt waar
            </button>
            <button className={`lb-pill ${weergave === 'verdiensten' ? 'is-active' : ''}`} onClick={() => setWeergave('verdiensten')}>
              <Wallet size={14} /> Recruiter-verdiensten
            </button>
          </div>
        )}
      </div>

      {!toonVerdiensten ? (
        <WieWerktWaar users={users} projects={projects} projectenVan={projectenVan} plaatsingen={plaatsingen} locById={locById} userById={userById} locaties={locaties} isManager={isManager} />
      ) : (
        <RecruiterVerdiensten plaatsingen={plaatsingen} locById={locById} userById={userById} recruiters={recruiters} onChanged={laadPlaatsingen} toast={toast} />
      )}
    </div>
  )
}

function WieWerktWaar({ users, projects, projectenVan, plaatsingen, locById, userById, locaties, isManager }) {
  const [zoek, setZoek] = useState('')
  // Manager: standaard alleen de mensen in zijn eigen projecten
  const [project, setProject] = useState(isManager ? 'mine' : 'all')
  const [locatie, setLocatie] = useState('all')
  const [ookGestopt, setOokGestopt] = useState(false)
  const [indeling, setIndeling] = useState(() => {
    try { return localStorage.getItem('reachconnect-personeel-indeling') || 'persoon' } catch { return 'persoon' }
  })
  function kiesIndeling(v) {
    setIndeling(v)
    try { localStorage.setItem('reachconnect-personeel-indeling', v) } catch { /* geen opslag */ }
  }

  const rijen = useMemo(() => {
    const lopend = new Map()
    for (const pl of plaatsingen) {
      if (pl.eind_op) continue
      if (pl.profile_id) lopend.set(`p:${pl.profile_id}`, pl)
      else if (pl.lead_id) lopend.set(`l:${pl.lead_id}`, pl)
    }
    const uit = []
    for (const u of users) {
      if (NIET_IN_OVERZICHT.includes(u.role)) continue
      if (u.is_active === false && !ookGestopt) continue
      uit.push({
        key: `p:${u.id}`,
        naam: u.full_name || u.email || 'Onbekend',
        functie: roleLabel(u.role),
        actief: u.is_active !== false,
        projecten: projectenVan.get(u.id) || [],
        plaatsing: lopend.get(`p:${u.id}`) || null
      })
    }
    // Geplaatst zonder account (aangenomen sollicitant)
    for (const [key, pl] of lopend) {
      if (!key.startsWith('l:')) continue
      uit.push({ key, naam: pl.naam, functie: 'Geen account', actief: true, projecten: [], plaatsing: pl })
    }
    return uit.sort((a, b) => a.naam.localeCompare(b.naam))
  }, [users, projectenVan, plaatsingen, ookGestopt])

  const zichtbaar = rijen.filter(r => {
    if (project === 'mine' && !r.projecten.length) return false
    if (project === 'none' && r.projecten.length) return false
    if (!['all', 'none', 'mine'].includes(project) && !r.projecten.some(p => p.id === project)) return false
    if (locatie === 'none' && r.plaatsing) return false
    if (locatie !== 'all' && locatie !== 'none' && r.plaatsing?.locatie_id !== locatie) return false
    const q = zoek.trim().toLowerCase()
    if (!q) return true
    const loc = r.plaatsing ? locById.get(r.plaatsing.locatie_id)?.naam : ''
    return [r.naam, r.functie, loc, ...r.projecten.map(p => p.name)].some(v => (v || '').toLowerCase().includes(q))
  })

  // Tellers per project
  const perProject = useMemo(() => {
    const t = new Map()
    for (const r of rijen) for (const p of r.projecten) t.set(p.id, (t.get(p.id) || 0) + 1)
    return projects.filter(p => t.get(p.id)).map(p => ({ ...p, n: t.get(p.id) }))
  }, [rijen, projects])

  // Per project: een kaart per project met wie erin zit (iemand met 2 projecten
  // staat dus in 2 kaarten). Volgt de filters hierboven.
  const kaarten = useMemo(() => {
    const m = new Map()
    for (const r of zichtbaar) {
      const lijst = r.projecten.length ? r.projecten : [null]
      for (const p of lijst) {
        if (p && !['all', 'none', 'mine'].includes(project) && p.id !== project) continue
        const k = p ? p.id : 'geen'
        if (!m.has(k)) m.set(k, { key: k, naam: p ? p.name : 'Zonder project', actief: p ? p.is_active !== false : true, mensen: [] })
        m.get(k).mensen.push(r)
      }
    }
    return [...m.values()].sort((a, b) => (a.key === 'geen') - (b.key === 'geen') || a.naam.localeCompare(b.naam))
  }, [zichtbaar, project])

  function exporteer() {
    exportToCSV(zichtbaar.map(r => {
      const loc = r.plaatsing ? locById.get(r.plaatsing.locatie_id) : null
      const rec = r.plaatsing?.recruiter_id ? userById.get(r.plaatsing.recruiter_id) : null
      return {
        Naam: r.naam,
        Functie: r.functie,
        Actief: r.actief ? 'ja' : 'nee',
        Projecten: r.projecten.map(p => p.name).join(', '),
        'Aantal projecten': r.projecten.length,
        Plek: loc?.naam || '',
        'Functie op plek': r.plaatsing?.functie || '',
        Sinds: r.plaatsing?.start_op || '',
        'Geplaatst door': rec?.full_name || ''
      }
    }), `ReachConnect_Personeel_${vandaag()}`)
  }

  function Plek({ r }) {
    const loc = r.plaatsing ? locById.get(r.plaatsing.locatie_id) : null
    const S = loc ? SOORTEN[loc.soort] : null
    if (!loc) return <span className="text-muted">Nog niet geplaatst</span>
    return (
      <span title={r.plaatsing.functie || ''} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
        {S && <S.icon size={13} style={{ color: S.color }} />}
        <span style={{ fontWeight: 600 }}>{loc.naam}</span>
        <span className="text-xs text-muted">sinds {formatDate(r.plaatsing.start_op)}</span>
      </span>
    )
  }

  return (
    <div>
      {perProject.length > 0 && (
        <div className="flex mb-3" style={{ gap: '6px', flexWrap: 'wrap' }}>
          {perProject.map(p => (
            <button key={p.id} className={`lb-pill ${project === p.id ? 'is-active' : ''}`} onClick={() => setProject(project === p.id ? (isManager ? 'mine' : 'all') : p.id)}>
              {p.name} <span style={{ opacity: 0.7 }}>{p.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="card mb-3" style={{ padding: '12px 16px' }}>
        <div className="flex items-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: '260px' }}>
            <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input className="form-control" value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoek naam, project of plek..." style={{ paddingLeft: '32px', width: '100%' }} />
          </div>
          <select className="form-control" style={{ width: 'auto' }} value={project} onChange={e => setProject(e.target.value)}>
            {isManager && <option value="mine">Mijn projecten</option>}
            <option value="all">{isManager ? 'Iedereen' : 'Alle projecten'}</option>
            <option value="none">Zonder project</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="form-control" style={{ width: 'auto' }} value={locatie} onChange={e => setLocatie(e.target.value)}>
            <option value="all">Alle plekken</option>
            <option value="none">Nog niet geplaatst</option>
            {locaties.filter(l => l.actief).map(l => <option key={l.id} value={l.id}>{l.naam}</option>)}
          </select>
          <label className="flex items-center text-xs" style={{ gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={ookGestopt} onChange={e => setOokGestopt(e.target.checked)} /> Ook inactieve accounts
          </label>
          <div className="lb-pills" style={{ marginLeft: 'auto' }}>
            <button className={`lb-pill ${indeling === 'persoon' ? 'is-active' : ''}`} onClick={() => kiesIndeling('persoon')}><List size={14} /> Per persoon</button>
            <button className={`lb-pill ${indeling === 'project' ? 'is-active' : ''}`} onClick={() => kiesIndeling('project')}><LayoutGrid size={14} /> Per project</button>
          </div>
          <span className="text-xs text-muted">{zichtbaar.length} van {rijen.length}</span>
          <button className="btn btn-outline btn-sm" onClick={exporteer}><Download size={14} /> CSV</button>
        </div>
      </div>

      {indeling === 'persoon' ? (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
            <thead>
              <tr><th style={th}>Naam</th><th style={th}>Functie</th><th style={th}>Projecten</th><th style={th}>Plek</th><th style={th}>Geplaatst door</th></tr>
            </thead>
            <tbody>
              {zichtbaar.map(r => {
                const rec = r.plaatsing?.recruiter_id ? userById.get(r.plaatsing.recruiter_id) : null
                return (
                  <tr key={r.key} style={{ opacity: r.actief ? 1 : 0.55 }}>
                    <td style={{ ...td, fontWeight: 700 }}>{r.naam}{!r.actief && <span className="text-xs text-muted"> (inactief)</span>}</td>
                    <td style={td}>{r.functie}</td>
                    <td style={td}>
                      {r.projecten.length
                        ? (
                          <div className="flex items-center" style={{ gap: '4px', flexWrap: 'wrap' }}>
                            {r.projecten.map(p => <span key={p.id} style={chip}>{p.name}</span>)}
                            {r.projecten.length > 1 && <span className="text-xs text-muted">({r.projecten.length})</span>}
                          </div>
                        )
                        : <span className="text-muted">-</span>}
                    </td>
                    <td style={td}><Plek r={r} /></td>
                    <td style={td}>{rec?.full_name || <span className="text-muted">-</span>}</td>
                  </tr>
                )
              })}
              {!zichtbaar.length && <tr><td style={{ ...td, textAlign: 'center', padding: '24px' }} colSpan={5} className="text-muted">Niemand gevonden.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
          {kaarten.map(k => (
            <div key={k.key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="flex items-center justify-between" style={{ padding: '12px 16px', background: 'var(--bg-elevated)', gap: '8px' }}>
                <div style={{ fontWeight: 800, color: k.key === 'geen' ? 'var(--text-muted)' : undefined }}>
                  {k.naam}{!k.actief && <span className="text-xs text-muted"> (gepauzeerd)</span>}
                </div>
                <span style={chip}>{k.mensen.length}</span>
              </div>
              <div>
                {k.mensen.map(r => (
                  <div key={r.key} style={{ padding: '9px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', opacity: r.actief ? 1 : 0.55 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{r.naam}</div>
                      <div className="text-xs text-muted">
                        {r.functie}
                        {r.projecten.length > 1 && ` · ook ${r.projecten.filter(p => p.id !== k.key).map(p => p.name).join(', ')}`}
                      </div>
                    </div>
                    <div className="text-xs"><Plek r={r} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!kaarten.length && <div className="card text-muted" style={{ padding: '24px', textAlign: 'center' }}>Niemand gevonden.</div>}
        </div>
      )}
      <p className="text-xs text-muted mt-3">
        Projecten komen uit het team van de persoon (of als manager van het project). Plekken zet je op <a href="/recruitment?view=plaatsingen" style={{ color: 'var(--accent)' }}>Plaatsingen</a>.
      </p>
    </div>
  )
}

function RecruiterVerdiensten({ plaatsingen, locById, userById, recruiters, onChanged, toast }) {
  const [maand, setMaand] = useState(huidigeMaand)
  const [sales, setSales] = useState([])
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState(null)
  const [recruiterFilter, setRecruiterFilter] = useState('')
  const [concept, setConcept] = useState({}) // invoer die nog niet is opgeslagen: { 'aantal:<plId>': '3', 'bedrag:<plId>': '12,50' }

  async function laadSales() {
    setLaden(true)
    const { data, error } = await supabase.from('plaatsing_sales').select('*').eq('maand', maandStart(maand))
    if (error) setFout(/does not exist|schema cache|relation/i.test(error.message || '')
      ? 'De tabel voor recruiter-verdiensten staat nog niet in de database. Draai eerst migration_v155_recruiter_verdiensten.sql in de SQL-editor van Supabase.'
      : error.message)
    else { setFout(null); setSales(data || []) }
    setLaden(false)
  }
  useEffect(() => { laadSales(); setConcept({}) }, [maand])

  const salesByPl = useMemo(() => new Map(sales.map(s => [s.plaatsing_id, s])), [sales])

  // Plaatsingen die (een deel van) deze maand liepen, plus alles met een maandregel
  const rijen = useMemo(() => {
    const van = maandStart(maand), tot = maandEind(maand)
    return plaatsingen
      .filter(pl => salesByPl.has(pl.id) || (pl.start_op <= tot && (!pl.eind_op || pl.eind_op >= van)))
      .map(pl => {
        const s = salesByPl.get(pl.id) || null
        const recruiterId = s?.recruiter_id ?? pl.recruiter_id ?? null
        const bedrag = s ? Number(s.bedrag_per_sale) : (pl.bedrag_per_sale != null ? Number(pl.bedrag_per_sale) : null)
        const aantal = s?.aantal ?? 0
        return { pl, s, recruiterId, bedrag, aantal, totaal: (bedrag || 0) * aantal }
      })
  }, [plaatsingen, salesByPl, maand])

  const groepen = useMemo(() => {
    const m = new Map()
    for (const r of rijen) {
      if (recruiterFilter && (r.recruiterId || 'geen') !== recruiterFilter) continue
      const k = r.recruiterId || 'geen'
      if (!m.has(k)) m.set(k, { key: k, naam: r.recruiterId ? (userById.get(r.recruiterId)?.full_name || 'Onbekend') : 'Nog geen recruiter gekozen', rijen: [], sales: 0, totaal: 0, open: 0 })
      const g = m.get(k)
      g.rijen.push(r); g.sales += r.aantal; g.totaal += r.totaal
      if (r.s && !r.s.uitbetaald_op) g.open += r.totaal
    }
    for (const g of m.values()) g.rijen.sort((a, b) => a.pl.naam.localeCompare(b.pl.naam))
    return [...m.values()].sort((a, b) => (a.key === 'geen') - (b.key === 'geen') || a.naam.localeCompare(b.naam))
  }, [rijen, userById, recruiterFilter])

  const totaal = groepen.reduce((t, g) => t + g.totaal, 0)
  const totaalOpen = groepen.reduce((t, g) => t + g.open, 0)
  const totaalSales = groepen.reduce((t, g) => t + g.sales, 0)

  // Maandregel opslaan (aanmaken of bijwerken). Bedrag en recruiter van NU gaan mee.
  async function bewaarMaand(r, wijziging) {
    const basis = {
      aantal: r.aantal,
      bedrag_per_sale: r.bedrag ?? 0,
      recruiter_id: r.recruiterId
    }
    const rij = { ...basis, ...wijziging }
    const { error } = r.s
      ? await supabase.from('plaatsing_sales').update(rij).eq('id', r.s.id)
      : await supabase.from('plaatsing_sales').insert({ ...rij, plaatsing_id: r.pl.id, maand: maandStart(maand) })
    if (error) { toast(error.message, 'error'); return false }
    await laadSales()
    return true
  }

  async function bewaarAantal(r) {
    const k = `aantal:${r.pl.id}`
    if (!(k in concept)) return
    const n = naarGetal(concept[k])
    const nieuw = n === null ? 0 : n
    if (!Number.isInteger(nieuw) || nieuw < 0) { toast('Vul een heel getal in (0 of meer)', 'error'); return }
    if (nieuw !== r.aantal) {
      if (r.s?.uitbetaald_op) { toast('Deze maand is al uitbetaald. Zet eerst "uitbetaald" uit.', 'error'); return }
      if (await bewaarMaand(r, { aantal: nieuw })) toast(`${r.pl.naam}: ${nieuw} sales in ${maandLabel(maand)}`, 'success')
    }
    setConcept(c => { const x = { ...c }; delete x[k]; return x })
  }

  // Bedrag per sale hoort bij de plaatsing (geldt vanaf nu). De maandregel van
  // deze maand gaat mee, behalve als die al uitbetaald is.
  async function bewaarBedrag(r) {
    const k = `bedrag:${r.pl.id}`
    if (!(k in concept)) return
    const n = naarGetal(concept[k])
    if (Number.isNaN(n) || (n !== null && n < 0)) { toast('Vul een geldig bedrag in', 'error'); return }
    const nieuw = n === null ? null : Math.round(n * 100) / 100
    if (nieuw !== (r.pl.bedrag_per_sale != null ? Number(r.pl.bedrag_per_sale) : null)) {
      const { error } = await supabase.from('plaatsingen').update({ bedrag_per_sale: nieuw }).eq('id', r.pl.id)
      if (error) { toast(error.message, 'error'); return }
      if (r.s && !r.s.uitbetaald_op) await bewaarMaand(r, { bedrag_per_sale: nieuw ?? 0 })
      toast(`Bedrag per sale voor ${r.pl.naam} opgeslagen`, 'success')
      await onChanged()
    }
    setConcept(c => { const x = { ...c }; delete x[k]; return x })
  }

  async function bewaarRecruiter(r, id) {
    const nieuw = id || null
    const { error } = await supabase.from('plaatsingen').update({ recruiter_id: nieuw }).eq('id', r.pl.id)
    if (error) { toast(error.message, 'error'); return }
    if (r.s && !r.s.uitbetaald_op) await bewaarMaand(r, { recruiter_id: nieuw })
    await onChanged()
  }

  async function wisselUitbetaald(r) {
    if (!r.s) return
    const { error } = await supabase.from('plaatsing_sales').update({ uitbetaald_op: r.s.uitbetaald_op ? null : vandaag() }).eq('id', r.s.id)
    if (error) { toast(error.message, 'error'); return }
    await laadSales()
  }

  async function groepUitbetaald(g) {
    const ids = g.rijen.filter(r => r.s && !r.s.uitbetaald_op && r.aantal > 0).map(r => r.s.id)
    if (!ids.length) return
    const { error } = await supabase.from('plaatsing_sales').update({ uitbetaald_op: vandaag() }).in('id', ids)
    if (error) { toast(error.message, 'error'); return }
    toast(`${g.naam}: ${maandLabel(maand)} op uitbetaald gezet`, 'success')
    await laadSales()
  }

  function exporteer() {
    exportToCSV(groepen.flatMap(g => g.rijen.map(r => ({
      Maand: maand,
      Recruiter: g.naam,
      'Geplaatste persoon': r.pl.naam,
      Plek: locById.get(r.pl.locatie_id)?.naam || '',
      'Bedrag per sale': (r.bedrag ?? 0).toFixed(2).replace('.', ','),
      Sales: r.aantal,
      Verdiensten: r.totaal.toFixed(2).replace('.', ','),
      Uitbetaald: r.s?.uitbetaald_op || ''
    }))), `ReachConnect_Recruiterverdiensten_${maand}`)
  }

  if (fout) return <div className="card" style={{ padding: '18px', color: 'var(--warning)' }}>{fout}</div>

  return (
    <div>
      <div className="card mb-3" style={{ padding: '12px 16px' }}>
        <div className="flex items-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
          <input type="month" className="form-control" style={{ width: 'auto' }} value={maand} onChange={e => e.target.value && setMaand(e.target.value)} />
          <PersonSelect
            people={recruiters}
            value={recruiterFilter}
            onChange={setRecruiterFilter}
            emptyLabel="Alle recruiters"
            extraOptions={[{ value: 'geen', label: 'Nog geen recruiter' }]}
            className="form-control"
            style={{ width: '200px' }}
            showEmail={false}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="text-xs text-muted">{totaalSales} sales</span>
            <span style={{ fontWeight: 800 }}>{euro(totaal)}</span>
            {totaalOpen > 0 && <span className="text-xs" style={{ color: 'var(--warning)' }}>nog uit te betalen {euro(totaalOpen)}</span>}
            <button className="btn btn-outline btn-sm" onClick={exporteer}><Download size={14} /> CSV</button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted mb-3">
        Vul per persoon het aantal sales van {maandLabel(maand)} in. Het bedrag per sale geldt vanaf nu; maanden die al uitbetaald zijn veranderen niet mee.
      </p>

      {laden && <div className="card" style={{ padding: '18px', textAlign: 'center' }}>Laden...</div>}
      {!laden && !groepen.length && (
        <div className="card" style={{ padding: '24px', textAlign: 'center' }}>
          <MapPin size={22} style={{ opacity: 0.4, marginBottom: '6px' }} />
          <div className="text-muted">Niemand geplaatst in {maandLabel(maand)}. Plaats mensen eerst op <a href="/recruitment?view=plaatsingen" style={{ color: 'var(--accent)' }}>Plaatsingen</a>.</div>
        </div>
      )}

      {!laden && groepen.map(g => (
        <div key={g.key} className="card mb-3" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex items-center justify-between" style={{ padding: '12px 16px', gap: '10px', flexWrap: 'wrap', background: 'var(--bg-elevated)' }}>
            <div style={{ fontWeight: 800, color: g.key === 'geen' ? 'var(--text-muted)' : undefined }}>{g.naam}</div>
            <div className="flex items-center" style={{ gap: '12px', flexWrap: 'wrap' }}>
              <span className="text-xs text-muted">{g.rijen.length} geplaatst · {g.sales} sales</span>
              <span style={{ fontWeight: 800 }}>{euro(g.totaal)}</span>
              {g.key !== 'geen' && g.open > 0 && (
                <button className="btn btn-outline btn-sm" onClick={() => groepUitbetaald(g)} title="Alle regels van deze maand op uitbetaald zetten">
                  <CheckCircle size={14} /> Alles uitbetaald
                </button>
              )}
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
              <thead>
                <tr><th style={th}>Geplaatste persoon</th><th style={th}>Plek</th><th style={th}>Recruiter</th><th style={th}>Per sale</th><th style={th}>Sales</th><th style={th}>Verdiensten</th><th style={th}>Uitbetaald</th></tr>
              </thead>
              <tbody>
                {g.rijen.map(r => {
                  const loc = locById.get(r.pl.locatie_id)
                  const kA = `aantal:${r.pl.id}`, kB = `bedrag:${r.pl.id}`
                  const huidigBedrag = r.pl.bedrag_per_sale != null ? Number(r.pl.bedrag_per_sale) : null
                  const afwijkend = r.s && huidigBedrag != null && Number(r.s.bedrag_per_sale) !== huidigBedrag
                  const betaald = !!r.s?.uitbetaald_op
                  return (
                    <tr key={r.pl.id}>
                      <td style={{ ...td, fontWeight: 700 }}>
                        {r.pl.naam}
                        {r.pl.eind_op && <div className="text-xs text-muted" style={{ fontWeight: 400 }}>tot {formatDate(r.pl.eind_op)}</div>}
                      </td>
                      <td style={td}>{loc?.naam || '-'}</td>
                      <td style={{ ...td, minWidth: '170px' }}>
                        <PersonSelect
                          people={recruiters}
                          value={r.pl.recruiter_id || ''}
                          onChange={id => bewaarRecruiter(r, id)}
                          emptyLabel="Geen"
                          className="form-control"
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          showEmail={false}
                          disabled={betaald}
                        />
                      </td>
                      <td style={td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <span className="text-muted">€</span>
                          <input
                            className="form-control"
                            inputMode="decimal"
                            style={{ width: '80px', padding: '4px 8px' }}
                            placeholder="0,00"
                            value={kB in concept ? concept[kB] : (huidigBedrag != null ? String(huidigBedrag.toFixed(2)).replace('.', ',') : '')}
                            onChange={e => setConcept(c => ({ ...c, [kB]: e.target.value }))}
                            onBlur={() => bewaarBedrag(r)}
                            onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                          />
                        </div>
                        {afwijkend && <div className="text-xs text-muted" title="Bedrag dat voor deze maand is vastgelegd">deze maand {euro(r.s.bedrag_per_sale)}</div>}
                      </td>
                      <td style={td}>
                        <input
                          className="form-control"
                          inputMode="numeric"
                          style={{ width: '70px', padding: '4px 8px' }}
                          value={kA in concept ? concept[kA] : String(r.aantal)}
                          onChange={e => setConcept(c => ({ ...c, [kA]: e.target.value }))}
                          onFocus={e => e.target.select()}
                          onBlur={() => bewaarAantal(r)}
                          onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
                          disabled={betaald}
                          title={betaald ? 'Al uitbetaald' : ''}
                        />
                      </td>
                      <td style={{ ...td, fontWeight: 800 }}>
                        {r.bedrag == null && r.aantal > 0 ? <span style={{ color: 'var(--warning)' }}>Bedrag ontbreekt</span> : euro(r.totaal)}
                      </td>
                      <td style={td}>
                        {r.s && r.aantal > 0 ? (
                          <label className="flex items-center text-xs" style={{ gap: '6px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={betaald} onChange={() => wisselUitbetaald(r)} />
                            {betaald ? formatDate(r.s.uitbetaald_op) : 'nee'}
                          </label>
                        ) : <span className="text-muted">-</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
