// ReachConnect v108 - "/" is voor bezoekers zonder account een kale pagina met
// twee tabbladen: Inloggen en Aanmelden. Verder niets: geen uitleg-blokken
// en geen nieuws meer (het nieuws staat nu op het dashboard van ingelogde
// medewerkers, zie components/NieuwsBlok.jsx).
// Wie al is ingelogd komt hier nooit: HomeRoute in App.jsx stuurt die door
// naar zijn eigen startscherm.
// De losse pagina's /login en /aanmelden blijven gewoon bestaan; dit scherm
// gebruikt precies dezelfde twee formulieren.
// Eigen licht thema, los van data-theme - een bezoeker is nog geen gebruiker.
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup-freelancer`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

const CSS = `
.hp{--bg:#F4F6F9;--surface:#FFFFFF;--line:#E1E5EC;--text:#14171F;--muted:#5B6270;--faint:#8A90A0;--accent:#2F6FE0;--accent-soft:#E7EEFC;--bad:#C6373C;--bad-soft:#FBE3E4;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.hp *{box-sizing:border-box}
.hp .wrap{max-width:440px;margin:0 auto;padding:56px 16px 80px}
.hp .brand{text-align:center;font-weight:900;font-size:22px;letter-spacing:-0.5px;margin:0 0 6px}
.hp .brand-sub{text-align:center;color:var(--muted);font-size:14px;margin:0 0 26px}
.hp .tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;background:#E9ECF2;border-radius:12px;padding:4px;margin-bottom:18px}
.hp .tabs button{font:inherit;font-size:14px;font-weight:700;padding:10px 8px;border:0;border-radius:9px;background:transparent;color:var(--muted);cursor:pointer}
.hp .tabs button[aria-selected=true]{background:#fff;color:var(--text);box-shadow:0 1px 2px rgba(20,23,31,.10)}
.hp .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px}
.hp h1{font-size:20px;line-height:1.3;margin:0 0 6px}
.hp .sub{color:var(--muted);font-size:14px;margin:0 0 18px;line-height:1.5}
.hp label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:14px 0 6px}
.hp .card form > label:first-child{margin-top:0}
.hp input[type=text],.hp input[type=email],.hp input[type=tel],.hp input[type=password]{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text)}
.hp input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
.hp .pw{position:relative}
.hp .pw input{padding-right:52px}
.hp .pw button{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:0;color:var(--muted);font:inherit;font-size:12px;font-weight:700;cursor:pointer;padding:6px 8px}
.hp .check{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-top:18px;background:var(--accent-soft);border-radius:10px;padding:12px 14px}
.hp .check input{width:20px;height:20px;margin-top:2px;flex:none}
.hp .err{background:var(--bad-soft);color:var(--bad);border-radius:10px;padding:10px 14px;font-size:14px;margin-top:14px}
.hp .btn{font:inherit;font-size:16px;font-weight:600;padding:14px 16px;border-radius:10px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer;width:100%;margin-top:18px}
.hp .btn:disabled{opacity:.5;cursor:not-allowed}
.hp .switch{text-align:center;margin-top:16px;font-size:13px;color:var(--muted)}
.hp .switch button{font:inherit;font-size:13px;font-weight:700;background:none;border:0;color:var(--accent);cursor:pointer;padding:0 2px;text-decoration:underline}
`

function Inloggen() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [toon, setToon] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Ongeldige e-mail of wachtwoord')
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h1>Inloggen</h1>
      <p className="sub">Log in met het e-mailadres en wachtwoord van je account.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="li-email">E-mailadres</label>
        <input id="li-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="jouw@email.nl" />

        <label htmlFor="li-pw">Wachtwoord</label>
        <div className="pw">
          <input id="li-pw" type={toon ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
          <button type="button" onClick={() => setToon(t => !t)}>{toon ? 'Verberg' : 'Toon'}</button>
        </div>

        {error && <div className="err">{error}</div>}

        <button type="submit" className="btn" disabled={loading}>
          {loading ? 'Bezig met inloggen...' : 'Inloggen'}
        </button>
      </form>
    </div>
  )
}

function AanmeldenForm() {
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', werkAkkoord: false })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(key, val) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.fullName.trim() || !form.email.trim() || !form.phone.trim() || !form.password) {
      setError('Vul alle velden in.'); return
    }
    if (form.password.length < 6) {
      setError('Je wachtwoord moet minimaal 6 tekens zijn.'); return
    }
    if (!form.werkAkkoord) {
      setError('Vink aan dat je als beller aan de slag wilt.'); return
    }
    setLoading(true)
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}`, apikey: ANON },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) throw new Error(data.error || 'Er ging iets mis. Probeer het opnieuw.')
      window.location.href = data.checkoutUrl
    } catch (err) {
      setError(err.message || 'Er ging iets mis. Probeer het opnieuw.')
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <h1>Aan de slag als beller</h1>
      <p className="sub">Maak hieronder je account aan. Voor €50 per maand (elke maand opzegbaar) wordt je account geactiveerd en kun je inloggen.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="am-name">Volledige naam</label>
        <input id="am-name" type="text" value={form.fullName} onChange={e => set('fullName', e.target.value)} autoComplete="name" />

        <label htmlFor="am-email">E-mailadres</label>
        <input id="am-email" type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" />

        <label htmlFor="am-phone">Telefoonnummer</label>
        <input id="am-phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" />

        <label htmlFor="am-pw">Wachtwoord</label>
        <input id="am-pw" type="password" value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" />

        <label className="check">
          <input type="checkbox" checked={form.werkAkkoord} onChange={e => set('werkAkkoord', e.target.checked)} />
          <span>Ik wil als medewerker (beller) aan de slag. Hier hoort €50 per maand bij, die ik zo via Mollie ga betalen. Elke maand weer opzegbaar.</span>
        </label>

        {error && <div className="err">{error}</div>}

        <button type="submit" className="btn" disabled={loading}>
          {loading ? 'Bezig...' : 'Doorgaan naar betaling (€50/maand)'}
        </button>
      </form>
    </div>
  )
}

export default function Home() {
  const startTab = new URLSearchParams(window.location.search).get('tab') === 'aanmelden' ? 'aanmelden' : 'inloggen'
  const [tab, setTab] = useState(startTab)

  return (
    <div className="hp">
      <style>{CSS}</style>
      <div className="wrap">
        <p className="brand">ReachConnect</p>
        <p className="brand-sub">Log in of meld je aan.</p>

        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'inloggen'} onClick={() => setTab('inloggen')}>Inloggen</button>
          <button type="button" role="tab" aria-selected={tab === 'aanmelden'} onClick={() => setTab('aanmelden')}>Aanmelden</button>
        </div>

        {tab === 'inloggen' ? <Inloggen /> : <AanmeldenForm />}

        {tab === 'inloggen' ? (
          <p className="switch">Nog geen account? <button type="button" onClick={() => setTab('aanmelden')}>Meld je aan</button></p>
        ) : (
          <p className="switch">Heb je al een account? <button type="button" onClick={() => setTab('inloggen')}>Log hier in</button></p>
        )}
      </div>
    </div>
  )
}
