export function parseCSV(csvText) {
  const lines = csvText.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const leads = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const lead = {}

    headers.forEach((header, index) => {
      const value = values[index] || ''
      if (header.includes('name') || header.includes('naam')) lead.name = value
      else if (header.includes('phone') || header.includes('tel') || header.includes('telefoon')) lead.phone = value
      else if (header.includes('email')) lead.email = value
      else if (header.includes('note') || header.includes('notit')) lead.notes = value
    })

    if (lead.name && lead.phone) {
      leads.push(lead)
    }
  }

  return leads
}

// v36: eigen, iets robuustere parser voor het sollicitanten-import (Recruitment.jsx).
// Los van parseCSV hierboven gehouden zodat het bestaande leads-import (Admin.jsx)
// hier niets van kan breken. Snapt zowel komma- als tab-gescheiden data (plakken
// vanuit Excel/Sheets geeft tabs) en respecteert aanhalingstekens rond velden.
function splitDelimitedLine(line, delimiter) {
  const result = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      result.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  result.push(cur)
  return result.map(s => s.trim())
}

export function parseApplicantCSV(text) {
  const raw = (text || '').replace(/\r/g, '')
  const lines = raw.split('\n').filter(l => l.trim().length > 0)
  if (lines.length < 2) return []

  const delimiter = lines[0].includes('\t') ? '\t' : ','
  const headers = splitDelimitedLine(lines[0], delimiter).map(h => h.toLowerCase())

  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const values = splitDelimitedLine(lines[i], delimiter)
    const row = { name: '', phone: '', email: '', function: '', lead_source: '', notes: '', cv_link: '' }
    headers.forEach((h, idx) => {
      const v = (values[idx] || '').trim()
      if (!v) return
      if (h.includes('naam') || h.includes('name')) row.name = v
      else if (h.includes('telefoon') || h.includes('phone') || h.includes('tel')) row.phone = v
      else if (h.includes('e-mail') || h.includes('email')) row.email = v
      else if (h.includes('functie') || h.includes('vacature') || h.includes('function') || h.includes('role')) row.function = v
      else if (h.includes('bron') || h.includes('source')) row.lead_source = v
      else if (h.includes('cv') || h.includes('linkedin')) row.cv_link = v
      else if (h.includes('notit') || h.includes('note') || h.includes('motivatie')) row.notes = v
    })
    if (row.name || row.phone) rows.push(row)
  }
  return rows
}

// Ruwe telefoon -> alleen cijfers, laatste 9 - genoeg om 06.. vs +316.. vs
// 0031 6.. als hetzelfde nummer te herkennen bij het dedupliceren.
export function normalizePhoneForDedup(phone) {
  return (phone || '').replace(/\D/g, '').slice(-9)
}

export function validateLeads(leads) {
  const valid = []
  const errors = []

  leads.forEach((lead, i) => {
    if (!lead.name) errors.push(`Rij ${i + 2}: Naam ontbreekt`)
    if (!lead.phone) errors.push(`Rij ${i + 2}: Telefoonnummer ontbreekt`)
    else if (!/^[\d\s\-\+]+$/.test(lead.phone)) errors.push(`Rij ${i + 2}: Ongeldig telefoonnummer`)
    if (lead.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email)) {
      errors.push(`Rij ${i + 2}: Ongeldig email`)
    }
    if (lead.name && lead.phone) valid.push(lead)
  })

  return { valid, errors }
}