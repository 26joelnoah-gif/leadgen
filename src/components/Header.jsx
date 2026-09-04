import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Zap, Settings, LogOut, Phone, Menu, X, Sun, Moon, HelpCircle } from 'lucide-react'
import Logo from './Logo'
import AccountSettingsModal from './AccountSettingsModal'
import { useToolAccess } from '../hooks/useToolAccess'

export default function Header({ onOpenSettings }) {
  const { profile, signOut, sessionCallCount, toggleWorkingMode, isWorking } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // v35: "Mijn account" (o.a. eigen wachtwoord wijzigen) - overal beschikbaar
  // via het tandwiel, ongeacht of een pagina zelf nog onOpenSettings gebruikt.
  const [showAccount, setShowAccount] = useState(false)
  // v60: tab Tools alleen als er via een project tools aan je hangen (admin altijd)
  const { hasTools } = useToolAccess()

  const isAdmin = profile?.role === 'admin'
  const isManager = profile?.role === 'manager'
  const isRecruiter = profile?.role === 'recruiter'
  const isBackoffice = profile?.role === 'backoffice'
  // v52: planning-account = alleen roosters doorgeven, geen enkele andere pagina.
  const isPlanning = profile?.role === 'planning'

  // v36: recruiter krijgt een eigen, kleine nav - geen sales-dashboard/verdiensten
  // v51: admin kan de Verdiensten-tab per medewerker uitzetten
  // (profiles.can_view_earnings, default true).
  const canViewEarnings = profile?.can_view_earnings !== false
  const navLinks = isPlanning
    ? [{ path: '/roosters', label: 'Roosters' }]
    : isRecruiter
    ? [
        { path: '/recruitment', label: 'Sollicitanten' },
        // v57: agenda met ingeplande gesprekken (zelfde pagina, ?view=agenda)
        { path: '/recruitment?view=agenda', label: 'Agenda' },
        // v58: referral-overzicht (zelfde pagina, ?view=referrals)
        { path: '/recruitment?view=referrals', label: 'Referrals' },
        { path: '/tba', label: 'TBA\'s' },
        { path: '/roosters', label: 'Roosters' }
      ]
    : [
        { path: '/', label: 'Dashboard' },
        { path: '/tba', label: 'TBA\'s' },
        ...(canViewEarnings ? [{ path: '/earnings', label: 'Verdiensten' }] : []),
        { path: '/roosters', label: 'Roosters' },
        // v59: offerte-tool bestelplatform + overzicht eigen offertes
        // v60: alleen zichtbaar als een project van jou tools heeft (campaign_tools)
        ...(hasTools ? [{ path: '/tools', label: 'Tools' }] : []),
        ...(isManager ? [
          { path: '/manager', label: 'Mijn Projecten' },
          { path: '/admin/reports', label: 'Rapportage' }
        ] : []),
      ]

  // Beheer-links in volgorde van dagelijks gebruik
  const adminLinks = [
    { path: '/admin', label: 'Admin' },
    { path: '/admin/management', label: 'Lead Beheer' },
    { path: '/admin/reports', label: 'Rapportage' },
    { path: '/admin/payouts', label: 'Payouts' },
    { path: '/admin/telemetry', label: 'Telemetrie' },
    { path: '/kanban', label: 'Kanban' },
    { path: '/tools', label: 'Tools' },
    // v57: admin kan de sollicitanten + agenda van de recruiter(s) inzien
    { path: '/recruitment', label: 'Sollicitanten' },
  ]

  // Links met een query (bv. ?view=agenda) zijn alleen actief als die query
  // ook echt in de URL staat; de kale variant is dan juist niet actief.
  const isActive = (path) => {
    const [p, q] = path.split('?')
    if (location.pathname !== p) return false
    if (q) return location.search.includes(q)
    const sibling = [...navLinks, ...adminLinks].some(l => l.path.startsWith(`${p}?`) && location.search.includes(l.path.split('?')[1]))
    return !sibling
  }

  return (
    <header className="header">
      <div className="container header-content">
        <div className="header-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo size="medium" />
          
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '8px' }}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <nav className={`nav ${mobileMenuOpen ? 'mobile-open' : ''}`} style={{ marginLeft: '24px', flex: 1, display: 'flex', gap: '4px', minWidth: 0 }}>
          {navLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={isActive(link.path) ? 'active' : ''}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {isAdmin && <span className="nav-divider" aria-hidden="true" />}
          {isAdmin && adminLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={isActive(link.path) ? 'active' : ''}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {(profile?.role === 'employee' || isRecruiter || isBackoffice) && (
            <button
              onClick={toggleWorkingMode}
              className="btn btn-sm"
              style={{
                background: isWorking ? 'var(--warning-bg)' : 'var(--accent)',
                color: isWorking ? 'var(--warning)' : 'var(--text-on-accent)',
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600
              }}
            >
              <Phone size={14} /> {isWorking ? 'Stoppen' : 'Werk'}
            </button>
          )}

          {(profile?.role === 'employee' || isBackoffice) && (
            <div className="flex items-center gap-2" style={{ background: 'var(--bg-elevated)', padding: '6px 14px', borderRadius: '20px', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
              <Zap size={14} className="text-secondary" />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {sessionCallCount} <span style={{ opacity: 0.6, fontWeight: 400 }}>calls</span>
              </span>
            </div>
          )}

          <button
            onClick={toggleTheme}
            className="btn btn-sm btn-outline"
            style={{ padding: '8px', minWidth: 'auto' }}
            title={theme === 'dark' ? 'Lichte weergave' : 'Donkere weergave'}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button
            onClick={() => window.dispatchEvent(new Event('leadgen:open-tutorial'))}
            className="btn btn-sm btn-outline"
            style={{ padding: '8px', minWidth: 'auto' }}
            title="Uitleg / tutorial"
          >
            <HelpCircle size={16} />
          </button>

          <button
            onClick={() => (onOpenSettings ? onOpenSettings() : setShowAccount(true))}
            className="btn btn-sm btn-outline"
            style={{ padding: '8px', minWidth: 'auto' }}
            title="Mijn account"
          >
            <Settings size={16} />
          </button>

          <button onClick={signOut} className="btn btn-sm btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <LogOut size={16} /> <span className="hide-mobile">Uitloggen</span>
          </button>
        </div>
      </div>

      <AccountSettingsModal isOpen={showAccount} onClose={() => setShowAccount(false)} profile={profile} />
      <style>{`
        .nav { overflow-x: auto; scrollbar-width: none; }
        .nav::-webkit-scrollbar { display: none; }
        .nav a {
          color: var(--text-muted); text-decoration: none; transition: color 0.15s, background 0.15s;
          white-space: nowrap; font-size: 0.85rem; font-weight: 600;
          padding: 8px 12px; border-radius: 8px;
        }
        .nav a:hover { color: var(--text-primary); background: var(--bg-elevated); }
        .nav a.active { color: var(--accent) !important; background: var(--accent-soft); }
        .nav a.active::after { display: none; }
        .nav-divider { width: 1px; align-self: stretch; background: var(--border-strong); margin: 2px 4px; }
        .mobile-menu-btn { display: none !important; }
        @media (max-width: 900px) {
          .header-content { flex-direction: column; align-items: stretch; gap: 16px; padding: 12px 0; }
          .header-brand { width: 100%; }
          .mobile-menu-btn { display: block !important; }
          .nav { display: none !important; flex-direction: column; gap: 12px; margin-left: 0 !important; width: 100%; }
          .nav.mobile-open { display: flex !important; }
          .nav a.active::after { display: none; }
          .nav a { padding: 12px 16px; background: var(--bg-elevated); border-radius: 8px; width: 100%; text-align: center; }
          .nav-divider { display: none; }
          .hide-mobile { display: none; } 
          .header-actions { justify-content: space-between; overflow-x: auto; padding-bottom: 8px; }
        }
      `}</style>
    </header>
  )
}
