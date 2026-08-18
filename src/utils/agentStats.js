import { STATUS_MAP } from './statusUtils'

// Afboektijd = de tijd tussen twee opeenvolgende afboekingen van dezelfde
// beller. Dat is de bruikbaarste maat voor tempo: hoe lang doet iemand over
// één lead, van opnemen tot wegzetten.
//
// Twee keuzes die het cijfer eerlijk houden:
//
// 1. Pauzes tellen niet mee. Een gat van drie uur is lunch of het einde van
//    de dag, geen gesprek. Alles boven de drempel valt buiten de meting.
// 2. We rapporteren de mediaan, niet het gemiddelde. Eén gesprek van veertig
//    minuten trekt een gemiddelde scheef; de mediaan laat zien wat een
//    normale lead kost.

export const PAUSE_THRESHOLD_MS = 30 * 60 * 1000  // 30 minuten
const DISPOSITION_ACTIONS = new Set(Object.keys(STATUS_MAP))

function median(values) {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2)
}

export function formatDuration(ms) {
  if (ms == null) return '—'
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`
  const h = Math.floor(m / 60)
  return `${h}u ${m % 60}m`
}

/**
 * Rekent per beller de afboektijd en conversie uit op basis van de
 * activiteiten in de gekozen periode.
 *
 * @param activities rijen uit public.activities, met user_id, action, created_at
 * @param users       profielen om namen bij de id's te zoeken
 */
export function computeAgentStats(activities, users = [], { pauseThresholdMs = PAUSE_THRESHOLD_MS } = {}) {
  const byUser = new Map()

  for (const a of activities || []) {
    if (!a.user_id || !a.created_at) continue
    if (!byUser.has(a.user_id)) byUser.set(a.user_id, [])
    byUser.get(a.user_id).push(a)
  }

  const rows = []

  for (const [userId, all] of byUser.entries()) {
    const dispositions = all
      .filter(a => DISPOSITION_ACTIONS.has(a.action))
      .sort((x, y) => new Date(x.created_at) - new Date(y.created_at))

    const gaps = []
    for (let i = 1; i < dispositions.length; i++) {
      const gap = new Date(dispositions[i].created_at) - new Date(dispositions[i - 1].created_at)
      if (gap > 0 && gap <= pauseThresholdMs) gaps.push(gap)
    }

    const count = (action) => dispositions.filter(a => a.action === action).length
    const calls = all.filter(a => a.action === 'call').length
    const appointments = count('afspraak_gemaakt')
    const deals = count('deal')
    const total = dispositions.length

    const profile = users.find(u => u.id === userId)

    rows.push({
      userId,
      name: profile?.full_name || profile?.email || 'Onbekend',
      calls,
      dispositions: total,
      appointments,
      deals,
      // Conversie = afspraken plus deals ten opzichte van alle afboekingen.
      conversion: total > 0 ? ((appointments + deals) / total) * 100 : 0,
      dealRate: total > 0 ? (deals / total) * 100 : 0,
      medianHandleMs: median(gaps),
      // Aantal metingen erbij, zodat je ziet of de mediaan iets voorstelt.
      samples: gaps.length,
      // Pauzes eruit gefilterd; dit is de tijd die daadwerkelijk aan het
      // bellen is besteed.
      activeMs: gaps.reduce((sum, g) => sum + g, 0),
    })
  }

  return rows.sort((a, b) => b.dispositions - a.dispositions)
}

export function computeTeamTotals(rows) {
  const dispositions = rows.reduce((s, r) => s + r.dispositions, 0)
  const appointments = rows.reduce((s, r) => s + r.appointments, 0)
  const deals = rows.reduce((s, r) => s + r.deals, 0)
  const allGapMedians = rows.map(r => r.medianHandleMs).filter(v => v != null)

  return {
    dispositions,
    appointments,
    deals,
    conversion: dispositions > 0 ? ((appointments + deals) / dispositions) * 100 : 0,
    medianHandleMs: median(allGapMedians),
    activeMs: rows.reduce((s, r) => s + r.activeMs, 0),
  }
}
