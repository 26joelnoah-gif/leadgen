import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import Setup from './pages/Setup'
import Dashboard from './pages/Dashboard'
import TBAs from './pages/TBAs'
import Earnings from './pages/Earnings'
import Admin from './pages/Admin'
import Reports from './pages/Reports'
import Kanban from './pages/Kanban'
import Telemetry from './pages/Telemetry'
import Payouts from './pages/Payouts'
import LeadManagement from './pages/LeadManagement'
import Manager from './pages/Manager'
import WorkInterface from './components/WorkInterface'

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
        Er staat een nieuwe versie van LeadGen klaar
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

function ProtectedRoute({ children, requireAdmin = false, allowManager = false }) {
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

function AppRoutes() {
  const { user } = useAuth()

  return (
    <>
      {user && <WorkInterface />}
      <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/setup" element={user ? <Setup /> : <Navigate to="/login" replace />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
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
        path="/manager"
        element={
          <ProtectedRoute requireAdmin allowManager>
            <Manager />
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
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}