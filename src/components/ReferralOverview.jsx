import { useMemo, useState } from 'react'
import { Gift, Award, UserCheck, Link2, CheckCircle2, Users } from 'lucide-react'
import { getStatusDetails } from '../utils/statusUtils'
import { formatDate } from '../utils/dateUtils'
import EmptyState from './EmptyState'

// v58: referral-overzicht voor de recruiter. Een referral is een sollicitant
// met een verwijzer (leads.referred_by = medewerker die hem/haar aandroeg).
// Na aanname koppelt de recruiter de sollicitant aan zijn medewerkersaccount
// (leads.hired_profile_id); de gewerkte roosterdagen komen dan uit Roosters
// (public.availability, RPC referral_roster_days). Bij REFERRAL_BONUS_DAYS
// roosterdagen mag de bonus worden goedgekeurd - alleen recruiter/admin
// (trigger tr_guard_referral_bonus_approval bewaakt dat ook in de DB).
export const REFERRAL_BONUS_DAYS = 40

function profileName(profiles, id) {
  if (!id) return null
  const p = profiles.find(x => x.id === id)
  return p ? (p.full_name || p.email || 'Onbekend') : 'Onbekend account'
}

export default function ReferralOverview({
  applicants = [],
  profiles = [],
  rosterDays,            // Map<profileId, days>
  rosterLoading = false,
  canApprove = false,
  onLinkProfile,         // (lead, profileId|null) => Promise
  onApprove,             // (lead) => Promise
  onOpenLead             // (lead) => void
}) {
  const [busyId, setBusyId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [referrerFilter, setReferrerFilter] = useState('')

  const referrals = useMemo(
    () => applicants.filter(l => l.referred_by).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [applicants]
  )

  // Samenvatting per verwijzer: aangedragen / aangenomen / bonussen goedgekeurd
  const perReferrer = useMemo(() => {
    const m = new Map()
    referrals.forEach(l => {
      const cur = m.get(l.referred_by) || { id: l.referred_by, total: 0, hired: 0, approved: 0, pending: 0 }
      cur.total += 1
      if (l.status === 'deal') cur.hired += 1
      if (l.referral_bonus_approved_at) cur.approved += 1
      else if (l.status === 'deal' && (rosterDays?.get(l.hired_profile_id) || 0) >= REFERRAL_BONUS_DAYS) cur.pending += 1
      m.set(l.referred_by, cur)
    })
    return [...m.values()].sort((a, b) => b.total - a.total)
  }, [referrals, rosterDays])

  const rows = referrerFilter ? referrals.filter(l => l.referred_by === referrerFilter) : referrals

  const activeProfiles = useMemo(
    () => profiles.filter(p => p.is_active !== false).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')),
    [profiles]
  )

  async function run(id, fn) {
    setBusyId(id)
    try { await fn() } finally { setBusyId(null) }
  }

  if (referrals.length === 0) {
    return (
      <EmptyState
        icon={Gift}
        title="Nog geen referrals"
        message={`Geef bij een sollicitant een verwijzer op (veld "Aangedragen door") - dan verschijnt hij hier. Bij ${REFERRAL_BONUS_DAYS} gewerkte roosterdagen kun je de referralbonus goedkeuren.`}
      />
    )
  }

  return (
    <div>
      {/* Per verwijzer */}
      <div className="stats-grid mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {perReferrer.map(r => {
          const active = referrerFilter === r.id
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setReferrerFilter(active ? '' : r.id)}
              className="stat-card glass-panel"
              title={active ? 'Filter uitzetten' : 'Alleen referrals van deze verwijzer tonen'}
              style={{ padding: '14px 16px', textAlign: 'left', cursor: 'pointer', borderLeft: `4px solid ${active ? 'var(--primary)' : 'var(--secondary)'}`, outline: active ? '2px solid var(--primary)' : 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, fontSize: '0.95rem', marginBottom: '6px' }}>
                <Users size={15} /> {profileName(profiles, r.id)}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <span><strong style={{ color: 'var(--text)' }}>{r.total}</strong> aangedragen</span>
                <span><strong style={{ color: 'var(--success)' }}>{r.hired}</strong> aangenomen</span>
                <span><strong style={{ color: 'var(--primary)' }}>{r.approved}</strong> bonus</span>
                {r.pending > 0 && <span style={{ color: 'var(--warning)', fontWeight: 700 }}>{r.pending} klaar voor goedkeuring</span>}
              </div>
            </button>
          )
        })}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%', minWidth: '860px' }}>
          <thead>
            <tr>
              <th>Sollicitant</th>
              <th>Aangedragen door</th>
              <th>Status</th>
              <th>Medewerkersaccount</th>
              <th style={{ minWidth: '180px' }}>Roosterdagen</th>
              <th>Referralbonus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(lead => {
              const status = getStatusDetails(lead.status, true)
              const hired = lead.status === 'deal'
              const days = lead.hired_profile_id ? (rosterDays?.get(lead.hired_profile_id) || 0) : 0
              const pct = Math.min(100, Math.round((days / REFERRAL_BONUS_DAYS) * 100))
              const reached = days >= REFERRAL_BONUS_DAYS
              const approved = !!lead.referral_bonus_approved_at
              const busy = busyId === lead.id
              // Naam-suggestie: account met (bijna) dezelfde naam als de sollicitant
              const suggestion = !lead.hired_profile_id && hired
                ? activeProfiles.find(p => (p.full_name || '').trim().toLowerCase() === (lead.name || '').trim().toLowerCase())
                : null
              return (
                <tr key={lead.id}>
                  <td>
                    <strong
                      onClick={() => onOpenLead?.(lead)}
                      style={{ cursor: onOpenLead ? 'pointer' : 'default' }}
                      title="Sollicitant bewerken"
                    >
                      {lead.name}
                    </strong>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{lead.function || ''}{lead.function ? ' · ' : ''}toegevoegd {formatDate(lead.created_at)}</div>
                  </td>
                  <td>{profileName(profiles, lead.referred_by)}</td>
                  <td>
                    <span style={{ background: status.bg || 'var(--bg-elevated)', color: status.color, fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                      {status.label}
                    </span>
                  </td>
                  <td>
                    {hired ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select
                          value={lead.hired_profile_id || ''}
                          disabled={busy || approved}
                          onChange={e => run(lead.id, () => onLinkProfile(lead, e.target.value || null))}
                          style={{ padding: '6px 8px', fontSize: '0.85rem', maxWidth: '220px' }}
                          title={approved ? 'Bonus is al goedgekeurd; koppeling staat vast' : 'Koppel het medewerkersaccount van deze aangenomen sollicitant'}
                        >
                          <option value="">Nog niet gekoppeld...</option>
                          {activeProfiles.map(p => (
                            <option key={p.id} value={p.id}>{p.full_name || p.email}{p.role ? ` (${p.role})` : ''}</option>
                          ))}
                        </select>
                        {suggestion && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            disabled={busy}
                            onClick={() => run(lead.id, () => onLinkProfile(lead, suggestion.id))}
                            style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                          >
                            <Link2 size={12} /> Koppel aan "{suggestion.full_name}"
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pas na aanname</span>
                    )}
                  </td>
                  <td>
                    {hired && lead.hired_profile_id ? (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '4px' }}>
                          <span>{rosterLoading ? '...' : days} / {REFERRAL_BONUS_DAYS}</span>
                          {!rosterLoading && !reached && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>nog {REFERRAL_BONUS_DAYS - days}</span>}
                          {reached && <span style={{ color: 'var(--success)' }}>✓ bereikt</span>}
                        </div>
                        <div style={{ height: '8px', borderRadius: '999px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: reached ? 'var(--success)' : 'var(--primary)', transition: 'width .3s' }} />
                        </div>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{hired ? 'Koppel eerst een account' : '-'}</span>
                    )}
                  </td>
                  <td>
                    {approved ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--success)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={15} />
                        <span>
                          Goedgekeurd {formatDate(lead.referral_bonus_approved_at)}
                          <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>door {profileName(profiles, lead.referral_bonus_approved_by) || 'onbekend'}</div>
                        </span>
                      </div>
                    ) : !hired ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span>
                    ) : !canApprove ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{reached ? 'Wacht op goedkeuring' : 'Nog niet'}</span>
                    ) : confirmId === lead.id ? (
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => run(lead.id, async () => { await onApprove(lead); setConfirmId(null) })}>
                          <Award size={14} /> Ja, goedkeuren
                        </button>
                        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setConfirmId(null)}>Annuleren</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!reached || busy}
                        onClick={() => setConfirmId(lead.id)}
                        title={reached ? 'Referralbonus goedkeuren' : `Pas mogelijk bij ${REFERRAL_BONUS_DAYS} gewerkte roosterdagen`}
                        style={{ background: reached ? 'var(--primary)' : 'var(--bg-elevated)', color: reached ? 'var(--text-on-accent)' : 'var(--text-muted)', fontWeight: 700 }}
                      >
                        <UserCheck size={14} /> Bonus goedkeuren
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '12px' }}>
        Roosterdagen = dagen t/m vandaag waarop de medewerker in Roosters op "beschikbaar" stond. Klik op een verwijzer-kaart om te filteren.
      </p>
    </div>
  )
}
