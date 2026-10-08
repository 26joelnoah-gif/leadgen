// v136: pagina /overeenkomsten (menu "Verklaringen").
// - Admin en iedereen met profiles.can_send_overeenkomsten: verklaringen
//   versturen aan bellers en de stand zien (verstuurd, geopend, getekend).
//   Een verstuurder zonder adminrol ziet alleen wat hij zelf verstuurde (RLS).
// - Admin: tabblad Sjabloon om de tekst en de opdrachtgever aan te passen.
//   Al verstuurde verklaringen veranderen daar niet door (vaste kopie).
// - /overeenkomsten/:id: een verklaring bekijken en als pdf bewaren (printen).
//   Ook de beller zelf mag zijn eigen verklaring hier openen.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileSignature, Send, Plus, Trash2, Eye, RefreshCw, Printer, ArrowLeft, X, Save, Ban } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import PersonSelect from '../components/PersonSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import OvereenkomstTekst from '../components/OvereenkomstTekst'
import { VERKLARING_STATUS, VERKLARING_ROLLEN, datumTijd } from '../lib/overeenkomsten'

const knopTekst = { textTransform: 'none', letterSpacing: 0, fontWeight: 600 }

function StatusChip({ status }) {
  const s = VERKLARING_STATUS[status] || VERKLARING_STATUS.ingetrokken
  return <span style={{ display: 'inline-block', fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, color: s.color, background: s.bg, whiteSpace: 'nowrap' }}>{s.label}</span>
}

export default function Overeenkomsten() {
  const { id } = useParams()
  if (id) return <Bekijken id={id} />
  return <Overzicht />
}

function Overzicht() {
  const { profile } = useAuth()
  const toast = useToast()
  const isAdmin = profile?.role === 'admin'
  const magVersturen = isAdmin || profile?.can_send_overeenkomsten === true

  const [tab, setTab] = useState('lijst')
  const [rows, setRows] = useState([])
  const [mensen, setMensen] = useState([])
  const [laden, setLaden] = useState(true)
  const [filter, setFilter] = useState('alles')
  const [versturen, setVersturen] = useState(null) // null | { profileId, tarieven }
  const [intrekBevestig, setIntrekBevestig] = useState(null)

  async function laad() {
    const [{ data: o, error }, { data: p }] = await Promise.all([
      supabase.from('overeenkomsten')
        .select('id, profile_id, titel, status, verstuurd_op, verstuurd_door, geopend_op, getekend_op, ingetrokken_op, ondertekening_id, tarieven')
        .order('verstuurd_op', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, role, is_active, deleted_at').is('deleted_at', null).order('full_name'),
    ])
    if (error) toast(error.message, 'error')
    setRows(o || [])
    setMensen(p || [])
    setLaden(false)
  }

  useEffect(() => {
    if (!magVersturen) return
    laad()
    const ch = supabase.channel('verklaringen-overzicht')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overeenkomsten' }, () => laad())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [magVersturen])

  const naamVan = useMemo(() => Object.fromEntries(mensen.map(m => [m.id, m.full_name || m.email])), [mensen])
  const bellers = useMemo(() => mensen.filter(m => VERKLARING_ROLLEN.includes(m.role) && m.is_active !== false), [mensen])

  // laatste verklaring per beller (voor "nog niets verstuurd")
  const laatstePerBeller = useMemo(() => {
    const m = {}
    for (const r of rows) if (!m[r.profile_id]) m[r.profile_id] = r
    return m
  }, [rows])
  const zonder = bellers.filter(b => !laatstePerBeller[b.id] || laatstePerBeller[b.id].status === 'ingetrokken')

  const telling = {
    alles: rows.length,
    verstuurd: rows.filter(r => r.status === 'verstuurd').length,
    getekend: rows.filter(r => r.status === 'getekend').length,
    ingetrokken: rows.filter(r => r.status === 'ingetrokken').length,
  }
  const zichtbaar = filter === 'alles' ? rows : rows.filter(r => r.status === filter)

  async function intrekken(r) {
    if (intrekBevestig !== r.id) { setIntrekBevestig(r.id); setTimeout(() => setIntrekBevestig(null), 4000); return }
    setIntrekBevestig(null)
    const { error } = await supabase.rpc('overeenkomst_intrekken', { p_id: r.id })
    if (error) { toast(error.message, 'error'); return }
    toast('Verklaring ingetrokken', 'success')
    laad()
  }

  if (!magVersturen) {
    return (<><Header /><main className="container pb-12"><EmptyState icon={FileSignature} title="Geen toegang" message="Je hebt geen recht om verklaringen te versturen." /></main></>)
  }
  if (laden) return (<><Header /><main className="container pb-12"><LoadingSpinner /></main></>)

  return (
    <>
      <Header />
      <main className="container pb-12" style={{ maxWidth: 1200 }}>
        <div className="flex justify-between items-center mb-4 pt-4" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title flex items-center gap-2" style={{ margin: 0 }}>
              <FileSignature size={26} className="text-primary" /> Verklaringen
            </h1>
            <p className="page-subtitle text-xs" style={{ margin: '4px 0 0' }}>
              Verklaring zelfstandig appointment setter. Een beller kan pas bellen als hij zijn verklaring getekend heeft.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className={`btn btn-sm ${tab === 'lijst' ? '' : 'btn-outline'}`} style={knopTekst} onClick={() => setTab('lijst')}>Verklaringen</button>
                <button className={`btn btn-sm ${tab === 'sjabloon' ? '' : 'btn-outline'}`} style={knopTekst} onClick={() => setTab('sjabloon')}>Sjabloon</button>
              </div>
            )}
            {tab === 'lijst' && (
              <button className="btn btn-primary btn-sm" style={knopTekst} onClick={() => setVersturen({ profileId: '', tarieven: [] })}>
                <Send size={14} /> Verklaring versturen
              </button>
            )}
          </div>
        </div>

        {tab === 'sjabloon' && isAdmin ? <SjabloonBewerken /> : (
          <>
            {isAdmin && zonder.length > 0 && (
              <div className="bg-elevated border border-border rounded-lg" style={{ padding: 12, marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 8 }}>Nog geen verklaring ({zonder.length})</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {zonder.slice(0, 40).map(b => (
                    <button key={b.id} className="btn btn-outline btn-sm" style={knopTekst} onClick={() => setVersturen({ profileId: b.id, tarieven: [] })} title="Verklaring versturen">
                      <Plus size={12} /> {b.full_name || b.email}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {[['alles', 'Alles'], ['verstuurd', 'Wacht op tekenen'], ['getekend', 'Getekend'], ['ingetrokken', 'Ingetrokken']].map(([k, l]) => (
                <button key={k} className={`btn btn-sm ${filter === k ? '' : 'btn-outline'}`} style={knopTekst} onClick={() => setFilter(k)}>{l} ({telling[k]})</button>
              ))}
              <button className="btn btn-outline btn-sm" style={{ ...knopTekst, marginLeft: 'auto' }} onClick={laad}><RefreshCw size={14} /> Verversen</button>
            </div>

            {zichtbaar.length === 0 ? (
              <EmptyState icon={FileSignature} title="Nog geen verklaringen" message="Klik op Verklaring versturen om er een naar een beller te sturen." />
            ) : (
              <div className="bg-elevated border border-border rounded-lg" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th style={cel}>Beller</th><th style={cel}>Stand</th><th style={cel}>Verstuurd</th><th style={cel}>Geopend</th><th style={cel}>Getekend</th><th style={cel}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zichtbaar.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={cel}><strong>{naamVan[r.profile_id] || 'Onbekend'}</strong></td>
                        <td style={cel}><StatusChip status={r.status} /></td>
                        <td style={cel}>{datumTijd(r.verstuurd_op)}<div className="text-muted" style={{ fontSize: '0.75rem' }}>door {naamVan[r.verstuurd_door] || 'onbekend'}</div></td>
                        <td style={cel}>{datumTijd(r.geopend_op) || <span className="text-muted">Nog niet</span>}</td>
                        <td style={cel}>{r.getekend_op ? <>{datumTijd(r.getekend_op)}<div className="text-muted" style={{ fontSize: '0.75rem' }}>{r.ondertekening_id}</div></> : <span className="text-muted">-</span>}</td>
                        <td style={{ ...cel, whiteSpace: 'nowrap', textAlign: 'right' }}>
                          <a className="btn btn-outline btn-sm" style={knopTekst} href={`/overeenkomsten/${r.id}`} target="_blank" rel="noopener noreferrer"><Eye size={13} /> Bekijk</a>{' '}
                          {r.status !== 'verstuurd' && (
                            <button className="btn btn-outline btn-sm" style={knopTekst} title="Nieuwe verklaring met dezelfde bedragen" onClick={() => setVersturen({ profileId: r.profile_id, tarieven: r.tarieven || [] })}><Send size={13} /> Opnieuw</button>
                          )}
                          {r.status === 'verstuurd' && (
                            <button className="btn btn-outline btn-sm" style={{ ...knopTekst, color: intrekBevestig === r.id ? 'var(--danger)' : undefined }} onClick={() => intrekken(r)}>
                              <Ban size={13} /> {intrekBevestig === r.id ? 'Nog een keer klikken' : 'Intrekken'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {versturen && (
        <VersturenModal
          start={versturen}
          bellers={bellers}
          heeftOpen={(pid) => rows.some(r => r.profile_id === pid && r.status === 'verstuurd')}
          onClose={() => setVersturen(null)}
          onVerstuurd={() => { setVersturen(null); laad() }}
        />
      )}
    </>
  )
}

const cel = { padding: '10px 12px', verticalAlign: 'top' }

function VersturenModal({ start, bellers, heeftOpen, onClose, onVerstuurd }) {
  const toast = useToast()
  const [profileId, setProfileId] = useState(start.profileId || '')
  const [tarieven, setTarieven] = useState(start.tarieven?.length ? start.tarieven.map(t => ({ project: t.project || '', afspraak: t.afspraak ?? '', sale: t.sale ?? '' })) : [{ project: '', afspraak: '', sale: '' }])
  const [projecten, setProjecten] = useState([])
  const [sjabloon, setSjabloon] = useState(null)
  const [voorbeeld, setVoorbeeld] = useState(false)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    supabase.from('campaigns').select('id, name, is_active').is('deleted_at', null).order('name')
      .then(({ data }) => setProjecten((data || []).filter(p => p.is_active !== false)))
    supabase.from('overeenkomst_sjabloon').select('*').eq('id', 1).maybeSingle().then(({ data }) => setSjabloon(data))
  }, [])

  // Tarieven uit de lijsten van dat project als voorstel (hoogste per soort).
  async function vulTarieven(i, naam) {
    const p = projecten.find(x => x.name === naam)
    if (!p) return
    const { data } = await supabase.from('lead_lists').select('rate_per_appointment, rate_per_deal').eq('campaign_id', p.id)
    const max = (k) => { const w = (data || []).map(l => Number(l[k] || 0)).filter(n => n > 0); return w.length ? Math.max(...w) : '' }
    setTarieven(t => t.map((r, j) => j !== i ? r : { ...r, afspraak: r.afspraak === '' ? max('rate_per_appointment') : r.afspraak, sale: r.sale === '' ? max('rate_per_deal') : r.sale }))
  }

  const zet = (i, k, v) => setTarieven(t => t.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const geldig = tarieven.filter(t => t.project.trim() && (t.afspraak !== '' || t.sale !== ''))
  const kan = profileId && geldig.length > 0 && !bezig
  const beller = bellers.find(b => b.id === profileId)

  async function verstuur() {
    if (!kan) return
    setBezig(true)
    const { error } = await supabase.rpc('overeenkomst_versturen', {
      p_profile: profileId,
      p_tarieven: geldig.map(t => ({ project: t.project.trim(), afspraak: t.afspraak === '' ? null : Number(t.afspraak), sale: t.sale === '' ? null : Number(t.sale) })),
    })
    setBezig(false)
    if (error) { toast(error.message, 'error'); return }
    toast(`Verklaring verstuurd naar ${beller?.full_name || 'de beller'}. Bij de volgende keer inloggen of meteen als hij al ingelogd is, moet hij tekenen.`, 'success', 7000)
    onVerstuurd()
  }

  const voorbeeldRij = sjabloon ? {
    titel: sjabloon.titel, tekst: sjabloon.tekst,
    opdrachtgever: { naam: sjabloon.opdrachtgever_naam, plaats: sjabloon.opdrachtgever_plaats, kvk: sjabloon.opdrachtgever_kvk },
    tarieven: geldig.map(t => ({ project: t.project, afspraak: t.afspraak === '' ? null : t.afspraak, sale: t.sale === '' ? null : t.sale })),
  } : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: voorbeeld ? 820 : 620, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2><Send size={18} /> Verklaring versturen</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="form-group">
          <label>Beller</label>
          <PersonSelect people={bellers} value={profileId} onChange={setProfileId} placeholder="Kies een beller" showRole />
          {profileId && heeftOpen(profileId) && (
            <p style={{ fontSize: '0.78rem', color: 'var(--warning)', margin: '6px 0 0' }}>Deze beller heeft al een verklaring die nog niet getekend is. Die wordt vervangen door deze nieuwe.</p>
          )}
        </div>

        <label style={{ fontSize: '0.8rem', fontWeight: 700 }}>Bedragen per project</label>
        <p className="text-muted" style={{ fontSize: '0.75rem', margin: '2px 0 8px' }}>Kies een project: de bedragen uit de tarieven van dat project worden alvast ingevuld. Laat een vak leeg als het niet geldt.</p>
        <datalist id="verklaring-projecten">{projecten.map(p => <option key={p.id} value={p.name} />)}</datalist>
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 34px', gap: 6, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
            <span>Project</span><span>Per afspraak €</span><span>Per netto sale €</span><span />
          </div>
          {tarieven.map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 110px 34px', gap: 6 }}>
              <input className="form-dark" list="verklaring-projecten" value={t.project} placeholder="Projectnaam"
                onChange={e => zet(i, 'project', e.target.value)} onBlur={e => vulTarieven(i, e.target.value)} />
              <input className="form-dark" type="number" min="0" step="0.01" value={t.afspraak} onChange={e => zet(i, 'afspraak', e.target.value)} />
              <input className="form-dark" type="number" min="0" step="0.01" value={t.sale} onChange={e => zet(i, 'sale', e.target.value)} />
              <button type="button" className="btn btn-outline btn-sm" title="Regel weghalen" disabled={tarieven.length === 1}
                onClick={() => setTarieven(x => x.filter((_, j) => j !== i))} style={{ padding: 0 }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-outline btn-sm mt-2" style={knopTekst} onClick={() => setTarieven(t => [...t, { project: '', afspraak: '', sale: '' }])}>
          <Plus size={13} /> Project toevoegen
        </button>

        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-outline btn-sm" style={knopTekst} onClick={() => setVoorbeeld(v => !v)} disabled={!sjabloon}>
            <Eye size={13} /> {voorbeeld ? 'Voorbeeld verbergen' : 'Voorbeeld bekijken'}
          </button>
          {voorbeeld && voorbeeldRij && (
            <div style={{ marginTop: 10, padding: 16, border: '1px solid var(--border)', borderRadius: 12 }}>
              <OvereenkomstTekst overeenkomst={voorbeeldRij} bellerNaam={beller?.full_name} />
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={verstuur} disabled={!kan} style={{ flex: 1 }}>
            {bezig ? 'Bezig...' : 'Versturen'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SjabloonBewerken() {
  const toast = useToast()
  const [sj, setSj] = useState(null)
  const [bezig, setBezig] = useState(false)
  const [gewijzigd, setGewijzigd] = useState(false)

  useEffect(() => {
    supabase.from('overeenkomst_sjabloon').select('*').eq('id', 1).maybeSingle().then(({ data }) => setSj(data))
  }, [])

  const zet = (k, v) => { setSj(s => ({ ...s, [k]: v })); setGewijzigd(true) }

  async function bewaar() {
    setBezig(true)
    const { data, error } = await supabase.from('overeenkomst_sjabloon')
      .update({ titel: sj.titel, opdrachtgever_naam: sj.opdrachtgever_naam, opdrachtgever_plaats: sj.opdrachtgever_plaats || null, opdrachtgever_kvk: sj.opdrachtgever_kvk || null, tekst: sj.tekst })
      .eq('id', 1).select().single()
    setBezig(false)
    if (error) { toast(error.message, 'error'); return }
    setSj(data); setGewijzigd(false)
    toast(`Sjabloon bewaard (versie ${data.versie})`, 'success')
  }

  if (!sj) return <LoadingSpinner />
  const voorbeeld = { titel: sj.titel, tekst: sj.tekst, opdrachtgever: { naam: sj.opdrachtgever_naam, plaats: sj.opdrachtgever_plaats, kvk: sj.opdrachtgever_kvk }, tarieven: [{ project: 'Voorbeeldproject', afspraak: 25, sale: 50 }] }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
      <div className="bg-elevated border border-border rounded-lg" style={{ padding: 16 }}>
        <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 0 }}>
          Versie {sj.versie}. Een wijziging geldt voor verklaringen die je hierna verstuurt. Wat al verstuurd of getekend is, blijft zoals het was.
        </p>
        <div className="form-group"><label>Titel</label><input className="form-dark" style={{ width: '100%' }} value={sj.titel || ''} onChange={e => zet('titel', e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <div className="form-group"><label>Opdrachtgever</label><input className="form-dark" style={{ width: '100%' }} value={sj.opdrachtgever_naam || ''} onChange={e => zet('opdrachtgever_naam', e.target.value)} /></div>
          <div className="form-group"><label>Plaats</label><input className="form-dark" style={{ width: '100%' }} value={sj.opdrachtgever_plaats || ''} onChange={e => zet('opdrachtgever_plaats', e.target.value)} /></div>
          <div className="form-group"><label>KvK</label><input className="form-dark" style={{ width: '100%' }} value={sj.opdrachtgever_kvk || ''} onChange={e => zet('opdrachtgever_kvk', e.target.value)} placeholder="Optioneel" /></div>
        </div>
        <div className="form-group">
          <label>Tekst</label>
          <textarea className="form-dark" style={{ width: '100%', minHeight: 420, fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.55 }} value={sj.tekst || ''} onChange={e => zet('tekst', e.target.value)} />
          <p className="text-muted" style={{ fontSize: '0.72rem', margin: '6px 0 0', lineHeight: 1.5 }}>
            Opmaak: begin een regel met <code>## </code> voor een kopje en met <code>- </code> voor een opsomming. Zet <code>{'{{tarieven}}'}</code> op een eigen regel waar de tabel met bedragen moet komen.
          </p>
        </div>
        <button className="btn btn-primary" onClick={bewaar} disabled={!gewijzigd || bezig} style={{ width: '100%' }}>
          <Save size={14} /> {bezig ? 'Bezig...' : 'Sjabloon bewaren'}
        </button>
      </div>
      <div className="bg-elevated border border-border rounded-lg" style={{ padding: 16 }}>
        <div className="text-muted" style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Voorbeeld</div>
        <OvereenkomstTekst overeenkomst={voorbeeld} bellerNaam="Naam beller" />
      </div>
    </div>
  )
}

function Bekijken({ id }) {
  const navigate = useNavigate()
  const [o, setO] = useState(null)
  const [naam, setNaam] = useState('')
  const [fout, setFout] = useState(null)

  useEffect(() => {
    supabase.from('overeenkomsten').select('*').eq('id', id).maybeSingle().then(async ({ data, error }) => {
      if (error || !data) { setFout('Deze verklaring bestaat niet of je mag hem niet zien.'); return }
      setO(data)
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', data.profile_id).maybeSingle()
      setNaam(p?.full_name || '')
    })
  }, [id])

  return (
    <>
      <div className="verklaring-geen-print"><Header /></div>
      <style>{`@media print {
        .verklaring-geen-print, .header, header, nav, .admin-sidebar { display: none !important; }
        body { background: #fff !important; padding: 0 !important; }
        body.has-admin-sidebar { padding-left: 0 !important; }
        .verklaring-print { box-shadow: none !important; border: none !important; padding: 0 !important; background: #fff !important; color: #000 !important; }
        .verklaring-print * { color: #000 !important; }
      }`}</style>
      <main className="container pb-12" style={{ maxWidth: 820 }}>
        <div className="verklaring-geen-print" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, margin: '16px 0', flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" style={knopTekst} onClick={() => navigate(-1)}><ArrowLeft size={14} /> Terug</button>
          {o && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <StatusChip status={o.status} />
              <button className="btn btn-primary btn-sm" style={knopTekst} onClick={() => window.print()}><Printer size={14} /> Download pdf</button>
            </div>
          )}
        </div>
        {fout && <EmptyState icon={FileSignature} title="Niet gevonden" message={fout} />}
        {!o && !fout && <LoadingSpinner />}
        {o && (
          <div className="verklaring-print glass-panel" style={{ padding: 24, borderRadius: 16 }}>
            {o.status === 'ingetrokken' && (
              <div className="verklaring-geen-print" style={{ background: 'var(--bg-elevated)', padding: '8px 12px', borderRadius: 10, marginBottom: 12, fontSize: '0.85rem' }}>
                Deze verklaring is ingetrokken en kan niet meer getekend worden.
              </div>
            )}
            <OvereenkomstTekst overeenkomst={o} bellerNaam={naam} />
          </div>
        )}
      </main>
    </>
  )
}
