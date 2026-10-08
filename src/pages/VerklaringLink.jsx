// v137: publieke pagina /verklaring/:token. Hiermee tekent iemand die nog geen
// account in ReachConnect heeft zijn verklaring. De link is niet te raden
// (48 tekens). Alles loopt via twee RPC's die ook zonder inloggen werken:
// overeenkomst_via_link (lezen + "geopend" zetten) en overeenkomst_tekenen_link.
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileSignature, CheckCircle2, Printer } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Logo from '../components/Logo'
import LoadingSpinner from '../components/LoadingSpinner'
import OvereenkomstTekst from '../components/OvereenkomstTekst'
import { TekenFormulier } from '../components/OvereenkomstGate'

export default function VerklaringLink() {
  const { token } = useParams()
  const [o, setO] = useState(null)
  const [stand, setStand] = useState('laden') // laden | ok | weg | fout
  const [netGetekend, setNetGetekend] = useState(null)

  async function laad() {
    const { data, error } = await supabase.rpc('overeenkomst_via_link', { p_token: token })
    if (error) { setStand('fout'); return }
    if (!data) { setStand('weg'); return }
    setO(data); setStand('ok')
  }

  useEffect(() => { laad() }, [token])

  async function teken(velden) {
    const { data, error } = await supabase.rpc('overeenkomst_tekenen_link', { p_token: token, ...velden })
    if (error) throw error
    setNetGetekend(data)
    await laad()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-dark)' }}>
      <style>{`@media print {
        .vl-geen-print { display: none !important; }
        body { background: #fff !important; }
        .vl-print { box-shadow: none !important; border: none !important; padding: 0 !important; background: #fff !important; }
        .vl-print * { color: #000 !important; }
      }`}</style>
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '20px 16px 60px' }}>
        <div className="vl-geen-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <Logo size="small" />
          {o?.status === 'getekend' && (
            <button className="btn btn-primary btn-sm" style={{ textTransform: 'none', letterSpacing: 0 }} onClick={() => window.print()}>
              <Printer size={14} /> Download pdf
            </button>
          )}
        </div>

        {stand === 'laden' && <LoadingSpinner />}

        {(stand === 'weg' || stand === 'fout') && (
          <div className="glass-panel" style={{ padding: 28, borderRadius: 16, textAlign: 'center' }}>
            <FileSignature size={40} className="text-muted" />
            <h2 style={{ fontWeight: 800, margin: '10px 0 6px' }}>
              {stand === 'weg' ? 'Deze link werkt niet' : 'Er ging iets mis'}
            </h2>
            <p className="text-muted" style={{ margin: 0 }}>
              {stand === 'weg'
                ? 'Controleer of je de hele link hebt gekopieerd, of vraag een nieuwe link aan.'
                : 'Probeer de pagina over een minuutje opnieuw te laden.'}
            </p>
          </div>
        )}

        {stand === 'ok' && o && (
          <>
            {o.status === 'verstuurd' && (
              <div className="vl-geen-print" style={{ marginBottom: 14 }}>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.4rem', fontWeight: 800, margin: 0 }}>
                  <FileSignature size={24} className="text-primary" /> Je verklaring
                </h1>
                <p className="text-muted" style={{ margin: '6px 0 0', fontSize: '0.9rem' }}>
                  {o.ontvanger_naam ? `Hoi ${o.ontvanger_naam.split(' ')[0]}, lees` : 'Lees'} de verklaring rustig door en teken hem onderaan.
                </p>
              </div>
            )}

            {o.status === 'getekend' && (
              <div className="vl-geen-print glass-panel" style={{ padding: 18, borderRadius: 16, marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
                <CheckCircle2 size={30} style={{ color: 'var(--success)', flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 800 }}>{netGetekend ? 'Getekend, top!' : 'Deze verklaring is getekend'}</div>
                  <div className="text-muted" style={{ fontSize: '0.88rem' }}>
                    Kenmerk {o.ondertekening_id}. Bewaar hem met de knop Download pdf. Je kunt deze link later ook weer openen.
                  </div>
                </div>
              </div>
            )}

            {o.status === 'ingetrokken' && (
              <div className="glass-panel" style={{ padding: 14, borderRadius: 12, marginBottom: 14, fontSize: '0.9rem' }}>
                Deze verklaring is ingetrokken en kan niet meer getekend worden. Vraag een nieuwe link aan.
              </div>
            )}

            <div className="glass-panel vl-print" style={{ padding: 22, borderRadius: 16, marginBottom: 16 }}>
              <OvereenkomstTekst overeenkomst={o} bellerNaam={o.ontvanger_naam} />
            </div>

            {o.status === 'verstuurd' && (
              <div className="vl-geen-print">
                <TekenFormulier startNaam={o.ontvanger_naam || ''} onTeken={teken} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
