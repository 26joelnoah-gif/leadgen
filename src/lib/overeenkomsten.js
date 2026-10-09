// v136: verklaring zelfstandig appointment setter.
// De tekst staat in public.overeenkomst_sjabloon (een rij) met simpele opmaak:
//   "## Kopje"   -> kopje
//   "- punt"     -> opsomming
//   {{tarieven}} -> tabel met bedragen per project
// Bij versturen maakt de database een vaste kopie (public.overeenkomsten), zodat
// een latere wijziging van het sjabloon een getekende verklaring nooit verandert.
import { supabase } from './supabase'

export const VERKLARING_STATUS = {
  verstuurd: { label: 'Wacht op tekenen', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  getekend: { label: 'Getekend', color: 'var(--success)', bg: 'var(--success-bg)' },
  ingetrokken: { label: 'Ingetrokken', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
}

// Wie kan een verklaring krijgen (zelfde regel als overeenkomst_versturen in de DB)
export const VERKLARING_ROLLEN = ['employee', 'backoffice']

export function euro(n) {
  if (n === null || n === undefined || n === '') return '-'
  const getal = Number(n)
  if (Number.isNaN(getal)) return '-'
  return '€ ' + getal.toLocaleString('nl-NL', { minimumFractionDigits: getal % 1 ? 2 : 0, maximumFractionDigits: 2 })
}

export function datumTijd(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Tekst -> blokken. Opeenvolgende "- " regels worden een lijst.
export function blokkenVanTekst(tekst = '') {
  const blokken = []
  let lijst = null
  for (const ruw of String(tekst).split('\n')) {
    const regel = ruw.trimEnd()
    if (regel.trim().startsWith('- ')) {
      if (!lijst) { lijst = { type: 'lijst', items: [] }; blokken.push(lijst) }
      lijst.items.push(regel.trim().slice(2))
      continue
    }
    lijst = null
    if (!regel.trim()) continue
    if (regel.trim() === '{{tarieven}}') blokken.push({ type: 'tarieven' })
    else if (regel.startsWith('## ')) blokken.push({ type: 'kop', tekst: regel.slice(3) })
    else blokken.push({ type: 'p', tekst: regel })
  }
  return blokken
}

const TEKEN_FOUTEN = {
  naam_ontbreekt: 'Vul je voor- en achternaam in.',
  handelsnaam_ontbreekt: 'Vul de naam van je onderneming in.',
  kvk_ongeldig: 'Een KvK-nummer heeft 8 cijfers.',
  akkoord_ontbreekt: 'Vink aan dat je de verklaring gelezen hebt en akkoord gaat.',
  zelfstandig_ontbreekt: 'Vink aan dat je als zelfstandig ondernemer werkt.',
  verzekering_ontbreekt: 'Vink aan dat je een bedrijfsaansprakelijkheidsverzekering hebt.',
  elektronisch_ontbreekt: 'Vink aan dat je akkoord gaat met elektronisch ondertekenen.',
}
export function tekenFout(err) {
  const msg = err?.message || String(err || '')
  const sleutel = Object.keys(TEKEN_FOUTEN).find(k => msg.includes(k))
  return sleutel ? TEKEN_FOUTEN[sleutel] : msg || 'Ondertekenen is niet gelukt. Probeer het opnieuw.'
}

export async function laadOpenVerklaring(profileId) {
  const { data, error } = await supabase
    .from('overeenkomsten')
    .select('*')
    .eq('profile_id', profileId)
    .eq('status', 'verstuurd')
    .order('verstuurd_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

// v137: verklaring via link, voor iemand die nog geen account heeft.
export function verklaringLink(token) {
  if (!token) return ''
  return `${window.location.origin}/verklaring/${token}`
}

export async function kopieerTekst(tekst) {
  try {
    await navigator.clipboard.writeText(tekst)
    return true
  } catch {
    // oudere browsers / geen https: via een tijdelijk tekstveld
    try {
      const el = document.createElement('textarea')
      el.value = tekst
      el.style.position = 'fixed'; el.style.opacity = '0'
      document.body.appendChild(el); el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch { return false }
  }
}

// Bedragen uit het scherm -> zoals de database ze wil (lege vakken = null)
export function tarievenVoorOpslaan(rijen = []) {
  return rijen
    .filter(t => String(t.project || '').trim() && (t.afspraak !== '' || t.sale !== ''))
    .map(t => ({
      project: String(t.project).trim(),
      afspraak: t.afspraak === '' || t.afspraak === null || t.afspraak === undefined ? null : Number(t.afspraak),
      sale: t.sale === '' || t.sale === null || t.sale === undefined ? null : Number(t.sale),
    }))
}

// Bedragen uit de database -> invulregels voor het scherm
export function tarievenVoorScherm(tarieven = []) {
  const rijen = (Array.isArray(tarieven) ? tarieven : []).map(t => ({ project: t.project || '', afspraak: t.afspraak ?? '', sale: t.sale ?? '' }))
  return rijen.length ? rijen : [{ project: '', afspraak: '', sale: '' }]
}

// v138: bedrag in woorden voor de verklaring ("zegge: vijfentwintig euro").
const EENHEDEN = ['nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien',
  'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien']
const TIENTALLEN = ['', '', 'twintig', 'dertig', 'veertig', 'vijftig', 'zestig', 'zeventig', 'tachtig', 'negentig']

function onder100(n) {
  if (n < 20) return EENHEDEN[n]
  const t = Math.floor(n / 10), e = n % 10
  if (!e) return TIENTALLEN[t]
  const een = EENHEDEN[e]
  // tweeëntwintig, drieëndertig (trema als het eerste woord op een e eindigt)
  return een + (een.endsWith('e') ? 'ën' : 'en') + TIENTALLEN[t]
}

function onder1000(n) {
  const h = Math.floor(n / 100), rest = n % 100
  const honderd = h === 0 ? '' : (h === 1 ? 'honderd' : EENHEDEN[h] + 'honderd')
  if (!rest) return honderd || 'nul'
  return honderd + onder100(rest)
}

export function getalInWoorden(n) {
  n = Math.floor(Math.abs(Number(n) || 0))
  if (n === 0) return 'nul'
  const miljoen = Math.floor(n / 1e6), duizend = Math.floor((n % 1e6) / 1000), rest = n % 1000
  const delen = []
  if (miljoen) delen.push((miljoen === 1 ? 'een' : getalInWoorden(miljoen)) + ' miljoen')
  if (duizend) delen.push(duizend === 1 ? 'duizend' : onder1000(duizend) + 'duizend')
  if (rest) delen.push(onder1000(rest))
  return delen.join(' ')
}

export function bedragInWoorden(bedrag) {
  if (bedrag === null || bedrag === undefined || bedrag === '') return ''
  const getal = Number(bedrag)
  if (Number.isNaN(getal)) return ''
  const centen = Math.round(Math.abs(getal) * 100)
  const euro = Math.floor(centen / 100), cent = centen % 100
  if (!euro && cent) return `${getalInWoorden(cent)} cent`
  const deel = `${getalInWoorden(euro)} euro`
  return cent ? `${deel} en ${getalInWoorden(cent)} cent` : deel
}
