// v117: onderhoudsmodus - de software tijdelijk op slot met de melding
// "We zijn bezig met onderhoud".
//
// Drie dingen in één bestand, want ze horen bij elkaar:
//  - OnderhoudScherm: wat iedereen ziet die er niet in mag.
//  - OnderhoudBanner: herinnering voor de admin die wél doorwerkt.
//  - OnderhoudSchakelaar: de knop in Admin om het aan of uit te zetten.
import { useState } from 'react'
import { Wrench, Power, RefreshCw } from 'lucide-react'
import Logo from './Logo'
import { useOnderhoud, onderhoudZetten } from '../hooks/useOnderhoud'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'

/* ------------------------------------------------------------------ */
/* Het scherm dat iedereen zonder admin-rechten te zien krijgt.        */
/* ------------------------------------------------------------------ */
export function OnderhoudScherm() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '22px',
      padding: '24px',
      textAlign: 'center',
      background: 'var(--bg-dark)',
      color: 'var(--text-primary)'
    }}>
      <Logo size="large" />

      <div style={{
        width: '64px', height: '64px', borderRadius: '18px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-card, rgba(255,255,255,0.05))',
        border: '1px solid var(--border, rgba(255,255,255,0.1))'
      }}>
        <Wrench size={28} style={{ color: 'var(--secondary)' }} />
      </div>

      <h1 style={{ fontSize: '1.6rem', fontWeight: 800, margin: 0 }}>
        We zijn bezig met onderhoud
      </h1>
      <p className="text-muted" style={{ maxWidth: '420px', margin: 0, lineHeight: 1.6 }}>
        ReachConnect is even niet beschikbaar. Probeer het straks opnieuw.
      </p>

      <button className="btn btn-outline" onClick={() => window.location.reload()}>
        <RefreshCw size={16} /> Opnieuw proberen
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Pil onderin voor de admin: onderhoud staat aan, en snel weer uit.   */
/* ------------------------------------------------------------------ */
export function OnderhoudBanner() {
  const { profile } = useAuth()
  const { actief } = useOnderhoud()
  const toast = useToast()
  const [bezig, setBezig] = useState(false)

  if (!actief || profile?.role !== 'admin') return null

  async function uitzetten() {
    setBezig(true)
    try {
      await onderhoudZetten(false)
      toast('Onderhoud staat uit, iedereen kan weer inloggen', 'success')
    } catch (e) {
      toast(e.message || 'Uitzetten mislukt', 'error')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', bottom: '20px', left: '20px', zIndex: 19000,
      display: 'flex', alignItems: 'center', gap: '12px',
      background: 'var(--bg-card, #1a1d27)', border: '1px solid var(--secondary, #F59E0B)',
      borderRadius: '14px', padding: '10px 14px', boxShadow: '0 8px 30px rgba(0,0,0,0.45)',
      maxWidth: 'calc(100vw - 40px)'
    }}>
      <Wrench size={16} style={{ color: 'var(--secondary)', flexShrink: 0 }} />
      <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
        Onderhoud staat aan: alleen admins kunnen erin
      </span>
      <button className="btn btn-primary btn-sm" onClick={uitzetten} disabled={bezig} style={{ whiteSpace: 'nowrap' }}>
        {bezig ? '...' : 'Uitzetten'}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* De schakelaar in Admin.                                             */
/* ------------------------------------------------------------------ */
export function OnderhoudSchakelaar() {
  const { actief, loading } = useOnderhoud()
  const toast = useToast()
  const [bezig, setBezig] = useState(false)
  const [bevestig, setBevestig] = useState(false) // aanzetten vraagt twee klikken

  async function zet(nieuw) {
    setBezig(true)
    try {
      await onderhoudZetten(nieuw)
      setBevestig(false)
      toast(nieuw
        ? 'Onderhoud staat aan. Iedereen behalve admins ziet nu de melding.'
        : 'Onderhoud staat uit, iedereen kan weer inloggen.', 'success')
    } catch (e) {
      toast(e.message || 'Opslaan mislukt', 'error')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="glass-panel p-6 mb-6" style={{
      borderColor: actief ? 'var(--secondary)' : undefined
    }}>
      <div className="flex justify-between items-start" style={{ gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <h2 className="text-lg font-black mb-1 flex items-center gap-2">
            <Wrench size={18} style={{ color: 'var(--secondary)' }} /> Onderhoud
          </h2>
          <p className="text-muted text-sm" style={{ lineHeight: 1.6 }}>
            Zet je dit aan, dan ziet iedereen behalve een admin alleen nog de melding
            "We zijn bezig met onderhoud". Open tabbladen gaan binnen een minuut mee.
            De tekenpagina voor offertes blijft wel werken, zodat klanten kunnen blijven
            ondertekenen.
          </p>
          {!loading && (
            <p className="text-sm mt-3" style={{ fontWeight: 800, color: actief ? 'var(--secondary)' : 'var(--success)' }}>
              {actief ? 'Staat nu AAN' : 'Staat nu uit'}
            </p>
          )}
        </div>

        <div className="flex gap-2 shrink-0" style={{ flexWrap: 'wrap' }}>
          {actief ? (
            <button className="btn btn-primary" onClick={() => zet(false)} disabled={bezig || loading}>
              <Power size={16} /> Onderhoud uitzetten
            </button>
          ) : bevestig ? (
            <>
              <button className="btn btn-primary" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => zet(true)} disabled={bezig || loading}>
                {bezig ? 'Bezig...' : 'Ja, zet op slot'}
              </button>
              <button className="btn btn-outline" onClick={() => setBevestig(false)} disabled={bezig}>
                Annuleren
              </button>
            </>
          ) : (
            <button className="btn btn-outline" onClick={() => setBevestig(true)} disabled={loading}>
              <Wrench size={16} /> Onderhoud aanzetten
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
