// v110 (28-09-2026): "Mijn afspraken" - de beller ziet wat er gebeurd is met de
// afspraken die HIJ heeft ingepland, en wat hij ervoor krijgt.
//
// Basis is leads.appointment_by (gezet bij het inplannen, v110). De afspraak
// blijft dus van de beller, ook als de accountmanager de lead overneemt.
// De uitkomst komt van de accountmanager (appointment_outcome, v97), het bedrag
// zet een admin of manager per afspraak (appointment_commission).
// Admin/manager kan hier ook per medewerker kijken, zodat je weet wat je moet
// uitbetalen zonder ergens anders te rekenen.
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { CalendarCheck, Clock, Trophy, Euro, Filter, RefreshCw } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { sentimentInfo, afspraakStand, euro } from '../lib/appointments'
import Header from '../components/Header'
import PersonSelect from '../components/PersonSelect'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

const PERIODES = [
  { id: 'maand', label: 'Deze maand' },
  { id: 'vorige', label: 'Vorige maand' },
  { id: 'kwartaal', label: 'Laatste 3 maanden' },
  { id: 'alles', label: 'Alles' },
]

function periodeRange(id) {
  const nu = new Date()
  if (id === 'maand') {
    return { van: new Date(nu.getFullYear(), nu.getMonth(), 1), tot: null }
  }
  if (id === 'vorige') {
    return {
      van: new Date(nu.getFullYear(), nu.getMonth() - 1, 1),
      tot: new Date(nu.getFullYear(), nu.getMonth(), 1),
    }
  }
  if (id === 'kwartaal') {
    return { van: new Date(nu.getFullYear(), nu.getMonth() - 2, 1), tot: null }
  }
  return { van: null, tot: null }
}

function fmtMoment(iso) {
  if (!iso) return 'Geen datum'
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ' ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

export default function MijnAfspraken() {
  const { user, profile } = useAuth()
  const isBeheer = profile?.role === 'admin' || profile?.role === 'manager'

  const [periode, setPeriode] = useState('maand')
  const [wieId, setWieId] = useState(user?.id || '')
  const [mensen, setMensen] = useState([])
  const [afspraken, setAfspraken] = useState([])
  const [namen, setNamen] = useState({})
  const [laden, setLaden] = useState(true)
  const [fout, setFout] = useState(null)
  const [statusFilter, setStatusFilter] = useState('alles')

  useEffect(() => { if (user?.id && !wieId) setWieId(user.id) }, [user?.id])

  // Medewerkerkiezer voor admin/manager
  useEffect(() => {
    if (!isBeheer) return
    let weg = false
    supabase.from('profiles')
      .select('id, full_name, email, role')
      .is('deleted_at', null)
      .order('full_name')
      .then(({ data }) => { if (!weg) setMensen(data || []) })
    return () => { weg = true }
  }, [isBeheer])

  async function laad() {
    if (!user?.id) return
    setLaden(true)
    setFout(null)
    try {
      const { van, tot } = periodeRange(periode)
      let q = supabase
        .from('leads')
        .select(`
          id, name, contact_person, city, status, appointment_at,
          appointment_sentiment, appointment_outcome, appointment_outcome_at,
          appointment_commission, appointment_commission_at, appointment_by,
          assigned_to, lead_list_id,
          lead_lists!inner(name, campaigns!inner(name, appointment_scheduling_enabled))
        `)
        // Alleen echte afspraken-projecten: een sollicitatiegesprek van de
        // recruiter heeft ook een appointment_at, maar daar hoort geen
        // accountmanager en geen uitbetaling per afspraak bij.
        .eq('lead_lists.campaigns.appointment_scheduling_enabled', true)
        .not('appointment_at', 'is', null)
        .is('deleted_at', null)
        .order('appointment_at', { ascending: false })
        .limit(500)

      if (wieId === 'all') q = q.not('appointment_by', 'is', null)
      else q = q.eq('appointment_by', wieId || user.id)

      if (van) q = q.gte('appointment_at', van.toISOString())
      if (tot) q = q.lt('appointment_at', tot.toISOString())

      const { data, error } = await q
      if (error) throw error
      const rijen = data || []
      setAfspraken(rijen)

      // Namen van de accountmanagers (en bij "iedereen" ook van de bellers)
      const ids = [...new Set(rijen.flatMap(l => [l.assigned_to, l.appointment_by]).filter(Boolean))]
      if (ids.length) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        const map = {}
        ;(profs || []).forEach(p => { map[p.id] = p.full_name })
        setNamen(map)
      } else setNamen({})
    } catch (err) {
      setFout(err.message || 'Afspraken laden mislukt')
    } finally {
      setLaden(false)
    }
  }

  useEffect(() => { laad() }, [user?.id, wieId, periode])

  const metStand = useMemo(() => afspraken.map(l => ({ ...l, stand: afspraakStand(l) })), [afspraken])

  const totalen = useMemo(() => {
    const t = { aantal: metStand.length, wacht: 0, deals: 0, bedrag: 0, zonderBedrag: 0 }
    metStand.forEach(l => {
      if (l.stand.key === 'wacht') t.wacht++
      if (l.stand.deal) t.deals++
      if (l.appointment_commission != null) t.bedrag += Number(l.appointment_commission)
      else t.zonderBedrag++
    })
    t.bedrag = Math.round(t.bedrag * 100) / 100
    return t
  }, [metStand])

  const zichtbaar = useMemo(() => {
    if (statusFilter === 'alles') return metStand
    if (statusFilter === 'open') return metStand.filter(l => !l.stand.klaar)
    if (statusFilter === 'deal') return metStand.filter(l => l.stand.deal)
    if (statusFilter === 'geenbedrag') return metStand.filter(l => l.appointment_commission == null)
    return metStand
  }, [metStand, statusFilter])

  const kaarten = [
    { label: 'Afspraken', waarde: totalen.aantal, icon: <CalendarCheck size={18} />, kleur: '#3B82F6' },
    { label: 'Wacht op uitkomst', waarde: totalen.wacht, icon: <Clock size={18} />, kleur: '#F59E0B' },
    { label: 'Deal of betaald', waarde: totalen.deals, icon: <Trophy size={18} />, kleur: '#10B981' },
    { label: 'Uitbetaling', waarde: euro(totalen.bedrag) || '€ 0,00', icon: <Euro size={18} />, kleur: '#047857' },
  ]

  return (
    <>
      <Header />
      <main className="container pb-12" style={{ maxWidth: '1100px' }}>
        <div className="flex justify-between items-center mb-4 pt-4" style={{ flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="page-title flex items-center gap-2" style={{ margin: 0 }}>
              <CalendarCheck size={26} className="text-primary" /> Mijn afspraken
            </h1>
            <p className="page-subtitle text-xs" style={{ margin: '4px 0 0' }}>
              Wat is er gebeurd met de afspraken die jij hebt ingepland, en wat krijg je ervoor.
            </p>
          </div>
          <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
            {isBeheer && mensen.length > 0 && (
              <div className="flex items-center gap-2 bg-elevated px-3 py-1.5 rounded-lg border border-border">
                <Filter size={14} className="text-muted" />
                <PersonSelect
                  people={mensen}
                  value={wieId}
                  onChange={id => setWieId(id)}
                  extraOptions={[{ value: 'all', label: 'Iedereen' }]}
                  showRole
                  className="form-dark text-xs"
                  style={{ padding: '2px 6px', border: 'none', background: 'transparent', minWidth: 170 }}
                />
              </div>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={laad} disabled={laden}>
              <RefreshCw size={14} /> Verversen
            </button>
          </div>
        </div>

        {/* Periode */}
        <div className="flex gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
          {PERIODES.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriode(p.id)}
              className={periode === p.id ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Kaarten */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '18px' }}>
          {kaarten.map(k => (
            <div key={k.label} className="card" style={{ padding: '14px 16px' }}>
              <div className="flex items-center gap-2" style={{ color: k.kleur, fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                {k.icon} {k.label}
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 4 }}>{k.waarde}</div>
            </div>
          ))}
        </div>

        {totalen.zonderBedrag > 0 && (
          <div className="card" style={{ padding: '10px 14px', marginBottom: '14px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Bij {totalen.zonderBedrag} {totalen.zonderBedrag === 1 ? 'afspraak' : 'afspraken'} staat het bedrag nog niet vast. Dat zet de manager per afspraak, zodra duidelijk is wat de deal oplevert.
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
          {[
            { id: 'alles', label: `Alles (${metStand.length})` },
            { id: 'open', label: `Nog geen uitkomst (${metStand.filter(l => !l.stand.klaar).length})` },
            { id: 'deal', label: `Deal of betaald (${totalen.deals})` },
            { id: 'geenbedrag', label: `Zonder bedrag (${totalen.zonderBedrag})` },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={statusFilter === f.id ? 'btn btn-secondary btn-sm' : 'btn btn-ghost btn-sm'}
              style={{ fontSize: '0.78rem' }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {fout && (
          <div className="card" style={{ padding: '12px 14px', color: 'var(--error, #EF4444)', marginBottom: 12 }}>{fout}</div>
        )}

        {laden ? (
          <LoadingSpinner />
        ) : zichtbaar.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="Geen afspraken in deze periode"
            message="Zodra je een afspraak inplant, zie je hier wat de accountmanager ermee doet en wat je ervoor krijgt."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {zichtbaar.map((l, i) => {
              const sent = sentimentInfo(l.appointment_sentiment)
              const bedrag = euro(l.appointment_commission)
              const amNaam = namen[l.assigned_to] || 'Nog niemand'
              const bellerNaam = namen[l.appointment_by]
              return (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="card"
                  style={{ padding: '14px 16px', display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}
                >
                  <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem', overflowWrap: 'anywhere' }}>{l.name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      {fmtMoment(l.appointment_at)}
                      {l.city ? ` · ${l.city}` : ''}
                      {l.lead_lists?.campaigns?.name ? ` · ${l.lead_lists.campaigns.name}` : ''}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
                      Accountmanager: {amNaam}
                      {wieId === 'all' && bellerNaam ? ` · ingepland door ${bellerNaam}` : ''}
                      {l.appointment_outcome_at ? ` · afgeboekt ${new Date(l.appointment_outcome_at).toLocaleDateString('nl-NL')}` : ''}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {sent && (
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: 6, color: sent.color, background: `${sent.color}22` }}>
                        {sent.emoji} {sent.label}
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '4px 10px', borderRadius: 6, color: '#fff', background: l.stand.color }}>
                      {l.stand.label}
                    </span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: bedrag ? 'var(--text-primary)' : 'var(--text-muted)', minWidth: 90, textAlign: 'right' }}>
                      {bedrag || 'Nog niet vastgesteld'}
                    </span>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
