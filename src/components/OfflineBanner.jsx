// Verbindingsbalk (betrouwbaarheid v71)
//
// Een beller die zijn wifi kwijtraakt merkte daar tot nu toe niets van: hij
// bleef gewoon doorklikken en afboeken, terwijl er niets meer werd opgeslagen.
// Deze balk maakt dat meteen zichtbaar, en meldt het ook weer als de
// verbinding terug is.
import { useEffect, useState } from 'react'
import { WifiOff, Wifi } from 'lucide-react'

export default function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [netTerug, setNetTerug] = useState(false)

  useEffect(() => {
    let timer
    const weerOnline = () => {
      setOnline(true)
      setNetTerug(true)
      clearTimeout(timer)
      timer = setTimeout(() => setNetTerug(false), 4000)
    }
    const offline = () => { setOnline(false); setNetTerug(false) }

    window.addEventListener('online', weerOnline)
    window.addEventListener('offline', offline)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', weerOnline)
      window.removeEventListener('offline', offline)
    }
  }, [])

  if (online && !netTerug) return null

  const kapot = !online

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 30000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
        padding: '9px 16px', fontSize: '0.86rem', fontWeight: 700,
        color: '#fff', background: kapot ? '#B91C1C' : '#047857',
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)'
      }}
    >
      {kapot ? <WifiOff size={16} /> : <Wifi size={16} />}
      <span style={{ textAlign: 'center' }}>
        {kapot
          ? 'Geen internetverbinding. Wacht met afboeken tot deze balk weg is, anders wordt het niet opgeslagen.'
          : 'Verbinding is terug. Je kunt weer verder.'}
      </span>
    </div>
  )
}
