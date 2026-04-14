import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Zap, Settings, LogOut } from 'lucide-react'
import Logo from './Logo'

export default function Header({ onOpenSettings }) {
  const { profile, signOut, sessionCallCount } = useAuth()
  const location = useLocation()

  const isAdmin = profile?.role === 'admin'

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/tba', label: 'TBA\'s' },
    { path: '/kanban', label: 'Kanban' },
    { path: '/earnings', label: 'Verdiensten' },
  ]

  const adminLinks = [
    { path: '/admin/telemetry', label: 'Telemetrie' },
    { path: '/admin', label: 'Admin' },
    { path: '/admin/reports', label: 'Rapportage' },
    { path: '/admin/payouts', label: 'Payouts' },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, zIndex: 100 }}>
      <div className="container header-content">
        <Logo size="medium" />
        <nav className="nav" style={{ marginLeft: '40px', flex: 1, display: 'flex', gap: '20px' }}>
          {navLinks.map(link => (
            <Link 
              key={link.path} 
              to={link.path} 
              className={isActive(link.path) ? 'active' : ''}
              style={{ fontSize: '0.9rem', fontWeight: isActive(link.path) ? 700 : 500 }}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && adminLinks.map(link => (
            <Link 
              key={link.path} 
              to={link.path} 
              className={isActive(link.path) ? 'active' : ''}
              style={{ fontSize: '0.9rem', fontWeight: isActive(link.path) ? 700 : 500 }}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        
        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.05)', padding: '6px 14px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Zap size={14} className="text-secondary" />
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'white' }}>
              {sessionCallCount} <span style={{ opacity: 0.6, fontWeight: 400 }}>calls</span>
            </span>
          </div>
          
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="btn btn-sm btn-outline" style={{ padding: '8px', minWidth: 'auto' }} title="Instellingen">
              <Settings size={16} />
            </button>
          )}
          
          <button onClick={signOut} className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LogOut size={16} /> <span className="hide-mobile">Uitloggen</span>
          </button>
        </div>
      </div>
      <style>{`
        .nav a { color: var(--text-muted); text-decoration: none; transition: all 0.2s; }
        .nav a:hover { color: white; }
        .nav a.active { color: var(--secondary) !important; position: relative; }
        .nav a.active::after { content: ''; position: absolute; bottom: -21px; left: 0; right: 0; height: 2px; background: var(--secondary); }
        @media (max-width: 900px) { .nav { display: none !important; } .hide-mobile { display: none; } }
      `}</style>
    </header>
  )
}
