import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Info, Lock, Mail, ChevronRight, Eye, EyeOff, X, ArrowRight, Zap, Target, Briefcase } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Promo Modal State - check localStorage first
  const [showPromo, setShowPromo] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('leadgen_promo_dismissed') !== 'true'
    }
    return true
  })
  const [promoStep, setPromoStep] = useState(0)

  function dismissPromo() {
    setShowPromo(false)
    localStorage.setItem('leadgen_promo_dismissed', 'true')
  }
  
  const { signIn, isDemoMode } = useAuth()
  const navigate = useNavigate()

  const promos = [
    {
      title: "Join the Lead Generation.",
      subtitle: "De nieuwe standaard in sales automation.",
      icon: <Target size={40} className="text-secondary" />,
      button: "Volgende"
    },
    {
      title: "Remote werken met snelle betalingen?",
      subtitle: "Genoeg proposities en direct resultaat. Begin vandaag nog met je onboarding.",
      icon: <Briefcase size={40} className="text-secondary" />,
      button: "Start Onboarding"
    }
  ]

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Ongeldige email of wachtwoord')
    } finally {
      setLoading(false)
    }
  }

  function fillDemo(role) {
    if (role === 'admin') {
      setEmail('admin@demo.nl')
    } else {
      setEmail('employee@demo.nl')
    }
    setPassword('demo123')
  }

  const nextPromo = () => {
    if (promoStep < promos.length - 1) {
      setPromoStep(promoStep + 1)
    } else {
      dismissPromo()
    }
  }

  return (
    <div className="login-page">
      {/* Promotional Global Popup */}
      <AnimatePresence>
        {showPromo && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="promo-overlay"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(10px)',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px'
            }}
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              style={{
                width: '100%',
                maxWidth: '500px',
                background: 'var(--bg-dark)',
                border: '1px solid var(--secondary)',
                borderRadius: '24px',
                padding: '40px',
                position: 'relative',
                boxShadow: '0 0 50px rgba(212, 175, 55, 0.1)',
                textAlign: 'center'
              }}
            >
              <button 
                onClick={() => dismissPromo()}
                style={{ position: 'absolute', top: '20px', right: '20px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={24} />
              </button>

              <AnimatePresence mode="wait">
                <motion.div
                  key={promoStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
                    {promos[promoStep].icon}
                  </div>
                  <h2 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: '16px', color: 'white', lineHeight: 1.2 }}>
                    {promos[promoStep].title}
                  </h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginBottom: '32px', lineHeight: 1.6 }}>
                    {promos[promoStep].subtitle}
                  </p>
                </motion.div>
              </AnimatePresence>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '32px' }}>
                {promos.map((_, i) => (
                  <div 
                    key={i} 
                    style={{ 
                      width: '12px', 
                      height: '4px', 
                      borderRadius: '2px', 
                      background: i === promoStep ? 'var(--secondary)' : 'rgba(255,255,255,0.1)',
                      transition: 'all 0.3s'
                    }} 
                  />
                ))}
              </div>

              <button 
                onClick={nextPromo}
                className="btn btn-primary glow-hover"
                style={{ width: '100%', py: '15px', fontSize: '1.1rem', fontWeight: 700, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {promos[promoStep].button} <ArrowRight size={20} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="login-card glass-panel"
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        {/* Aesthetic background glow */}
        <div style={{ position: 'absolute', top: '-100px', right: '-100px', width: '200px', height: '200px', background: 'var(--secondary)', filter: 'blur(80px)', opacity: 0.1, pointerEvents: 'none' }} />
        
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1 style={{ fontSize: '3rem', fontWeight: 900, background: 'linear-gradient(135deg, var(--secondary) 0%, #FFF 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '8px', letterSpacing: '-0.05em' }}>
            LEADGEN
          </h1>
          <p style={{ color: 'var(--secondary)', fontSize: '1.2rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '4px' }}>SMILE & DIAL</p>
        </div>

        {isDemoMode && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            style={{
              background: 'rgba(212, 175, 55, 0.05)',
              border: '1px solid rgba(212, 175, 55, 0.2)',
              borderRadius: '12px',
              padding: '16px',
              marginBottom: '24px',
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--secondary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
              <Info size={16} /> DEMO MODUS ACTIEF
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5 }}>
              Gebruik de knoppen hieronder voor snelle toegang:
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
              <button type="button" onClick={() => fillDemo('employee')} className="btn btn-sm btn-outline" style={{ flex: 1, padding: '8px', fontSize: '0.75rem' }}>
                Employee
              </button>
              <button type="button" onClick={() => fillDemo('admin')} className="btn btn-sm btn-outline" style={{ flex: 1, padding: '8px', fontSize: '0.75rem' }}>
                Admin
              </button>
            </div>
          </motion.div>
        )}

        {error && (
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            className="login-error" 
            style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(211, 47, 47, 0.1)', color: 'var(--danger)', border: '1px solid rgba(211, 47, 47, 0.2)', borderRadius: '8px', padding: '12px', fontSize: '0.85rem' }}
          >
            <AlertCircle size={18} />
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} style={{ marginTop: '24px' }}>
          <div className="form-group" style={{ marginBottom: '20px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
              <Mail size={16} className="text-muted" /> Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="jouw@email.nl"
              className="form-control"
              style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '32px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
              <Lock size={16} className="text-muted" /> Wachtwoord
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="form-control"
                style={{ width: '100%', padding: '12px 16px', paddingRight: '48px', background: 'rgba(255,255,255,0.05)' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  padding: '4px'
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-block glow-hover" disabled={loading} style={{ width: '100%', height: '50px', fontSize: '1rem' }}>
            {loading ? 'Bezig met inloggen...' : 'Inloggen'}
            {!loading && <ChevronRight size={18} />}
          </button>
        </form>
      </motion.div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        .login-page {
          background: var(--bg-dark);
          background-image: radial-gradient(circle at 20% 20%, rgba(15, 76, 54, 0.4) 0%, transparent 40%),
                            radial-gradient(circle at 80% 80%, rgba(212, 175, 55, 0.1) 0%, transparent 40%);
        }
        .btn-block { width: 100%; display: flex; justify-content: center; }
      `}} />
    </div>
  )
}