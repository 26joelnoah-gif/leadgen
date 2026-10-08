// v136: staat er voor deze beller een verklaring klaar die nog niet getekend
// is, dan ligt dit scherm over de hele app (ook over het belscherm). Bellen
// kan dus pas na ondertekenen. Alleen voor de echte rol beller/backoffice.
// Faalt open: lukt het laden niet, dan blokkeren we niemand.
import { useEffect, useRef, useState } from 'react'
import { FileSignature, CheckCircle2, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { laadOpenVerklaring, tekenFout, VERKLARING_ROLLEN } from '../lib/overeenkomsten'
import OvereenkomstTekst from './OvereenkomstTekst'

export default function OvereenkomstGate() {
  const { user, profile, signOut } = useAuth()
  const [open, setOpen] = useState(null)
  const [klaar, setKlaar] = useState(null)
  const geopendRef = useRef(null)
  const actief = !!user && VERKLARING_ROLLEN.includes(profile?.role)

  useEffect(() => {
    if (!actief) { setOpen(null); return }
    let weg = false
    const laad = () => laadOpenVerklaring(user.id).then(o => { if (!weg) setOpen(o) }).catch(() => { /* faalt open */ })
    laad()
    const ch = supabase
      .channel(`verklaring-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'overeenkomsten', filter: `profile_id=eq.${user.id}` }, laad)
      .subscribe()
    return () => { weg = true; supabase.removeChannel(ch) }
  }, [actief, user?.id])

  useEffect(() => {
    if (open?.id && geopendRef.current !== open.id) {
      geopendRef.current = open.id
      supabase.rpc('overeenkomst_geopend', { p_id: open.id }).then(() => {})
    }
  }, [open?.id])

  if (!actief || (!open && !klaar)) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 20000, background: 'var(--bg-dark)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 16px 60px' }}>
        {klaar ? (
          <Klaar kenmerk={klaar.kenmerk} id={klaar.id} onVerder={() => setKlaar(null)} />
        ) : (
          <Tekenen o={open} profile={profile} signOut={signOut} onGetekend={(kenmerk) => { setKlaar({ kenmerk, id: open.id }); setOpen(null) }} />
        )}
      </div>
    </div>
  )
}

function Tekenen({ o, profile, signOut, onGetekend }) {
  const [naam, setNaam] = useState(profile?.full_name || '')
  const [handelsnaam, setHandelsnaam] = useState('')
  const [kvk, setKvk] = useState('')
  const [vink, setVink] = useState({ akkoord: false, zelfstandig: false, verzekering: false, elektronisch: false })
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState(null)

  const kvkCijfers = kvk.replace(/\D/g, '')
  const kan = naam.trim().length >= 3 && handelsnaam.trim().length >= 2 && kvkCijfers.length === 8 && Object.values(vink).every(Boolean)

  async function teken(e) {
    e.preventDefault()
    if (!kan || bezig) return
    setBezig(true); setFout(null)
    const { data, error } = await supabase.rpc('overeenkomst_tekenen', {
      p_id: o.id, p_naam: naam.trim(), p_handelsnaam: handelsnaam.trim(), p_kvk: kvkCijfers,
      p_akkoord: vink.akkoord, p_zelfstandig: vink.zelfstandig, p_verzekering: vink.verzekering, p_elektronisch: vink.elektronisch,
      p_browser: navigator.userAgent,
    })
    setBezig(false)
    if (error) { setFout(tekenFout(error)); return }
    onGetekend(data)
  }

  const vinkjes = [
    ['akkoord', 'Ik heb deze verklaring gelezen en ga akkoord.'],
    ['zelfstandig', 'Ik werk als zelfstandig ondernemer en mijn KvK-gegevens kloppen.'],
    ['verzekering', 'Ik heb een bedrijfsaansprakelijkheidsverzekering.'],
    ['elektronisch', 'Ik ga akkoord met elektronisch ondertekenen.'],
  ]

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
            <FileSignature size={24} className="text-primary" /> Teken eerst je verklaring
          </h1>
          <p className="text-muted" style={{ margin: '6px 0 0', fontSize: '0.88rem' }}>
            Lees hem rustig door. Na het tekenen kun je meteen aan de slag.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={signOut} style={{ textTransform: 'none', letterSpacing: 0 }}>
          <LogOut size={14} /> Uitloggen
        </button>
      </div>

      <div className="glass-panel" style={{ padding: 20, borderRadius: 16, marginBottom: 16 }}>
        <OvereenkomstTekst overeenkomst={o} bellerNaam={profile?.full_name} />
      </div>

      <form onSubmit={teken} className="glass-panel" style={{ padding: 20, borderRadius: 16 }} autoComplete="off">
        <h3 style={{ margin: '0 0 12px', fontWeight: 800 }}>Ondertekenen</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
          <div className="form-group">
            <label>Voor- en achternaam</label>
            <input className="form-dark" style={{ width: '100%' }} value={naam} onChange={e => setNaam(e.target.value)} maxLength={120} />
          </div>
          <div className="form-group">
            <label>Naam van je onderneming</label>
            <input className="form-dark" style={{ width: '100%' }} value={handelsnaam} onChange={e => setHandelsnaam(e.target.value)} maxLength={120} placeholder="Zoals bij de KvK" />
          </div>
          <div className="form-group">
            <label>KvK-nummer</label>
            <input className="form-dark" style={{ width: '100%' }} value={kvk} onChange={e => setKvk(e.target.value)} inputMode="numeric" maxLength={12} placeholder="8 cijfers" />
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8, margin: '6px 0 14px' }}>
          {vinkjes.map(([k, tekst]) => (
            <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', fontSize: '0.9rem', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: vink[k] ? 'var(--accent-soft)' : 'transparent' }}>
              <input type="checkbox" checked={vink[k]} onChange={e => setVink(v => ({ ...v, [k]: e.target.checked }))} style={{ marginTop: 3 }} />
              <span>{tekst}</span>
            </label>
          ))}
        </div>
        {fout && <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 12px', borderRadius: 10, marginBottom: 12, fontSize: '0.88rem' }}>{fout}</div>}
        <button type="submit" className="btn btn-primary" disabled={!kan || bezig} style={{ width: '100%' }}>
          {bezig ? 'Bezig...' : 'Onderteken verklaring'}
        </button>
        <p className="text-muted" style={{ fontSize: '0.75rem', margin: '10px 0 0', lineHeight: 1.5 }}>
          We leggen vast wie er tekent, wanneer en vanaf welk apparaat. Je kunt de getekende verklaring daarna altijd terugzien en downloaden.
        </p>
      </form>
    </>
  )
}

function Klaar({ kenmerk, id, onVerder }) {
  return (
    <div className="glass-panel" style={{ padding: 28, borderRadius: 16, textAlign: 'center', marginTop: 40 }}>
      <CheckCircle2 size={44} style={{ color: 'var(--success)' }} />
      <h2 style={{ fontWeight: 800, margin: '10px 0 6px' }}>Getekend, top!</h2>
      <p className="text-muted" style={{ margin: '0 0 4px' }}>Kenmerk: <strong>{kenmerk}</strong></p>
      <p className="text-muted" style={{ margin: '0 0 18px', fontSize: '0.88rem' }}>Je kunt nu aan de slag. Je verklaring vind je terug onder Verklaringen.</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <a className="btn btn-outline" href={`/overeenkomsten/${id}`} target="_blank" rel="noopener noreferrer">Bekijk of download</a>
        <button type="button" className="btn btn-primary" onClick={onVerder}>Verder</button>
      </div>
    </div>
  )
}
