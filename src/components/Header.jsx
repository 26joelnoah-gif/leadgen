import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Zap, Settings, LogOut, Phone, Menu, X, Sun, Moon, HelpCircle } from 'lucide-react'
import Logo from './Logo'
import NotificationBell from './NotificationBell'
import AccountSettingsModal from './AccountSettingsModal'
import { useToolAccess } from '../hooks/useToolAccess'
import { useLeadBoardAccess } from '../hooks/useLeadBoardAccess'
import { useAccountManagementAccess } from '../hooks/useAccountManagement'
import { useLeadLists } from '../hooks/useLeadLists'
import { useToast } from './Toast'

export default function Header({ onOpenSettings }) {
  const { user, profile, signOut, sessionCallCount, toggleWorkingMode, startWorkingWithList, isWorking, effectiveRole, setEffectiveRole } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  // v87: de lijsten die deze medewerker mag bellen, om de knop "Werk" hieronder
  // altijd een lijst te laten kiezen voordat de belmodus opent.
  const { leadLists } = useLeadLists()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  // v35: "Mijn account" (o.a. eigen wachtwoord wijzigen) - overal beschikbaar
  // via het tandwiel, ongeacht of een pagina zelf nog onOpenSettings gebruikt.
  const [showAccount, setShowAccount] = useState(false)
  // v60: tab Tools alleen als er via een project tools aan je hangen (admin altijd)
  const { hasTools } = useToolAccess()
  // v62: tab Leads (gedeelde leadlijst) zodra je minimaal 1 bellijst kunt zien
  const { hasLeadBoard } = useLeadBoardAccess()
  // v68: tab Klanten zodra je in het team van een accountmanagement-project zit
  const { hasAccountManagement } = useAccountManagementAccess()

  const isRealAdmin = profile?.role === 'admin' || user?.email === 'noah.ando1@icloud.com' || profile?.email === 'noah.ando1@icloud.com'
  const activeRole = isRealAdmin ? (effectiveRole || 'admin') : (profile?.role || 'employee')

  const isAdmin = activeRole === 'admin'
  const isAccountmanager = activeRole === 'accountmanager'
  const isManager = activeRole === 'manager'
  const isRecruiter = activeRole === 'recruiter'
  const isBackoffice = activeRole === 'backoffice'
  const isPlanning = activeRole === 'planning'
  const isExtern = activeRole === 'extern'

  // v87: "Werk" opende voorheen de belmodus zonder ooit een lijst te kiezen
  // (toggleWorkingMode zet workingListId niet), waardoor WorkInterface nooit
  // een lead claimde en meteen "Wachtrij leeg" toonde - leek een lege lead.
  // Dashboard/Recruitment kiezen wel altijd eerst een lijst (startWorkingWithList);
  // deze knop doet dat nu ook, op dezelfde manier als die pagina's.
  function handleWerkClick() {
    if (isWorking) { toggleWorkingMode(); return }
    if (isRecruiter) {
      const recruitmentLists = leadLists.filter(l => l.campaigns?.type === 'recruitment')
      const homeList = recruitmentLists.find(l => l.assigned_to === profile?.id) || recruitmentLists[0]
      if (!homeList) { toast('Geen sollicitatieproject gekoppeld aan je account.', 'error'); return }
      startWorkingWithList(homeList.id)
      return
    }
    const belLists = leadLists.filter(l => l.campaigns?.type !== 'accountmanagement' && l.campaigns?.type !== 'recruitment')
    if (belLists.length === 0) { toast('Geen belproject gekoppeld aan je account.', 'error'); return }
    if (belLists.length === 1) { startWorkingWithList(belLists[0].id); return }
    // Meerdere projecten: net als op het Dashboard laten we daar kiezen
    // i.p.v. zelf te gokken welke lijst bedoeld is.
    navigate('/')
  }

  // v36: recruiter krijgt een eigen, kleine nav - geen sales-dashboard/verdiensten
  // v51: admin kan de Verdiensten-tab per medewerker uitzetten
  // (profiles.can_view_earnings, default true).
  const canViewEarnings = profile?.can_view_earnings !== false
  // v61: planning en recruiter krijgen ook de tab Tools als een project van
  // hen tools heeft (campaign_tools via hun team) - verder blijft hun nav klein.
  const navLinks = isExtern
    ? [{ path: '/tools', label: 'Tools' }]
    : isPlanning
    ? [
        { path: '/roosters', label: 'Roosters' },
        ...(hasLeadBoard ? [{ path: '/leads', label: 'Leads' }] : []),
        ...(hasTools ? [{ path: '/tools', label: 'Tools' }] : []),
      ]
    : isRecruiter
    ? [
        { path: '/recruitment', label: 'Sollicitanten' },
        // v57: agenda met ingeplande gesprekken (zelfde pagina, ?view=agenda)
        { path: '/recruitment?view=agenda', label: 'Agenda' },
        // v58: referral-overzicht (zelfde pagina, ?view=referrals)
        { path: '/recruitment?view=referrals', label: 'Referrals' },
        { path: '/tba', label: 'TBA\'s' },
        { path: '/roosters', label: 'Roosters' },
        ...(hasLeadBoard ? [{ path: '/leads', label: 'Leads' }] : []),
        ...(hasTools ? [{ path: '/tools', label: 'Tools' }] : []),
      ]
    : isAccountmanager
    ? [
        { path: '/leads', label: 'Leads' },
        { path: '/agenda', label: 'Agenda' },
        { path: '/tba', label: 'TBA\'s' },
        ...(isRealAdmin ? [{ path: '/recruitment', label: 'Sollicitanten' }] : []),
        { path: '/roosters', label: 'Roosters' },
        ...(hasTools ? [{ path: '/tools', label: 'Tools' }] : []),
      ]
    : [
        { path: '/', label: 'Dashboard' },
        ...(hasAccountManagement ? [{ path: '/accountmanagement', label: 'Klanten' }] : []),
        ...(hasLeadBoard ? [{ path: '/leads', label: 'Leads' }] : []),
        { path: '/agenda', label: 'Agenda' },
        { path: '/tba', label: 'TBA\'s' },
        ...(isRealAdmin ? [{ path: '/recruitment', label: 'Sollicitanten' }] : []),
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
  // v94: Sollicitanten vooraan geplaatst zodat het altijd direct zichtbaar is
  const adminLinks = [
    { path: '/admin', label: 'Admin' },
    { path: '/admin/management', label: 'Lead Beheer' },
    { path: '/recruitment', label: 'Sollicitanten' },
    { path: '/admin/reports', label: 'Rapportage' },
    { path: '/admin/payouts', label: 'Payouts' },
    { path: '/admin/telemetry', label: 'Telemetrie' },
    { path: '/admin/fouten', label: 'Foutlogboek' },
    { path: '/kanban', label: 'Kanban' },
    ...(hasTools ? [] : [{ path: '/tools', label: 'Tools' }]),
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
        <div className="header-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <Logo size="medium" />
          
          <button 
            className="mobile-menu-btn" 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '8px' }}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        <nav
          className={`nav ${mobileMenuOpen ? 'mobile-open' : ''}`}
          style={{
            marginLeft: '16px',
            flex: 1,
            display: 'flex',
            flexWrap: 'wrap',
            rowGap: '4px',
            gap: '3px',
            minWidth: 0
          }}
        >
          {navLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={isActive(link.path) ? 'active' : ''}
              style={{ padding: '6px 11px', fontSize: '0.84rem', whiteSpace: 'nowrap' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          {/* v94-fix: het Beheer-menu (Sollicitanten, Rapportage, etc.) blijft altijd
              zichtbaar voor de echte admin, ongeacht welke werkmodus (effectiveRole) actief
              is. Eerder stond dit op isAdmin (= activeRole === 'admin'), waardoor het hele
              menu verdween zodra admin naar Beller/Accountmanager schakelde - en dat bleef
              hangen in localStorage, dus ook na een herlaad of nieuwe sessie. */}
          {isRealAdmin && <span className="nav-divider" aria-hidden="true" />}
          {isRealAdmin && adminLinks.map(link => (
            <Link
              key={link.path}
              to={link.path}
              className={isActive(link.path) ? 'active' : ''}
              style={{ padding: '6px 11px', fontSize: '0.84rem', whiteSpace: 'nowrap' }}
              onClick={() => setMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}

        </nav>

        <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* v94: Admin Rol-Switcher Pill */}
          {isRealAdmin && (
            <div
              className="role-switcher-pill"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                background: 'var(--bg-elevated)',
                border: '1.5px solid var(--primary)',
                boxShadow: '0 0 12px rgba(59, 130, 246, 0.25)',
                borderRadius: '20px',
                padding: '2px 4px',
                flexShrink: 0
              }}
            >
              <button
                type="button"
                onClick={() => { setEffectiveRole('admin'); toast('Werkmodus: Admin', 'info') }}
                style={{
                  background: activeRole === 'admin' ? 'var(--secondary)' : 'transparent',
                  color: activeRole === 'admin' ? '#000' : 'var(--text-muted)',
                  fontWeight: activeRole === 'admin' ? 800 : 600,
                  fontSize: '0.72rem',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '4px 9px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Admin beheer-interface"
              >
                🛡️ Admin
              </button>
              <button
                type="button"
                onClick={() => { setEffectiveRole('employee'); toast('Werkmodus: Beller', 'info') }}
                style={{
                  background: activeRole === 'employee' ? 'var(--primary)' : 'transparent',
                  color: activeRole === 'employee' ? '#fff' : 'var(--text-muted)',
                  fontWeight: activeRole === 'employee' ? 800 : 600,
                  fontSize: '0.72rem',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '4px 9px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Beller interface (dialer, dashboard)"
              >
                📞 Beller
              </button>
              <button
                type="button"
                onClick={() => { setEffectiveRole('accountmanager'); toast('Werkmodus: Accountmanager', 'info') }}
                style={{
                  background: activeRole === 'accountmanager' ? '#8B5CF6' : 'transparent',
                  color: activeRole === 'accountmanager' ? '#fff' : 'var(--text-muted)',
                  fontWeight: activeRole === 'accountmanager' ? 800 : 600,
                  fontSize: '0.72rem',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '4px 9px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Accountmanager interface (leadbord & agenda)"
              >
                💼 AM
              </button>
            </div>
          )}

          {/* v75: meldingen, o.a. als een collega een lead van je overneemt */}
          <NotificationBell />
          {(activeRole === 'employee' || isRecruiter || isBackoffice) && (
            <button
              onClick={handleWerkClick}
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
