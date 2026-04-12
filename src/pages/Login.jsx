import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, Info, Lock, Mail, ChevronRight } from 'lucide-react'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, isDemoMode } = useAuth()
  const navigate = useNavigate()

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

  return (
    <div className="login-page">
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
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className="form-control"
              style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)' }}
            />
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