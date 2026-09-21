// LEADGEN v88 — publieke aanmeldpagina /aanmelden. Geen login. Voor mensen
// die als beller (medewerker) willen werken: kaal account + eenmalige
// bijdrage van €50 via Mollie. Praat alleen met de Edge Function
// signup-freelancer (die het account + de Mollie-betaling aanmaakt) en
// stuurt daarna door naar Mollie's hosted checkout.
// Eigen licht thema, los van data-theme — de aanmelder is nog geen
// LeadGen-gebruiker. Zie AanmeldenBedankt.jsx voor de pagina na terugkomst
// van Mollie.
import { useState } from 'react'

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup-freelancer`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const BEHEERDER_EMAIL = 'noah.ando1@icloud.com'

const CSS = `
.am{--bg:#F4F6F9;--surface:#FFFFFF;--line:#E1E5EC;--text:#14171F;--muted:#5B6270;--faint:#8A90A0;--accent:#2F6FE0;--accent-soft:#E7EEFC;--bad:#C6373C;--bad-soft:#FBE3E4;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.am *{box-sizing:border-box}
.am .wrap{max-width:480px;margin:0 auto;padding:40px 16px 80px}
.am h1{font-size:24px;line-height:1.3;margin:0 0 8px}
.am .sub{color:var(--muted);font-size:15px;margin:0 0 24px;line-height:1.5}
.am .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:22px}
.am label{display:block;font-size:13px;font-weight:600;color:var(--muted);margin:14px 0 6px}
.am label:first-child{margin-top:0}
.am input[type=text],.am input[type=email],.am input[type=tel],.am input[type=password]{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text)}
.am input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
.am .check{display:flex;gap:10px;align-items:flex-start;font-size:14px;margin-top:18px;background:var(--accent-soft);border-radius:10px;padding:12px 14px}
.am .check input{width:20px;height:20px;margin-top:2px;flex:none}
.am .err{background:var(--bad-soft);color:var(--bad);border-radius:10px;padding:10px 14px;font-size:14px;margin-top:14px}
.am .btn{font:inherit;font-size:16px;font-weight:600;padding:14px 16px;border-radius:10px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer;width:100%;margin-top:18px}
.am .btn:disabled{opacity:.5;cursor:not-allowed}
.am .note{font-size:13px;color:var(--muted);margin-top:20px;line-height:1.5}
.am .note a{color:var(--accent);text-decoration:none;font-weight:600}
.am .login-link{text-align:center;margin-top:16px;font-size:13px}
.am .login-link a{color:var(--muted);text-decoration:underline}
`

export default function Aanmelden() {
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
    <div className="am">
      <style>{CSS}</style>
      <div className="wrap">
        <h1>Aan de slag als beller</h1>
        <p className="sub">Maak hieronder je account aan. Voor €50 per maand (elke maand opzegbaar) wordt je account geactiveerd en kun je inloggen.</p>
        <div className="card">
          <form onSubmit={handleSubmit}>
            <label htmlFor="fullName">Volledige naam</label>
            <input id="fullName" type="text" value={form.fullName} onChange={e => set('fullName', e.target.value)} autoComplete="name" />

            <label htmlFor="email">E-mailadres</label>
            <input id="email" type="email" value={form.email} onChange={e => set('email', e.target.value)} autoComplete="email" />

            <label htmlFor="phone">Telefoonnummer</label>
            <input id="phone" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} autoComplete="tel" />

            <label htmlFor="password">Wachtwoord</label>
            <input id="password" type="password" value={form.password} onChange={e => set('password', e.target.value)} autoComplete="new-password" />

            <label className="check">
              <input type="checkbox" checked={form.werkAkkoord} onChange={e => set('werkAkkoord', e.target.checked)} />
              <span>Ik wil als medewerker (beller) aan de slag. Hier hoort €50 per maand bij, die ik zo via Mollie ga betalen. Elke maand weer opzegbaar.</span>
            </label>

            {error && <div className="err">{error}</div>}

            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Bezig...' : 'Doorgaan naar betaling (€50/maand)'}
            </button>
          </form>
          <p className="note">
            Wil je zelf klanten of projecten op LeadGen aannemen (in plaats van bellen)? Dat regel je niet hier.
            Neem contact op met de beheerder via <a href={`mailto:${BEHEERDER_EMAIL}`}>{BEHEERDER_EMAIL}</a>.
          </p>
        </div>
        <p className="login-link"><a href="/login">Heb je al een account? Log hier in</a></p>
      </div>
    </div>
  )
}
