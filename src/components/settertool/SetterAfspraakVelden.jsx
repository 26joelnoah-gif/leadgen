// v159: extra verplichte velden bij "Afspraak" in een project met de settertool
// (brief 4.3): interesse, beslisser bij de afspraak, WhatsApp-bevestiging.
// Datum/tijd, closer (accountmanager) en fysiek/online staan al in de popup.

export function setterAfspraakCompleet(kaart) {
  if (!kaart) return false
  if (!kaart.interesse?.length) return false
  if (kaart.interesse.includes('anders') && !kaart.interesseAnders?.trim()) return false
  if (kaart.beslisser !== true && kaart.beslisser !== false) return false
  if (kaart.beslisser === false && !kaart.medeBeslisser?.trim()) return false
  return true
}

export default function SetterAfspraakVelden({ tool, kaart, setKaart }) {
  const zet = (k, v) => setKaart(prev => ({ ...prev, [k]: v }))
  const wissel = (id) => setKaart(prev => ({
    ...prev, interesse: prev.interesse.includes(id) ? prev.interesse.filter(x => x !== id) : [...prev.interesse, id]
  }))
  const labelStyle = { display: 'block', color: 'var(--text-muted)', marginBottom: '4px', fontSize: '0.85rem' }
  const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontSize: '0.9rem' }
  const knop = (actief) => ({
    flex: 1, padding: '8px 6px', borderRadius: '8px', cursor: 'pointer', fontWeight: 800, fontSize: '0.85rem',
    border: `2px solid ${actief ? 'var(--primary)' : 'var(--border)'}`,
    background: actief ? 'var(--accent-soft)' : 'transparent',
    color: actief ? 'var(--primary)' : 'var(--text-primary)'
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div>
        <label style={labelStyle}>Interesse (verplicht, meer keuzes mogelijk)</label>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {tool.interesseOpties.map(o => (
            <button key={o.id} type="button" onClick={() => wissel(o.id)} style={{ ...knop(kaart.interesse.includes(o.id)), flex: '1 1 40%' }}>{o.label}</button>
          ))}
        </div>
        {kaart.interesse.includes('anders') && (
          <input type="text" style={{ ...inputStyle, marginTop: 6 }} value={kaart.interesseAnders} maxLength={200}
            onChange={e => zet('interesseAnders', e.target.value)} placeholder="Waar heeft de klant interesse in?" />
        )}
      </div>

      <div>
        <label style={labelStyle}>Is de beslisser bij de afspraak? (verplicht)</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={() => zet('beslisser', true)} style={knop(kaart.beslisser === true)}>Ja</button>
          <button type="button" onClick={() => zet('beslisser', false)} style={knop(kaart.beslisser === false)}>Nee, er beslist iemand mee</button>
        </div>
        {kaart.beslisser === false && (
          <input type="text" style={{ ...inputStyle, marginTop: 6 }} value={kaart.medeBeslisser} maxLength={120}
            onChange={e => zet('medeBeslisser', e.target.value)} placeholder="Naam mede-beslisser (verplicht)" />
        )}
      </div>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.88rem', cursor: 'pointer' }}>
        <input type="checkbox" checked={kaart.whatsapp} onChange={e => zet('whatsapp', e.target.checked)} />
        Bevestigd via WhatsApp (klant stuurde "ok")
      </label>
      {!kaart.whatsapp && (
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: -6 }}>
          Nog niet bevestigd? Vink het later aan op de pagina Settertool. Na 24 uur krijg je een melding.
        </div>
      )}
    </div>
  )
}
