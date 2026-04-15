import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import TBAs from './pages/TBAs'
import Earnings from './pages/Earnings'
import Admin from './pages/Admin'
import Reports from './pages/Reports'
import Kanban from './pages/Kanban'
import Telemetry from './pages/Telemetry'
import Payouts from './pages/Payouts'
import LeadManagement from './pages/LeadManagement'
import WorkInterface from './components/WorkInterface'

function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, profile, loading } = useAuth()

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

  if (requireAdmin && profile?.role !== 'admin') {
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
          <ProtectedRoute requireAdmin>
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
      <AuthProvider>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: '4px', background: 'var(--primary)', zIndex: 10001 }} />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}