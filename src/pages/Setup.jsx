import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrganization } from '../hooks/useOrganization'
import { useAuth } from '../context/AuthContext'

export default function Setup() {
  const { profile } = useAuth()
  const { createOrganization } = useOrganization()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    setError(null)

    try {
      await createOrganization(name.trim())
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-dark)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '48px',
        width: '100%',
        maxWidth: '480px',
      }}>
        {/* Logo / title */}
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{
            fontSize: '28px',
            fontWeight: 800,
            letterSpacing: '2px',
            color: 'var(--primary)',
            marginBottom: '8px',
          }}>
            LEADGEN
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
            Welkom{profile?.full_name ? `, ${profile.full_name}` : ''}! Stel je bedrijf in.
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              letterSpacing: '1px',
              color: 'var(--text-muted)',
              marginBottom: '8px',
              textTransform: 'uppercase',
            }}>
              Bedrijfsnaam
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Bijv. Acme Sales BV"
              autoFocus
              required
              style={{
                width: '100%',
                background: 'var(--bg-dark)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px 16px',
                color: 'var(--text-primary)',
                fontSize: '15px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--primary)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px',
              padding: '12px 16px',
              color: '#EF4444',
              fontSize: '13px',
              marginBottom: '20px',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !name.trim()}
            style={{
              width: '100%',
              background: loading || !name.trim() ? 'var(--bg-hover)' : 'var(--primary)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              padding: '14px',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '1px',
              cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s',
            }}
          >
            {loading ? 'AANMAKEN...' : 'START MET LEADGEN →'}
          </button>
        </form>

        <div style={{
          marginTop: '24px',
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--text-muted)',
          lineHeight: '1.6',
        }}>
          Je begint op het Free plan (5 gebruikers, 1.000 leads).<br />
          Upgraden kan altijd via Instellingen.
        </div>
      </div>
    </div>
  )
}
