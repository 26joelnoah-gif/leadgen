import { useMemo } from 'react'
import { Timer, TrendingUp, Info } from 'lucide-react'
import { computeAgentStats, computeTeamTotals, formatDuration } from '../utils/agentStats'

export default function AgentPerformance({ activities, users }) {
  const rows = useMemo(() => computeAgentStats(activities, users), [activities, users])
  const team = useMemo(() => computeTeamTotals(rows), [rows])

  if (rows.length === 0) {
    return (
      <div className="card">
        <div className="flex items-center gap-2 mb-2">
          <Timer size={18} style={{ color: 'var(--primary)' }} />
          <h3 className="text-xl font-bold">Tempo en conversie per beller</h3>
        </div>
        <p className="text-sm text-muted">
          Nog geen afboekingen in deze periode.
        </p>
      </div>
    )
  }

  // Snelste tempo als ijkpunt voor de balkjes.
  const fastest = Math.min(...rows.filter(r => r.medianHandleMs != null).map(r => r.medianHandleMs), Infinity)

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Timer size={18} style={{ color: 'var(--primary)' }} />
        <h3 className="text-xl font-bold">Tempo en conversie per beller</h3>
      </div>
      <p className="text-sm text-muted mb-4">
        Afboektijd is de mediane tijd tussen twee afboekingen. Pauzes langer dan
        een half uur tellen niet mee, en de mediaan wordt gebruikt zodat één lang
        gesprek het beeld niet vertekent.
      </p>

      <div className="table-scroll">
        <table className="table perf-table">
          <thead>
            <tr>
              <th>Beller</th>
              <th className="text-right">Afboekingen</th>
              <th>Afboektijd</th>
              <th className="text-right">Afspraken</th>
              <th className="text-right">Deals</th>
              <th className="text-right">Conversie</th>
              <th className="text-right">Actief</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.userId}>
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td className="text-right perf-num">{r.dispositions}</td>
                <td>
                  <div className="perf-time">
                    <span className="perf-time__value">{formatDuration(r.medianHandleMs)}</span>
                    {r.medianHandleMs != null && (
                      <span className="perf-bar" aria-hidden="true">
                        <span
                          className="perf-bar__fill"
                          style={{ width: `${Math.min(100, (fastest / r.medianHandleMs) * 100)}%` }}
                        />
                      </span>
                    )}
                    {r.samples < 3 && r.medianHandleMs != null && (
                      <span className="perf-hint" title={`Gebaseerd op ${r.samples} meting${r.samples === 1 ? '' : 'en'}`}>
                        <Info size={12} />
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-right perf-num">{r.appointments}</td>
                <td className="text-right perf-num">{r.deals}</td>
                <td className="text-right perf-num">
                  <span style={{ color: r.conversion >= team.conversion ? 'var(--success)' : 'var(--text-main)' }}>
                    {r.conversion.toFixed(0)}%
                  </span>
                </td>
                <td className="text-right perf-num text-muted">{formatDuration(r.activeMs)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ fontWeight: 700 }}>Team</td>
              <td className="text-right perf-num">{team.dispositions}</td>
              <td className="perf-num">{formatDuration(team.medianHandleMs)}</td>
              <td className="text-right perf-num">{team.appointments}</td>
              <td className="text-right perf-num">{team.deals}</td>
              <td className="text-right perf-num">{team.conversion.toFixed(0)}%</td>
              <td className="text-right perf-num">{formatDuration(team.activeMs)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex items-center gap-2 mt-3 text-sm text-muted">
        <TrendingUp size={14} />
        <span>
          Conversie telt afspraken en deals samen, gedeeld door het totaal aantal
          afboekingen.
        </span>
      </div>
    </div>
  )
}
