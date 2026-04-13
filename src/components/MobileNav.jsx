import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export default function MobileNav({ profile }) {
  const [open, setOpen] = useState(false)

  const links = [
    { to: '/', label: 'Dashboard' },
    ...(profile?.role !== 'admin' ? [{ to: '/focus', label: 'Focus Mode' }] : []),
    { to: '/tba', label: 'TBA\'s' },
    { to: '/earnings', label: 'Verdiensten' },
    ...(profile?.role === 'admin' ? [
      { to: '/admin', label: 'Admin' },
      { to: '/admin/reports', label: 'Rapportage' }
    ] : [])
  ]

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="mobile-menu-btn"
        style={{
          display: 'none',
          background: 'transparent',
          border: 'none',
          color: 'white',
          padding: '8px',
          cursor: 'pointer'
        }}
      >
        {open ? <X size={24} /> : <Menu size={24} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mobile-nav-overlay"
            onClick={() => setOpen(false)}
          >
            <nav className="mobile-nav" onClick={e => e.stopPropagation()}>
              {links.map(link => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setOpen(false)}
                  className="mobile-nav-link"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: block !important; }
          .nav { display: none !important; }
        }
        .mobile-nav-overlay {
          position: fixed;
          top: 60px;
          left: 0;
          right: 0;
          background: var(--primary);
          padding: 16px;
          box-shadow: var(--shadow-lg);
          z-index: 999;
        }
        .mobile-nav {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .mobile-nav-link {
          color: white;
          padding: 14px 16px;
          border-radius: var(--radius-sm);
          text-decoration: none;
          font-weight: 500;
          transition: background 0.2s;
        }
        .mobile-nav-link:hover {
          background: rgba(255,255,255,0.1);
        }
      `}</style>
    </>
  )
}