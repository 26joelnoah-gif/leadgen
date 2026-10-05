import { useMemo, useState } from 'react'
import { Search, Shield, Check, X, UserCog } from 'lucide-react'
import { useToast } from './Toast'
import {
  FUNCTIES_UITDEELBAAR, FUNCTIES_AANPASBAAR, FUNCTIE_LABELS, wijzigFunctie
} from '../lib/accounts'

// v125: overzicht "Accounts" voor een recruiter (met het recht "Accounts
// aanmaken"): de planning-accounts die hij aanmaakte voor de rooster-app, en
// de andere accounts in de organisatie, met per account een keuze voor de
// functie (planning / beller / backoffice / accountmanager). Nooit manager,
// admin of recruiter - die accounts staan er wel, maar zijn niet aan te passen.
// Het echte opslaan loopt via RPC account_functie_wijzigen, die dit ook bewaakt.
export default function AccountFuncties({ profiles, me, onChanged }) {
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [alleenPlanning, setAlleenPlanning] = useState(true)
  // { [id]: gekozen rol } - pas na "Bevestig" gaat hij naar de database
  const [keuze, setKeuze] = useState({})
  const [bezig, setBezig] = useState(null)

  const rijen = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (profiles || [])
      .filter(p => p.id !== me?.id)
      .filter(p => p.is_active !== false)
      .filter(p => !alleenPlanning || p.role === 'planning')
      .filter(p => !q || (p.full_name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q))
      .sort((a, b) => {
        // planning-accounts bovenaan, dan op naam
        const pa = a.role === 'planning' ? 0 : 1
        const pb = b.role === 'planning' ? 0 : 1
        if (pa !== pb) return pa - pb
        return (a.full_name || '').localeCompare(b.full_name || '')
      })
  }, [profiles, me, search, alleenPlanning])

  const aantalPlanning = (profiles || []).filter(p => p.role === 'planning' && p.is_active !== false && p.id !== me?.id).length

  async function bevestig(p) {
    const rol = keuze[p.id]
    if (!rol || rol === p.role) return
    setBezig(p.id)
    try {
      await wijzigFunctie(p.id, rol)
      toast(`${p.full_name || p.email} is nu ${FUNCTIE_LABELS[rol] || rol}. De beheerder koppelt het account aan een project of team.`, 'success')
      setKeuze(k => { const n = { ...k }; delete n[p.id]; return n })
      onChanged && onChanged()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBezig(null)
    }
  }

  return (
    <div>
      <div className="card mb-3" style={{ padding: '12px 16px' }}>
        <div className="flex items-center justify-between" style={{ gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserCog size={18} /> Accounts een functie geven
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Een nieuw account is altijd <strong>Planning</strong> (alleen rooster). Begint iemand echt? Kies dan hier de functie: beller, backoffice of accountmanager.
            </p>
          </div>
          <div className="flex items-center" style={{ gap: '8px', flexWrap: 'wrap' }}>
            <label className="flex items-center" style={{ gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={alleenPlanning} onChange={e => setAlleenPlanning(e.target.checked)} />
              Alleen planning ({aantalPlanning})
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Zoek op naam of e-mail"
                style={{ paddingLeft: '28px', minWidth: '200px' }}
              />
            </div>
          </div>
        </div>
      </div>

      {rijen.length === 0 ? (
        <div className="card" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
          {alleenPlanning ? 'Geen planning-accounts gevonden. Maak er een aan met "Nieuw account".' : 'Geen accounts gevonden.'}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                <th style={{ padding: '10px 14px' }}>Naam</th>
                <th style={{ padding: '10px 14px' }}>E-mail</th>
                <th style={{ padding: '10px 14px' }}>Nu</th>
                <th style={{ padding: '10px 14px' }}>Functie</th>
                <th style={{ padding: '10px 14px' }}></th>
              </tr>
            </thead>
            <tbody>
              {rijen.map(p => {
                const aanpasbaar = FUNCTIES_AANPASBAAR.includes(p.role)
                const gekozen = keuze[p.id] ?? p.role
                const gewijzigd = aanpasbaar && gekozen !== p.role
                return (
                  <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{p.full_name || '(geen naam)'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.email}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px', background: 'var(--bg-elevated)', color: p.role === 'planning' ? 'var(--text-muted)' : 'var(--text)' }}>
                        {FUNCTIE_LABELS[p.role] || p.role}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      {aanpasbaar ? (
                        <select
                          value={gekozen}
                          onChange={e => setKeuze(k => ({ ...k, [p.id]: e.target.value }))}
                          disabled={bezig === p.id}
                          style={{ minWidth: '190px' }}
                        >
                          {/* huidige functie altijd kiesbaar, ook als hij (extern) niet uitdeelbaar is */}
                          {!FUNCTIES_UITDEELBAAR.includes(p.role) && (
                            <option value={p.role}>{FUNCTIE_LABELS[p.role] || p.role}</option>
                          )}
                          {FUNCTIES_UITDEELBAAR.map(r => (
                            <option key={r} value={r}>{FUNCTIE_LABELS[r]}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Shield size={13} /> Alleen de beheerder
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                      {gewijzigd && (
                        <span className="flex items-center" style={{ gap: '6px' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => bevestig(p)} disabled={bezig === p.id}>
                            <Check size={14} /> {bezig === p.id ? 'Bezig...' : 'Bevestig'}
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => setKeuze(k => { const n = { ...k }; delete n[p.id]; return n })} disabled={bezig === p.id} title="Annuleren">
                            <X size={14} />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
