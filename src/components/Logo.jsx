import { motion } from 'framer-motion'
import { Phone, Check } from 'lucide-react'

export default function Logo({ size = 'medium', showSlogan = true }) {
  const iconSize = size === 'large' ? 32 : size === 'small' ? 18 : 24
  const fontSize = size === 'large' ? '1.8rem' : size === 'small' ? '1.1rem' : '1.4rem'

  return (
    <div className="logo-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <motion.div 
        className="logo" 
        style={{ fontSize, gap: '8px' }}
        whileHover={{ scale: 1.02 }}
      >
        <div style={{ 
          background: 'var(--secondary)', 
          color: 'var(--primary-dark)', 
          width: iconSize + 8, 
          height: iconSize + 8, 
          borderRadius: '8px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          boxShadow: 'var(--shadow-glow)'
        }}>
          <span style={{ fontWeight: 900, fontSize: iconSize * 0.7 }}>LG</span>
        </div>
        <span style={{ 
          background: 'linear-gradient(135deg, var(--secondary) 0%, #FFF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontWeight: 800
        }}>
          LEADGEN
        </span>
      </motion.div>
      {showSlogan && (
        <motion.span 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.8 }}
          style={{ 
            fontSize: size === 'small' ? '0.6rem' : '0.75rem', 
            color: 'var(--secondary)', 
            fontWeight: 600, 
            letterSpacing: '2px',
            textTransform: 'uppercase',
            marginLeft: '40px',
            marginTop: '-4px'
          }}
        >
          Smile & Dial
        </motion.span>
      )}
    </div>
  )
}
