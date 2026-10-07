// ReachConnect v114 - Google Agenda koppelen vanuit de agendapagina.
//
// Wat de koppeling doet, in gewone taal:
//  - ReachConnect maakt in jouw Google-account een eigen agenda aan met de
//    naam "ReachConnect afspraken". Daar komen jouw afspraken in te staan.
//    ReachConnect kan alleen bij die ene agenda, nooit bij je privé-agenda.
//  - Andersom vraagt ReachConnect alleen op wanneer je bezet bent (dus geen
//    titels of details). Die tijd komt hier als blokkade in de agenda, zodat
//    bellers er geen afspraak overheen kunnen plannen.
//
// De tokens staan alleen in de database achter service_role; de browser
// leest zijn status via de RPC google_agenda_status_v2() (v134, met opnieuw_koppelen).
import { useState, useEffect, useCallback } from 'react'
import { Calendar, Link2, Unlink, RefreshCw, AlertTriangle, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useToast } from './Toast'

function geleden(iso) {
  if (!iso) return 'nog niet'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'net'
  if (min < 60) return `${min} min geleden`
  const uur = Math.round(min / 60)
  if (uur < 24) return `${uur} uur geleden`
  return `${Math.round(uur / 24)} dagen geleden`
}

export default function GoogleAgendaKoppeling({ onVeranderd }) {
  const toast = useToast()
  const [status, setStatus] = useState(null)   // null = nog niet geladen
  const [laden, setLaden] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [open, setOpen] = useState(false)
  const [bevestigLos, setBevestigLos] = useState(false)

  const haalStatus = useCallback(async () => {
    setLaden(true)
    try {
      const { data, error } = await supabase.rpc('google_agenda_status_v2')
      if (error) throw error
      const rij = Array.isArray(data) ? (data[0] || false) : (data || false)
      setStatus(rij)
      if (rij && rij.opnieuw_koppelen) setOpen(true) // verlopen: meteen de knop laten zien
    } catch (err) {
      console.error('google_agenda_status_v2', err)
      setStatus(false)
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { haalStatus() }, [haalStatus])

  // Terug van Google? Dan staat het resultaat in de adresbalk.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const uitkomst = params.get('google')
    if (!uitkomst) return
    if (uitkomst === 'gekoppeld') {
      toast('Google Agenda gekoppeld', 'success')
      setOpen(true)
      haalStatus()
      if (onVeranderd) onVeranderd()
    } else if (uitkomst === 'geannuleerd') {
      toast('Koppelen geannuleerd', 'info')
    } else {
      toast(params.get('melding') || 'Koppelen met Google is niet gelukt', 'error')
      setOpen(true)
    }
    params.delete('google')
    params.delete('melding')
    const rest = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (rest ? `?${rest}` : ''))
  }, [toast, haalStatus, onVeranderd])

  async function koppel() {
    setBezig(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-agenda-oauth', { body: { actie: 'start' } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      if (!data?.url) throw new Error('Geen koppel-link ontvangen')
      window.location.assign(data.url)
    } catch (err) {
      toast(err.message || 'Kon het koppelen niet starten', 'error')
      setBezig(false)
    }
  }

  async function ontkoppel() {
    if (!bevestigLos) {
      setBevestigLos(true)
      setTimeout(() => setBevestigLos(false), 4000)
      return
    }
    setBezig(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-agenda-oauth', { body: { actie: 'ontkoppelen' } })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      toast('Google Agenda ontkoppeld', 'success')
      setBevestigLos(false)
      await haalStatus()
      if (onVeranderd) onVeranderd()
    } catch (err) {
      toast(err.message || 'Kon niet ontkoppelen', 'error')
    } finally {
      setBezig(false)
    }
  }

  async function zetInstelling(veld, waarde) {
    setBezig(true)
    try {
      const { error } = await supabase.rpc('google_agenda_instellen', {
        p_push: veld === 'push' ? waarde : null,
        p_busy: veld === 'busy' ? waarde : null,
      })
      if (error) throw error
      await haalStatus()
      if (onVeranderd) onVeranderd()
    } catch (err) {
      toast(err.message || 'Kon de instelling niet opslaan', 'error')
    } finally {
      setBezig(false)
    }
  }

  const gekoppeld = !!status && !!status.connected_at
  // v134: Google accepteert de toegang niet meer (verlopen of ingetrokken).
  const verlopen = gekoppeld && !!status.opnieuw_koppelen

  if (laden) return null

  return (
    <div className="glass-panel p-3 mb-4 border border-border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <Calendar size={16} className={gekoppeld ? 'text-primary' : 'text-muted'} />
        <span className="font-bold text-sm text-body">Google Agenda</span>
        <span
          className="text-xs font-semibold"
          style={{ color: gekoppeld ? 'var(--primary)' : 'var(--text-muted)' }}
        >
          {gekoppeld ? `gekoppeld${status.google_email ? ` (${status.google_email})` : ''}` : 'niet gekoppeld'}
        </span>
        {verlopen ? (
          <span className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--danger)' }}>
            <AlertTriangle size={13} /> verlopen, opnieuw koppelen
          </span>
        ) : gekoppeld && status.last_error && (
          <span className="text-xs font-semibold flex items-center gap-1" style={{ color: 'var(--danger)' }}>
            <AlertTriangle size={13} /> let op
          </span>
        )}
        <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{open ? 'verbergen' : 'instellen'}</span>
      </button>

      {open && (
        <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          {!gekoppeld ? (
            <>
              <p className="text-xs text-muted" style={{ lineHeight: 1.6, marginBottom: 10 }}>
                Koppel je Google Agenda en je afspraken staan ook op je telefoon. ReachConnect maakt
                daarvoor een aparte agenda aan met de naam &quot;ReachConnect afspraken&quot; en kan
                alleen bij die agenda, niet bij je privé-afspraken. Andersom ziet ReachConnect alleen
                wanneer je bezet bent, zonder te zien waarmee, zodat bellers er niets overheen plannen.
              </p>
              <button type="button" onClick={koppel} disabled={bezig} className="btn btn-primary btn-sm" style={{ fontWeight: 800 }}>
                <Link2 size={14} /> {bezig ? 'Bezig...' : 'Koppel Google Agenda'}
              </button>
            </>
          ) : (
            <>
              {verlopen ? (
                <div
                  className="text-xs p-2 mb-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--danger)', lineHeight: 1.5 }}
                >
                  <strong>Je koppeling met Google is verlopen.</strong> Je afspraken gaan nu niet naar je
                  Google Agenda en je bezette tijd wordt niet opgehaald. Koppel opnieuw om het weer aan te zetten.
                  <div className="mt-2">
                    <button type="button" onClick={koppel} disabled={bezig} className="btn btn-primary btn-sm" style={{ fontWeight: 800 }}>
                      <Link2 size={14} /> {bezig ? 'Bezig...' : 'Opnieuw koppelen'}
                    </button>
                  </div>
                </div>
              ) : status.last_error && (
                <div
                  className="text-xs p-2 mb-3"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: 'var(--danger)' }}
                >
                  {status.last_error}
                </div>
              )}

              <label className="flex items-start gap-2 mb-2" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!status.push_enabled}
                  disabled={bezig}
                  onChange={e => zetInstelling('push', e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span className="text-xs text-body">
                  <strong>Afspraken in mijn Google Agenda zetten</strong>
                  <br />
                  <span className="text-muted">Laatste keer: {geleden(status.last_push_at)}</span>
                </span>
              </label>

              <label className="flex items-start gap-2 mb-3" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!status.busy_import_enabled}
                  disabled={bezig}
                  onChange={e => zetInstelling('busy', e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span className="text-xs text-body">
                  <strong>Bezette tijd uit mijn Google Agenda blokkeren</strong>
                  <br />
                  <span className="text-muted">
                    Wordt elk kwartier opgehaald. Laatste keer: {geleden(status.last_busy_sync_at)}
                  </span>
                </span>
              </label>

              <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                <button type="button" onClick={haalStatus} disabled={bezig} className="btn btn-outline btn-sm">
                  <RefreshCw size={13} /> Status verversen
                </button>
                <button
                  type="button"
                  onClick={ontkoppel}
                  disabled={bezig}
                  className="btn btn-sm"
                  style={{
                    background: bevestigLos ? 'var(--danger)' : 'transparent',
                    color: bevestigLos ? '#fff' : 'var(--danger)',
                    border: '1px solid var(--danger)',
                    fontWeight: 700,
                  }}
                >
                  {bevestigLos ? <><Check size={13} /> Klik nogmaals om te ontkoppelen</> : <><Unlink size={13} /> Ontkoppelen</>}
                </button>
              </div>
              <p className="text-xs text-muted mt-2" style={{ lineHeight: 1.5 }}>
                Bij ontkoppelen haalt ReachConnect de agenda &quot;ReachConnect afspraken&quot; uit je
                Google-account en trekt het de toegang in.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
