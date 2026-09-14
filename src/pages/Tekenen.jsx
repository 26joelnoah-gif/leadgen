// LEADGEN v65 — publieke tekenpagina /tekenen/:token.
// Geen login. Praat alleen met de Edge Function offerte-sign en rendert de
// offerte generiek vanuit de kolommen van public.offertes (regels, upsell,
// bedragen, akkoord_tekst). Kent geen pakketten of prijsmodel: dat hoort bij
// de offerte-tool van de tenant, niet bij het tekenen. Eigen licht thema,
// onafhankelijk van data-theme, want de klant is geen LeadGen-gebruiker.
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/offerte-sign`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const euro = (n) => '€ ' + Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const datum = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const tijd = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

const CSS = `
.tk{--bg:#F4F6F9;--surface:#FFFFFF;--line:#E1E5EC;--text:#14171F;--muted:#5B6270;--faint:#8A90A0;--accent:#2F6FE0;--accent-soft:#E7EEFC;--good:#1E8A5B;--good-soft:#DDF3E8;--bad:#C6373C;--bad-soft:#FBE3E4;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.tk *{box-sizing:border-box}
.tk .wrap{max-width:680px;margin:0 auto;padding:20px 16px 140px}
.tk header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0 16px}
.tk header .brand{font-weight:700;font-size:18px}
.tk header img{max-height:40px}
.tk header .nr{font-size:13px;color:var(--muted);text-align:right;line-height:1.4}
.tk .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px}
.tk h1{font-size:22px;line-height:1.25;margin:0 0 6px}
.tk h2{font-size:15px;margin:0 0 10px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.04em}
.tk .muted{color:var(--muted);font-size:14px}
.tk .am{display:flex;align-items:center;gap:12px;background:var(--accent-soft);border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:14px}
.tk .am b{display:block}
.tk .am a{color:var(--accent);text-decoration:none;font-weight:600;margin-right:12px}
.tk table{width:100%;border-collapse:collapse;font-size:15px}
.tk td{padding:9px 0;border-top:1px solid var(--line);vertical-align:top}
.tk tr:first-child td{border-top:0}
.tk td.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tk td.n{color:var(--muted);font-size:13px}
.tk .tot td{font-weight:600}
.tk .tot.big td{font-size:18px;padding-top:12px}
.tk .akkoord{font-size:14px;color:var(--text);white-space:pre-wrap}
.tk label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:12px 0 6px}
.tk input[type=text]{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text)}
.tk input[type=text]:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
.tk .sig{position:relative;border:2px dashed var(--line);border-radius:12px;background:#fff;touch-action:none}
.tk .sig canvas{display:block;width:100%;height:200px;border-radius:10px}
.tk .sig .hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--faint);font-size:14px;pointer-events:none}
.tk .sig .line{position:absolute;left:24px;right:24px;bottom:44px;border-top:1px solid var(--line);pointer-events:none}
.tk .row{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:10px}
.tk .check{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-top:14px}
.tk .check input{width:20px;height:20px;margin-top:2px;flex:none}
.tk .btn{font:inherit;font-size:15px;font-weight:600;padding:12px 16px;border-radius:10px;border:1px solid var(--line);background:#fff;color:var(--text);cursor:pointer}
.tk .btn.sm{font-size:13px;padding:8px 12px}
.tk .btn.p{background:var(--accent);border-color:var(--accent);color:#fff;width:100%;padding:16px;font-size:17px}
.tk .btn:disabled{opacity:.45;cursor:not-allowed}
.tk .sticky{position:fixed;left:0;right:0;bottom:0;background:rgba(244,246,249,.92);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
.tk .sticky .in{max-width:680px;margin:0 auto}
.tk .link{background:none;border:0;color:var(--muted);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;display:block;margin:10px auto 0}
.tk .state{text-align:center;padding:40px 20px}
.tk .state .ico{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:30px}
.tk .state.ok .ico{background:var(--good-soft);color:var(--good)}
.tk .state.bad .ico{background:var(--bad-soft);color:var(--bad)}
.tk .state.warn .ico{background:#FBEFD9;color:#C77A0A}
.tk .err{background:var(--bad-soft);color:var(--bad);border-radius:10px;padding:10px 12px;font-size:14px;margin-top:10px}
.tk details{margin-top:8px}
.tk summary{cursor:pointer;color:var(--accent);font-size:14px;font-weight:600}
.tk ul{margin:8px 0 0;padding-left:18px;font-size:14px;color:var(--muted)}
.tk textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;min-height:80px;margin-top:8px}
`

function SignaturePad({ disabled, onChange }) {
  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const c = canvasRef.current
    const ratio = window.devicePixelRatio || 1
    const rect = c.getBoundingClientRect()
    c.width = rect.width * ratio
    c.height = rect.height * ratio
    const ctx = c.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#14171F'
  }, [])

  const pos = (e) => {
    const c = canvasRef.current
    const r = c.getBoundingClientRect()
    const p = e.touches ? e.touches[0] : e
    return [p.clientX - r.left, p.clientY - r.top]
  }
  const start = (e) => {
    if (disabled) return
    drawing.current = true
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(...pos(e))
    e.preventDefault()
  }
  const move = (e) => {
    if (!drawing.current) return
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(...pos(e))
    ctx.stroke()
    if (!hasInk) { setHasInk(true); onChange(true) }
    e.preventDefault()
  }
  const end = () => { drawing.current = false }
  const clear = () => {
    const c = canvasRef.current
    c.getContext('2d').clearRect(0, 0, c.width, c.height)
    setHasInk(false)
    onChange(false)
  }

  return (
    <>
      <div className="sig">
        <canvas
          ref={canvasRef}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        />
        <div className="line" />
        {!hasInk && <div className="hint">Teken hier met uw vinger of muis</div>}
      </div>
      <div className="row">
        <span className="muted" style={{ fontSize: 13 }}>Handtekening</span>
        <button type="button" className="btn sm" onClick={clear} disabled={disabled || !hasInk}>Wis</button>
      </div>
    </>
  )
}
SignaturePad.getPng = (root) => root?.querySelector('canvas')?.toDataURL('image/png')

export default function Tekenen() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [naam, setNaam] = useState('')
  const [functie, setFunctie] = useState('')
  const [gelezen, setGelezen] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [afwijzen, setAfwijzen] = useState(false)
  const [reden, setReden] = useState('')
  const [submitErr, setSubmitErr] = useState(null)
  const padRoot = useRef(null)

  useEffect(() => {
    document.title = 'Offerte ondertekenen'
    const meta = document.createElement('meta')
    meta.name = 'robots'; meta.content = 'noindex'
    document.head.appendChild(meta)
    return () => { document.head.removeChild(meta) }
  }, [])

  useEffect(() => {
    let stop = false
    async function load() {
      try {
        const res = await fetch(`${FN_URL}?t=${encodeURIComponent(token)}`, { headers: { apikey: ANON } })
        const body = await res.json().catch(() => ({}))
        if (stop) return
        if (res.status === 404 || body?.error === 'onbekend') { setError('onbekend'); return }
        if (body?.error === 'te_veel_verzoeken') { setError('druk'); return }
        setData(body)
      } catch {
        if (!stop) setError('netwerk')
      }
    }
    load()
    return () => { stop = true }
  }, [token])

  async function post(payload) {
    setBusy(true); setSubmitErr(null)
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON },
        body: JSON.stringify({ t: token, ...payload }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.ok) {
        if (body?.state) { setData({ ...data, state: body.state }); return }
        setSubmitErr(body?.error === 'handtekening_ongeldig' ? 'De handtekening kon niet worden opgeslagen. Probeer het opnieuw.' : 'Er ging iets mis. Probeer het opnieuw of bel ons.')
        return
      }
      setData({ ...data, state: body.state, getekend_op: body.getekend_op, door: naam })
      window.scrollTo({ top: 0 })
    } catch {
      setSubmitErr('Geen verbinding. Controleer uw internet en probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  function tekenen() {
    const png = SignaturePad.getPng(padRoot.current)
    post({ actie: 'tekenen', naam: naam.trim(), functie: functie.trim(), png })
  }

  const org = data?.org || {}
  const am = data?.am || {}

  const Header = () => (
    <header>
      {org.logo_url ? <img src={org.logo_url} alt={org.naam || ''} /> : <div className="brand">{org.naam || 'Offerte'}</div>}
      {data?.nummer || data?.offerte?.nummer ? (
        <div className="nr">Offerte {data?.nummer || data?.offerte?.nummer}{data?.offerte?.geldig_tot ? <><br />geldig tot {datum(data.offerte.geldig_tot)}</> : null}</div>
      ) : null}
    </header>
  )
  const AmBlok = () => (am.naam ? (
    <div className="am">
      <div>
        <b>Vragen? Bel of mail {am.naam}</b>
        {am.telefoon && <a href={`tel:${am.telefoon}`}>{am.telefoon}</a>}
        {am.email && <a href={`mailto:${am.email}`}>{am.email}</a>}
      </div>
    </div>
  ) : null)

  const State = ({ kind, icon, title, text }) => (
    <div className="tk"><style>{CSS}</style><div className="wrap">
      <Header />
      <div className={`card state ${kind}`}>
        <div className="ico">{icon}</div>
        <h1>{title}</h1>
        <p className="muted">{text}</p>
      </div>
      <AmBlok />
    </div></div>
  )

  if (error === 'onbekend') return <State kind="bad" icon="?" title="Deze link is niet geldig" text="Controleer of u de volledige link uit de e-mail heeft gebruikt." />
  if (error === 'druk') return <State kind="warn" icon="!" title="Even geduld" text="Er zijn te veel verzoeken vanaf uw verbinding. Probeer het over een paar minuten opnieuw." />
  if (error === 'netwerk') return <State kind="warn" icon="!" title="Geen verbinding" text="De offerte kon niet worden geladen. Controleer uw internetverbinding en ververs de pagina." />
  if (!data) {
    return <div className="tk"><style>{CSS}</style><div className="wrap"><div className="card state"><p className="muted">Offerte laden…</p></div></div></div>
  }
  if (data.state === 'getekend') {
    return <State kind="ok" icon="✓" title="Ondertekend, bedankt" text={`Offerte ${data.nummer || ''} is op ${tijd(data.getekend_op)} ondertekend${data.door ? ` door ${data.door}` : ''}. U ontvangt een bevestiging per e-mail.`} />
  }
  if (data.state === 'verlopen') return <State kind="warn" icon="⌛" title="Deze offerte is verlopen" text="De geldigheid van deze offerte is voorbij. Neem contact met ons op voor een nieuwe versie." />
  if (data.state === 'afgewezen') return <State kind="bad" icon="×" title="Offerte afgewezen" text="U heeft aangegeven niet akkoord te gaan met deze offerte. Wij nemen contact met u op." />
  if (data.state === 'geannuleerd') return <State kind="bad" icon="×" title="Deze offerte is ingetrokken" text="Deze offerte is door ons ingetrokken. Neem contact met ons op voor een actuele versie." />

  const o = data.offerte
  const regels = Array.isArray(o.regels) ? o.regels : []
  const upsell = Array.isArray(o.upsell) ? o.upsell : []
  const spec = o.speclijst && typeof o.speclijst === 'object' ? Object.entries(o.speclijst).filter(([, v]) => v) : []
  const canSign = naam.trim().length >= 2 && hasInk && gelezen && !busy

  return (
    <div className="tk"><style>{CSS}</style>
      <div className="wrap">
        <Header />

        <div className="card">
          <h1>Offerte voor {o.zaak_naam}</h1>
          <div className="muted">
            {o.contact_naam && <div>T.a.v. {o.contact_naam}</div>}
            {o.adres && <div>{o.adres}</div>}
          </div>
        </div>

        <AmBlok />

        <div className="card">
          <h2>Eenmalig</h2>
          <table>
            <tbody>
              {regels.map((r, i) => (
                <tr key={i}>
                  <td>{r.naam}{r.aantal > 1 ? <span className="muted"> × {r.aantal}</span> : null}</td>
                  <td className="r">{euro(r.totaal ?? (r.prijs * (r.aantal || 1)))}</td>
                </tr>
              ))}
              {Number(o.korting) > 0 && (
                <tr><td>Korting</td><td className="r">- {euro(o.korting)}</td></tr>
              )}
              <tr className="tot"><td>Subtotaal (excl. btw)</td><td className="r">{euro(o.eenmalig_ex)}</td></tr>
              <tr><td className="n">Btw 21%</td><td className="r n">{euro(o.btw)}</td></tr>
              <tr className="tot big"><td>Totaal eenmalig (incl. btw)</td><td className="r">{euro(o.eenmalig_incl)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Per maand</h2>
          <table>
            <tbody>
              {regels.filter((r) => Number(r.mnd) > 0).map((r, i) => (
                <tr key={'m' + i}><td>{r.naam}</td><td className="r">{euro(r.mnd)}</td></tr>
              ))}
              {upsell.map((u, i) => (
                <tr key={'u' + i}><td>{u.naam}</td><td className="r">{u.prijs == null || u.op_aanvraag ? 'op aanvraag' : euro(u.prijs)}</td></tr>
              ))}
              <tr className="tot big"><td>Totaal per maand (excl. btw)</td><td className="r">{euro(o.maandbedrag_ex)}</td></tr>
            </tbody>
          </table>
          {o.pakket && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>Pakket: {o.pakket}</div>}
          {spec.length > 0 && (
            <details>
              <summary>Bijbehorende specificaties ({spec.length})</summary>
              <ul>{spec.map(([k, v]) => <li key={k}>{typeof v === 'string' ? v : k}</li>)}</ul>
            </details>
          )}
        </div>

        <div className="card">
          <h2>Akkoordverklaring</h2>
          <div className="akkoord">{o.akkoord_tekst}</div>
        </div>

        {!afwijzen ? (
          <div className="card" ref={padRoot}>
            <h2>Ondertekenen</h2>
            <label htmlFor="tk-naam">Uw naam</label>
            <input id="tk-naam" type="text" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voor- en achternaam" autoComplete="name" />
            <label htmlFor="tk-functie">Functie (optioneel)</label>
            <input id="tk-functie" type="text" value={functie} onChange={(e) => setFunctie(e.target.value)} placeholder="Bijv. eigenaar" />
            <label>Handtekening</label>
            <SignaturePad disabled={busy} onChange={setHasInk} />
            <label className="check">
              <input type="checkbox" checked={gelezen} onChange={(e) => setGelezen(e.target.checked)} />
              <span>Ik heb de offerte en de akkoordverklaring gelezen en ga hiermee akkoord namens {o.zaak_naam}.</span>
            </label>
            {submitErr && <div className="err">{submitErr}</div>}
          </div>
        ) : (
          <div className="card">
            <h2>Niet akkoord</h2>
            <p className="muted">Wilt u ons laten weten waarom? Dat helpt ons een passend voorstel te doen.</p>
            <textarea value={reden} onChange={(e) => setReden(e.target.value)} placeholder="Reden (optioneel)" />
            <div className="row">
              <button type="button" className="btn" onClick={() => setAfwijzen(false)} disabled={busy}>Terug</button>
              <button type="button" className="btn" style={{ color: 'var(--bad)' }} onClick={() => post({ actie: 'afwijzen', reden })} disabled={busy}>Offerte afwijzen</button>
            </div>
            {submitErr && <div className="err">{submitErr}</div>}
          </div>
        )}
      </div>

      {!afwijzen && (
        <div className="sticky"><div className="in">
          <button type="button" className="btn p" onClick={tekenen} disabled={!canSign}>{busy ? 'Bezig…' : 'Akkoord en ondertekenen'}</button>
          <button type="button" className="link" onClick={() => setAfwijzen(true)} disabled={busy}>Ik ga niet akkoord</button>
        </div></div>
      )}
    </div>
  )
}
