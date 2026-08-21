import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, ClipboardPaste, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, List, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLeadLists } from '../hooks/useLeadLists'
import { normalizeWebsite, displayWebsite } from '../utils/urlUtils'
import { useToast } from './Toast'

// ============================================================
// Import-wizard: plak uit Google Sheets/Excel, of upload een
// .csv/.xlsx bestand. Kolommen worden automatisch herkend en
// zijn daarna zelf aan te passen. Website-links worden
// opgeschoond zodat ze kort en klikbaar blijven.
// ============================================================

const FIELDS = [
  { id: 'skip', label: '- Negeren -' },
  { id: 'name', label: 'Bedrijfsnaam *' },
  { id: 'phone', label: 'Telefoonnummer *' },
  { id: 'contact_person', label: 'Contactpersoon' },
  { id: 'function', label: 'Functie' },
  { id: 'email', label: 'E-mail' },
  { id: 'website', label: 'Website' },
  { id: 'address', label: 'Straat' },
  { id: 'house_number', label: 'Huisnummer' },
  { id: 'postal_code', label: 'Postcode' },
  { id: 'city', label: 'Plaats' },
  { id: 'notes', label: 'Notities' },
  { id: 'extra_info1', label: 'Extra info 1' },
  { id: 'extra_info2', label: 'Extra info 2' },
  { id: 'extra_info3', label: 'Extra info 3' },
]

// Robuuste parser voor geplakte/gelezen tekst (tab, ; of , met quotes)
function parseDelimited(text) {
  const firstLines = text.split(/\r?\n/).slice(0, 5).join('\n')
  const counts = {
    '\t': (firstLines.match(/\t/g) || []).length,
    ';': (firstLines.match(/;/g) || []).length,
    ',': (firstLines.match(/,/g) || []).length,
  }
  const delim = counts['\t'] > 0 ? '\t' : (counts[';'] >= counts[','] && counts[';'] > 0 ? ';' : ',')

  const rows = []
  let row = [], cell = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(cell); cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(v => v.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(v => v.trim() !== '')) rows.push(row)
  return rows.map(r => r.map(v => v.trim()))
}

// Telefoonnummer opschonen (Excel sloopt vaak de voorloopnul)
function cleanPhone(raw) {
  if (!raw) return ''
  let p = String(raw).trim().replace(/[^\d+]/g, '')
  if (p.startsWith('00')) p = `+${p.slice(2)}`
  if (/^316\d{8}$/.test(p) || /^31\d{9}$/.test(p)) p = `+${p}`
  if (/^6\d{8}$/.test(p)) p = `0${p}`          // 612345678 -> 0612345678
  if (/^[1-9]\d{8}$/.test(p) && !p.startsWith('6')) p = `0${p}` // vaste nummers zonder 0
  return p
}

function guessFieldForHeader(header) {
  const h = header.toLowerCase().trim()
  // Specifieke velden eerst, anders pakt "nummer" ook "huisnummer" of "kvk-nummer"
  if (/huisnr|huisnummer|house/.test(h)) return 'house_number'
  if (/postcode|zip|postal/.test(h)) return 'postal_code'
  if (/kvk|btw|iban/.test(h)) return 'skip'
  if (/contact|persoon|voornaam|achternaam|aanspreek/.test(h)) return 'contact_person'
  if (/bedrijf|company|organisatie|firma|zaak|praktijk|winkel/.test(h)) return 'name'
  // Telefoon: telefoonnummer, telefoon, tel, tel., nummer, nr, phone, mobiel, gsm, 06...
  if (/telefoonnummer|telefoon|tel\b|tel\.|phone|mobiel|mobile|gsm|nummer|^nr\.?$|^06/.test(h)) return 'phone'
  if (/mail/.test(h)) return 'email'
  if (/site|url|web|link|domein/.test(h)) return 'website'
  if (/plaats|stad|city|gemeente|woonplaats/.test(h)) return 'city'
  if (/straat|adres|address/.test(h)) return 'address'
  if (/functie|rol|title|beroep/.test(h)) return 'function'
  if (/notitie|opmerking|note|comment|info|omschrijving|beschrijving/.test(h)) return 'notes'
  // Generiek "naam"/"name" als laatste, zodat "achternaam" eerst bij contactpersoon uitkomt
  if (/naam|name/.test(h)) return 'name'
  return 'skip'
}

function guessFieldForColumn(values) {
  const sample = values.filter(Boolean).slice(0, 15)
  if (sample.length === 0) return 'skip'
  const share = (test) => sample.filter(test).length / sample.length
  if (share(v => /^[\d\s\-+().]{8,}$/.test(v)) > 0.6) return 'phone'
  if (share(v => /@/.test(v)) > 0.6) return 'email'
  if (share(v => /(https?:\/\/|www\.|\.(nl|com|be|net|org|io|eu)(\/|$))/i.test(v)) > 0.6) return 'website'
  if (share(v => /^\d{4}\s?[a-z]{2}$/i.test(v)) > 0.6) return 'postal_code'
  return 'skip'
}

export default function ImportLeadsModal({ isOpen, onClose, onImported }) {
  const { user, profile, isDemoMode } = useAuth()
  const { leadLists, createLeadList, fetchLeadLists } = useLeadLists()
  const toast = useToast()
  const fileRef = useRef(null)

  const [step, setStep] = useState(1)           // 1 = data, 2 = kolommen & preview, 3 = klaar
  const [pasteText, setPasteText] = useState('')
  const [rows, setRows] = useState([])           // string[][]
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState([])     // veld-id per kolom
  // v21: leads landen in een lijst BINNEN een project (campagne).
  // Zonder project kan een team niet op de lijst bellen.
  const [campaigns, setCampaigns] = useState([])
  const [teams, setTeams] = useState([])
  const [targetCampaignId, setTargetCampaignId] = useState('')
  const [newCampaignName, setNewCampaignName] = useState('')
  const [newCampaignTeamId, setNewCampaignTeamId] = useState('')
  const [targetListId, setTargetListId] = useState('')
  const [newListName, setNewListName] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [fileName, setFileName] = useState('')

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (!isOpen || isDemoMode) return
    supabase.from('campaigns').select('id, name, assigned_team_id').is('deleted_at', null).order('name')
      .then(({ data }) => setCampaigns(data || []))
    supabase.from('teams').select('id, name').order('name')
      .then(({ data }) => setTeams(data || []))
  }, [isOpen, isDemoMode])

  function reset() {
    setStep(1); setPasteText(''); setRows([]); setMapping([]); setResult(null)
    setTargetCampaignId(''); setNewCampaignName(''); setNewCampaignTeamId('')
    setTargetListId(''); setNewListName(''); setFileName(''); setHasHeader(true)
  }

  function close() { reset(); onClose() }

  // ---------- Stap 1: data binnenhalen ----------
  function loadRows(parsedRows) {
    if (!parsedRows.length) { toast('Geen data gevonden', 'error'); return }
    const colCount = Math.max(...parsedRows.map(r => r.length))
    const normalized = parsedRows.map(r => { const c = [...r]; while (c.length < colCount) c.push(''); return c })

    // Kopregel-detectie: bevat de eerste rij geen telefoonnummer/e-mail, dan is het waarschijnlijk een kop
    const first = normalized[0]
    const looksLikeHeader = !first.some(v => /^[\d\s\-+().]{8,}$/.test(v) || /@.*\./.test(v))
    setHasHeader(looksLikeHeader)

    // Automatische kolomherkenning
    const dataRows = looksLikeHeader ? normalized.slice(1) : normalized
    const guessed = first.map((header, i) => {
      let g = looksLikeHeader ? guessFieldForHeader(header) : 'skip'
      if (g === 'skip') g = guessFieldForColumn(dataRows.map(r => r[i]))
      return g
    })
    // Geen naam-kolom gevonden? Pak de eerste tekstkolom die nog vrij is
    if (!guessed.includes('name')) {
      const idx = guessed.findIndex((g, i) => g === 'skip' && dataRows.some(r => r[i] && !/^\d+$/.test(r[i])))
      if (idx >= 0) guessed[idx] = 'name'
    }
    // Dubbele toewijzingen (behalve skip/notes) opschonen
    const seen = new Set()
    const finalMapping = guessed.map(g => {
      if (g === 'skip') return g
      if (seen.has(g) && g !== 'notes') return 'skip'
      seen.add(g)
      return g
    })

    // Vangnet: onherkende kolommen mét inhoud gaan automatisch naar Extra info 1-3,
    // zodat er bij een import geen data verloren gaat.
    const extraSlots = ['extra_info1', 'extra_info2', 'extra_info3'].filter(s => !finalMapping.includes(s))
    finalMapping.forEach((g, i) => {
      if (g === 'skip' && extraSlots.length > 0 && dataRows.some(r => (r[i] || '').trim() !== '')) {
        finalMapping[i] = extraSlots.shift()
      }
    })

    setRows(normalized)
    setMapping(finalMapping)
    setStep(2)
  }

  function handlePaste() {
    if (!pasteText.trim()) { toast('Plak eerst je data in het veld', 'error'); return }
    loadRows(parseDelimited(pasteText))
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        // SheetJS wordt pas geladen als het echt nodig is (lazy import)
        const XLSX = await import('xlsx')
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
        loadRows(data.map(r => r.map(v => String(v ?? '').trim())))
      } else {
        loadRows(parseDelimited(await file.text()))
      }
    } catch (err) {
      console.error('Bestand lezen mislukt:', err)
      toast('Kon het bestand niet lezen. Probeer opslaan als .csv of kopieer/plak de data.', 'error')
    } finally {
      e.target.value = ''
    }
  }

  // ---------- Stap 2: preview & validatie ----------
  const dataRows = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader])

  const parsedLeads = useMemo(() => {
    const leads = []
    const errors = []
    const seenPhones = new Set()
    dataRows.forEach((r, idx) => {
      const lead = {}
      mapping.forEach((field, i) => {
        if (field === 'skip') return
        const value = (r[i] || '').trim()
        if (!value) return
        if (field === 'notes') lead.notes = lead.notes ? `${lead.notes} | ${value}` : value
        else if (field === 'website') lead.website = normalizeWebsite(value)
        else if (field === 'phone') lead.phone = cleanPhone(value)
        else if (field.startsWith('extra_info')) {
          // Kopregel meenemen zodat je in de belmodus ziet wát dit was (bijv. "Branche: Bouw")
          const header = hasHeader ? (rows[0]?.[i] || '').trim() : ''
          lead[field] = header ? `${header}: ${value}` : value
        }
        else lead[field] = value
      })
      const rowNr = idx + (hasHeader ? 2 : 1)
      if (!lead.name && !lead.phone) return // volledig lege rij
      if (!lead.name) { errors.push(`Rij ${rowNr}: bedrijfsnaam ontbreekt`); return }
      if (!lead.phone || lead.phone.replace(/\D/g, '').length < 8) { errors.push(`Rij ${rowNr}: geen geldig telefoonnummer`); return }
      if (seenPhones.has(lead.phone)) { errors.push(`Rij ${rowNr}: dubbel nummer (${lead.phone}) - overgeslagen`); return }
      seenPhones.add(lead.phone)
      leads.push(lead)
    })
    return { leads, errors }
  }, [dataRows, mapping, hasHeader, rows])

  const mappingHasName = mapping.includes('name')
  const mappingHasPhone = mapping.includes('phone')

  // ---------- Stap 3: importeren ----------
  async function runImport() {
    if (isDemoMode) { toast('Import werkt niet in demo-modus', 'error'); return }
    if (!parsedLeads.leads.length) { toast('Geen geldige leads om te importeren', 'error'); return }
    const isNewProject = targetCampaignId === '__new__'
    if (!targetCampaignId) { toast('Kies eerst het project waar deze import bij hoort', 'error'); return }
    if (isNewProject && !newCampaignName.trim()) { toast('Geef het nieuwe project een naam', 'error'); return }
    if (!targetListId && !newListName.trim()) { toast('Kies een lijst of geef een nieuwe lijstnaam op', 'error'); return }

    setImporting(true)
    try {
      // 1a. Project (campagne) bepalen - bestaand of (expliciet) nieuw
      let campaignId = targetCampaignId
      if (isNewProject) {
        const { data: camp, error: campErr } = await supabase
          .from('campaigns')
          .insert({
            name: newCampaignName.trim(),
            description: `Aangemaakt bij import op ${new Date().toLocaleDateString('nl-NL')}`,
            assigned_team_id: newCampaignTeamId || null,
            created_by: user?.id,
            organization_id: profile?.organization_id ?? null
          })
          .select()
          .single()
        if (campErr || !camp?.id) throw new Error(campErr?.message || 'Project aanmaken mislukt')
        campaignId = camp.id
      }

      // 1b. Lijst binnen het project bepalen (bestaand of nieuw)
      let listId = targetListId
      if (!listId) {
        const { data: list, error: listErr } = await supabase
          .from('lead_lists')
          .insert({
            name: newListName.trim(),
            description: `Geïmporteerd op ${new Date().toLocaleDateString('nl-NL')}`,
            campaign_id: campaignId,
            created_by: user?.id,
            organization_id: profile?.organization_id ?? null
          })
          .select()
          .single()
        if (listErr || !list?.id) throw new Error(listErr?.message || 'Lijst aanmaken mislukt')
        listId = list.id
      }

      // 2. Bestaande nummers checken zodat je geen dubbelen importeert
      const phones = parsedLeads.leads.map(l => l.phone)
      const existing = new Set()
      for (let i = 0; i < phones.length; i += 200) {
        const { data } = await supabase.from('leads').select('phone').in('phone', phones.slice(i, i + 200)).is('deleted_at', null)
        data?.forEach(d => existing.add(d.phone))
      }

      const toInsert = parsedLeads.leads
        .filter(l => !existing.has(l.phone))
        .map(l => ({
          ...l,
          status: 'new',
          lead_list_id: listId,
          created_by: user?.id,
          organization_id: profile?.organization_id ?? null,
          lead_source: 'cold'
        }))

      // 3. In batches wegschrijven
      let inserted = 0
      for (let i = 0; i < toInsert.length; i += 100) {
        const chunk = toInsert.slice(i, i + 100)
        const { error } = await supabase.from('leads').insert(chunk)
        if (error) throw error
        inserted += chunk.length
      }

      await fetchLeadLists()
      setResult({
        inserted,
        duplicates: parsedLeads.leads.length - toInsert.length,
        skipped: parsedLeads.errors.length,
        listName: targetListId ? (leadLists.find(l => l.id === targetListId)?.name || 'lijst') : newListName.trim()
      })
      setStep(3)
      onImported?.()
    } catch (err) {
      console.error('Import mislukt:', err)
      toast(`Import mislukt: ${err.message}`, 'error')
    } finally {
      setImporting(false)
    }
  }

  const previewCols = rows[0]?.length || 0

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="modal-overlay" onClick={close} style={{ zIndex: 10000 }}>
          <motion.div
            initial={{ scale: 0.95, y: 15 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 15 }}
            className="modal glass-panel" onClick={e => e.stopPropagation()}
            style={{ maxWidth: step === 2 ? '1000px' : '640px', width: '100%', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.2rem' }}>
                <FileSpreadsheet size={20} style={{ color: 'var(--secondary)' }} />
                Leads importeren
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '3px 10px', borderRadius: '10px' }}>
                  Stap {step} van 3
                </span>
              </h2>
              <button onClick={close} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={22} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {/* ===== STAP 1: DATA ===== */}
              {step === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, marginBottom: '8px', color: 'var(--text-primary)' }}>
                      <ClipboardPaste size={16} style={{ color: 'var(--primary)' }} /> Plakken uit Google Sheets of Excel
                    </label>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                      Selecteer je rijen in Google Sheets of Excel (inclusief kopregel), kopieer ze (Cmd+C) en plak ze hieronder (Cmd+V).
                    </p>
                    <textarea
                      value={pasteText}
                      onChange={e => setPasteText(e.target.value)}
                      rows={8}
                      placeholder={'Bedrijfsnaam\tTelefoon\tWebsite\nJansen BV\t0612345678\twww.jansen.nl\n...'}
                      style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                    />
                    <button onClick={handlePaste} disabled={!pasteText.trim()} className="btn btn-primary btn-block" style={{ marginTop: '10px', padding: '13px', fontWeight: 800, opacity: pasteText.trim() ? 1 : 0.5 }}>
                      Verwerk geplakte data <ArrowRight size={16} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 800 }}>OF</span>
                    <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                  </div>

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, marginBottom: '8px', color: 'var(--text-primary)' }}>
                      <Upload size={16} style={{ color: 'var(--secondary)' }} /> Bestand uploaden
                    </label>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                      Excel (.xlsx / .xls) of CSV. Vanuit Google Sheets: Bestand → Downloaden → CSV, of kopieer/plak hierboven.
                    </p>
                    <button
                      onClick={() => fileRef.current?.click()}
                      style={{ width: '100%', padding: '28px', borderRadius: '12px', border: '2px dashed var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
                    >
                      <Upload size={26} style={{ opacity: 0.5 }} />
                      {fileName || 'Klik om een .xlsx of .csv bestand te kiezen'}
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" onChange={handleFile} style={{ display: 'none' }} />
                  </div>
                </div>
              )}

              {/* ===== STAP 2: KOLOMMEN & PREVIEW ===== */}
              {step === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{dataRows.length}</strong> rijen gevonden - kies per kolom wat het is. Ik heb alvast een voorzet gedaan.
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={hasHeader} onChange={e => setHasHeader(e.target.checked)} style={{ width: '15px', height: '15px' }} />
                      Eerste rij is een kopregel
                    </label>
                  </div>

                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: '12px' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: `${previewCols * 160}px` }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-elevated)' }}>
                          {mapping.map((field, i) => (
                            <th key={i} style={{ padding: '10px', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                              <select
                                value={field}
                                onChange={e => setMapping(prev => prev.map((f, j) => j === i ? e.target.value : f))}
                                style={{
                                  width: '100%', padding: '8px', borderRadius: '8px', fontWeight: 700, fontSize: '0.8rem',
                                  border: field === 'skip' ? '1px solid var(--border)' : '1px solid var(--primary)',
                                  background: field === 'skip' ? 'var(--bg-dark)' : 'rgba(59,130,246,0.15)',
                                  color: field === 'skip' ? 'var(--text-muted)' : 'var(--accent)'
                                }}
                              >
                                {FIELDS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                              </select>
                              {hasHeader && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '6px', fontWeight: 600, textAlign: 'left' }}>{rows[0]?.[i]}</div>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dataRows.slice(0, 6).map((r, ri) => (
                          <tr key={ri} style={{ borderBottom: '1px solid var(--border)' }}>
                            {mapping.map((field, ci) => (
                              <td key={ci} style={{ padding: '8px 10px', fontSize: '0.8rem', color: field === 'skip' ? 'var(--text-muted)' : 'var(--accent)', borderRight: '1px solid var(--border)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {field === 'website' ? displayWebsite(r[ci]) : r[ci]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {dataRows.length > 6 && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>… en nog {dataRows.length - 6} rijen</div>}

                  {/* Validatie-samenvatting */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '200px', padding: '14px', borderRadius: '12px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                      <div style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--success)' }}>{parsedLeads.leads.length}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>leads klaar voor import</div>
                    </div>
                    {parsedLeads.errors.length > 0 && (
                      <div style={{ flex: 2, minWidth: '260px', padding: '14px', borderRadius: '12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <AlertTriangle size={14} /> {parsedLeads.errors.length} rijen worden overgeslagen
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', maxHeight: '70px', overflowY: 'auto' }}>
                          {parsedLeads.errors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}
                          {parsedLeads.errors.length > 8 && <div>… en {parsedLeads.errors.length - 8} meer</div>}
                        </div>
                      </div>
                    )}
                  </div>
                  {(!mappingHasName || !mappingHasPhone) && (
                    <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontSize: '0.82rem', fontWeight: 700 }}>
                      Wijs minimaal een kolom toe aan {!mappingHasName && '"Bedrijfsnaam"'}{!mappingHasName && !mappingHasPhone && ' en '}{!mappingHasPhone && '"Telefoonnummer"'}.
                    </div>
                  )}

                  {/* Doel: project (campagne) → lijst binnen dat project */}
                  <div style={{ padding: '16px', borderRadius: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        <List size={15} style={{ color: 'var(--primary)' }} /> 1. Bij welk project hoort deze import?
                      </label>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select
                          value={targetCampaignId}
                          onChange={e => { setTargetCampaignId(e.target.value); setTargetListId(''); if (e.target.value !== '__new__') { setNewCampaignName(''); setNewCampaignTeamId('') } }}
                          style={{ flex: 1, minWidth: '200px', padding: '11px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontWeight: 600 }}
                        >
                          <option value="">- Kies een project -</option>
                          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          {isAdmin && <option value="__new__">+ Nieuw project aanmaken...</option>}
                        </select>
                        {targetCampaignId === '__new__' && isAdmin && (
                          <>
                            <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Plus size={15} style={{ color: 'var(--secondary)' }} />
                              <input
                                type="text"
                                value={newCampaignName}
                                onChange={e => setNewCampaignName(e.target.value)}
                                placeholder="Naam van het nieuwe project..."
                                style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid var(--secondary)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontWeight: 600 }}
                              />
                            </div>
                            <select
                              value={newCampaignTeamId}
                              onChange={e => setNewCampaignTeamId(e.target.value)}
                              title="Zonder team kan alleen een individueel toegewezen beller op dit project bellen"
                              style={{ minWidth: '180px', padding: '11px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontWeight: 600 }}
                            >
                              <option value="">Team koppelen (optioneel)</option>
                              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </>
                        )}
                      </div>
                      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Het team van het project mag op alle lijsten binnen dat project bellen. Een lijst zonder project is voor bellers onzichtbaar.
                      </p>
                    </div>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        <Plus size={15} style={{ color: 'var(--primary)' }} /> 2. In welke lijst komen de leads?
                      </label>
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <select
                          value={targetListId}
                          onChange={e => { setTargetListId(e.target.value); if (e.target.value) setNewListName('') }}
                          disabled={!targetCampaignId || (targetCampaignId === '__new__' && !newCampaignName.trim())}
                          style={{ flex: 1, minWidth: '200px', padding: '11px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontWeight: 600, opacity: (!targetCampaignId || (targetCampaignId === '__new__' && !newCampaignName.trim())) ? 0.5 : 1 }}
                        >
                          <option value="">- Nieuwe lijst aanmaken -</option>
                          {targetCampaignId && targetCampaignId !== '__new__' && leadLists.filter(l => l.campaign_id === targetCampaignId).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        {!targetListId && (
                          <div style={{ flex: 1, minWidth: '200px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={15} style={{ color: 'var(--secondary)' }} />
                            <input
                              type="text"
                              value={newListName}
                              onChange={e => setNewListName(e.target.value)}
                              placeholder="Naam van de nieuwe lijst..."
                              style={{ flex: 1, padding: '11px', borderRadius: '10px', border: '1px solid var(--secondary)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontWeight: 600 }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setStep(1)} className="btn btn-outline" style={{ padding: '13px 20px' }}><ArrowLeft size={16} /> Terug</button>
                    <button
                      onClick={runImport}
                      disabled={importing || !parsedLeads.leads.length || !mappingHasName || !mappingHasPhone || !targetCampaignId || (targetCampaignId === '__new__' && !newCampaignName.trim()) || (!targetListId && !newListName.trim())}
                      className="btn btn-primary"
                      style={{ flex: 1, padding: '13px', fontWeight: 900, fontSize: '1rem', opacity: (importing || !parsedLeads.leads.length || !mappingHasName || !mappingHasPhone || !targetCampaignId || (targetCampaignId === '__new__' && !newCampaignName.trim()) || (!targetListId && !newListName.trim())) ? 0.5 : 1 }}
                    >
                      {importing ? 'Bezig met importeren...' : `Importeer ${parsedLeads.leads.length} leads`}
                    </button>
                  </div>
                </div>
              )}

              {/* ===== STAP 3: RESULTAAT ===== */}
              {step === 3 && result && (
                <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                  <CheckCircle2 size={54} style={{ color: 'var(--success)', marginBottom: '16px' }} />
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '1.4rem' }}>Import gelukt!</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                    <strong style={{ color: 'var(--success)' }}>{result.inserted} leads</strong> toegevoegd aan lijst <strong style={{ color: 'var(--text-primary)' }}>"{result.listName}"</strong>.
                    {result.duplicates > 0 && <><br />{result.duplicates} overgeslagen (telefoonnummer bestond al in het systeem).</>}
                    {result.skipped > 0 && <><br />{result.skipped} rijen overgeslagen wegens ontbrekende naam/nummer.</>}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button onClick={() => { setStep(1); setPasteText(''); setRows([]); setResult(null) }} className="btn btn-outline">Nog een import</button>
                    <button onClick={close} className="btn btn-primary" style={{ fontWeight: 800 }}>Klaar</button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
