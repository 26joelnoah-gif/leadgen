// CSV-import voor leadlijsten.
//
// De vorige versie deed lines.split('\n') en values.split(','). Dat gaat mis
// op precies de data die je in de praktijk krijgt:
//   - Nederlandse Excel-exports gebruiken standaard een puntkomma
//   - bedrijfsnamen bevatten komma's ("Bakkerij Jansen, B.V.")
//   - velden met aanhalingstekens kunnen regeleindes bevatten
//   - Excel zet een BOM aan het begin van het bestand
// Deze parser volgt RFC 4180 en herkent het scheidingsteken zelf.

const FIELD_LABELS = {
  name: 'Bedrijfsnaam',
  phone: 'Telefoon',
  email: 'E-mail',
  contact_person: 'Contactpersoon',
  function: 'Functie',
  website: 'Website',
  address: 'Straat',
  house_number: 'Huisnummer',
  postal_code: 'Postcode',
  city: 'Plaats',
  notes: 'Notities',
  lead_source: 'Bron',
}

export const IMPORT_FIELDS = Object.entries(FIELD_LABELS).map(([key, label]) => ({ key, label }))

// Koptekst -> veld. Eerste match wint, dus specifieke termen staan vooraan.
const HEADER_PATTERNS = [
  ['house_number',   [/huisnr/, /huisnummer/, /^nr$/, /house.?number/]],
  ['postal_code',    [/postcode/, /postal/, /^zip/, /^pc$/]],
  ['contact_person', [/contactpersoon/, /contact.?person/, /^contact$/, /aanhef/, /voornaam/, /achternaam/]],
  ['function',       [/functie/, /^functi/, /job.?title/, /^rol$/, /position/]],
  ['website',        [/website/, /^web$/, /^url$/, /domein/, /domain/]],
  ['email',          [/e-?mail/, /mailadres/]],
  ['phone',          [/telefoon/, /^tel/, /phone/, /mobiel/, /^gsm/, /nummer/]],
  ['city',           [/plaats/, /woonplaats/, /^stad$/, /^city$/, /gemeente/]],
  ['address',        [/adres/, /straat/, /address/, /street/]],
  ['notes',          [/notitie/, /notes/, /opmerking/, /^memo$/, /toelichting/]],
  ['lead_source',    [/bron/, /source/, /herkomst/]],
  ['name',           [/bedrijf/, /^naam$/, /^name$/, /company/, /organisatie/, /klant/]],
]

export function guessField(header) {
  const h = String(header || '').trim().toLowerCase()
  if (!h) return null
  for (const [field, patterns] of HEADER_PATTERNS) {
    if (patterns.some(p => p.test(h))) return field
  }
  return null
}

// Kiest het scheidingsteken op basis van de kopregel: het teken dat buiten
// aanhalingstekens het vaakst voorkomt.
function detectDelimiter(text) {
  const firstLine = text.slice(0, 5000).split(/\r?\n/)[0] || ''
  const counts = {}
  let inQuotes = false
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && (ch === ';' || ch === ',' || ch === '\t' || ch === '|')) {
      counts[ch] = (counts[ch] || 0) + 1
    }
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : ','
}

// RFC 4180: velden mogen tussen aanhalingstekens staan en dan het
// scheidingsteken, regeleindes en verdubbelde aanhalingstekens bevatten.
function parseRows(text, delimiter) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    // Aanhalingstekens hebben alleen betekenis aan het begin van een veld.
    // Anders raakt een naam als Slagerij "De Beste" ze onderweg kwijt.
    if (ch === '"' && field === '') { inQuotes = true; continue }
    if (ch === delimiter) { row.push(field); field = ''; continue }
    if (ch === '\r') continue
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += ch
  }

  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(r => r.some(c => c.trim() !== ''))
}

/**
 * Leest een CSV-tekst in en geeft kopteksten, rijen en een voorstel voor de
 * kolomindeling terug. De gebruiker kan die indeling daarna aanpassen.
 */
export function parseCSV(csvText) {
  const text = String(csvText || '').replace(/^﻿/, '') // Excel-BOM
  if (!text.trim()) return { headers: [], rows: [], mapping: {}, delimiter: ',' }

  const delimiter = detectDelimiter(text)
  const rows = parseRows(text, delimiter)
  if (rows.length === 0) return { headers: [], rows: [], mapping: {}, delimiter }

  const headers = rows[0].map(h => h.trim())
  const dataRows = rows.slice(1)

  const mapping = {}
  const taken = new Set()
  headers.forEach((h, i) => {
    const field = guessField(h)
    if (field && !taken.has(field)) {
      mapping[i] = field
      taken.add(field)
    }
  })

  return { headers, rows: dataRows, mapping, delimiter }
}

// 06-12345678, +31 6 1234 5678 en 0031612345678 zijn hetzelfde nummer.
// Voor dubbelcheck vergelijken we een genormaliseerde vorm.
export function normalizePhone(raw) {
  let p = String(raw || '').replace(/[^\d+]/g, '')
  if (!p) return ''
  if (p.startsWith('00')) p = '+' + p.slice(2)
  if (p.startsWith('+31')) p = '0' + p.slice(3)
  else if (p.startsWith('31') && p.length > 10) p = '0' + p.slice(2)
  return p
}

function isPlausiblePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Zet ruwe rijen om naar leads volgens de kolomindeling, en scheidt bruikbare
 * regels van regels met een probleem. Dubbele nummers binnen het bestand en
 * nummers die al in de database staan worden apart gemeld.
 */
export function buildLeads(rows, mapping, { existingPhones = [] } = {}) {
  const valid = []
  const problems = []
  const seen = new Set()
  const existing = new Set(existingPhones.map(normalizePhone).filter(Boolean))

  rows.forEach((row, i) => {
    const lineNo = i + 2 // kopregel meegeteld
    const lead = {}

    Object.entries(mapping).forEach(([colIndex, field]) => {
      if (!field) return
      const value = (row[Number(colIndex)] ?? '').trim()
      if (value) lead[field] = value
    })

    if (!lead.name && !lead.phone) return // lege regel

    if (!lead.name) {
      problems.push({ line: lineNo, reason: 'Bedrijfsnaam ontbreekt', row })
      return
    }
    if (!lead.phone) {
      problems.push({ line: lineNo, reason: 'Telefoonnummer ontbreekt', row })
      return
    }
    if (!isPlausiblePhone(lead.phone)) {
      problems.push({ line: lineNo, reason: `Onbruikbaar telefoonnummer: ${lead.phone}`, row })
      return
    }
    if (lead.email && !EMAIL_RE.test(lead.email)) {
      // Geen reden om de lead te weigeren; het mailadres laten we vallen.
      problems.push({ line: lineNo, reason: `Ongeldig e-mailadres genegeerd: ${lead.email}`, row, warning: true })
      delete lead.email
    }

    const key = normalizePhone(lead.phone)
    if (seen.has(key)) {
      problems.push({ line: lineNo, reason: `Dubbel in dit bestand: ${lead.phone}`, row })
      return
    }
    if (existing.has(key)) {
      problems.push({ line: lineNo, reason: `Staat al in het systeem: ${lead.phone}`, row })
      return
    }

    seen.add(key)
    valid.push(lead)
  })

  return { valid, problems }
}

export { FIELD_LABELS }
