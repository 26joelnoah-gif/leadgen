import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { DollarSign, Zap, Copy, CheckCircle, Phone, PhoneOff, Calendar } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLeads } from '../hooks/useLeads'
import { getSettings } from '../utils/settingsUtils'
import Logo from '../components/Logo'
import MobileNav from '../components/MobileNav'

export default function Earnings() {
  const { profile, signOut, sessionCallCount } = useAuth()
  const { leads } = useLeads()
  const [copied, setCopied] = useState(false)
  const [settings] = useState(getSettings)

  // Date range state - default to current month
  const now = new Date()
  const [startDate, setStartDate] = useState(() => {
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  })
  const [endDate, setEndDate] = useState(() => {
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  })

  // Filter leads by date range
  const { deals, appointments } = useMemo(() => {
    const start = new Date(startDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)

    const filteredDeals = leads.filter(l => {
      if (l.status !== 'deal') return false
      const created = new Date(l.created_at)
      return created >= start && created <= end
    })

    const filteredAppointments = leads.filter(l => {
      if (l.status !== 'afspraak_gemaakt') return false
      const created = new Date(l.created_at)
      return created >= start && created <= end
    })

    return { deals: filteredDeals, appointments: filteredAppointments }
  }, [leads, startDate, endDate])

  const showDeals = profile?.role === 'admin' || profile?.show_deals_in_earnings !== false
  const showAppointments = profile?.role === 'admin' || profile?.show_appointments_in_earnings !== false

  const dealAmount = showDeals ? deals.length * settings.dealValue : 0
  const appointmentAmount = showAppointments ? appointments.length * settings.appointmentValue : 0
  const totalAmount = dealAmount + appointmentAmount

  // Format period for display
  const startFormatted = new Date(startDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  const endFormatted = new Date(endDate).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' })
  const periodLabel = startFormatted === endFormatted ? startFormatted : `${startFormatted} - ${endFormatted}`

  const invoiceText = `${profile?.full_name || 'Medewerker'}\nPeriode: ${periodLabel}\n\nDeals: ${deals.length} x €${settings.dealValue} = €${dealAmount}\nAfspraken: ${appointments.length} x €${settings.appointmentValue} = €${appointmentAmount}\n\nTotaal te factureren: €${totalAmount}`

  function copyInvoice() {
    navigator.clipboard.writeText(invoiceText)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="earnings-page" style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <header className="header" style={{ background: 'var(--primary-dark)', borderBottom: '1px solid var(--border)' }}>
        <div className="container header-content">
          <Logo size="medium" />
          <nav className="nav" style={{ marginLeft: '40px', flex: 1 }}>
            <Link to="/">Dashboard</Link>
            <Link to="/tba">TBA's</Link>
            <Link to="/earnings" className="active">Verdiensten</Link>
            {profile?.role === 'admin' && <Link to="/admin/telemetry">Telemetrie</Link>}
            {profile?.role === 'admin' && <Link to="/admin">Admin</Link>}
            {profile?.role === 'admin' && <Link to="/admin/reports">Rapportage</Link>}
          </nav>
          <MobileNav profile={profile} />
          <div className="header-actions">
            <div className="flex items-center gap-2 mr-3" style={{ background: 'rgba(232, 185, 35, 0.15)', padding: '8px 16px', borderRadius: '20px', border: '1px solid var(--secondary)' }}>
              <Zap size={18} style={{ color: 'var(--secondary)' }} />
              <span style={{ fontSize: '1rem', fontWeight: 800, color: 'white' }}>{sessionCallCount}</span>
              <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>calls</span>
            </div>
            <button onClick={signOut} className="btn btn-sm btn-outline">Uitloggen</button>
          </div>
        </div>
      </header>

      <main className="container" style={{ paddingTop: '60px', paddingBottom: '60px' }}>
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-5"
        >
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
            Facturatie Overzicht
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
            {profile?.full_name || 'Medewerker'} - {periodLabel}
          </p>
          <div className="flex gap-2 justify-center mt-3" style={{ flexWrap: 'wrap' }}>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-muted" />
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'white',
                  fontSize: '0.85rem'
                }}
              />
              <span className="text-muted">tot</span>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg-elevated)',
                  color: 'white',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="card glass-panel"
          style={{ maxWidth: '500px', margin: '0 auto', textAlign: 'center', padding: '40px' }}
        >
          <div style={{ marginBottom: '32px' }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>TOTAAL TE FACTUREREN</p>
            <div style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--secondary)', lineHeight: 1 }}>
              €{totalAmount}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '32px' }}>
            <div style={{ background: 'var(--bg-elevated)', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--success)' }}>{deals.length}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>DEALS</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '4px' }}>€{dealAmount}</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: '20px', borderRadius: '12px' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--info)' }}>{appointments.length}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>AFSPRAKEN</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginTop: '4px' }}>€{appointmentAmount}</div>
            </div>
          </div>

          <button
            onClick={copyInvoice}
            className="btn btn-lg btn-block"
            style={{
              padding: '20px',
              borderRadius: '16px',
              fontSize: '1.1rem',
              fontWeight: 700,
              background: copied ? 'var(--success)' : 'var(--secondary)',
              color: 'var(--primary-dark)',
              border: 'none',
              gap: '12px'
            }}
          >
            {copied ? <CheckCircle size={24} /> : <Copy size={24} />}
            {copied ? 'GEKOPIEERD!' : 'KOPIEER VOOR FACTUUR'}
          </button>

          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '16px' }}>
            Plak dit in je factuur software
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="card glass-panel mt-4"
          style={{ maxWidth: '500px', margin: '0 auto', padding: '24px' }}
        >
          <pre style={{
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            color: 'var(--text-main)',
            whiteSpace: 'pre-wrap',
            margin: 0,
            lineHeight: 1.6
          }}>
{`${profile?.full_name || 'Medewerker'}
Periode: April 2026

Deals: ${deals.length} x €${settings.dealValue} = €${dealAmount}
Afspraken: ${appointments.length} x €${settings.appointmentValue} = €${appointmentAmount}

Totaal te factureren: €${totalAmount}`}
          </pre>
        </motion.div>
      </main>
    </div>
  )
}