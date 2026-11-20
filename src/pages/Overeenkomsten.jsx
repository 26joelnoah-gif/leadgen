// v136: pagina /overeenkomsten (menu "Verklaringen").
// - Admin en iedereen met profiles.can_send_overeenkomsten: verklaringen
//   versturen aan bellers en de stand zien (verstuurd, geopend, getekend).
//   Een verstuurder zonder adminrol ziet alleen wat hij zelf verstuurde (RLS).
// - /overeenkomsten/:id: een verklaring bekijken en als pdf bewaren (printen).
//   Ook de beller zelf mag zijn eigen verklaring hier openen.
// v137:
// - Meerdere sjablonen (tabel overeenkomst_sjablonen), elk met eigen tekst en
//   standaardbedragen. Admin beheert ze in het tabblad Sjablonen, en kan in de
//   verstuur-popup de ingevulde bedragen als (nieuw) sjabloon bewaren.
// - Bedragen van een verklaring die nog niet getekend is aanpassen
//   (RPC overeenkomst_tarieven_wijzigen), zonder opnieuw te versturen.
// - Versturen "via link" naar iemand zonder account: je krijgt een link
//   (/verklaring/<token>) om te kopieren en zelf te sturen.
// v158: vier standaard verklaringen als kaarten (overeenkomst_sjablonen.snelkeuze),
//   tegels met de stand, en versturen in drie stappen op een scherm.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileSignature, Send, Plus, Trash2, Eye, RefreshCw, Printer, ArrowLeft, X, Save, Ban, Link2, Copy, Pencil, Star, CopyPlus, User, Handshake, Megaphone, Sparkles, Users, Search, Clock, CheckCircle2, UserX } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import Header from '../components/Header'
import PersonSelect from '../components/PersonSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import OvereenkomstTekst from '../components/OvereenkomstTekst'
import {
  VERKLARING_STATUS, VERKLARING_ROLLEN, datumTijd, verklaringLink, kopieerTekst,
  tarievenVoorOpslaan, tarievenVoorScherm, euro, procentTekst,
} from '../lib/overeenkomsten'

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

function useProjecten() {
  const [projecten, setProjecten] = useState([])
  useEffect(() => {
    supabase.from('campaigns').select('id, name, is_active').is('deleted_at', null).order('name')
      .then(({ data }) => setProjecten((data || []).filter(p => p.is_active !== false)))
  }, [])
  return projecten
}

async function laadSjablonen() {
  const { data, error } = await supabase.from('overeenkomst_sjablonen').select('*')
    .order('is_standaard', { ascending: false }).order('naam')
  if (error) throw error
  return data || []
}

// v158: standaard verklaringen (snelkeuze-kaarten) + rustiger overzicht.
const ROL_LABEL = { employee: 'Beller', backoffice: 'Backoffice', accountmanager: 'Accountmanager' }

function icoonVoor(sj) {
  const n = `${sj?.naam || ''} ${sj?.ontvanger_rol || ''}`.toLowerCase()
  if (n.includes('closer') || n.includes('accountmanager')) return Handshake
  if (n.includes('recruit')) return Users
  if (n.includes('beauty')) return Sparkles
  if (n.includes('marketing') || n.includes('prosell')) return Megaphone
  return FileSignature
}

const heeft = (v) => v !== null && v !== undefined && v !== ''

// Korte regels per project: "BEAUTYINFO: € 75 per sale"
function tariefRegels(tarieven) {
  return (Array.isArray(tarieven) ? tarieven : []).filter(t => t?.project).map(t => {
    const delen = []
    if (heeft(t.afspraak)) delen.push(`${euro(t.afspraak)} per afspraak`)
    if (heeft(t.sale)) delen.push(`${euro(t.sale)} per sale`)
    if (heeft(t.sale_procent)) delen.push(`${procentTekst(t.sale_procent)} van de order`)
    return { project: t.project, tekst: delen.join(' + '), leeg: delen.length === 0 }
  })
}

function TariefRegels({ tarieven, klein }) {
  const regels = tariefRegels(tarieven)
  if (!regels.length) return <span className="text-muted" style={{ fontSize: '0.78rem' }}>Bedragen vul je in bij versturen</span>
  return (
    <div style={{ display: 'grid', gap: 3 }}>
      {regels.map((r, i) => (
        <div key={i} style={{ fontSize: klein ? '0.76rem' : '0.82rem', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>{r.project}</span>
          {r.leeg ? <span style={{ color: 'var(--warning)' }}>bedrag invullen</span> : <span className="text-muted">{r.tekst}</span>}
        </div>
      ))}
    </div>
  )
}

function Tegel({ label, aantal, kleur, actief, onClick, icon: Icon }) {
  return (
    <button type="button" onClick={onClick} className="bg-elevated border border-border rounded-lg"
      style={{ padding: '12px 14px', textAlign: 'left', cursor: 'pointer', outline: actief ? `2px solid ${kleur}` : 'none', outlineOffset: -1, display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)' }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--bg-dark)', color: kleur, flexShrink: 0 }}><Icon size={17} /></span>
      <span>
        <span style={{ display: 'block', fontSize: '1.35rem', fontWeight: 800, lineHeight: 1.1 }}>{aantal}</span>
        <span className="text-muted" style={{ fontSize: '0.75rem' }}>{label}</span>
      </span>
    </button>
  )
}

function Overzicht() {
  const { profile } = useAuth()
  const toast = useToast()
  const isAdmin = profile?.role === 'admin'
  const magVersturen = isAdmin || profile?.can_send_overeenkomsten === true

  const [tab, setTab] = useState('lijst')
  const [rows, setRows] = useState([])
  const [mensen, setMensen] = useState([])
  const [sjablonen, setSjablonen] = useState([])
  const [laden, setLaden] = useState(true)
  const [filter, setFilter] = useState('alles')
  const [zoek, setZoek] = useState('')
  const [versturen, setVersturen] = useState(null) // null | { profileId, tarieven, via, sjabloonId }
  const [wijzigen, setWijzigen] = useState(null)
  const [intrekBevestig, setIntrekBevestig] = useState(null)

  async function laad() {
    const [{ data: o, error }, { data: p }] = await Promise.all([
      supabase.from('overeenkomsten')
        .select('id, profile_id, ontvanger_naam, ontvanger_email, token, titel, opdrachtgever, sjabloon_id, status, verstuurd_op, verstuurd_door, geopend_op, getekend_op, ingetrokken_op, ondertekening_id, tarieven')
        .order('verstuurd_op', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email, role, is_active, deleted_at').is('deleted_at', null).order('full_name'),
    ])
    if (error) toast(error.message, 'error')
    setRows(o || [])
    setMensen(p || [])
    try { setSjablonen(await laadSjablonen()) } catch (e) { toast(e.message, 'error') }
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
  const sjabloonVan = useMemo(() => Object.fromEntries(sjablonen.map(s => [s.id, s])), [sjablonen])
  const standaarden = useMemo(() => sjablonen.filter(s => s.snelkeuze !== null && s.snelkeuze !== undefined).sort((a, b) => a.snelkeuze - b.snelkeuze), [sjablonen])
  const bellers = useMemo(() => mensen.filter(m => VERKLARING_ROLLEN.includes(m.role) && m.is_active !== false), [mensen])

  const gedekt = useMemo(() => {
    const ids = new Set()
    const mails = new Set()
    for (const r of rows) {
      if (r.status === 'ingetrokken') continue
      if (r.profile_id) ids.add(r.profile_id)
      if (r.ontvanger_email) mails.add(r.ontvanger_email.toLowerCase())
    }
    return { ids, mails }
  }, [rows])
  const zonder = bellers.filter(b => !gedekt.ids.has(b.id) && !(b.email && gedekt.mails.has(b.email.toLowerCase())))

  const telling = {
    alles: rows.length,
    verstuurd: rows.filter(r => r.status === 'verstuurd').length,
    getekend: rows.filter(r => r.status === 'getekend').length,
    ingetrokken: rows.filter(r => r.status === 'ingetrokken').length,
  }
  const getekendPerSjabloon = useMemo(() => {
    const m = {}
    for (const r of rows) if (r.status === 'getekend' && r.sjabloon_id) m[r.sjabloon_id] = (m[r.sjabloon_id] || 0) + 1
    return m
  }, [rows])

  const naamVanRij = (r) => r.profile_id ? (naamVan[r.profile_id] || 'Onbekend') : (r.ontvanger_naam || 'Onbekend')
  const soortVanRij = (r) => sjabloonVan[r.sjabloon_id]?.naam || r.opdrachtgever?.ontvanger_rol || r.titel || '-'
  const q = zoek.trim().toLowerCase()
  const zichtbaar = rows
    .filter(r => filter === 'alles' || r.status === filter)
    .filter(r => !q || `${naamVanRij(r)} ${r.ontvanger_email || ''} ${soortVanRij(r)}`.toLowerCase().includes(q))

  // Voorstel bij iemand zonder verklaring: accountmanager = closer-sjabloon.
  function voorstelVoor(persoon) {
    if (persoon?.role === 'accountmanager') return standaarden.find(s => icoonVoor(s) === Handshake)?.id || ''
    return ''
  }

  async function intrekken(r) {
    if (intrekBevestig !== r.id) { setIntrekBevestig(r.id); setTimeout(() => setIntrekBevestig(null), 4000); return }
    setIntrekBevestig(null)
    const { error } = await supabase.rpc('overeenkomst_intrekken', { p_id: r.id })
    if (error) { toast(error.message, 'error'); return }
    toast('Verklaring ingetrokken', 'success')
    laad()
  }

  async function kopieerLink(r) {
    const ok = await kopieerTekst(verklaringLink(r.token))
    toast(ok ? 'Link gekopieerd' : 'Kopieren lukte niet, open de verklaring en kopieer de link uit de adresbalk', ok ? 'success' : 'error')
  }

  if (!magVersturen) {
    return (<><Header /><main className="container pb-12"><EmptyState icon={FileSignature} title="Geen toegang" message="Je hebt geen recht om verklaringen te versturen." /></main></>)
  }
  if (laden) return (<><Header /><main className="container pb-12"><LoadingSpinner /></main></>)

  const sectieKop = { fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', margin: '22px 0 10px' }

  return (
    <>
      <Header />
      <main className="container pb-12" style={{ maxWidth: 1200 }}>
        <div className="flex justify-between items-center mb-2 pt-4" style={{ flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="page-title flex items-center gap-2" style={{ margin: 0 }}>
              <FileSignature size={26} className="text-primary" /> Verklaringen
            </h1>
            <p className="page-subtitle text-xs" style={{ margin: '4px 0 0' }}>
              Iedereen die voor ons belt of sluit, tekent een korte verklaring. Kies een standaard, kies de persoon en verstuur.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button className={`btn btn-sm ${tab === 'lijst' ? '' : 'btn-outline'}`} style={knopTekst} onClick={() => setTab('lijst')}>Overzicht</button>
                <button className={`btn btn-sm ${tab === 'sjabloon' ? '' : 'btn-outline'}`} style={knopTekst} onClick={() => setTab('sjabloon')}>Teksten aanpassen</button>
              </div>
            )}
            {tab === 'lijst' && (
              <button className="btn btn-primary btn-sm" style={knopTekst} onClick={() => setVersturen({ profileId: '', tarieven: null, via: 'account', sjabloonId: '' })}>
                <Plus size={14} /> Nieuwe verklaring
              </button>
            )}
          </div>
        </div>

        {tab === 'sjabloon' && isAdmin ? <SjablonenBeheer sjablonen={sjablonen} onGewijzigd={setSjablonen} /> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginTop: 14 }}>
              <Tegel icon={Clock} label="Wacht op tekenen" aantal={telling.verstuurd} kleur="var(--warning)" actief={filter === 'verstuurd'} onClick={() => setFilter(f => f === 'verstuurd' ? 'alles' : 'verstuurd')} />
              <Tegel icon={CheckCircle2} label="Getekend" aantal={telling.getekend} kleur="var(--success)" actief={filter === 'getekend'} onClick={() => setFilter(f => f === 'getekend' ? 'alles' : 'getekend')} />
              <Tegel icon={UserX} label="Nog geen verklaring" aantal={zonder.length} kleur="var(--info)" actief={false} onClick={() => document.getElementById('verklaring-zonder')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
              <Tegel icon={Ban} label="Ingetrokken" aantal={telling.ingetrokken} kleur="var(--text-muted)" actief={filter === 'ingetrokken'} onClick={() => setFilter(f => f === 'ingetrokken' ? 'alles' : 'ingetrokken')} />
            </div>

            {standaarden.length > 0 && (
              <>
                <div style={sectieKop}>Standaard verklaringen</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                  {standaarden.map(s => {
                    const Icon = icoonVoor(s)
                    return (
                      <div key={s.id} className="bg-elevated border border-border rounded-lg" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--bg-dark)', color: 'var(--primary)', flexShrink: 0 }}><Icon size={18} /></span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800 }}>{s.naam}</div>
                            <div className="text-muted" style={{ fontSize: '0.72rem' }}>{s.ontvanger_rol || 'Appointment setter'}{getekendPerSjabloon[s.id] ? `, ${getekendPerSjabloon[s.id]} getekend` : ''}</div>
                          </div>
                        </div>
                        {s.omschrijving && <div className="text-muted" style={{ fontSize: '0.8rem', lineHeight: 1.45 }}>{s.omschrijving}</div>}
                        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, flex: 1 }}><TariefRegels tarieven={s.tarieven} klein /></div>
                        <button className="btn btn-outline btn-sm" style={{ ...knopTekst, width: '100%' }} onClick={() => setVersturen({ profileId: '', tarieven: null, via: 'account', sjabloonId: s.id })}>
                          <Send size={13} /> Versturen
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {zonder.length > 0 && (
              <div id="verklaring-zonder">
                <div style={sectieKop}>Nog geen verklaring ({zonder.length})</div>
                <div className="bg-elevated border border-border rounded-lg" style={{ padding: 12 }}>
                  <p className="text-muted" style={{ fontSize: '0.78rem', margin: '0 0 8px' }}>Klik op een naam. Je kiest daarna welke verklaring hij krijgt.</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {zonder.slice(0, 60).map(b => (
                      <button key={b.id} className="btn btn-outline btn-sm" style={knopTekst} onClick={() => setVersturen({ profileId: b.id, tarieven: null, via: 'account', sjabloonId: voorstelVoor(b) })} title="Verklaring versturen">
                        <Plus size={12} /> {b.full_name || b.email}
                        {b.role !== 'employee' && <span className="text-muted" style={{ fontWeight: 500, fontSize: '0.72rem' }}>{ROL_LABEL[b.role]}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div style={{ ...sectieKop, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span>Verstuurd {filter !== 'alles' ? `(${VERKLARING_STATUS[filter]?.label.toLowerCase()})` : ''}</span>
              {filter !== 'alles' && <button className="btn btn-outline btn-sm" style={{ ...knopTekst, padding: '2px 8px', fontSize: '0.72rem' }} onClick={() => setFilter('alles')}><X size={11} /> Alles tonen</button>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, textTransform: 'none', letterSpacing: 0 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input className="form-dark" value={zoek} onChange={e => setZoek(e.target.value)} placeholder="Zoek op naam" style={{ paddingLeft: 28, width: 200, fontSize: '0.82rem' }} />
                </div>
                <button className="btn btn-outline btn-sm" style={knopTekst} onClick={laad} title="Verversen"><RefreshCw size={14} /></button>
              </div>
            </div>

            {zichtbaar.length === 0 ? (
              <EmptyState icon={FileSignature} title={rows.length ? 'Niets gevonden' : 'Nog geen verklaringen'} message={rows.length ? 'Pas het filter of de zoekterm aan.' : 'Kies hierboven een standaard verklaring en klik op Versturen.'} />
            ) : (
              <div className="bg-elevated border border-border rounded-lg" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      <th style={cel}>Naam</th><th style={cel}>Verklaring</th><th style={cel}>Stand</th><th style={cel}>Verstuurd</th><th style={cel}>Getekend</th><th style={cel}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zichtbaar.map(r => (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={cel}>
                          <strong>{naamVanRij(r)}</strong>
                          {r.token && (
                            <div className="text-muted" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <Link2 size={11} /> via link{r.ontvanger_email ? `, ${r.ontvanger_email}` : ''}
                            </div>
                          )}
                        </td>
                        <td style={cel}>{soortVanRij(r)}</td>
                        <td style={cel}>
                          <StatusChip status={r.status} />
                          {r.status === 'verstuurd' && <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 3 }}>{r.geopend_op ? `geopend ${datumTijd(r.geopend_op)}` : 'nog niet geopend'}</div>}
                        </td>
                        <td style={cel}>{datumTijd(r.verstuurd_op)}<div className="text-muted" style={{ fontSize: '0.72rem' }}>door {naamVan[r.verstuurd_door] || 'onbekend'}</div></td>
                        <td style={cel}>{r.getekend_op ? <>{datumTijd(r.getekend_op)}<div className="text-muted" style={{ fontSize: '0.72rem' }}>{r.ondertekening_id}</div></> : <span className="text-muted">-</span>}</td>
                        <td style={{ ...cel, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <a className="btn btn-outline btn-sm" style={knopTekst} href={`/overeenkomsten/${r.id}`} target="_blank" rel="noopener noreferrer" title="Bekijken of als pdf bewaren"><Eye size={13} /></a>
                            {r.token && r.status !== 'ingetrokken' && (
                              <button className="btn btn-outline btn-sm" style={knopTekst} onClick={() => kopieerLink(r)} title="Link kopieren om zelf te sturen"><Copy size={13} /> Link</button>
                            )}
                            {r.status === 'verstuurd' && (
                              <button className="btn btn-outline btn-sm" style={knopTekst} onClick={() => setWijzigen(r)} title="Bedragen aanpassen, de link blijft hetzelfde"><Pencil size={13} /> Bedragen</button>
                            )}
                            {r.status !== 'verstuurd' && r.profile_id && (
                              <button className="btn btn-outline btn-sm" style={knopTekst} title="Nieuwe verklaring met dezelfde bedragen" onClick={() => setVersturen({ profileId: r.profile_id, tarieven: r.tarieven || [], via: 'account', sjabloonId: r.sjabloon_id || '' })}><Send size={13} /> Opnieuw</button>
                            )}
                            {r.status === 'verstuurd' && (
                              <button className="btn btn-outline btn-sm" style={{ ...knopTekst, color: intrekBevestig === r.id ? 'var(--danger)' : undefined }} onClick={() => intrekken(r)} title="Intrekken">
                                <Ban size={13} /> {intrekBevestig === r.id ? 'Nog een keer klikken' : ''}
                              </button>
                            )}
                          </div>
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
          sjablonen={sjablonen}
          standaarden={standaarden}
          isAdmin={isAdmin}
          heeftOpen={(pid) => rows.some(r => r.profile_id === pid && r.status === 'verstuurd')}
          onSjablonen={setSjablonen}
          onClose={() => setVersturen(null)}
          onVerstuurd={() => laad()}
        />
      )}
      {wijzigen && (
        <BedragenWijzigenModal
          overeenkomst={wijzigen}
          naam={wijzigen.profile_id ? naamVan[wijzigen.profile_id] : wijzigen.ontvanger_naam}
          onClose={() => setWijzigen(null)}
          onOpgeslagen={() => { setWijzigen(null); laad() }}
        />
      )}
    </>
  )
}

const cel = { padding: '10px 12px', verticalAlign: 'top' }

// Invulregels: project + bedrag per afspraak + bedrag per netto sale + (v139) % van de orderwaarde.
function TarievenEditor({ rijen, setRijen, projecten }) {
  // Tarieven uit de lijsten van dat project als voorstel (hoogste per soort), alleen in lege vakken.
  async function vulTarieven(i, naam) {
    const p = projecten.find(x => x.name === naam)
    if (!p) return
    const { data } = await supabase.from('lead_lists').select('rate_per_appointment, rate_per_deal').eq('campaign_id', p.id)
    const max = (k) => { const w = (data || []).map(l => Number(l[k] || 0)).filter(n => n > 0); return w.length ? Math.max(...w) : '' }
    setRijen(t => t.map((r, j) => j !== i ? r : { ...r, afspraak: r.afspraak === '' ? max('rate_per_appointment') : r.afspraak, sale: r.sale === '' && (r.sale_procent ?? '') === '' ? max('rate_per_deal') : r.sale }))
  }
  const zet = (i, k, v) => setRijen(t => t.map((r, j) => j === i ? { ...r, [k]: v } : r))

  return (
    <>
      <datalist id="verklaring-projecten">{projecten.map(p => <option key={p.id} value={p.name} />)}</datalist>
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px 88px 78px 34px', gap: 6, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
          <span>Project</span><span>Afspraak €</span><span>Sale €</span><span>% order</span><span />
        </div>
        {rijen.map((t, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 88px 88px 78px 34px', gap: 6 }}>
            <input className="form-dark" list="verklaring-projecten" value={t.project} placeholder="Projectnaam"
              onChange={e => zet(i, 'project', e.target.value)} onBlur={e => vulTarieven(i, e.target.value)} />
            <input className="form-dark" type="number" min="0" step="0.01" value={t.afspraak} onChange={e => zet(i, 'afspraak', e.target.value)} />
            <input className="form-dark" type="number" min="0" step="0.01" value={t.sale} onChange={e => zet(i, 'sale', e.target.value)} />
            <input className="form-dark" type="number" min="0" max="100" step="0.5" value={t.sale_procent ?? ''} placeholder="%" title="Percentage van de orderwaarde" onChange={e => zet(i, 'sale_procent', e.target.value)} />
            <button type="button" className="btn btn-outline btn-sm" title="Regel weghalen" disabled={rijen.length === 1}
              onClick={() => setRijen(x => x.filter((_, j) => j !== i))} style={{ padding: 0 }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-outline btn-sm mt-2" style={knopTekst} onClick={() => setRijen(t => [...t, { project: '', afspraak: '', sale: '', sale_procent: '' }])}>
        <Plus size={13} /> Project toevoegen
      </button>
    </>
  )
}

// v158: versturen in drie stappen op een scherm: welke verklaring, voor wie, bedragen.
function VersturenModal({ start, bellers, sjablonen, standaarden, isAdmin, heeftOpen, onSjablonen, onClose, onVerstuurd }) {
  const toast = useToast()
  const projecten = useProjecten()
  const eersteKeuze = sjablonen.find(s => s.id === start.sjabloonId) || null
  const [via, setVia] = useState(start.via || 'account')
  const [profileId, setProfileId] = useState(start.profileId || '')
  const [naam, setNaam] = useState('')
  const [email, setEmail] = useState('')
  const [sjabloonId, setSjabloonId] = useState(eersteKeuze?.id || '')
  const [tarieven, setTarieven] = useState(tarievenVoorScherm(start.tarieven?.length ? start.tarieven : eersteKeuze?.tarieven))
  const [aanpassen, setAanpassen] = useState(false)
  const [anderOpen, setAnderOpen] = useState(!!eersteKeuze && !standaarden.some(s => s.id === eersteKeuze.id))
  const [voorbeeld, setVoorbeeld] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [nieuwNaam, setNieuwNaam] = useState(null)
  const [link, setLink] = useState(null)

  const sjabloon = sjablonen.find(s => s.id === sjabloonId) || null
  const overige = sjablonen.filter(s => !standaarden.some(x => x.id === s.id))

  function kiesSjabloon(id) {
    setSjabloonId(id)
    const sj = sjablonen.find(s => s.id === id)
    setTarieven(tarievenVoorScherm(sj?.tarieven))
    setNieuwNaam(null)
  }

  const geldig = tarievenVoorOpslaan(tarieven)
  const nogInvullen = tarieven.filter(t => String(t.project || '').trim() && ![t.afspraak, t.sale, t.sale_procent].some(heeft)).map(t => t.project)
  const editorOpen = aanpassen || (sjabloon && (nogInvullen.length > 0 || geldig.length === 0))
  const ontvangerOk = via === 'account' ? !!profileId : naam.trim().length >= 2
  const kan = ontvangerOk && geldig.length > 0 && !!sjabloon && !bezig
  const beller = bellers.find(b => b.id === profileId)

  async function verstuur() {
    if (!kan) return
    setBezig(true)
    const { data, error } = await supabase.rpc('overeenkomst_versturen', {
      p_profile: via === 'account' ? profileId : null,
      p_tarieven: geldig,
      p_sjabloon: sjabloon.id,
      p_naam: via === 'link' ? naam.trim() : null,
      p_email: via === 'link' ? (email.trim() || null) : null,
    })
    setBezig(false)
    if (error) { toast(error.message, 'error'); return }
    onVerstuurd()
    if (via === 'link') {
      const url = verklaringLink(data?.token)
      setLink(url)
      const ok = await kopieerTekst(url)
      if (ok) toast('Link gemaakt en gekopieerd', 'success')
      return
    }
    toast(`Verklaring verstuurd naar ${beller?.full_name || 'de beller'}. Hij moet tekenen voordat hij verder kan werken.`, 'success', 7000)
    onClose()
  }

  async function bedragenInSjabloon() {
    if (!sjabloon) return
    const { error } = await supabase.from('overeenkomst_sjablonen').update({ tarieven: geldig }).eq('id', sjabloon.id)
    if (error) { toast(error.message, 'error'); return }
    onSjablonen(await laadSjablonen())
    toast(`Bedragen bewaard in "${sjabloon.naam}"`, 'success')
  }

  async function bewaarAlsNieuw() {
    const n = (nieuwNaam || '').trim()
    if (n.length < 2 || !sjabloon) return
    const { data, error } = await supabase.from('overeenkomst_sjablonen').insert({
      naam: n, titel: sjabloon.titel, opdrachtgever_naam: sjabloon.opdrachtgever_naam,
      opdrachtgever_plaats: sjabloon.opdrachtgever_plaats, opdrachtgever_kvk: sjabloon.opdrachtgever_kvk,
      ontvanger_rol: sjabloon.ontvanger_rol || 'Appointment setter', tekst: sjabloon.tekst, tarieven: geldig,
    }).select().single()
    if (error) { toast(error.message, 'error'); return }
    onSjablonen(await laadSjablonen())
    setSjabloonId(data.id)
    setAnderOpen(true)
    setNieuwNaam(null)
    toast(`Sjabloon "${n}" bewaard`, 'success')
  }

  const voorbeeldRij = sjabloon ? {
    titel: sjabloon.titel, tekst: sjabloon.tekst,
    opdrachtgever: { naam: sjabloon.opdrachtgever_naam, plaats: sjabloon.opdrachtgever_plaats, kvk: sjabloon.opdrachtgever_kvk, ontvanger_rol: sjabloon.ontvanger_rol },
    tarieven: geldig,
  } : null

  if (link) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal glass-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
          <div className="modal-header">
            <h2><Link2 size={18} /> Link voor {naam.trim()}</h2>
            <button className="modal-close" onClick={onClose}><X size={18} /></button>
          </div>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: 0 }}>
            Stuur deze link zelf door, bijvoorbeeld via WhatsApp of mail. Wie de link heeft, kan de verklaring lezen en tekenen. In het overzicht zie je wanneer hij geopend en getekend is.
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="form-dark" readOnly value={link} onFocus={e => e.target.select()} style={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }} />
            <button className="btn btn-primary btn-sm" style={knopTekst} onClick={async () => {
              const ok = await kopieerTekst(link)
              toast(ok ? 'Link gekopieerd' : 'Kopieren lukte niet, selecteer de link en kopieer hem zelf', ok ? 'success' : 'error')
            }}>
              <Copy size={14} /> Kopieer
            </button>
          </div>
          <div className="flex gap-2 mt-4">
            <a className="btn btn-outline" style={{ flex: 1, ...knopTekst }} href={`https://wa.me/?text=${encodeURIComponent(`Hoi ${naam.trim()}, hier is je verklaring om te tekenen: ${link}`)}`} target="_blank" rel="noopener noreferrer">Via WhatsApp sturen</a>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>Klaar</button>
          </div>
        </div>
      </div>
    )
  }

  const stap = { fontSize: '0.78rem', fontWeight: 800, margin: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 8 }
  const nr = { width: 20, height: 20, borderRadius: 999, background: 'var(--primary)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: '0.7rem' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: voorbeeld ? 820 : 640, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2><FileSignature size={18} /> Nieuwe verklaring</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ ...stap, marginTop: 0 }}><span style={nr}>1</span> Welke verklaring?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
          {standaarden.map(s => {
            const Icon = icoonVoor(s)
            const actief = s.id === sjabloonId
            return (
              <button key={s.id} type="button" onClick={() => kiesSjabloon(s.id)} className="border rounded-lg"
                style={{ padding: '10px 12px', textAlign: 'left', cursor: 'pointer', background: actief ? 'var(--bg-elevated)' : 'transparent', borderColor: actief ? 'var(--primary)' : 'var(--border)', boxShadow: actief ? '0 0 0 1px var(--primary)' : 'none', color: 'var(--text-primary)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <Icon size={17} style={{ color: actief ? 'var(--primary)' : 'var(--text-muted)', marginTop: 2, flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: '0.88rem' }}>{s.naam}</span>
                  <span className="text-muted" style={{ fontSize: '0.74rem', lineHeight: 1.35 }}>{s.omschrijving || s.ontvanger_rol}</span>
                </span>
              </button>
            )
          })}
        </div>
        {overige.length > 0 && (
          anderOpen || !standaarden.length ? (
            <select className="form-dark mt-2" style={{ width: '100%' }} value={standaarden.some(s => s.id === sjabloonId) ? '' : sjabloonId} onChange={e => e.target.value && kiesSjabloon(e.target.value)}>
              <option value="">Ander sjabloon kiezen...</option>
              {overige.map(s => <option key={s.id} value={s.id}>{s.naam}</option>)}
            </select>
          ) : (
            <button type="button" className="btn btn-outline btn-sm mt-2" style={{ ...knopTekst, fontSize: '0.75rem' }} onClick={() => setAnderOpen(true)}>Ander sjabloon</button>
          )
        )}

        <div style={stap}><span style={nr}>2</span> Voor wie?</div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          <button type="button" className={`btn btn-sm ${via === 'account' ? '' : 'btn-outline'}`} style={{ ...knopTekst, flex: 1 }} onClick={() => setVia('account')}><User size={13} /> Heeft een account</button>
          <button type="button" className={`btn btn-sm ${via === 'link' ? '' : 'btn-outline'}`} style={{ ...knopTekst, flex: 1 }} onClick={() => setVia('link')}><Link2 size={13} /> Nog geen account (link)</button>
        </div>
        {via === 'account' ? (
          <>
            <PersonSelect people={bellers} value={profileId} onChange={setProfileId} placeholder="Kies een persoon" showRole />
            {profileId && heeftOpen(profileId) && (
              <p style={{ fontSize: '0.78rem', color: 'var(--warning)', margin: '6px 0 0' }}>Deze persoon heeft al een verklaring die nog niet getekend is. Die wordt vervangen door deze nieuwe.</p>
            )}
          </>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
            <input className="form-dark" value={naam} onChange={e => setNaam(e.target.value)} placeholder="Voor- en achternaam" maxLength={120} />
            <input className="form-dark" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-mail (mag leeg)" />
            <p className="text-muted" style={{ fontSize: '0.74rem', margin: 0, gridColumn: '1 / -1' }}>Je krijgt een link die je zelf doorstuurt. Er gaat niets automatisch naar deze persoon.</p>
          </div>
        )}

        <div style={stap}><span style={nr}>3</span> Bedragen</div>
        {!sjabloon ? (
          <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>Kies eerst een verklaring.</p>
        ) : !editorOpen ? (
          <div className="border border-border rounded-lg" style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}><TariefRegels tarieven={geldig} /></div>
            <button type="button" className="btn btn-outline btn-sm" style={knopTekst} onClick={() => setAanpassen(true)}><Pencil size={13} /> Aanpassen</button>
          </div>
        ) : (
          <>
            {nogInvullen.length > 0 && <p style={{ fontSize: '0.78rem', color: 'var(--warning)', margin: '0 0 8px' }}>Vul een bedrag in voor {nogInvullen.join(', ')}, of haal die regel weg.</p>}
            <p className="text-muted" style={{ fontSize: '0.74rem', margin: '0 0 8px' }}>Laat een vak leeg als het niet geldt. Kies je een project, dan worden lege vakken gevuld met de tarieven van dat project.</p>
            <TarievenEditor rijen={tarieven} setRijen={setTarieven} projecten={projecten} />
            {isAdmin && (
              <div style={{ marginTop: 10, padding: 10, border: '1px dashed var(--border)', borderRadius: 10 }}>
                <div style={{ fontSize: '0.76rem', fontWeight: 700, marginBottom: 6 }}>Deze bedragen ook voor de volgende keer bewaren?</div>
                {nieuwNaam === null ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-outline btn-sm" style={knopTekst} disabled={!geldig.length} onClick={bedragenInSjabloon}><Save size={13} /> Opslaan in "{sjabloon.naam}"</button>
                    <button type="button" className="btn btn-outline btn-sm" style={knopTekst} disabled={!geldig.length} onClick={() => setNieuwNaam('')}><CopyPlus size={13} /> Als nieuw sjabloon</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-dark" autoFocus value={nieuwNaam} onChange={e => setNieuwNaam(e.target.value)} placeholder="Naam, bijv. Setter Marketing 15%" style={{ flex: 1, minWidth: 0 }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bewaarAlsNieuw() } }} />
                    <button type="button" className="btn btn-primary btn-sm" style={knopTekst} disabled={nieuwNaam.trim().length < 2} onClick={bewaarAlsNieuw}>Bewaar</button>
                    <button type="button" className="btn btn-outline btn-sm" style={knopTekst} onClick={() => setNieuwNaam(null)}>Annuleer</button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-outline btn-sm" style={knopTekst} onClick={() => setVoorbeeld(v => !v)} disabled={!sjabloon}>
            <Eye size={13} /> {voorbeeld ? 'Verklaring verbergen' : 'Verklaring lezen'}
          </button>
          {voorbeeld && voorbeeldRij && (
            <div style={{ marginTop: 10, padding: 16, border: '1px solid var(--border)', borderRadius: 12 }}>
              <OvereenkomstTekst overeenkomst={voorbeeldRij} bellerNaam={via === 'link' ? naam : beller?.full_name} />
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={verstuur} disabled={!kan} style={{ flex: 1 }}>
            {bezig ? 'Bezig...' : via === 'link' ? 'Link maken' : beller ? `Versturen naar ${beller.full_name?.split(' ')[0] || 'beller'}` : 'Versturen'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Bedragen van een verklaring aanpassen die nog niet getekend is. Zelfde
// verklaring en zelfde link, de ontvanger ziet meteen de nieuwe bedragen.
function BedragenWijzigenModal({ overeenkomst, naam, onClose, onOpgeslagen }) {
  const toast = useToast()
  const projecten = useProjecten()
  const [tarieven, setTarieven] = useState(tarievenVoorScherm(overeenkomst.tarieven))
  const [bezig, setBezig] = useState(false)
  const geldig = tarievenVoorOpslaan(tarieven)

  async function bewaar() {
    if (!geldig.length || bezig) return
    setBezig(true)
    const { error } = await supabase.rpc('overeenkomst_tarieven_wijzigen', { p_id: overeenkomst.id, p_tarieven: geldig })
    setBezig(false)
    if (error) { toast(error.message, 'error'); return }
    toast('Bedragen aangepast', 'success')
    onOpgeslagen()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal glass-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: 620, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h2><Pencil size={18} /> Bedragen aanpassen{naam ? ` voor ${naam}` : ''}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: 0 }}>
          Deze verklaring is nog niet getekend. Na opslaan ziet {naam || 'de ontvanger'} meteen de nieuwe bedragen{overeenkomst.token ? ', de link blijft hetzelfde' : ''}.
        </p>
        <TarievenEditor rijen={tarieven} setRijen={setTarieven} projecten={projecten} />
        <div className="flex gap-2 mt-4">
          <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>Annuleren</button>
          <button type="button" className="btn btn-primary" onClick={bewaar} disabled={!geldig.length || bezig} style={{ flex: 1 }}>
            <Save size={14} /> {bezig ? 'Bezig...' : 'Bedragen opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SjablonenBeheer({ sjablonen, onGewijzigd }) {
  const toast = useToast()
  const projecten = useProjecten()
  const [kiesId, setKiesId] = useState(sjablonen[0]?.id || null)
  const [sj, setSj] = useState(null)
  const [tarieven, setTarieven] = useState([{ project: '', afspraak: '', sale: '', sale_procent: '' }])
  const [gewijzigd, setGewijzigd] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [weg, setWeg] = useState(false)

  const gekozen = sjablonen.find(s => s.id === kiesId) || null
  useEffect(() => {
    if (!gekozen) { setSj(null); return }
    setSj({ ...gekozen })
    setTarieven(tarievenVoorScherm(gekozen.tarieven))
    setGewijzigd(false)
    setWeg(false)
  }, [kiesId, gekozen?.updated_at])

  const zet = (k, v) => { setSj(s => ({ ...s, [k]: v })); setGewijzigd(true) }
  const zetTarieven = (f) => { setTarieven(f); setGewijzigd(true) }

  async function herlaad(id) {
    const lijst = await laadSjablonen()
    onGewijzigd(lijst)
    if (id) setKiesId(id)
  }

  async function bewaar() {
    if (!sj?.naam?.trim()) { toast('Geef het sjabloon een naam', 'error'); return }
    setBezig(true)
    const { data, error } = await supabase.from('overeenkomst_sjablonen')
      .update({ naam: sj.naam.trim(), titel: sj.titel, opdrachtgever_naam: sj.opdrachtgever_naam, opdrachtgever_plaats: sj.opdrachtgever_plaats || null, opdrachtgever_kvk: sj.opdrachtgever_kvk || null, ontvanger_rol: (sj.ontvanger_rol || '').trim() || 'Appointment setter', tekst: sj.tekst, tarieven: tarievenVoorOpslaan(tarieven), omschrijving: (sj.omschrijving || '').trim() || null, snelkeuze: sj.snelkeuze === '' || sj.snelkeuze === null || sj.snelkeuze === undefined ? null : Number(sj.snelkeuze) })
      .eq('id', sj.id).select().single()
    setBezig(false)
    if (error) { toast(error.message, 'error'); return }
    setGewijzigd(false)
    toast(`Sjabloon bewaard (versie ${data.versie})`, 'success')
    herlaad(data.id)
  }

  async function nieuw(kopieVan) {
    const bron = kopieVan || sjablonen.find(s => s.is_standaard) || sjablonen[0]
    if (!bron) return
    const { data, error } = await supabase.from('overeenkomst_sjablonen').insert({
      naam: kopieVan ? `${bron.naam} (kopie)` : 'Nieuw sjabloon',
      titel: bron.titel, opdrachtgever_naam: bron.opdrachtgever_naam, opdrachtgever_plaats: bron.opdrachtgever_plaats,
      opdrachtgever_kvk: bron.opdrachtgever_kvk, ontvanger_rol: bron.ontvanger_rol || 'Appointment setter', tekst: bron.tekst, tarieven: kopieVan ? bron.tarieven : [],
    }).select().single()
    if (error) { toast(error.message, 'error'); return }
    toast('Sjabloon gemaakt. Geef hem een naam en bewaar.', 'success')
    herlaad(data.id)
  }

  async function maakStandaard() {
    if (!sj || sj.is_standaard) return
    const e1 = await supabase.from('overeenkomst_sjablonen').update({ is_standaard: false }).eq('is_standaard', true)
    if (e1.error) { toast(e1.error.message, 'error'); return }
    const e2 = await supabase.from('overeenkomst_sjablonen').update({ is_standaard: true }).eq('id', sj.id)
    if (e2.error) { toast(e2.error.message, 'error'); return }
    toast(`"${sj.naam}" is nu het standaardsjabloon`, 'success')
    herlaad(sj.id)
  }

  async function verwijder() {
    if (!sj || sj.is_standaard) return
    if (!weg) { setWeg(true); setTimeout(() => setWeg(false), 4000); return }
    const { error } = await supabase.from('overeenkomst_sjablonen').delete().eq('id', sj.id)
    if (error) { toast(error.message, 'error'); return }
    toast('Sjabloon verwijderd. Al verstuurde verklaringen blijven gewoon staan.', 'success')
    const lijst = await laadSjablonen()
    onGewijzigd(lijst)
    setKiesId(lijst[0]?.id || null)
  }

  if (!sjablonen.length) {
    return <EmptyState icon={FileSignature} title="Nog geen sjablonen" message="Er is nog geen sjabloon. Draai eerst migratie v137 in Supabase." />
  }
  if (!sj) return <LoadingSpinner />

  const tarievenNu = tarievenVoorOpslaan(tarieven)
  const voorbeeld = {
    titel: sj.titel, tekst: sj.tekst,
    opdrachtgever: { naam: sj.opdrachtgever_naam, plaats: sj.opdrachtgever_plaats, kvk: sj.opdrachtgever_kvk, ontvanger_rol: sj.ontvanger_rol },
    tarieven: tarievenNu.length ? tarievenNu : [{ project: 'Voorbeeldproject', afspraak: 25, sale: 50 }],
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {sjablonen.map(s => (
          <button key={s.id} className={`btn btn-sm ${s.id === kiesId ? '' : 'btn-outline'}`} style={knopTekst} onClick={() => setKiesId(s.id)}>
            {s.is_standaard && <Star size={12} />} {s.naam}
          </button>
        ))}
        <button className="btn btn-outline btn-sm" style={knopTekst} onClick={() => nieuw(null)}><Plus size={13} /> Nieuw sjabloon</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div className="bg-elevated border border-border rounded-lg" style={{ padding: 16 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <button className="btn btn-outline btn-sm" style={knopTekst} onClick={() => nieuw(gekozen)}><CopyPlus size={13} /> Kopie maken</button>
            {!sj.is_standaard && <button className="btn btn-outline btn-sm" style={knopTekst} onClick={maakStandaard}><Star size={13} /> Maak standaard</button>}
            {!sj.is_standaard && (
              <button className="btn btn-outline btn-sm" style={{ ...knopTekst, color: weg ? 'var(--danger)' : undefined }} onClick={verwijder}>
                <Trash2 size={13} /> {weg ? 'Nog een keer klikken' : 'Verwijderen'}
              </button>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 0 }}>
            Versie {sj.versie}{sj.is_standaard ? ', standaardsjabloon' : ''}. Een wijziging geldt voor verklaringen die je hierna verstuurt. Wat al verstuurd of getekend is, blijft zoals het was.
          </p>
          <div className="form-group"><label>Naam van het sjabloon</label><input className="form-dark" style={{ width: '100%' }} value={sj.naam || ''} onChange={e => zet('naam', e.target.value)} placeholder="Alleen voor jezelf, bijv. BeautyInfo setters" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 8, alignItems: 'end' }}>
            <div className="form-group">
              <label>Als kaart tonen</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', fontWeight: 500, height: 38 }}>
                <input type="checkbox" checked={sj.snelkeuze !== null && sj.snelkeuze !== undefined && sj.snelkeuze !== ''}
                  onChange={e => zet('snelkeuze', e.target.checked ? (Math.max(0, ...sjablonen.map(x => Number(x.snelkeuze) || 0)) + 1) : null)} />
                Standaard
              </label>
            </div>
            <div className="form-group"><label>Korte uitleg op de kaart</label><input className="form-dark" style={{ width: '100%' }} value={sj.omschrijving || ''} onChange={e => zet('omschrijving', e.target.value)} placeholder="Bijv. Belt klinieken voor BeautyInfo" maxLength={160} /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
            <div className="form-group"><label>Titel boven de verklaring</label><input className="form-dark" style={{ width: '100%' }} value={sj.titel || ''} onChange={e => zet('titel', e.target.value)} /></div>
            <div className="form-group"><label>Ontvanger heet</label><input className="form-dark" style={{ width: '100%' }} value={sj.ontvanger_rol || ''} onChange={e => zet('ontvanger_rol', e.target.value)} placeholder="Appointment setter" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div className="form-group"><label>Opdrachtgever</label><input className="form-dark" style={{ width: '100%' }} value={sj.opdrachtgever_naam || ''} onChange={e => zet('opdrachtgever_naam', e.target.value)} /></div>
            <div className="form-group"><label>Plaats</label><input className="form-dark" style={{ width: '100%' }} value={sj.opdrachtgever_plaats || ''} onChange={e => zet('opdrachtgever_plaats', e.target.value)} /></div>
            <div className="form-group"><label>KvK</label><input className="form-dark" style={{ width: '100%' }} value={sj.opdrachtgever_kvk || ''} onChange={e => zet('opdrachtgever_kvk', e.target.value)} placeholder="Optioneel" /></div>
          </div>

          <div className="form-group">
            <label>Standaardbedragen</label>
            <p className="text-muted" style={{ fontSize: '0.75rem', margin: '2px 0 8px' }}>Worden ingevuld als je dit sjabloon kiest bij versturen. Daar kun je ze per persoon nog aanpassen.</p>
            <TarievenEditor rijen={tarieven} setRijen={zetTarieven} projecten={projecten} />
          </div>

          <div className="form-group">
            <label>Tekst</label>
            <textarea className="form-dark" style={{ width: '100%', minHeight: 380, fontFamily: 'inherit', fontSize: '0.85rem', lineHeight: 1.55 }} value={sj.tekst || ''} onChange={e => zet('tekst', e.target.value)} />
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
    </>
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
      if (!data.profile_id) { setNaam(data.ontvanger_naam || ''); return }
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
