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
    if (valid.length === 0 && lead.name && lead.phone) valid.push(lead)
  })

  return { valid, errors }
}