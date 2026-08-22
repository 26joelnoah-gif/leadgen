// Strak, zakelijk logo: LG-monogram met het woordmerk LEADGEN.
// Geen slogan, geen gradients - rustig en professioneel.
export default function Logo({ size = 'medium', showWordmark = true }) {
  const iconSize = size === 'large' ? 32 : size === 'small' ? 18 : 24
  const fontSize = size === 'large' ? '1.6rem' : size === 'small' ? '1rem' : '1.25rem'

  return (
    <div className="logo" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{
        background: 'var(--primary)',
        color: 'var(--text-on-accent)',
        width: iconSize + 12,
        height: iconSize + 12,
        borderRadius: '10px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}>
        <span style={{ fontWeight: 800, fontSize: iconSize * 0.62, letterSpacing: '0.5px' }}>LG</span>
      </div>
      {showWordmark && (
        <span style={{
          color: 'var(--text-primary)',
          fontWeight: 700,
          fontSize,
          letterSpacing: '0.02em'
        }}>
          LEADGEN
        </span>
      )}
    </div>
  )
}
