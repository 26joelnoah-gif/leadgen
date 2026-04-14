import { motion } from 'framer-motion'
import { Phone, Check } from 'lucide-react'

export default function Logo({ size = 'medium', showSlogan = true, align = 'flex-start' }) {
  const iconSize = size === 'large' ? 40 : size === 'small' ? 24 : 32
  const fontSize = size === 'large' ? '2rem' : size === 'small' ? '1.2rem' : '1.6rem'

  return (
    <div className="logo-container" style={{ display: 'flex', flexDirection: 'column', alignItems: align }}>
      <motion.div 
        className="logo" 
        style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
      >
        <div style={{ 
          background: 'white', 
          color: 'black', 
          width: iconSize, 
          height: iconSize, 
          borderRadius: '0px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          border: '2px solid white'
        }}>
          <span style={{ fontWeight: 900, fontSize: iconSize * 0.55, fontFamily: 'monospace', letterSpacing: '-1px' }}>LG</span>
        </div>
        <span style={{ 
          color: 'white',
          fontWeight: 900,
          fontSize: fontSize,
          letterSpacing: '-1.5px',
          textTransform: 'uppercase'
        }}>
          LEADGEN
        </span>
      </motion.div>
      {showSlogan && (
        <span 
          style={{ 
            fontSize: size === 'small' ? '0.6rem' : '0.75rem', 
            color: '#9ca3af', 
            fontWeight: 700, 
            letterSpacing: '1px',
            textTransform: 'uppercase',
            marginLeft: iconSize + 10,
            marginTop: '4px',
            fontFamily: 'monospace'
          }}
        >
          SMILE & DIAL.
        </span>
      )}
    </div>
  )
}
