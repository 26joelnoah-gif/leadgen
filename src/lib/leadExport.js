// v159: leads downloaden voor Excel of een eigen CRM.
// Excel in het Nederlands verwacht een puntkomma als scheidingsteken en
// herkent UTF-8 alleen met een BOM aan het begin. Daarom geen exportToCSV
// (komma, geen BOM): dan staat alles in een kolom en breken de accenten.
import { supabase } from './supabase'
import { getStatusDetails } from '../utils/statusUtils'

const BLOK = 150 // zelfde blokgrootte als lead_mail_status in LeadBoard (URL-lengte)

const datum = (iso) => iso
  ? new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''

function cel(v) {
  const s = v == null ? '' : String(v)
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadVoorExcel(rows, bestandsnaam) {
  if (!rows.length) return false
  const kop = Object.keys(rows[0])
  const regels = [kop.map(cel).join(';'), ...rows.map(r => kop.map(k => cel(r[k])).join(';'))]
  const blob = new Blob(['﻿' + regels.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${bestandsnaam}.csv`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return true
}

// Haalt de leads vers op (met notities) plus alle gesprekken uit call_logs,
// en zet ze om naar 1 rij per lead. RLS bepaalt wat de gebruiker mag zien.
export async function leadsVoorExcel(leadIds, listNames = {}) {
  const leads = []
  const logs = []
  for (let i = 0; i < leadIds.length; i += BLOK) {
    const ids = leadIds.slice(i, i + BLOK)
    const [l, c] = await Promise.all([
      supabase.from('leads')
        .select('id, lead_list_id, name, contact_person, function, phone, email, website, address, house_number, postal_code, city, status, next_contact_date, appointment_at, contact_attempts, notes, created_at, updated_at')
        .in('id', ids).is('deleted_at', null),
      supabase.from('call_logs')
        .select('lead_id, disposition, notes, created_at')
        .in('lead_id', ids).order('created_at', { ascending: true }),
    ])
    if (l.error) throw l.error
    leads.push(...(l.data || []))
    if (!c.error) logs.push(...(c.data || []))
  }

  const perLead = {}
  for (const g of logs) (perLead[g.lead_id] ||= []).push(g)

  return leads
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nl'))
    .map(l => {
      const gesprekken = perLead[l.id] || []
      const laatste = gesprekken[gesprekken.length - 1]
      return {
        Bedrijf: l.name || '',
        Contactpersoon: l.contact_person || '',
        Functie: l.function || '',
        Telefoon: l.phone || '',
        'E-mail': l.email || '',
        Website: l.website || '',
        Adres: [l.address, l.house_number].filter(Boolean).join(' '),
        Postcode: l.postal_code || '',
        Plaats: l.city || '',
        Status: getStatusDetails(l.status).label || l.status || '',
        'Volgende actie': datum(l.next_contact_date),
        Afspraak: datum(l.appointment_at),
        'Aantal keer gebeld': gesprekken.length || l.contact_attempts || 0,
        'Laatst gebeld': datum(laatste?.created_at),
        Notities: l.notes || '',
        Gesprekken: gesprekken
          .filter(g => g.notes)
          .map(g => `${datum(g.created_at)} (${getStatusDetails(g.disposition).label || g.disposition}): ${g.notes}`)
          .join(' | '),
        Lijst: listNames[l.lead_list_id] || '',
        'Toegevoegd op': datum(l.created_at),
      }
    })
}
