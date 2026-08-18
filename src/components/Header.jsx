import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Zap, Settings, LogOut, Phone, Menu, X } from 'lucide-react'
import Logo from './Logo'

export default function Header({ onOpenSettings }) {
  const { profile, signOut, sessionCallCount, toggleWorkingMode, isWorking } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isAdmin = profile?.role === 'admin'

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/tba', label: "TBA's" },
    { path: '/earnings', label: 'Verdiensten' },
  ]

  const adminLinks = [
    { path: '/kanban', label: 'Kanban' },
    { path: '/admin/management', label: 'Lead Beheer' },
    { path: '/admin', label: 'Admin' },
    { path: '/admin/reports', label: 'Rapportage' },
    { path: '/admin/payouts', label: 'Payouts' },
    { path: '/admin/telemetry', label: 'Telemetrie' },
  ]

  const links = isAdmin ? [...navLinks, ...adminLinks] : navLinks
  const isActive = (path) => location.pathname === path

  // Menu sluiten bij navigatie, anders blijft het paneel op mobiel openstaan.
  useEffect(() => { setMobileMenuOpen(false) }, [location.pathname])

  // Achtergrond niet laten scrollen zolang het mobiele menu open is.
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileMenuOpen])

  return (
    <header className="app-header">
      <div className="container app-header__bar">
        <Link to="/" className="app-header__brand" aria-label="Naar dashboard">
          <Logo size="medium" />
        </Link>

        <nav className="app-header__nav" aria-label="Hoofdnavigatie">
          {links.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={isActive(link.path) ? 'is-active' : ''}
              aria-current={isActive(link.path) ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="app-header__actions">
          {!isAdmin && (
            <button
              onClick={toggleWorkingMode}
              className={`btn btn-sm ${isWorking ? 'btn-warning' : 'btn-primary'}`}
            >
              <Phone size={14} />
              <span className="hide-sm">{isWorking ? 'Stoppen' : 'Werk'}</span>
            </button>
          )}

          <div className="app-header__counter" title={`${sessionCallCount} gesprekken deze sessie`}>
            <Zap size={14} />
            <span>{sessionCallCount}</span>
            <span className="hide-sm app-header__counter-unit">calls</span>
          </div>

          {onOpenSettings && (
            <button onClick={onOpenSettings} className="btn btn-sm btn-icon btn-ghost" title="Instellingen" aria-label="Instellingen">
              <Settings size={16} />
            </button>
          )}

          <button onClick={signOut} className="btn btn-sm btn-ghost" title="Uitloggen">
            <LogOut size={16} />
            <span className="hide-md">Uitloggen</span>
          </button>

          <button
            className="btn btn-sm btn-icon btn-ghost app-header__toggle"
            onClick={() => setMobileMenuOpen(v => !v)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Menu sluiten' : 'Menu openen'}
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <>
          <div className="app-header__scrim" onClick={() => setMobileMenuOpen(false)} />
          <nav className="app-header__drawer" aria-label="Mobiele navigatie">
            {links.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={isActive(link.path) ? 'is-active' : ''}
                aria-current={isActive(link.path) ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </>
      )}
    </header>
  )
}
