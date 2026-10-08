// v136: toont een verklaring (verstuurd, getekend of als voorbeeld) op dezelfde
// manier in het tekenscherm, het overzicht en de pdf.
import { ShieldCheck } from 'lucide-react'
import { blokkenVanTekst, euro } from '../lib/overeenkomsten'

export default function OvereenkomstTekst({ overeenkomst, bellerNaam }) {
  const o = overeenkomst || {}
  const opdr = o.opdrachtgever || {}
  const ak = o.akkoord || null
  const tarieven = Array.isArray(o.tarieven) ? o.tarieven : []
  const heeftAfspraak = tarieven.some(t => t.afspraak !== null && t.afspraak !== undefined && t.afspraak !== '')
  const heeftSale = tarieven.some(t => t.sale !== null && t.sale !== undefined && t.sale !== '')

  return (
    <div className="verklaring-tekst" style={{ fontSize: '0.92rem', lineHeight: 1.65, color: 'var(--text-primary)' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 14px' }}>{o.titel || 'Verklaring'}</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 18 }}>
        <div style={kaart}>
          <div style={label}>Opdrachtgever</div>
          <div style={{ fontWeight: 700 }}>{opdr.naam || '-'}</div>
          {opdr.plaats && <div className="text-muted">{opdr.plaats}</div>}
          {opdr.kvk && <div className="text-muted">KvK {opdr.kvk}</div>}
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>hierna "wij"</div>
        </div>
        <div style={kaart}>
          <div style={label}>Appointment setter</div>
          <div style={{ fontWeight: 700 }}>{ak?.naam || bellerNaam || '-'}</div>
          {ak ? (
            <>
              <div className="text-muted">handelend onder {ak.handelsnaam}</div>
              <div className="text-muted">KvK {ak.kvk}</div>
            </>
          ) : (
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>Handelsnaam en KvK-nummer vul je in bij het tekenen.</div>
          )}
          <div className="text-muted" style={{ fontSize: '0.8rem' }}>hierna "jij"</div>
        </div>
      </div>

      {blokkenVanTekst(o.tekst).map((b, i) => {
        if (b.type === 'kop') return <h3 key={i} style={{ fontSize: '1rem', fontWeight: 800, margin: '18px 0 6px' }}>{b.tekst}</h3>
        if (b.type === 'lijst') return <ul key={i} style={{ margin: '4px 0 8px', paddingLeft: 20 }}>{b.items.map((t, j) => <li key={j}>{t}</li>)}</ul>
        if (b.type === 'tarieven') return (
          <div key={i} style={{ overflowX: 'auto', margin: '8px 0 10px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th style={th}>Project</th>
                  {heeftAfspraak && <th style={{ ...th, textAlign: 'right' }}>Per afspraak</th>}
                  {heeftSale && <th style={{ ...th, textAlign: 'right' }}>Per netto sale</th>}
                </tr>
              </thead>
              <tbody>
                {tarieven.length === 0 && <tr><td style={td} colSpan={3} className="text-muted">Nog geen bedragen ingevuld</td></tr>}
                {tarieven.map((t, j) => (
                  <tr key={j}>
                    <td style={td}>{t.project}</td>
                    {heeftAfspraak && <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{euro(t.afspraak)}</td>}
                    {heeftSale && <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{euro(t.sale)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        return <p key={i} style={{ margin: '0 0 8px' }}>{b.tekst}</p>
      })}

      {ak && (
        <div style={{ ...kaart, marginTop: 20, borderColor: 'var(--success)', background: 'var(--success-bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--success)', marginBottom: 6 }}>
            <ShieldCheck size={18} /> Bewijs van ondertekening
          </div>
          <div style={{ fontSize: '0.85rem', display: 'grid', gap: 2 }}>
            <div>Kenmerk: <strong>{o.ondertekening_id}</strong></div>
            <div>Getekend door {ak.naam}, namens {ak.handelsnaam} (KvK {ak.kvk})</div>
            <div>Op {ak.tijdstip_nl} (Nederlandse tijd), in ReachConnect met het eigen account</div>
            <div>Verklaard: akkoord met de verklaring, werkt als zelfstandig ondernemer, heeft een bedrijfsaansprakelijkheidsverzekering, akkoord met elektronisch ondertekenen</div>
            {ak.ip && <div>IP-adres: {ak.ip}</div>}
            <div style={{ wordBreak: 'break-all' }} className="text-muted">Controlecode tekst: {ak.inhoud_hash}</div>
          </div>
        </div>
      )}
    </div>
  )
}

const kaart = { border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', background: 'var(--bg-elevated)' }
const label = { fontSize: '0.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 4 }
const th = { textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }
const td = { padding: '8px 10px', borderBottom: '1px solid var(--border)' }
