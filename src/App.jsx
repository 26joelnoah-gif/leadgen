import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import OvereenkomstGate from './components/OvereenkomstGate' // v136
import Home from './pages/Home'
import { Privacy, Voorwaarden } from './pages/Juridisch'
import { useToolAccess } from './hooks/useToolAccess'
import WorkInterface from './components/WorkInterface'
import FollowUpReminders from './components/FollowUpReminders' // v130
import ErrorBoundary from './components/ErrorBoundary'
import OfflineBanner from './components/OfflineBanner'
import { OnderhoudScherm, OnderhoudBanner } from './components/Onderhoud' // v117
import { useOnderhoud } from './hooks/useOnderhoud' // v117
import FeatureAwareness from './components/FeatureAwareness'
import Chat from './components/Chat'

// v147: pagina's laden pas als je ze opent (was: alles in 1 bestand van 2 MB).
// Na een nieuwe deploy bestaat een oud paginabestand niet meer; dan herladen
// we de app 1 keer, zodat je de nieuwe versie krijgt in plaats van een fout.
const CHUNK_VLAG = 'reachconnect-chunk-herladen'
function laadPagina(importer) {
  return lazy(() => importer()
    .then(m => { try { sessionStorage.removeItem(CHUNK_VLAG) } catch { /* privemodus */ } return m })
    .catch(err => {
      let al = false
      try { al = sessionStorage.getItem(CHUNK_VLAG) === '1' } catch { /* privemodus */ }
      if (!al) {
        try { sessionStorage.setItem(CHUNK_VLAG, '1') } catch { /* privemodus */ }
        window.location.reload()
        return new Promise(() => {})
      }
      throw err
    }))
}
const Setup = laadPagina(() => import('./pages/Setup'))
const TBAs = laadPagina(() => import('./pages/TBAs'))
const Earnings = laadPagina(() => import('./pages/Earnings'))
const Admin = laadPagina(() => import('./pages/Admin'))
const Reports = laadPagina(() => import('./pages/Reports'))
const Kanban = laadPagina(() => import('./pages/Kanban'))
const Telemetry = laadPagina(() => import('./pages/Telemetry'))
const Foutlogboek = laadPagina(() => import('./pages/Foutlogboek'))
const Payouts = laadPagina(() => import('./pages/Payouts'))
const LeadManagement = laadPagina(() => import('./pages/LeadManagement'))
const Manager = laadPagina(() => import('./pages/Manager'))
const Recruitment = laadPagina(() => import('./pages/Recruitment'))
const Roosters = laadPagina(() => import('./pages/Roosters'))
const Tools = laadPagina(() => import('./pages/Tools'))
const LeadBoard = laadPagina(() => import('./pages/LeadBoard'))
const Outside = laadPagina(() => import('./pages/Outside'))
const Tekenen = laadPagina(() => import('./pages/Tekenen'))
const Agenda = laadPagina(() => import('./pages/Agenda'))
const MijnAfspraken = laadPagina(() => import('./pages/MijnAfspraken')) // v110
const Videocalls = laadPagina(() => import('./pages/Videocalls')) // v152
const Offertes = laadPagina(() => import('./pages/Offertes')) // v112
const Overeenkomsten = laadPagina(() => import('./pages/Overeenkomsten')) // v136
const VerklaringLink = laadPagina(() => import('./pages/VerklaringLink')) // v137
const Aanbrengen = laadPagina(() => import('./pages/Aanbrengen')) // v127
const Aanmelden = laadPagina(() => import('./pages/Aanmelden'))
const AanmeldenBedankt = laadPagina(() => import('./pages/AanmeldenBedankt'))
const AccountManagement = laadPagina(() => import('./pages/AccountManagement'))
const BriefingScript = laadPagina(() => import('./pages/BriefingScript'))

// v147: de meest gebruikte pagina's alvast stil inladen zodra de browser niets
// te doen heeft, zodat doorklikken direct gaat.
function laadAlvast() {
  const lijst = [
    () => import('./pages/LeadBoard'), () => import('./pages/Agenda'),
    () => import('./pages/MijnAfspraken'), () => import('./pages/Admin'),
    () => import('./pages/Recruitment'), () => import('./pages/Roosters'),
    () => import('./pages/Tools'), () => import('./pages/Reports'),
  ]
  const stap = () => {
    const volgende = lijst.shift()
    if (!volgende) return
    volgende().catch(() => {}).finally(() => plan(stap))
  }
  const plan = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 600))
  plan(stap)
}

// v147: korte laadmelding tussen pagina's; pas na 250 ms zichtbaar, anders flitst hij
function PaginaLaden() {
  const [zichtbaar, setZichtbaar] = useState(false)
  useEffect(() => { const t = setTimeout(() => setZichtbaar(true), 250); return () => clearTimeout(t) }, [])
  if (!zichtbaar) return null
  return (
    <div style={{ minHeight: '50vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="rc-laden" aria-label="Pagina laden" />
    </div>
  )
}

// v33: waarschuw open tabbladen zodra er een nieuwe versie live staat.
// Zonder dit draaien gebruikers dagenlang oude code omdat een webapp
// nieuwe code pas na een verversing laadt.
function UpdateChecker() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    let stopped = false
    async function check() {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!stopped && data?.build && data.build !== __BUILD_ID__) setUpdateReady(true)
      } catch { /* offline of dev-modus - stil houden */ }
    }
    check()
    const interval = setInterval(check, 3 * 60 * 1000) // elke 3 minuten
    const onFocus = () => check() // en meteen als je terugkomt naar het tabblad
    window.addEventListener('focus', onFocus)
    return () => { stopped = true; clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [])

  if (!updateReady) return null
  return (
    <div style={{
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 20000, display: 'flex', alignItems: 'center', gap: '14px',
      background: 'var(--bg-card, #1a1d27)', border: '1px solid var(--primary, #3B82F6)',
      borderRadius: '14px', padding: '12px 18px', boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
      maxWidth: 'calc(100vw - 32px)'
    }}>
      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary, #fff)' }}>
        Er staat een nieuwe versie van ReachConnect klaar
      </span>
      <button
        onClick={() => window.location.reload()}
        className="btn btn-primary btn-sm"
        style={{ whiteSpace: 'nowrap', fontWeight: 800 }}
      >
        Nu vernieuwen
      </button>
    </div>
  )
}

// v60: /tools alleen voor wie via een project tools heeft (campaign_tools) of admin is.
// Handmatig ingetypte URL zonder recht gaat terug naar het dashboard.
function ToolsGate({ children }) {
  const { toolKeys, loading } = useToolAccess()
  if (loading) return null
  if (toolKeys.length === 0) return <Navigate to="/" replace />
  return children
}

// v64: /outside alleen voor wie de tool 'outside' via een project heeft (admin altijd).
function OutsideGate({ children }) {
  const { toolKeys, loading } = useToolAccess()
  if (loading) return null
  if (!toolKeys.includes('outside')) return <Navigate to="/" replace />
  return children
}

// v140: Agenda en Mijn afspraken alleen voor admin, accountmanager of wie het
// vinkje "Agenda tonen" heeft (profiles.can_view_agenda). Anders naar het dashboard.
function AgendaGate({ children }) {
  const { profile } = useAuth()
  if (!profile) return children
  const mag = profile.role === 'admin' || profile.role === 'accountmanager' || profile.can_view_agenda === true
  return mag ? children : <Navigate to="/" replace />
}

// v152: videocalls (keuren + meeting-link) - zelfde als de agenda, plus managers
function VideocallsGate({ children }) {
  const { profile } = useAuth()
  if (!profile) return children
  const mag = ['admin', 'manager', 'accountmanager'].includes(profile.role) || profile.can_view_agenda === true
  return mag ? children : <Navigate to="/" replace />
}

function ProtectedRoute({ children, requireAdmin = false, allowManager = false, allowPlanning = false, allowExtern = false, allowAanbrenger = false }) {
  const { user, profile, loading, isDemoMode } = useAuth()

  if (loading) return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'var(--bg-dark)',
      color: 'var(--secondary)'
    }}>
      <div className="loading-spinner-box" style={{ 
        width: '40px', 
        height: '40px', 
        border: '3px solid rgba(245, 158, 11, 0.1)', 
        borderTopColor: 'var(--secondary)', 
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '16px'
      }} />
      <div style={{ fontWeight: 600, letterSpacing: '1px' }}>LADEN...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  // v52: een planning-account mag alleen de roosterpagina zien. Alles wat
  // hier binnenkomt zonder allowPlanning stuurt hem terug naar /roosters,
  // dus ook een handmatig ingetypte URL. De DB (migration v52) sluit
  // leads/lijsten/campagnes/chat voor deze rol apart af.
  if (profile?.role === 'planning' && !allowPlanning) {
    return <Navigate to="/roosters" replace />
  }
  // v77: extern (bv. installateur) ziet alleen Tools. De DB sluit leads,
  // lijsten en chat voor deze rol af via is_planning() (migration v77).
  if (profile?.role === 'extern' && !allowExtern) {
    return <Navigate to="/tools" replace />
  }
  // v127: aanbrenger (klant die andere klanten aanbrengt) ziet alleen /aanbrengen.
  // De DB sluit leads/lijsten/chat af via is_planning() (migration v127).
  if (profile?.role === 'aanbrenger' && !allowAanbrenger) {
    return <Navigate to="/aanbrengen" replace />
  }

  const roleOk = profile?.role === 'admin' || (allowManager && profile?.role === 'manager')

  if (requireAdmin && !roleOk) {
    return (
      <div className="access-denied">
        <h2>Geen toegang</h2>
        <p>Je hebt admin-rechten nodig om deze pagina te bekijken.</p>
      </div>
    )
  }

  return children
}

// v36: recruiters landen niet op het sales-dashboard maar meteen op hun
// eigen sollicitanten-scherm (zelfde route "/", geen aparte diepe link nodig).
// v94: accountmanagers landen direct op het leadbord
function HomeRoute() {
  const { profile, effectiveRole } = useAuth()
  const active = profile?.role === 'admin' ? (effectiveRole || 'admin') : profile?.role
  if (active === 'planning') return <Navigate to="/roosters" replace />
  if (active === 'extern') return <Navigate to="/tools" replace />
  if (active === 'aanbrenger') return <Navigate to="/aanbrengen" replace />
  if (active === 'recruiter') return <Navigate to="/recruitment" replace />
  if (active === 'accountmanager') return <Navigate to="/leads" replace />
  return <Dashboard />
}

function AppRoutes() {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  const { actief: onderhoud, loading: onderhoudLaadt } = useOnderhoud() // v117

  // v147: na inloggen de vaste pagina's alvast op de achtergrond laden
  useEffect(() => { if (user?.id) laadAlvast() }, [user?.id])

  // v117: onderhoudsmodus. Alleen een echte admin komt er dan nog in.
  // Bewust buiten de grens gehouden: de tekenpagina (klanten moeten hun
  // offerte kunnen blijven ondertekenen), de juridische pagina's en /login
  // (anders kan de admin zelf niet meer inloggen om het weer uit te zetten).
  const onderhoudVrijPad = ['/tekenen', '/verklaring/', '/privacy', '/voorwaarden', '/login']
    .some(p => location.pathname.startsWith(p))

  if (onderhoud && !onderhoudLaadt && !onderhoudVrijPad) {
    // Wachten tot het profiel binnen is, anders ziet een admin bij het laden
    // eerst even het onderhoudsscherm.
    if (user && loading) return null
    if (profile?.role !== 'admin') return <OnderhoudScherm />
  }

  return (
    <>
      {/* Het belscherm is een globale overlay. Zonder eigen grens zou een fout
          daarin ook het dashboard eronder meesleuren. */}
      {user && (
        <ErrorBoundary naam="belscherm" variant="inline">
          <WorkInterface />
        </ErrorBoundary>
      )}
      {/* Puur een hulppopup: gaat die stuk, dan merkt niemand er iets van. */}
      {user && (
        <ErrorBoundary naam="featureawareness" variant="stil">
          <FeatureAwareness />
        </ErrorBoundary>
      )}
      {/* v136: beller met een open verklaring moet eerst tekenen (ligt over alles heen) */}
      {user && !location.pathname.startsWith('/tekenen') && !location.pathname.startsWith('/verklaring/') && (
        <ErrorBoundary naam="verklaring" variant="stil">
          <OvereenkomstGate />
        </ErrorBoundary>
      )}
      {/* v85: teamchat is overal beschikbaar (was alleen op het dashboard),
          behalve op de publieke tekenpagina. Eigen grens: gaat de chat stuk,
          dan blijft de rest gewoon werken. */}
      {user && !location.pathname.startsWith('/tekenen') && !location.pathname.startsWith('/verklaring/') && !location.pathname.startsWith('/aanmelden') && (
        <ErrorBoundary naam="teamchat" variant="stil">
          <Chat />
        </ErrorBoundary>
      )}
      {/* v130: Te doen-paneel met opvolgingen/terugbelafspraken die nu aan de beurt zijn */}
      {user && (
        <ErrorBoundary naam="tedoen" variant="stil">
          <FollowUpReminders />
        </ErrorBoundary>
      )}
      {/* Per pagina een grens: crasht er een, dan blijft de rest bruikbaar en
          reset hij vanzelf zodra je naar een andere pagina navigeert. */}
      <ErrorBoundary naam={`pagina${location.pathname}`} resetKey={location.pathname}>
      <Suspense fallback={<PaginaLaden />}>
      {/* v147: zachte overgang tussen pagina's (alleen opacity, zie polish.css) */}
      <div key={location.pathname} className="rc-pagina">
      <Routes>
      {/* v65: publieke tekenpagina voor klanten, bewust buiten ProtectedRoute */}
      <Route path="/tekenen/:token" element={<Tekenen />} />
      {/* v137: publieke pagina om een verklaring te tekenen zonder account */}
      <Route path="/verklaring/:token" element={<VerklaringLink />} />
      {/* v88: publieke aanmeldpagina voor bellers die zelf een account willen, bewust buiten ProtectedRoute */}
      {/* Publiek: privacybeleid en voorwaarden. Nodig voor het Google-toestemmingsscherm. */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/voorwaarden" element={<Voorwaarden />} />
      <Route path="/aanmelden" element={<Aanmelden />} />
      <Route path="/aanmelden/bedankt" element={<AanmeldenBedankt />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/setup" element={user ? <Setup /> : <Navigate to="/login" replace />} />
      {/* v90/v108: "/" is voor wie nog niet is ingelogd een kale pagina met
          twee tabbladen: Inloggen en Aanmelden (dezelfde formulieren als
          /login en /aanmelden). Het nieuws staat sinds v108 op het dashboard.
          Wie al is ingelogd ziet hier gewoon zijn eigen startscherm. */}
      <Route
        path="/"
        element={
          user ? (
            <ProtectedRoute>
              <HomeRoute />
            </ProtectedRoute>
          ) : (
            <Home />
          )
        }
      />
      <Route
        path="/recruitment"
        element={
          <ProtectedRoute>
            <Recruitment />
          </ProtectedRoute>
        }
      />
      {/* v68: werkplek accountmanager (projectsoort accountmanagement); de pagina
          zelf stuurt terug naar / als je geen accountmanagement-lijst hebt */}
      <Route
        path="/accountmanagement"
        element={
          <ProtectedRoute>
            <AccountManagement />
          </ProtectedRoute>
        }
      />
      {/* v95: los tabblad met het belscript per project - open te zetten
          naast het belscherm, door bellers zelf te bewerken (RLS v95) */}
      <Route
        path="/briefing/:campaignId"
        element={
          <ProtectedRoute allowPlanning allowExtern>
            <BriefingScript />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tba"
        element={
          <ProtectedRoute>
            <TBAs />
          </ProtectedRoute>
        }
      />
      <Route
        path="/earnings"
        element={
          <ProtectedRoute>
            <Earnings />
          </ProtectedRoute>
        }
      />
      {/* v112: alle offertes met hun status (verstuurd, geopend, getekend) */}
      <Route
        path="/offertes"
        element={
          <ProtectedRoute>
            <Offertes />
          </ProtectedRoute>
        }
      />
      {/* v136: verklaringen zelfstandig appointment setter */}
      <Route
        path="/overeenkomsten"
        element={
          <ProtectedRoute>
            <Overeenkomsten />
          </ProtectedRoute>
        }
      />
      <Route
        path="/overeenkomsten/:id"
        element={
          <ProtectedRoute>
            <Overeenkomsten />
          </ProtectedRoute>
        }
      />
      {/* v110: eigen afspraken + wat ze opleveren */}
      <Route
        path="/mijn-afspraken"
        element={
          <ProtectedRoute>
            <AgendaGate><MijnAfspraken /></AgendaGate>
          </ProtectedRoute>
        }
      />
      {/* v127: klant brengt andere bedrijven aan */}
      <Route
        path="/aanbrengen"
        element={
          <ProtectedRoute allowAanbrenger>
            <Aanbrengen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <Admin />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/reports"
        element={
          <ProtectedRoute requireAdmin allowManager>
            <Reports />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/management"
        element={
          <ProtectedRoute requireAdmin>
            <LeadManagement />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/payouts"
        element={
          <ProtectedRoute requireAdmin>
            <Payouts />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/telemetry"
        element={
          <ProtectedRoute requireAdmin>
            <Telemetry />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/fouten"
        element={
          <ProtectedRoute requireAdmin>
            <Foutlogboek />
          </ProtectedRoute>
        }
      />
      <Route
        path="/manager"
        element={
          <ProtectedRoute requireAdmin allowManager>
            <Manager />
          </ProtectedRoute>
        }
      />
      <Route
        path="/roosters"
        element={
          <ProtectedRoute allowPlanning>
            <Roosters />
          </ProtectedRoute>
        }
      />
      <Route
        path="/tools"
        element={
          // v61: planning mag hier wel heen; ToolsGate checkt via my_tool_keys
          // of er echt tools aan zijn project hangen.
          <ProtectedRoute allowPlanning allowExtern>
            <ToolsGate>
              <Tools />
            </ToolsGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/outside"
        element={
          <ProtectedRoute>
            <OutsideGate>
              <Outside />
            </OutsideGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          // v62: gedeelde leadlijst - ook voor planning-accounts (DB laat
          // alleen leads door van projecten met planning_can_view_leads)
          <ProtectedRoute allowPlanning>
            <LeadBoard />
          </ProtectedRoute>
        }
      />
      {/* v152: overzicht van alle ingeplande videocalls */}
      <Route
        path="/videocalls"
        element={
          <ProtectedRoute>
            <VideocallsGate><Videocalls /></VideocallsGate>
          </ProtectedRoute>
        }
      />
      {/* v94: agenda voor afspraken en blokkades */}
      <Route
        path="/agenda"
        element={
          <ProtectedRoute>
            <AgendaGate><Agenda /></AgendaGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/kanban"
        element={
          <ProtectedRoute>
            <Kanban />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
      </div>
      </Suspense>
      </ErrorBoundary>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
            <UpdateChecker />
            <OfflineBanner />
            <OnderhoudBanner />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}