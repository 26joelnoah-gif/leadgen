// LEADGEN v88 — /aanmelden/bedankt?p=<profileId>. Mollie stuurt de aanmelder
// hierheen terug na de betaling. De webhook (mollie-webhook) is de echte
// bron van waarheid en kan een paar seconden achterlopen, dus deze pagina
// pollt check-signup-status een tijdje voordat hij "nog niet bevestigd"
// laat zien.
import { useEffect, useRef, useState } from 'react'

const STATUS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-signup-status`
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const BEHEERDER_EMAIL = 'noah.ando1@icloud.com'
const MAX_POLLS = 15
const POLL_MS = 3000

const CSS = `
.ab{--bg:#F4F6F9;--surface:#FFFFFF;--line:#E1E5EC;--text:#14171F;--muted:#5B6270;--accent:#2F6FE0;--good:#1E8A5B;--good-soft:#DDF3E8;--bad:#C6373C;--bad-soft:#FBE3E4;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5}
.ab *{box-sizing:border-box}
.ab .wrap{max-width:480px;margin:0 auto;padding:60px 16px 80px;text-align:center}
.ab .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:32px 24px}
.ab .ico{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:28px}
.ab .ico.ok{background:var(--good-soft);color:var(--good)}
.ab .ico.wait{background:#EFF1F5;color:var(--muted)}
.ab .ico.bad{background:var(--bad-soft);color:var(--bad)}
.ab h1{font-size:20px;margin:0 0 10px}
.ab p{color:var(--muted);font-size:15px;line-height:1.5;margin:0}
.ab .btn{display:inline-block;margin-top:20px;font:inherit;font-size:15px;font-weight:600;padding:12px 20px;border-radius:10px;background:var(--accent);color:#fff;text-decoration:none}
.ab a.plain{color:var(--accent);text-decoration:none;font-weight:600}
`

export default function AanmeldenBedankt() {
  const [state, setState] = useState('loading') // loading | paid | pending | notfound
  const pollsRef = useRef(0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const profileId = params.get('p')
    if (!profileId) { setState('notfound'); return }

    let stopped = false
    async function poll() {
      try {
        const res = await fetch(`${STATUS_URL}?p=${encodeURIComponent(profileId)}`, {
          headers: { Authorization: `Bearer ${ANON}`, apikey: ANON },
        })
        const data = await res.json().catch(() => ({}))
        if (stopped) return
        if (!res.ok || data.error) { setState('notfound'); return }
        if (data.activated) { setState('paid'); return }
        pollsRef.current += 1
        if (pollsRef.current >= MAX_POLLS) { setState('pending'); return }
        setTimeout(poll, POLL_MS)
      } catch {
        if (!stopped) setTimeout(poll, POLL_MS)
      }
    }
    poll()
    return () => { stopped = true }
  }, [])

  return (
    <div className="ab">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="card">
          {state === 'loading' && (<>
            <div className="ico wait">⏳</div>
            <h1>We controleren je betaling</h1>
            <p>Dit duurt meestal maar een paar seconden.</p>
          </>)}
          {state === 'paid' && (<>
            <div className="ico ok">✓</div>
            <h1>Bedankt, je account is geactiveerd</h1>
            <p>Je kunt nu inloggen met het e-mailadres en wachtwoord die je net hebt opgegeven.</p>
            <a className="btn" href="/login">Naar inloggen</a>
          </>)}
          {state === 'pending' && (<>
            <div className="ico wait">⏳</div>
            <h1>Nog niet bevestigd</h1>
            <p>De betaling is nog niet bevestigd. Dit kan soms een paar minuten duren. Probeer over een paar minuten in te loggen, of neem contact op met <a className="plain" href={`mailto:${BEHEERDER_EMAIL}`}>{BEHEERDER_EMAIL}</a> als het langer duurt.</p>
          </>)}
          {state === 'notfound' && (<>
            <div className="ico bad">!</div>
            <h1>We kunnen je aanmelding niet vinden</h1>
            <p>Neem contact op met <a className="plain" href={`mailto:${BEHEERDER_EMAIL}`}>{BEHEERDER_EMAIL}</a> als je net wel hebt betaald.</p>
          </>)}
        </div>
      </div>
    </div>
  )
}
