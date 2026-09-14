// Vangnet tegen witte schermen (betrouwbaarheid v71)
//
// Zonder dit onderdeel haalt EEN fout in EEN component de hele app onderuit:
// React gooit de complete boom weg en de beller kijkt naar een leeg scherm,
// zonder uitleg en zonder knop. Dat is eerder gebeurd (Dashboard-crash v30-v32).
//
// Met deze grens blijft de schade beperkt tot het stuk dat stuk is, ziet de
// gebruiker wat er aan de hand is en kan hij zelf verder. De fout gaat
// automatisch naar het foutlogboek, zodat Noah het ziet zonder dat iemand belt.
import { Component } from 'react'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { logAppError } from '../lib/errorLog'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { fout: null, poging: 0 }
  }

  static getDerivedStateFromError(fout) {
    return { fout }
  }

  componentDidCatch(fout, info) {
    logAppError(`render:${this.props.naam || 'app'}`, fout, {
      componentStack: (info?.componentStack || '').slice(0, 1500),
      pad: typeof window !== 'undefined' ? window.location.pathname : null
    })
  }

  componentDidUpdate(vorigeProps) {
    // Bij een routewissel proberen we het vanzelf opnieuw: de gebruiker klikt
    // weg van de kapotte pagina en hoort niet vast te blijven zitten.
    if (this.state.fout && vorigeProps.resetKey !== this.props.resetKey) {
      this.setState({ fout: null })
    }
  }

  opnieuw = () => this.setState(s => ({ fout: null, poging: s.poging + 1 }))

  render() {
    if (!this.state.fout) return this.props.children

    if (this.props.variant === 'stil') return null

    const inline = this.props.variant === 'inline'

    return (
      <div style={{
        minHeight: inline ? 'auto' : '70vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '14px', padding: inline ? '24px 16px' : '40px 20px',
        textAlign: 'center', color: 'var(--text-primary, #fff)'
      }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444'
        }}>
          <AlertTriangle size={26} />
        </div>

        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: inline ? '1.05rem' : '1.3rem', fontWeight: 800 }}>
            Er ging hier iets mis
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary, #94A3B8)', fontSize: '0.92rem', maxWidth: '420px' }}>
            De rest van LeadGen werkt gewoon door. Probeer het opnieuw, dat lost
            het meestal op. Wij zien deze melding automatisch.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary btn-sm" onClick={this.opnieuw} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Probeer opnieuw
          </button>
          {!inline && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
                Pagina verversen
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { window.location.href = '/' }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Home size={14} /> Naar dashboard
              </button>
            </>
          )}
        </div>

        {this.state.poging >= 2 && (
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary, #94A3B8)' }}>
            Blijft het misgaan? Ververs de pagina, en meld het als het daarna nog steeds gebeurt.
          </p>
        )}

        {import.meta.env.DEV && (
          <pre style={{
            marginTop: '10px', maxWidth: '90vw', overflow: 'auto', textAlign: 'left',
            fontSize: '0.75rem', color: '#EF4444', background: 'rgba(0,0,0,0.3)',
            padding: '10px', borderRadius: '8px'
          }}>
            {String(this.state.fout?.stack || this.state.fout?.message || this.state.fout)}
          </pre>
        )}
      </div>
    )
  }
}
