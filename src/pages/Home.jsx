// LEADGEN v90 — publieke homepage op "/". Geen login nodig: iedereen die
// de site bezoekt zonder account ziet deze pagina (wie al is ingelogd
// gaat via HomeRoute in App.jsx gewoon naar zijn eigen dashboard, dat
// verandert niet). Laat zien wat LeadGen is en toont het nieuwsoverzicht
// dat admins zelf bijhouden (Admin > Nieuws, tabel news_items).
// Eigen licht thema, los van data-theme — een bezoeker is nog geen
// ingelogde gebruiker. Zelfde aanpak als Aanmelden.jsx.
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const BEHEERDER_EMAIL = 'noah.ando1@icloud.com'

const CSS = `
.hp{--bg:#F4F6F9;--surface:#FFFFFF;--line:#E1E5EC;--text:#14171F;--muted:#5B6270;--faint:#8A90A0;--accent:#2F6FE0;--accent-soft:#E7EEFC;
  min-height:100vh;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;-webkit-font-smoothing:antialiased}
.hp *{box-sizing:border-box}
.hp .top{max-width:960px;margin:0 auto;padding:20px 16px;display:flex;align-items:center;justify-content:space-between}
.hp .logo{font-weight:900;font-size:18px;letter-spacing:-0.5px}
.hp .top a{color:var(--muted);text-decoration:none;font-size:14px;font-weight:600}
.hp .hero{max-width:960px;margin:0 auto;padding:40px 16px 24px;text-align:center}
.hp .hero h1{font-size:34px;line-height:1.2;margin:0 0 14px;letter-spacing:-0.5px}
.hp .hero p{color:var(--muted);font-size:17px;max-width:560px;margin:0 auto 28px;line-height:1.55}
.hp .cta-row{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.hp .btn{font:inherit;font-size:15px;font-weight:700;padding:13px 22px;border-radius:10px;border:1px solid var(--accent);cursor:pointer;text-decoration:none;display:inline-block}
.hp .btn-primary{background:var(--accent);color:#fff}
.hp .btn-outline{background:#fff;color:var(--accent)}
.hp .section{max-width:960px;margin:0 auto;padding:36px 16px}
.hp .section h2{font-size:20px;margin:0 0 18px}
.hp .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
.hp .card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px}
.hp .card h3{font-size:15px;margin:0 0 6px}
.hp .card p{color:var(--muted);font-size:14px;margin:0;line-height:1.5}
.hp .news-item{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:12px}
.hp .news-item h3{font-size:15px;margin:0 0 4px}
.hp .news-item time{color:var(--faint);font-size:12px;display:block;margin-bottom:8px}
.hp .news-item p{color:var(--text);font-size:14px;margin:0;line-height:1.6;white-space:pre-wrap}
.hp .empty{color:var(--faint);font-size:14px}
.hp footer{max-width:960px;margin:0 auto;padding:32px 16px 60px;color:var(--faint);font-size:13px;text-align:center;border-top:1px solid var(--line)}
.hp footer a{color:var(--accent);text-decoration:none;font-weight:600}
`

const FEATURES = [
  { title: 'Belscherm & wachtrij', text: 'Altijd de juiste lead klaar, met briefing en gespreksgeschiedenis erbij.' },
  { title: 'Rapportages & uitbetaling', text: 'Direct zicht op resultaten, afspraken en verdiensten.' },
  { title: 'Planning & roosters', text: 'Beschikbaarheid doorgeven en het teamrooster inzien.' },
  { title: 'Offertes op afstand tekenen', text: 'Klanten ontvangen een link en tekenen digitaal.' },
]

export default function Home() {
  const [news, setNews] = useState([])
  const [loadingNews, setLoadingNews] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function loadNews() {
      try {
        const { data, error } = await supabase
          .from('news_items')
          .select('id, title, body, created_at')
          .eq('is_published', true)
          .order('created_at', { ascending: false })
          .limit(20)
        if (!cancelled && !error) setNews(data || [])
      } finally {
        if (!cancelled) setLoadingNews(false)
      }
    }
    loadNews()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="hp">
      <style>{CSS}</style>

      <div className="top">
        <div className="logo">LeadGen</div>
        <Link to="/login">Inloggen</Link>
      </div>

      <div className="hero">
        <h1>Het platform achter ons salesteam</h1>
        <p>Leads bellen, opvolgen en omzetten in klanten - alles op één plek voor ons team en de bureaus waarmee we werken.</p>
        <div className="cta-row">
          <Link to="/login" className="btn btn-primary">Inloggen</Link>
          <Link to="/aanmelden" className="btn btn-outline">Aan de slag als beller</Link>
        </div>
      </div>

      <div className="section">
        <h2>Wat je met LeadGen kan</h2>
        <div className="grid">
          {FEATURES.map(f => (
            <div className="card" key={f.title}>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="section">
        <h2>Nieuws</h2>
        {loadingNews && <p className="empty">Laden...</p>}
        {!loadingNews && news.length === 0 && <p className="empty">Nog geen nieuwsberichten.</p>}
        {!loadingNews && news.map(item => (
          <div className="news-item" key={item.id}>
            <h3>{item.title}</h3>
            <time>{new Date(item.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
            <p>{item.body}</p>
          </div>
        ))}
      </div>

      <footer>
        Vragen? Mail de beheerder op <a href={`mailto:${BEHEERDER_EMAIL}`}>{BEHEERDER_EMAIL}</a>.
      </footer>
    </div>
  )
}
