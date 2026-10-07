// ReachConnect v65 — publieke ondertekenpagina /tekenen/:token.
// Geen login. Praat alleen met de Edge Function offerte-sign en rendert de
// offerte generiek vanuit de kolommen van public.offertes (regels, upsell,
// bedragen, akkoord_tekst). Kent geen pakketten of prijsmodel: dat hoort bij
// de offerte-tool van de tenant, niet bij het ondertekenen. Eigen licht thema,
// onafhankelijk van data-theme, want de klant is geen ReachConnect-gebruiker.
//
// v112: maandregels staan niet in de eenmalig-tabel, lege blokken vallen weg,
//       de notitie van de accountmanager komt als "Afspraken" op de offerte.
// v113: kleuren van het merk (organizations.accent_kleur), ondertekenen met een
//       akkoordknop plus bevestigingsstap wanneer offertes.handtekening_vereist
//       false is, looptijd per maandregel, en na ondertekenen een bevestiging
//       met de volledige offerte en een downloadknop (print naar pdf).
// v114: twee vinkjes (akkoord met de offerte + akkoord met elektronisch
//       ondertekenen) en een ondertekenbewijs met kenmerk, tijdstip, e-mail,
//       ip, browser en de hash van de offerte, ook zichtbaar in de pdf.
// v115: wie tekent. De klant vult ook de bedrijfsnaam in en verklaart dat hij
//       eigenaar of bevoegd is. Daarnaast een vrijwillig vinkje voor bellen en
//       mailen over andere diensten; dat vinkje is niet nodig om te tekenen.
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/offerte-sign`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const euro = (n) => '€ ' + Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const datum = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
const vandaag = () => new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
const tijd = (iso) => iso ? new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

// De looptijd komt als getal mee uit de offerte-tool (0 = maandelijks opzegbaar).
const looptijd = (r) => {
  if (r?.looptijd_label) return r.looptijd_label
  const v = Number(r?.looptijd || 0)
  if (!v) return 'Maandelijks opzegbaar'
  return `${v} maanden`
}

const CSS = `
.tk{--bg:#FAFAF7;--surface:#FFFFFF;--line:#E6E6E1;--text:#0B0B0C;--muted:#6B6B75;--faint:#9A9AA5;--accent:#15803D;--accent-ink:#FFFFFF;--accent-soft:#EFF6F1;--good:#1E8A5B;--good-soft:#E9F7EF;--bad:#C6373C;--bad-soft:#FBE3E4;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.tk *{box-sizing:border-box}
.tk .wrap{max-width:680px;margin:0 auto;padding:20px 16px 150px}
.tk header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0 16px}
.tk header .brand{font-weight:800;font-size:19px;letter-spacing:-0.02em}
.tk header img{max-height:40px}
.tk header .nr{font-size:13px;color:var(--muted);text-align:right;line-height:1.4}
.tk .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;margin-bottom:14px}
.tk h1{font-size:23px;line-height:1.25;margin:0 0 6px;letter-spacing:-0.02em}
.tk h2{font-size:13px;margin:0 0 10px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.06em}
.tk .muted{color:var(--muted);font-size:14px}
.tk .am{display:flex;align-items:center;gap:12px;background:var(--accent-soft);border-radius:12px;padding:12px 14px;margin-bottom:14px;font-size:14px}
.tk .am b{display:block}
.tk .am a{color:var(--text);text-decoration:underline;font-weight:600;margin-right:12px}
.tk table{width:100%;border-collapse:collapse;font-size:15px}
.tk td{padding:9px 0;border-top:1px solid var(--line);vertical-align:top}
.tk tr:first-child td{border-top:0}
.tk td.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.tk td.n{color:var(--muted);font-size:13px}
.tk .sub{display:block;color:var(--muted);font-size:13px;margin-top:2px}
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
.tk .check{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-top:14px;cursor:pointer}
.tk .check input{width:20px;height:20px;margin-top:2px;flex:none;accent-color:var(--accent)}
.tk .btn{font:inherit;font-size:15px;font-weight:600;padding:12px 18px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--text);cursor:pointer}
.tk .btn.sm{font-size:13px;padding:9px 14px}
.tk .btn.p{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);width:100%;padding:16px;font-size:17px}
.tk .btn:disabled{opacity:.45;cursor:not-allowed}
.tk .sticky{position:fixed;left:0;right:0;bottom:0;background:rgba(250,250,247,.93);backdrop-filter:blur(8px);border-top:1px solid var(--line);padding:12px 16px calc(12px + env(safe-area-inset-bottom))}
.tk .sticky .in{max-width:680px;margin:0 auto}
.tk .link{background:none;border:0;color:var(--muted);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;display:block;margin:10px auto 0}
.tk .state{text-align:center;padding:36px 20px}
.tk .state .ico{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:30px}
.tk .state.ok .ico{background:var(--good-soft);color:var(--good)}
.tk .state.bad .ico{background:var(--bad-soft);color:var(--bad)}
.tk .state.warn .ico{background:#FBEFD9;color:#C77A0A}
.tk .err{background:var(--bad-soft);color:var(--bad);border-radius:10px;padding:10px 12px;font-size:14px;margin-top:10px}
.tk details{margin-top:8px}
.tk summary{cursor:pointer;color:var(--text);font-size:14px;font-weight:600}
.tk ul{margin:8px 0 0;padding-left:18px;font-size:14px;color:var(--muted)}
.tk textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;min-height:80px;margin-top:8px}
.tk .bevestigd{background:var(--good-soft);border:1px solid var(--good);border-radius:14px;padding:18px;margin-bottom:14px}
.tk .bevestigd .kop{display:flex;gap:12px;align-items:center}
.tk .bevestigd .vink{width:40px;height:40px;border-radius:50%;background:var(--good);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;flex:none}
.tk .vw p{margin:0 0 8px;font-size:12px;color:var(--muted)}
/* bevestig-venster */
.tk-modal{position:fixed;inset:0;z-index:70;background:rgba(11,11,12,.5);display:flex;align-items:center;justify-content:center;padding:16px}
.tk-modal .box{background:#fff;border-radius:16px;max-width:420px;width:100%;padding:22px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#0B0B0C}
.tk-modal h3{font-size:19px;margin:0 0 8px}
.tk-modal .sum{background:#F4F4F0;border-radius:10px;padding:12px;margin:12px 0;font-size:14px}
.tk-modal .sum div{display:flex;justify-content:space-between;padding:3px 0}
.tk-modal .acties{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
@media print{
  .tk{background:#fff}
  .tk .sticky,.tk .am,.tk .geen-print,.tk-modal{display:none!important}
  .tk .wrap{max-width:none;padding:0}
  .tk .card,.tk .bevestigd{border:0;padding:0 0 14px;margin:0 0 14px;border-bottom:1px solid #ddd;break-inside:avoid}
}
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
    ctx.strokeStyle = '#0B0B0C'
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
  const [elektronisch, setElektronisch] = useState(false)
  const [bedrijf, setBedrijf] = useState('')
  const [bevoegd, setBevoegd] = useState(false)
  const [contactOptin, setContactOptin] = useState(false)
  const [hasInk, setHasInk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [afwijzen, setAfwijzen] = useState(false)
  const [bevestig, setBevestig] = useState(false)
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
        if (body?.offerte?.zaak_naam) setBedrijf(body.offerte.zaak_naam)
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
        setSubmitErr(
          body?.error === 'handtekening_ongeldig' ? 'De handtekening kon niet worden opgeslagen. Probeer het opnieuw.'
            : body?.error === 'akkoord_ontbreekt' ? 'Zet eerst het vinkje dat u akkoord gaat met de offerte.'
              : body?.error === 'elektronisch_ontbreekt' ? 'Zet ook het vinkje dat u elektronisch wilt ondertekenen.'
                : body?.error === 'bevoegd_ontbreekt' ? 'Zet ook het vinkje dat u bevoegd bent om namens het bedrijf te tekenen.'
                  : body?.error === 'bedrijfsnaam_ontbreekt' ? 'Vul de naam van het bedrijf in.'
              : 'Er ging iets mis. Probeer het opnieuw of bel ons.')
        return
      }
      setData({
        ...data, state: body.state, getekend_op: body.getekend_op, door: naam, functie, bedrijfsnaam: bedrijf,
        bewijs: {
          ...(data?.bewijs || {}), kenmerk: body.ondertekening_id || null, op: body.getekend_op,
          methode: 'op_afstand_knop', bevoegd: true, contact_optin: contactOptin,
        },
      })
      setBevestig(false)
      window.scrollTo({ top: 0 })
    } catch {
      setSubmitErr('Geen verbinding. Controleer uw internet en probeer het opnieuw.')
    } finally {
      setBusy(false)
    }
  }

  function tekenen() {
    const png = metHandtekening ? SignaturePad.getPng(padRoot.current) : undefined
    post({
      actie: 'tekenen', naam: naam.trim(), functie: functie.trim(), png, akkoord: true,
      elektronisch: metHandtekening ? true : elektronisch,
      bedrijfsnaam: bedrijf.trim(), bevoegd, contact_optin: contactOptin,
    })
  }

  const org = data?.org || {}
  const am = data?.am || {}
  // Kleuren van het merk. Zonder ingesteld merk blijft het de standaardkleur.
  const merkStijl = {
    ...(org.accent_kleur ? { '--accent': org.accent_kleur } : {}),
    ...(org.accent_tekst_kleur ? { '--accent-ink': org.accent_tekst_kleur } : {}),
  }

  const Header = () => (
    <header>
      {org.logo_url ? <img src={org.logo_url} alt={org.naam || ''} /> : <div className="brand">{org.naam || 'Offerte'}</div>}
      {data?.nummer || data?.offerte?.nummer ? (
        <div className="nr">Offerte {data?.nummer || data?.offerte?.nummer}{data?.offerte?.geldig_tot && data?.state !== 'getekend' ? <><br />geldig tot {datum(data.offerte.geldig_tot)}</> : null}</div>
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
    <div className="tk" style={merkStijl}><style>{CSS}</style><div className="wrap">
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
  if (data.state === 'verlopen') return <State kind="warn" icon="⌛" title="Deze offerte is verlopen" text="De geldigheid van deze offerte is voorbij. Neem contact met ons op voor een nieuwe versie." />
  if (data.state === 'afgewezen') return <State kind="bad" icon="×" title="Offerte afgewezen" text="U heeft aangegeven niet akkoord te gaan met deze offerte. Wij nemen contact met u op." />
  if (data.state === 'geannuleerd') return <State kind="bad" icon="×" title="Deze offerte is ingetrokken" text="Deze offerte is door ons ingetrokken. Neem contact met ons op voor een actuele versie." />

  const getekend = data.state === 'getekend'
  const o = data.offerte
  // Een oudere getekende offerte kan nog zonder inhoud terugkomen; dan tonen we
  // alleen de bevestiging.
  if (getekend && !o) {
    return <State kind="ok" icon="✓" title="Ondertekend, bedankt" text={`Offerte ${data.nummer || ''} is op ${tijd(data.getekend_op)} ondertekend${data.door ? ` door ${data.door}` : ''}. U ontvangt een bevestiging per e-mail.`} />
  }

  const regels = Array.isArray(o.regels) ? o.regels : []
  const upsell = Array.isArray(o.upsell) ? o.upsell : []
  const spec = o.speclijst && typeof o.speclijst === 'object' ? Object.entries(o.speclijst).filter(([, v]) => v) : []
  const voorwaarden = Array.isArray(org.voorwaarden) ? org.voorwaarden : []
  const metHandtekening = o.handtekening_vereist !== false
  const bewijs = data.bewijs || {}
  const canSign = naam.trim().length >= 2 && bedrijf.trim().length >= 2 && gelezen && !busy
    && (metHandtekening ? hasInk : (elektronisch && bevoegd))

  const eenmaligeRegels = regels.filter((r) => r.type !== 'maand')
  const maandRegels = regels.filter((r) => Number(r.mnd) > 0)
  const toonEenmalig = eenmaligeRegels.length > 0 || Number(o.eenmalig_incl) > 0
  const toonMaand = maandRegels.length > 0 || upsell.length > 0 || Number(o.maandbedrag_ex) > 0

  return (
    <div className="tk" style={merkStijl}><style>{CSS}</style>
      <div className="wrap">
        <Header />

        {getekend ? (
          <div className="bevestigd">
            <div className="kop">
              <div className="vink">✓</div>
              <div>
                <h1 style={{ fontSize: 20, margin: 0 }}>Ondertekend, bedankt</h1>
                <div className="muted">
                  Offerte {data.nummer || o.nummer} is op {tijd(data.getekend_op)} ondertekend
                  {data.door ? ` door ${data.door}` : ''}{data.functie ? ` (${data.functie})` : ''}.
                </div>
              </div>
            </div>
            <p className="muted" style={{ marginBottom: 0 }}>
              U krijgt een bevestiging per e-mail. Deze pagina blijft bereikbaar via dezelfde link, zodat u de ondertekende offerte altijd kunt terugzien.
            </p>
            <div className="row geen-print" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn p" style={{ width: 'auto' }} onClick={() => window.print()}>Download offerte (pdf)</button>
            </div>
          </div>
        ) : (
          <div className="card">
            <h1>Offerte voor {o.zaak_naam}</h1>
            <div className="muted">
              {o.contact_naam && <div>T.a.v. {o.contact_naam}</div>}
              {o.adres && <div>{o.adres}</div>}
            </div>
            <div className="row geen-print" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="btn" style={{ width: 'auto' }} onClick={() => window.print()}>Download offerte (pdf)</button>
            </div>
          </div>
        )}

        <AmBlok />

        {toonEenmalig && (
          <div className="card">
            <h2>Eenmalig</h2>
            <table>
              <tbody>
                {eenmaligeRegels.map((r, i) => (
                  <tr key={i}>
                    <td>
                      {r.naam}{r.aantal > 1 ? <span className="muted"> × {r.aantal}</span> : null}
                      {r.sub ? <span className="sub">{r.sub}</span> : null}
                    </td>
                    <td className="r">{euro(r.totaal ?? (r.prijs * (r.aantal || 1)))}</td>
                  </tr>
                ))}
                {Number(o.korting) > 0 && (
                  <tr><td>Korting</td><td className="r">- {euro(o.korting)}</td></tr>
                )}
                <tr className="tot"><td>Subtotaal (excl. btw)</td><td className="r">{euro(o.eenmalig_ex)}</td></tr>
                <tr><td className="n">Btw</td><td className="r n">{euro(o.btw)}</td></tr>
                <tr className="tot big"><td>Totaal eenmalig (incl. btw)</td><td className="r">{euro(o.eenmalig_incl)}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {toonMaand && (
          <div className="card">
            <h2>Per maand</h2>
            <table>
              <tbody>
                {maandRegels.map((r, i) => (
                  <tr key={'m' + i}>
                    <td>
                      {r.naam}{r.aantal > 1 ? <span className="muted"> × {r.aantal}</span> : null}
                      <span className="sub">{looptijd(r)}{r.sub ? ` · ${r.sub}` : ''}</span>
                    </td>
                    <td className="r">{euro(r.mnd)}</td>
                  </tr>
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
        )}

        {o.notitie_klant && (
          <div className="card">
            <h2>Afspraken</h2>
            <div style={{ whiteSpace: 'pre-wrap' }}>{o.notitie_klant}</div>
          </div>
        )}

        <div className="card">
          <h2>Akkoordverklaring</h2>
          <div className="akkoord">{o.akkoord_tekst}</div>
          {voorwaarden.length > 0 && (
            <details>
              <summary>Voorwaarden ({voorwaarden.length})</summary>
              <div className="vw" style={{ marginTop: 8 }}>
                {voorwaarden.map((v, i) => (
                  <p key={i}><b>{i + 1}. {v.titel}.</b> {v.tekst}</p>
                ))}
              </div>
            </details>
          )}
        </div>

        {getekend ? (
          <div className="card">
            <h2>Bewijs van ondertekening</h2>
            <div className="muted" style={{ marginBottom: 10 }}>
              Elektronisch ondertekend door <b style={{ color: 'var(--text)' }}>{data.door || '—'}</b>{data.functie ? ` (${data.functie})` : ''} namens {data.bedrijfsnaam || o.zaak_naam} op {tijd(data.getekend_op)},
              na het lezen van de offerte en de akkoordverklaring, met de verklaring bevoegd te zijn en akkoord met elektronisch ondertekenen.
            </div>
            <table>
              <tbody>
                {bewijs.kenmerk && <tr><td className="n">Kenmerk</td><td className="r">{bewijs.kenmerk}</td></tr>}
                <tr><td className="n">Namens</td><td className="r">{data.bedrijfsnaam || o.zaak_naam}</td></tr>
                <tr><td className="n">Ondertekend op</td><td className="r">{tijd(data.getekend_op)}</td></tr>
                {bewijs.email && <tr><td className="n">Verstuurd naar</td><td className="r">{bewijs.email}</td></tr>}
                {bewijs.ip && <tr><td className="n">Ip-adres</td><td className="r">{bewijs.ip}</td></tr>}
                {bewijs.browser && <tr><td className="n">Browser</td><td className="r" style={{ whiteSpace: 'normal', wordBreak: 'break-all', textAlign: 'left' }}>{bewijs.browser}</td></tr>}
                {bewijs.document_hash && <tr><td className="n">Documentcode</td><td className="r" style={{ whiteSpace: 'normal', wordBreak: 'break-all', textAlign: 'left' }}>{bewijs.document_hash}</td></tr>}
                {bewijs.bevoegd && <tr><td className="n">Verklaring</td><td className="r">Eigenaar of bevoegd om te tekenen</td></tr>}
                <tr><td className="n">Bellen en mailen</td><td className="r">{bewijs.contact_optin ? 'Toestemming gegeven' : 'Geen toestemming gegeven'}</td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
              De documentcode hoort bij de inhoud van deze offerte op het moment van versturen. Wijzigt er iets aan de offerte, dan klopt die code niet meer.
            </p>
          </div>
        ) : !afwijzen ? (
          <div className="card" ref={padRoot}>
            <h2>Ondertekenen</h2>
            <label htmlFor="tk-naam">Uw naam</label>
            <input id="tk-naam" type="text" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voor- en achternaam" autoComplete="name" />
            <label htmlFor="tk-functie">Functie (optioneel)</label>
            <input id="tk-functie" type="text" value={functie} onChange={(e) => setFunctie(e.target.value)} placeholder="Bijv. eigenaar" />
            <label htmlFor="tk-bedrijf">Namens welk bedrijf</label>
            <input id="tk-bedrijf" type="text" value={bedrijf} onChange={(e) => setBedrijf(e.target.value)} placeholder="Naam van het bedrijf" autoComplete="organization" />
            <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>Datum: {vandaag()}</p>
            {metHandtekening && (
              <>
                <label>Handtekening</label>
                <SignaturePad disabled={busy} onChange={setHasInk} />
              </>
            )}
            <label className="check">
              <input type="checkbox" checked={gelezen} onChange={(e) => setGelezen(e.target.checked)} />
              <span>Ik heb de offerte en de akkoordverklaring gelezen en ga hiermee akkoord namens {bedrijf.trim() || o.zaak_naam}.</span>
            </label>
            {!metHandtekening && (
              <label className="check">
                <input type="checkbox" checked={bevoegd} onChange={(e) => setBevoegd(e.target.checked)} />
                <span>Ik ben eigenaar van {bedrijf.trim() || o.zaak_naam} of bevoegd om namens dit bedrijf te tekenen.</span>
              </label>
            )}
            {!metHandtekening && (
              <>
                <label className="check">
                  <input type="checkbox" checked={elektronisch} onChange={(e) => setElektronisch(e.target.checked)} />
                  <span>Ik wil deze overeenkomst elektronisch ondertekenen en ga ermee akkoord dat mijn naam, het tijdstip, mijn ip-adres en mijn browser worden vastgelegd als bewijs van ondertekening.</span>
                </label>
                <p className="muted" style={{ fontSize: 13, marginBottom: 0 }}>
                  Na het zetten van de vinkjes klikt u op Ondertekenen. U krijgt dan een bevestiging met een uniek kenmerk, die u kunt bewaren en downloaden.
                </p>
              </>
            )}
            <label className="check" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 14 }}>
              <input type="checkbox" checked={contactOptin} onChange={(e) => setContactOptin(e.target.checked)} />
              <span>
                {org.naam || 'Wij'} mag mij bellen en mailen over andere diensten, aanbiedingen en nieuws.
                <span className="muted"> Vrijwillig, u kunt ook zonder dit vinkje tekenen. Afmelden kan altijd.</span>
              </span>
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

        {(org.kvk || org.btw_nummer || org.adres) && (
          <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>
            {[org.naam, org.adres, org.kvk ? `KvK ${org.kvk}` : null, org.btw_nummer ? `Btw ${org.btw_nummer}` : null].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {!getekend && !afwijzen && (
        <div className="sticky"><div className="in">
          <button type="button" className="btn p" onClick={() => setBevestig(true)} disabled={!canSign}>{busy ? 'Bezig…' : 'Ondertekenen'}</button>
          <button type="button" className="link" onClick={() => setAfwijzen(true)} disabled={busy}>Ik ga niet akkoord</button>
        </div></div>
      )}

      {bevestig && (
        <div className="tk-modal" role="dialog" aria-modal="true">
          <div className="box">
            <h3>Weet u het zeker?</h3>
            <p style={{ margin: 0, color: '#6B6B75', fontSize: 14 }}>
              U ondertekent offerte {o.nummer} namens {bedrijf.trim() || o.zaak_naam} als {naam.trim()}{functie.trim() ? ` (${functie.trim()})` : ''}, op {vandaag()}.
            </p>
            <div className="sum">
              {Number(o.eenmalig_incl) > 0 && <div><span>Eenmalig incl. btw</span><b>{euro(o.eenmalig_incl)}</b></div>}
              {Number(o.maandbedrag_ex) > 0 && <div><span>Per maand excl. btw</span><b>{euro(o.maandbedrag_ex)}</b></div>}
              {maandRegels.map((r, i) => (
                <div key={i} style={{ color: '#6B6B75', fontSize: 12.5 }}><span>{r.naam}</span><span>{looptijd(r)}</span></div>
              ))}
            </div>
            <p style={{ margin: 0, color: '#6B6B75', fontSize: 12.5 }}>
              Na ondertekenen staat de offerte vast. U krijgt direct een bevestiging per e-mail.
            </p>
            {submitErr && <div className="err">{submitErr}</div>}
            <div className="acties">
              <button type="button" className="btn p" style={{ width: 'auto' }} onClick={tekenen} disabled={busy}>{busy ? 'Bezig…' : 'Ja, ondertekenen'}</button>
              <button type="button" className="btn" onClick={() => setBevestig(false)} disabled={busy}>Terug</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
