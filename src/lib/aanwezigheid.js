// v111: laatste login en "laatst actief" per account leesbaar maken.
//
// Waar komt het vandaan?
//  * laatste login  -> auth.users.last_sign_in_at, via de RPC team_aanwezigheid().
//    Let op: iemand blijft ingelogd, dus dit is het moment dat er echt opnieuw
//    is ingelogd. Het kan dus ouder zijn dan "laatst actief".
//  * laatst actief  -> profiles.last_seen_at, automatisch gezet zodra iemand
//    klikt (klik-heartbeat v43) of een gesprek afboekt.

const MIN = 60 * 1000
const UUR = 60 * MIN
const DAG = 24 * UUR

function tijd(d) {
  return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

// "nu" / "12 min" / "3 u" / "gisteren 16:12" / "4 dagen" / "12 sep"
export function fmtGeleden(ts) {
  if (!ts) return 'nooit'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return 'nooit'
  const diff = Date.now() - d.getTime()
  if (diff < 0) return tijd(d)
  if (diff < 2 * MIN) return 'nu'
  if (diff < UUR) return `${Math.floor(diff / MIN)} min`

  const vandaag = new Date(); vandaag.setHours(0, 0, 0, 0)
  const dagVan = new Date(d); dagVan.setHours(0, 0, 0, 0)
  const dagenTerug = Math.round((vandaag - dagVan) / DAG)

  if (dagenTerug === 0) return diff < 8 * UUR ? `${Math.floor(diff / UUR)} u` : `vandaag ${tijd(d)}`
  if (dagenTerug === 1) return `gisteren ${tijd(d)}`
  if (dagenTerug < 7) return `${dagenTerug} dagen`
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

// Volledige datum voor de tooltip: "ma 29 sep 2026, 19:41"
export function fmtVolledig(ts) {
  if (!ts) return 'nooit'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return 'nooit'
  return d.toLocaleString('nl-NL', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

// Stand voor het bolletje: nu online, vandaag/deze week gewerkt, of lang weg.
export function aanwezigheidsStand(ts) {
  if (!ts) return { key: 'nooit', kleur: 'var(--muted)', label: 'Nog nooit actief geweest' }
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 5 * MIN) return { key: 'online', kleur: 'var(--primary)', label: 'Nu aan het werk' }
  if (diff < 12 * UUR) return { key: 'vandaag', kleur: 'var(--secondary)', label: 'Vandaag actief geweest' }
  if (diff < 7 * DAG) return { key: 'week', kleur: 'var(--muted)', label: 'Deze week actief geweest' }
  return { key: 'lang', kleur: 'var(--error)', label: 'Meer dan een week niets gedaan' }
}

// Tooltip met beide momenten onder elkaar.
export function aanwezigheidsTitel(aw) {
  return [
    `Laatst actief: ${fmtVolledig(aw?.laatst_actief)}`,
    `Laatste login: ${fmtVolledig(aw?.laatste_login)}`,
    aw?.account_sinds ? `Account sinds: ${fmtVolledig(aw.account_sinds)}` : null
  ].filter(Boolean).join('\n')
}
