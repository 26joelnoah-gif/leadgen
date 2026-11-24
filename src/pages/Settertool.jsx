import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, BookOpen, BarChart3, MessageCircle } from 'lucide-react'
import Header from '../components/Header'
import LoadingSpinner from '../components/LoadingSpinner'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../components/Toast'
import { supabase } from '../lib/supabase'
import { setterTool } from '../content/settertool'
import { zetWhatsappBevestigd } from '../lib/setterGesprekken'
import { foutTekst } from '../lib/retry'

// v159: Settertool - onboarding + weekchecklist (iedere setter), open
// afspraken die nog via WhatsApp bevestigd moeten worden, en voor admin /
// projectmanager het overzicht per setter en per haak (echte data).
const PERIODES = [
  { id: 'week', label: 'Deze week', van: () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d } },
  { id: 'maand', label: 'Deze maand', van: () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(1); return d } },
  { id: '30', label: 'Laatste 30 dagen', van: () => new Date(Date.now() - 30 * 864e5) },
  { id: 'alles', label: 'Alles', van: () => new Date('2026-01-01T00:00:00Z') },
]

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '-')

export default function Settertool() {
  const { profile, user } = useAuth()
  const toast = useToast()
  const [projecten, setProjecten] = useState(null)
  const [projectId, setProjectId] = useState(null)
  const [tab, setTab] = useState('onboarding')
  const [vinkjes, setVinkjes] = useState([])
  const [open, setOpen] = useState([])
  const [periode, setPeriode] = useState('week')
  const [overzicht, setOverzicht] = useState(null)
  const [overzichtFout, setOverzichtFout] = useState(null)

  const isAdmin = profile?.role === 'admin'
  const project = projecten?.find(p => p.id === projectId) || null
  const tool = setterTool(project?.setter_tool)
  const magOverzicht = isAdmin || (project && project.isManager)

  useEffect(() => {
    if (!user?.id) return
    let weg = false
    Promise.all([
      supabase.from('campaigns').select('id, name, setter_tool').not('setter_tool', 'is', null).is('deleted_at', null),
      supabase.from('campaign_managers').select('campaign_id').eq('manager_id', user.id),
    ]).then(([{ data, error }, { data: cm }]) => {
      if (weg) return
      if (error) { setProjecten([]); return }
      const beheer = new Set((cm || []).map(r => r.campaign_id))
      const lijst = (data || []).filter(p => setterTool(p.setter_tool)).map(p => ({ ...p, isManager: beheer.has(p.id) }))
      setProjecten(lijst)
      setProjectId(lijst[0]?.id || null)
    })
    return () => { weg = true }
  }, [user?.id])

  // Afvinklijst
  useEffect(() => {
    if (!user?.id || !project?.setter_tool) return
    supabase.from('setter_onboarding').select('item').eq('user_id', user.id).eq('tool', project.setter_tool)
      .then(({ data }) => setVinkjes((data || []).map(r => r.item)))
  }, [user?.id, project?.setter_tool])

  async function vink(item) {
    const aan = !vinkjes.includes(item)
    setVinkjes(v => aan ? [...v, item] : v.filter(x => x !== item))
    const q = aan
      ? supabase.from('setter_onboarding').insert({ user_id: user.id, tool: project.setter_tool, item })
      : supabase.from('setter_onboarding').delete().eq('user_id', user.id).eq('tool', project.setter_tool).eq('item', item)
    const { error } = await q
    if (error) {
      setVinkjes(v => aan ? v.filter(x => x !== item) : [...v, item])
      toast(`Niet opgeslagen: ${foutTekst(error)}`, 'error')
    }
  }

  // Eigen afspraken die nog niet via WhatsApp bevestigd zijn
  const laadOpen = useCallback(async () => {
    if (!user?.id || !projectId) return
    const { data } = await supabase.from('setter_gesprekken')
      .select('id, created_at, afspraak_op, afspraak_vorm, lead_id, leads(name, contact_person, phone, status)')
      .eq('setter_id', user.id).eq('campaign_id', projectId)
      .eq('uitkomst', 'afspraak').eq('whatsapp_bevestigd', false)
      .gte('afspraak_op', new Date().toISOString())
      .order('afspraak_op', { ascending: true }).limit(50)
    setOpen((data || []).filter(r => r.leads?.status === 'afspraak_gemaakt'))
  }, [user?.id, projectId])
  useEffect(() => { laadOpen() }, [laadOpen])

  async function bevestig(id) {
    const { ok, error } = await zetWhatsappBevestigd(id)
    if (!ok) { toast(`Niet opgeslagen: ${foutTekst(error)}`, 'error'); return }
    setOpen(o => o.filter(r => r.id !== id))
    toast('Afspraak staat op bevestigd', 'success')
  }

  // Overzicht
  useEffect(() => {
    if (tab !== 'overzicht' || !magOverzicht || !projectId) return
    let weg = false
    setOverzicht(null); setOverzichtFout(null)
    const van = PERIODES.find(p => p.id === periode).van()
    supabase.rpc('settertool_overzicht', { p_campaign: projectId, p_van: van.toISOString(), p_tot: new Date(Date.now() + 864e5).toISOString() })
      .then(({ data, error }) => {
        if (weg) return
        if (error) setOverzichtFout(foutTekst(error))
        else setOverzicht(data || { setters: [], haken: [] })
      })
    return () => { weg = true }
  }, [tab, magOverzicht, projectId, periode])

  const totaal = useMemo(() => (overzicht?.setters || []).reduce((t, r) => ({
    gebeld: t.gebeld + r.gebeld, bereikt: t.bereikt + r.bereikt, afspraken: t.afspraken + r.afspraken, bevestigd: t.bevestigd + r.bevestigd,
  }), { gebeld: 0, bereikt: 0, afspraken: 0, bevestigd: 0 }), [overzicht])

  if (projecten === null) return (<><Header /><LoadingSpinner /></>)

  const tabKnop = (id, label, icon) => (
    <button key={id} type="button" onClick={() => setTab(id)} className={`btn btn-sm ${tab === id ? 'btn-primary' : 'btn-outline'}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon} {label}</button>
  )
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 800, borderBottom: '1px solid var(--border)' }
  const td = { padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '0.9rem' }

  return (
    <>
      <Header />
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 60px' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 4 }}>Settertool{tool ? ` ${tool.naam}` : ''}</h1>
        {!tool ? (
          <p style={{ color: 'var(--text-muted)' }}>Er is nog geen project met de settertool waar jij aan werkt.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '12px 0 20px' }}>
              {tabKnop('onboarding', 'Onboarding', <BookOpen size={14} />)}
              {tabKnop('bevestigen', `Te bevestigen${open.length ? ` (${open.length})` : ''}`, <MessageCircle size={14} />)}
              {magOverzicht && tabKnop('overzicht', 'Overzicht', <BarChart3 size={14} />)}
              {projecten.length > 1 && (
                <select value={projectId || ''} onChange={e => setProjectId(e.target.value)} style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 8, background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  {projecten.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </div>

            {tab === 'onboarding' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {tool.onboarding.map(sec => (
                  <section key={sec.titel} className="card" style={{ padding: '16px 18px' }}>
                    <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>{sec.titel}</h2>
                    {(sec.alinea || []).map((a, i) => <p key={i} style={{ lineHeight: 1.6, margin: '0 0 8px' }}>{a}</p>)}
                    {sec.lijst && <ul style={{ paddingLeft: 20, lineHeight: 1.7 }}>{sec.lijst.map(l => <li key={l}>{l}</li>)}</ul>}
                    {sec.genummerd && <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>{sec.genummerd.map(l => <li key={l}>{l}</li>)}</ol>}
                    {sec.tabel && (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', margin: '4px 0 8px' }}>
                          <thead><tr>{sec.tabel.kop.map(k => <th key={k} style={th}>{k}</th>)}</tr></thead>
                          <tbody>{sec.tabel.rijen.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={td}>{c}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    )}
                    {(sec.naTabel || []).map((a, i) => <p key={i} style={{ lineHeight: 1.6, margin: '8px 0 0' }}>{a}</p>)}
                  </section>
                ))}
                <section className="card" style={{ padding: '16px 18px' }}>
                  <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Je eerste week</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 10px' }}>{vinkjes.length} van {tool.weekChecklist.length} afgevinkt</p>
                  {tool.weekChecklist.map(c => (
                    <label key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', cursor: 'pointer', lineHeight: 1.5 }}>
                      <input type="checkbox" checked={vinkjes.includes(c.id)} onChange={() => vink(c.id)} style={{ marginTop: 4 }} />
                      <span style={{ textDecoration: vinkjes.includes(c.id) ? 'line-through' : 'none', color: vinkjes.includes(c.id) ? 'var(--text-muted)' : 'var(--text-primary)' }}>{c.tekst}</span>
                    </label>
                  ))}
                </section>
              </div>
            )}

            {tab === 'bevestigen' && (
              <div className="card" style={{ padding: '16px 18px' }}>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', marginTop: 0 }}>Afspraken die de klant nog niet via WhatsApp heeft bevestigd. Stuurde de klant "ok"? Klik op Bevestigd.</p>
                {open.length === 0 ? <p>Alles is bevestigd.</p> : open.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <strong>{r.leads?.name || 'Lead'}</strong>{r.leads?.contact_person ? ` - ${r.leads.contact_person}` : ''}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(r.afspraak_op).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}, {r.afspraak_vorm === 'online' ? 'online' : 'fysiek'}
                        {r.leads?.phone ? ` - ${r.leads.phone}` : ''}
                      </div>
                    </div>
                    <button type="button" className="btn btn-sm btn-primary" onClick={() => bevestig(r.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={14} /> Bevestigd
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tab === 'overzicht' && magOverzicht && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {PERIODES.map(p => (
                    <button key={p.id} type="button" onClick={() => setPeriode(p.id)} className={`btn btn-sm ${periode === p.id ? 'btn-primary' : 'btn-outline'}`}>{p.label}</button>
                  ))}
                </div>
                {overzichtFout && <p style={{ color: 'var(--error)' }}>Overzicht niet geladen: {overzichtFout}</p>}
                {!overzicht && !overzichtFout && <LoadingSpinner />}
                {overzicht && (
                  <>
                    <section className="card" style={{ padding: '16px 18px', overflowX: 'auto' }}>
                      <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>Per setter</h2>
                      {overzicht.setters.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Nog geen gesprekken in deze periode.</p> : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>{['Setter', 'Gebeld', 'Bereikt', 'Afspraken', 'Bevestigd', 'Afspraak per bereikt'].map(k => <th key={k} style={th}>{k}</th>)}</tr></thead>
                          <tbody>
                            {overzicht.setters.map(r => (
                              <tr key={r.setter_id}>
                                <td style={td}>{r.naam}</td><td style={td}>{r.gebeld}</td><td style={td}>{r.bereikt}</td>
                                <td style={td}>{r.afspraken}</td><td style={td}>{r.bevestigd}</td><td style={td}>{pct(r.afspraken, r.bereikt)}</td>
                              </tr>
                            ))}
                            <tr style={{ fontWeight: 800 }}>
                              <td style={td}>Totaal</td><td style={td}>{totaal.gebeld}</td><td style={td}>{totaal.bereikt}</td>
                              <td style={td}>{totaal.afspraken}</td><td style={td}>{totaal.bevestigd}</td><td style={td}>{pct(totaal.afspraken, totaal.bereikt)}</td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </section>
                    <section className="card" style={{ padding: '16px 18px', overflowX: 'auto' }}>
                      <h2 style={{ fontSize: '1.05rem', marginBottom: 4 }}>Per haak</h2>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 8px' }}>Alleen gesprekken waarin iemand opnam.</p>
                      {overzicht.haken.length === 0 ? <p style={{ color: 'var(--text-muted)' }}>Nog geen gesprekken in deze periode.</p> : (
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead><tr>{['Haak', 'Gebruikt', 'Afspraken', 'Slagingspercentage'].map(k => <th key={k} style={th}>{k}</th>)}</tr></thead>
                          <tbody>
                            {overzicht.haken.map(h => (
                              <tr key={h.haak}>
                                <td style={td}>{tool.haken.find(x => x.id === h.haak)?.label || h.haak}</td>
                                <td style={td}>{h.gebruikt}</td><td style={td}>{h.afspraken}</td><td style={td}>{pct(h.afspraken, h.gebruikt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </section>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
