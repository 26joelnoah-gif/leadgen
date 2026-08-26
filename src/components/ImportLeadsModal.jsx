import { useState, useRef, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, ClipboardPaste, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, List, Plus, Sparkles } from 'lucide-react'
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
// v31: naast importeren ook VERRIJKEN - plak nieuwe info (bijv.
// beslissers of contactpersonen per bedrijf) en die wordt bij de
// juiste bestaande lead gezet. Kolommen op "Negeren" doen nooit mee.
// ============================================================

const FIELDS = [
  { id: 'skip', label: '- Negeren -' },
  { id: 'name', label: 'Bedrijfsnaam' },
  { id: 'phone', label: 'Telefoonnummer *' },
  { id: 'contact_person', label: 'Contactpersoon' },
  { id: 'function', label: 'Functie' },
  { id: 'lead_source', label: 'Bron' },
  { id: 'email', label: 'E-mail' },
  { id: 'website', label: 'Website' },
  { id: 'address', label: 'Straat' },
  { id: 'house_number', label: 'Huisnummer' },
  { id: 'postal_code', label: 'Postcode' },
  { id: 'city', label: 'Plaats' },
  { id: 'notes', label: 'Notities' },
  { id: 'verrijking', label: 'Verrijking (altijd toevoegen)' },
  { id: 'decision_maker', label: 'Beslisser (ja/nee)' },
  { id: 'sale_date', label: 'Verkoopdatum/tijd (backoffice)' },
  { id: 'extra_info1', label: 'Extra info 1' },
  { id: 'extra_info2', label: 'Extra info 2' },
  { id: 'extra_info3', label: 'Extra info 3' },
]

// Velden die bij verrijken aangevuld mogen worden (alleen als ze nu leeg zijn)
const ENRICHABLE = ['contact_person', 'function', 'email', 'website', 'address', 'house_number', 'postal_code', 'city', 'notes', 'extra_info1', 'extra_info2', 'extra_info3']

const parseDecisionMaker = (v) => /^(ja|j|yes|y|x|true|1|beslisser|dmu?)$/i.test(String(v || '').trim())

// v38: verkoopdatum/tijd voor de backoffice-wachtrij (FIFO op sale_date).
// Snapt dd-mm-jjjj, dd/mm/jjjj, jjjj-mm-dd (met of zonder tijd) en
// Excel-serienummers (SheetJS levert die soms als plat getal aan).
function parseSaleDate(v) {
  const raw = String(v || '').trim()
  if (!raw) return null
  if (/^\d{4,6}(\.\d+)?$/.test(raw)) {
    const serial = parseFloat(raw)
    const ms = Math.round((serial - 25569) * 86400 * 1000)
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d.toISOString()
  }
  const dmy = raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (dmy) {
    let [, d, m, y, h, min] = dmy
    if (y.length === 2) y = `20${y}`
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h || 0), Number(min || 0))
    if (!isNaN(date.getTime())) return date.toISOString()
  }
  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/)
  if (ymd) {
    const [, y, m, d, h, min] = ymd
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(h || 0), Number(min || 0))
    if (!isNaN(date.getTime())) return date.toISOString()
  }
  const fallback = new Date(raw)
  return isNaN(fallback.getTime()) ? null : fallback.toISOString()
}

// v32.2: bedrijfsnaam normaliseren voor het matchen - rechtsvorm (B.V., VOF...)
// en leestekens tellen niet mee, zodat "Verdel Logistiek B.V." ook matcht
// met "Verdel Logistiek".
function normCompanyName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\b(b\.?\s?v\.?|n\.?\s?v\.?|v\.?o\.?f\.?|c\.?v\.?|holding|beheer|groep|group|international|internationaal|int\.?|& ?zn\.?|en ?zonen|& ?co\.?)(?=\s|$|\.)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// v32.3: contactpersoon-cellen zoals Perplexity/AI ze aanlevert netjes uit
// elkaar halen. Kan overweg met: "Naam (Functie)", meerdere personen
// gescheiden door , of /, markdown-links, bronkruimels aan het eind
// ("stagemarkt+1", "dnb"), e-mailadressen in de cel, en "geen naam
// gevonden"-teksten (die tellen als leeg).
function parseContactCell(raw) {
  let value = String(raw || '').trim()
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown-links -> alleen de tekst

  // Bronkruimels van AI-output aan het eind weghalen: losse woorden die
  // volledig uit kleine letters/cijfers bestaan (bijv. "vanthiel", "stl+1")
  const tokens = value.split(/\s+/)
  while (tokens.length > 1 && /^[a-z][a-z0-9.+-]{3,}$/.test(tokens[tokens.length - 1])) {
    tokens.pop()
  }
  value = tokens.join(' ').trim()

  const emails = value.match(/[^\s(),/]+@[^\s(),/]+\.[a-z]{2,}/gi) || []
  const noName = /geen\s+(specifieke\s+|persoonlijke\s+)?(naam|inkoop\S*|hr\S*)|niet\s+gevonden|^n\.?\s?a\.?$/i.test(value)

  // Personen splitsen op komma of / buiten haakjes ("HR/personeel" blijft heel)
  const parts = value.split(/\s*[,/]\s*(?![^(]*\))/).map(s => s.trim()).filter(Boolean)
  const first = parts[0] || ''
  const m = first.match(/^(.+?)\s*\(([^)]+)\)/)
  let name = (m ? m[1] : first).trim()
  const func = m ? m[2].trim() : ''
  // Geen echte naam? (leeg, "geen ... gevonden", alleen een e-mailadres of
  // een cel die met haakjes begint)
  if (noName || !name || /@/.test(name) || name.startsWith('(')) name = ''

  return { name, func, emails, multiple: parts.length > 1, cleaned: value }
}

// Robuuste parser voor geplakte/gelezen tekst (tab, ; of , met quotes).
// v32.3: herkent ook markdown-tabellen (| kolom | kolom |) zoals
// Perplexity en ChatGPT ze geven - scheidingsrijen (|---|) worden
// overgeslagen en markdown-links in cellen worden platte tekst.
function parseDelimited(text) {
  const rawLines = text.split(/\r?\n/).filter(l => l.trim() !== '')
  const pipey = rawLines.filter(l => (l.match(/\|/g) || []).length >= 2)
  if (rawLines.length > 0 && pipey.length >= rawLines.length * 0.8) {
    return rawLines
      .filter(l => !/^[\s|:-]+$/.test(l)) // |----|----| scheidingsrijen
      .map(l => l
        .replace(/^\s*\|/, '')
        .replace(/\|\s*$/, '')
        .split('|')
        .map(c => c.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim())
      )
      .filter(r => r.some(v => v !== ''))
  }

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
  if (/bron|source/.test(h)) return 'lead_source'
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
  // v32.2: "Naam (Functie)" of "Naam (Functie), Naam (Functie)" = contactpersonen
  if (share(v => /^[^,()]{2,60}\([^)]{2,60}\)/.test(v)) > 0.5) return 'contact_person'
  return 'skip'
}

// v40: standaardbron voor deze import - zelfde vrije-tekst-aanpak als Recruitment.jsx,
// met de bestaande vaste codes (cold/linkedin/referral) als suggestie zodat oude en
// nieuwe leads dezelfde waarden gebruiken.
const DEFAULT_SOURCE_SUGGESTIONS = ['cold', 'linkedin', 'referral']

export default function ImportLeadsModal({ isOpen, onClose, onImported, initialMode = 'import' }) {
  const { user, profile, isDemoMode } = useAuth()
  const { leadLists, createLeadList, fetchLeadLists } = useLeadLists()
  const toast = useToast()
  const fileRef = useRef(null)

  const [step, setStep] = useState(1)           // 1 = data, 2 = kolommen & preview, 3 = klaar
  const [mode, setMode] = useState('import')    // v31: 'import' (nieuwe leads) of 'enrich' (bestaande leads verrijken)
  const [existingLeads, setExistingLeads] = useState([])
  const [loadingExisting, setLoadingExisting] = useState(false)
  const [excludedRows, setExcludedRows] = useState(new Set()) // v31: rijen die je in het overzicht uitzet
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
  const [importSource, setImportSource] = useState('') // v40: bron die voor de hele import geldt
  const [sourceSuggestions, setSourceSuggestions] = useState(DEFAULT_SOURCE_SUGGESTIONS)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [fileName, setFileName] = useState('')
  // v42: projectsoort bepaalt automatisch het naamveld-label en het importgedrag
  // (i.p.v. losse checkboxes per import) - 'sales' is de standaard voor uitbellen/
  // acquisitie, 'backoffice' voor al gemaakte sales (monteur inplannen).
  const [newCampaignType, setNewCampaignType] = useState('sales')

  const isAdmin = profile?.role === 'admin'
  // v42: type van het gekozen (of nog aan te maken) project - bepaalt naamveld-label
  // en of geïmporteerde leads meteen als 'deal' binnenkomen (backoffice) of als 'new'.
  const selectedCampaign = campaigns.find(c => c.id === targetCampaignId)
  const effectiveCampaignType = targetCampaignId === '__new__' ? newCampaignType : (selectedCampaign?.type || 'sales')
  const isBackofficeProject = effectiveCampaignType === 'backoffice'
  const nameFieldLabel = effectiveCampaignType === 'backoffice' ? 'Naam klant' : (effectiveCampaignType === 'recruitment' ? 'Naam sollicitant' : 'Bedrijfsnaam')

  useEffect(() => {
    if (!isOpen || isDemoMode) return
    supabase.from('campaigns').select('id, name, type').is('deleted_at', null).order('name')
      .then(({ data }) => setCampaigns(data || []))
    supabase.from('teams').select('id, name').order('name')
      .then(({ data }) => setTeams(data || []))
    // v40: bronnen die al eerder gebruikt zijn, als suggestie bij "Standaardbron"
    supabase.from('leads').select('lead_source').not('lead_source', 'is', null).limit(3000)
      .then(({ data }) => {
        const byLower = new Map()
        DEFAULT_SOURCE_SUGGESTIONS.forEach(v => byLower.set(v.toLowerCase(), v))
        ;(data || []).forEach(d => {
          const v = (d.lead_source || '').trim()
          if (v && !byLower.has(v.toLowerCase())) byLower.set(v.toLowerCase(), v)
        })
        setSourceSuggestions(Array.from(byLower.values()).sort((a, b) => a.localeCompare(b)))
      })
  }, [isOpen, isDemoMode])

  function reset() {
    setStep(1); setPasteText(''); setRows([]); setMapping([]); setResult(null)
    setTargetCampaignId(''); setNewCampaignName(''); setNewCampaignTeamId(''); setNewCampaignType('sales')
    setTargetListId(''); setNewListName(''); setFileName(''); setHasHeader(true)
    setExcludedRows(new Set()); setImportSource('')
  }

  function close() { reset(); onClose() }

  // v32.1: open de wizard direct in de gevraagde modus (aparte knoppen
  // "Importeren" en "Verrijken" in plaats van een verstopte keuze in stap 1)
  useEffect(() => {
    if (isOpen) setMode(initialMode)
  }, [isOpen, initialMode])

  // v31: bij verrijken hebben we de bestaande leads nodig om op te matchen
  useEffect(() => {
    if (!isOpen || isDemoMode || mode !== 'enrich' || step !== 2) return
    let cancelled = false
    async function fetchAll() {
      setLoadingExisting(true)
      const all = []
      const PAGE = 1000
      for (let from = 0; from < 20000; from += PAGE) {
        const { data, error } = await supabase
          .from('leads')
          .select('id, name, phone, website, email, contact_person, function, address, house_number, postal_code, city, notes, extra_info1, extra_info2, extra_info3, decision_maker')
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error || !data) break
        all.push(...data)
        if (data.length < PAGE) break
      }
      if (!cancelled) { setExistingLeads(all); setLoadingExisting(false) }
    }
    fetchAll()
    return () => { cancelled = true }
  }, [isOpen, isDemoMode, mode, step])

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
    setExcludedRows(new Set())
    setStep(2)
  }

  function handlePaste() {
    if (!pasteText.trim()) { toast('Plak eerst je data in het veld', 'error'); return }
    loadRows(parseDelimited(pasteText))
  }

  // v33: "Herken met AI" - losse tekst (AI-proza, e-mails, notities) door de
  // Edge Function parse-paste laten structureren tot nette rijen
  const [aiParsing, setAiParsing] = useState(false)
  async function handleAiParse() {
    if (!pasteText.trim()) { toast('Plak eerst je tekst in het veld', 'error'); return }
    setAiParsing(true)
    try {
      const { data, error } = await supabase.functions.invoke('parse-paste', { body: { text: pasteText } })
      if (error) {
        let msg = error.message
        try {
          const body = await error.context?.json?.()
          if (body?.error) msg = body.error
        } catch { /* geen json */ }
        throw new Error(msg)
      }
      if (data?.error) throw new Error(data.error)
      const aiRows = data?.rows || []
      if (!aiRows.length) { toast('De AI kon geen bedrijven herkennen in deze tekst', 'error'); return }
      const COLS = [
        ['name', 'Bedrijfsnaam'], ['contact_person', 'Contactpersoon'], ['function', 'Functie'],
        ['email', 'E-mail'], ['phone', 'Telefoon'], ['website', 'Website'], ['city', 'Plaats'], ['notes', 'Notities']
      ].filter(([key]) => aiRows.some(r => (r[key] || '').toString().trim()))
      setRows([COLS.map(c => c[1]), ...aiRows.map(r => COLS.map(([key]) => (r[key] || '').toString()))])
      setMapping(COLS.map(([key]) => key))
      setHasHeader(true)
      setExcludedRows(new Set())
      setStep(2)
      toast(`${aiRows.length} bedrijven herkend - controleer het overzicht en bevestig`, 'success')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setAiParsing(false)
    }
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
        if (field === 'notes' || field === 'verrijking') lead.notes = lead.notes ? `${lead.notes} | ${value}` : value
        else if (field === 'website') lead.website = normalizeWebsite(value)
        else if (field === 'phone') lead.phone = cleanPhone(value)
        else if (field === 'decision_maker') lead.decision_maker = parseDecisionMaker(value)
        else if (field === 'sale_date') { const d = parseSaleDate(value); if (d) lead.sale_date = d }
        else if (field === 'contact_person') {
          // v32.3: ook bij import de contactpersoon-cel netjes uit elkaar halen
          const parsed = parseContactCell(value)
          if (parsed.name) lead.contact_person = parsed.name
          if (parsed.func && !lead.function) lead.function = parsed.func
          if (parsed.emails.length && !lead.email) lead.email = parsed.emails[0].toLowerCase()
          if (parsed.multiple && parsed.name) lead.notes = lead.notes ? `${lead.notes} | Contactpersonen: ${parsed.cleaned}` : `Contactpersonen: ${parsed.cleaned}`
        }
        else if (field.startsWith('extra_info')) {
          // Kopregel meenemen zodat je in de belmodus ziet wát dit was (bijv. "Branche: Bouw")
          const header = hasHeader ? (rows[0]?.[i] || '').trim() : ''
          lead[field] = header ? `${header}: ${value}` : value
        }
        else lead[field] = value
      })
      const rowNr = idx + (hasHeader ? 2 : 1)
      if (!lead.name && !lead.phone) return // volledig lege rij
      // v39: bedrijfsnaam is niet altijd bekend (particuliere/consumentenlijsten) -
      // val dan terug op de contactpersoon als naam, want leads.name mag niet leeg zijn.
      if (!lead.name && lead.contact_person) lead.name = lead.contact_person
      if (!lead.name) { errors.push(`Rij ${rowNr}: ${nameFieldLabel.toLowerCase()} of contactpersoon ontbreekt`); return }
      if (!lead.phone || lead.phone.replace(/\D/g, '').length < 8) { errors.push(`Rij ${rowNr}: geen geldig telefoonnummer`); return }
      if (seenPhones.has(lead.phone)) { errors.push(`Rij ${rowNr}: dubbel nummer (${lead.phone}) - overgeslagen`); return }
      seenPhones.add(lead.phone)
      leads.push(lead)
    })
    return { leads, errors }
  }, [dataRows, mapping, hasHeader, rows, nameFieldLabel])

  const mappingHasName = mapping.includes('name')
  const mappingHasContactPerson = mapping.includes('contact_person')
  const mappingHasPhone = mapping.includes('phone')
  // v39: bedrijfsnaam is niet altijd beschikbaar (bijv. particuliere/consumentenlijsten) -
  // contactpersoon mag 'm dan vervangen als identificerend naamveld.
  const mappingHasNameOrContact = mappingHasName || mappingHasContactPerson

  // ===== v31: VERRIJKEN - geplakte rijen matchen aan bestaande leads =====
  // Kolommen op "Negeren" doen hier bewust NIET mee: negeren = negeren.
  const enrichPlan = useMemo(() => {
    if (mode !== 'enrich') return { matches: [], unmatched: [], noNews: 0 }

    // Lookup-tabellen over de bestaande leads
    const byPhone = new Map(), byWeb = new Map(), byName = new Map()
    const nameCount = {}
    existingLeads.forEach(l => {
      const p = cleanPhone(l.phone)
      if (p && !byPhone.has(p)) byPhone.set(p, l)
      const w = (normalizeWebsite(l.website || '') || '').toLowerCase()
      if (w && !byWeb.has(w)) byWeb.set(w, l)
      const n = normCompanyName(l.name)
      if (n) {
        nameCount[n] = (nameCount[n] || 0) + 1
        if (!byName.has(n)) byName.set(n, l)
      }
    })

    const matches = []
    const unmatched = []
    let noNews = 0
    const seenLeadIds = new Set()

    dataRows.forEach((r, idx) => {
      // Rij -> object volgens de kolomtoewijzing (skip = overslaan)
      const row = {}
      mapping.forEach((field, i) => {
        if (field === 'skip') return
        const value = (r[i] || '').trim()
        if (!value) return
        if (field === 'notes') row.notes = row.notes ? `${row.notes} | ${value}` : value
        else if (field === 'website') row.website = normalizeWebsite(value)
        else if (field === 'phone') row.phone = cleanPhone(value)
        else if (field === 'decision_maker') row.decision_maker = parseDecisionMaker(value)
        else if (field === 'contact_person') {
          // v32.3: "Naam (Functie) / Naam (Functie) bronkruimel" netjes uit
          // elkaar halen; e-mailadressen in de cel gaan naar het e-mailveld
          const parsed = parseContactCell(value)
          if (parsed.name) row.contact_person = parsed.name
          if (parsed.func && !row.function) row.function = parsed.func
          if (parsed.emails.length && !row.email) row.email = parsed.emails[0].toLowerCase()
          if (parsed.multiple && (parsed.name || parsed.emails.length)) row.__alle_contacten = parsed.cleaned
        }
        else if (field === 'verrijking') {
          // v32.2: "Verrijking" wordt ALTIJD toegevoegd (gelabelde notitieregel),
          // ook als alle andere velden van de lead al gevuld zijn
          const header = hasHeader ? (rows[0]?.[i] || '').trim() : ''
          const line = header && !/^verrijking$/i.test(header) ? `${header}: ${value}` : value
          row.__verrijking = row.__verrijking ? [...row.__verrijking, line] : [line]
        }
        else if (field.startsWith('extra_info')) {
          const header = hasHeader ? (rows[0]?.[i] || '').trim() : ''
          row[field] = header ? `${header}: ${value}` : value
        }
        else row[field] = value
      })
      if (Object.keys(row).length === 0) return // lege rij
      const rowNr = idx + (hasHeader ? 2 : 1)

      // Matchen: telefoonnummer > website > bedrijfsnaam
      let lead = null, via = null
      if (row.phone && byPhone.has(row.phone)) { lead = byPhone.get(row.phone); via = 'telefoon' }
      if (!lead && row.website) {
        const w = String(row.website).toLowerCase()
        if (byWeb.has(w)) { lead = byWeb.get(w); via = 'website' }
      }
      if (!lead && row.name) {
        // v32.3: "Naam A / Naam B" - probeer de hele naam én beide varianten
        const variants = [...new Set([row.name, ...row.name.split('/')].map(normCompanyName).filter(Boolean))]
        for (const n of variants) {
          if (nameCount[n] > 1) { unmatched.push({ rowNr, name: row.name, reason: 'meerdere leads met deze naam - niet eenduidig' }); return }
          if (byName.has(n)) { lead = byName.get(n); via = 'naam'; break }
        }
      }
      if (!lead) { unmatched.push({ rowNr, name: row.name || row.phone || row.website || `rij ${rowNr}`, reason: 'geen bestaande lead gevonden' }); return }
      if (seenLeadIds.has(lead.id)) { unmatched.push({ rowNr, name: row.name || lead.name, reason: 'lead komt al eerder in je plak-data voor' }); return }

      // Alleen LEGE velden aanvullen - bestaande data blijft altijd staan
      const additions = {}
      ENRICHABLE.filter(f => f !== 'notes').forEach(f => {
        if (row[f] && !(lead[f] || '').toString().trim()) additions[f] = row[f]
      })
      if (row.decision_maker === true && lead.decision_maker !== true) additions.decision_maker = true

      // Notities: geplakte notitie alleen als het veld leeg is; stonden er
      // meerdere contactpersonen in één cel, dan komen die er als gelabelde
      // regel bij (overschrijft niets, dubbele regels worden overgeslagen)
      let newNotes = null
      if (row.notes && !(lead.notes || '').toString().trim()) newNotes = row.notes
      const alwaysLines = [
        ...(row.__alle_contacten ? [`Contactpersonen: ${row.__alle_contacten}`] : []),
        ...(row.__verrijking || [])
      ]
      for (const line of alwaysLines) {
        const current = newNotes ?? String(lead.notes || '')
        if (current.includes(line)) continue // niet twee keer dezelfde regel
        const base = newNotes ?? ((lead.notes || '').toString().trim() ? lead.notes : null)
        newNotes = base ? `${base}\n${line}` : line
      }
      if (newNotes !== null) additions.notes = newNotes

      if (Object.keys(additions).length === 0) { noNews++; return }
      seenLeadIds.add(lead.id)
      matches.push({ rowNr, lead, via, additions })
    })

    return { matches, unmatched, noNews }
  }, [mode, existingLeads, dataRows, mapping, hasHeader, rows])

  const enrichHasKeyColumn = mappingHasPhone || mappingHasName || mapping.includes('website')
  const activeEnrichCount = enrichPlan.matches.filter(m => !excludedRows.has(m.rowNr)).length

  async function runEnrich() {
    if (isDemoMode) { toast('Verrijken werkt niet in demo-modus', 'error'); return }
    const todo = enrichPlan.matches.filter(m => !excludedRows.has(m.rowNr))
    if (!todo.length) { toast('Geen leads om te verrijken', 'error'); return }
    setImporting(true)
    try {
      let enriched = 0
      const failures = []
      for (let i = 0; i < todo.length; i += 10) {
        const chunk = todo.slice(i, i + 10)
        const results = await Promise.all(chunk.map(m =>
          supabase.from('leads').update(m.additions).eq('id', m.lead.id).select('id')
        ))
        results.forEach((res, j) => {
          if (res.error || !res.data?.length) failures.push(chunk[j].lead.name)
          else enriched++
        })
      }
      setResult({
        mode: 'enrich',
        enriched,
        failures: failures.length,
        unmatched: enrichPlan.unmatched.length,
        noNews: enrichPlan.noNews,
        deselected: enrichPlan.matches.length - todo.length
      })
      setStep(3)
      onImported?.()
    } catch (err) {
      console.error('Verrijken mislukt:', err)
      toast(`Verrijken mislukt: ${err.message}`, 'error')
    } finally {
      setImporting(false)
    }
  }

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
            type: newCampaignType,
            description: `Aangemaakt bij import op ${new Date().toLocaleDateString('nl-NL')}`,
            created_by: user?.id,
            organization_id: profile?.organization_id ?? null
          })
          .select()
          .single()
        if (campErr || !camp?.id) throw new Error(campErr?.message || 'Project aanmaken mislukt')
        campaignId = camp.id
        // v23: team-koppeling via campaign_teams (meerdere teams mogelijk)
        if (newCampaignTeamId) {
          const { error: ctErr } = await supabase
            .from('campaign_teams')
            .insert({ campaign_id: campaignId, team_id: newCampaignTeamId })
          if (ctErr) throw ctErr
        }
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
          status: isBackofficeProject ? 'bruto_deal' : 'new',
          sale_date: isBackofficeProject ? (l.sale_date || new Date().toISOString()) : (l.sale_date || null),
          lead_list_id: listId,
          created_by: user?.id,
          organization_id: profile?.organization_id ?? null,
          lead_source: (l.lead_source || importSource || '').trim() || 'cold'
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
                {mode === 'enrich' ? 'Leads verrijken' : 'Leads importeren'}
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
                  {/* v31: wat wil je doen - nieuwe leads erbij, of bestaande aanvullen? */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[
                      { id: 'import', title: 'Nieuwe leads importeren', sub: 'Rijen worden als nieuwe leads aan een project toegevoegd.' },
                      { id: 'enrich', title: 'Bestaande leads verrijken', sub: 'Nieuwe info (beslissers, contactpersonen, e-mail...) wordt bij de juiste bestaande lead gezet.' }
                    ].map(m => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMode(m.id)}
                        style={{
                          flex: 1, padding: '14px', borderRadius: '12px', cursor: 'pointer', textAlign: 'left',
                          border: mode === m.id ? '1px solid var(--primary)' : '1px solid var(--border)',
                          background: mode === m.id ? 'rgba(59,130,246,0.12)' : 'var(--bg-elevated)'
                        }}
                      >
                        <div style={{ fontWeight: 900, fontSize: '0.9rem', color: mode === m.id ? 'var(--primary)' : 'var(--text-primary)' }}>{m.title}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.4 }}>{m.sub}</div>
                      </button>
                    ))}
                  </div>
                  {/* v42: eerst het project bepalen - bestaand kiezen of meteen een los nieuw project
                      aanmaken. Het projecttype (uitbellen/acquisitie of backoffice) bepaalt verderop
                      automatisch het naamveld-label en of leads als nieuw of als 'deal' binnenkomen -
                      geen losse checkboxes meer per import. */}
                  {mode === 'import' && (
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
                          <option value="">- Kies een bestaand project -</option>
                          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}{c.type === 'backoffice' ? ' (backoffice)' : ''}</option>)}
                          {isAdmin && <option value="__new__">+ Los nieuw project aanmaken...</option>}
                        </select>
                      </div>
                      {targetCampaignId === '__new__' && isAdmin && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => setNewCampaignType('sales')} className={`btn btn-sm ${newCampaignType === 'sales' ? 'btn-primary' : 'btn-outline'}`}>Uitbellen / acquisitie</button>
                            <button type="button" onClick={() => setNewCampaignType('backoffice')} className={`btn btn-sm ${newCampaignType === 'backoffice' ? 'btn-primary' : 'btn-outline'}`}>Backoffice (al gemaakte sales)</button>
                          </div>
                        </div>
                      )}
                      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Het team van het project mag op alle lijsten binnen dat project bellen. Een lijst zonder project is voor bellers onzichtbaar.
                      </p>
                      {isBackofficeProject && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--warning)', fontWeight: 700 }}>
                          Backoffice-project: leads komen binnen met status "Deal" en het naamveld hieronder heet "Naam klant". Map een kolom naar "Verkoopdatum/tijd (backoffice)" voor de juiste FIFO-volgorde.
                        </p>
                      )}
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

                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, marginBottom: '10px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                        <Sparkles size={15} style={{ color: 'var(--primary)' }} /> 3. Bron (optioneel)
                      </label>
                      <input
                        type="text"
                        list="import-source-suggestions"
                        value={importSource}
                        onChange={e => setImportSource(e.target.value)}
                        placeholder="bv. cold, linkedin, referral, beurs..."
                        style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-dark)', color: 'var(--text-primary)', fontWeight: 600 }}
                      />
                      <datalist id="import-source-suggestions">
                        {sourceSuggestions.map(s => <option key={s} value={s} />)}
                      </datalist>
                      <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        Geldt voor de hele import. Map hierboven een kolom op "Bron" als de bron per rij verschilt - die overschrijft dit veld dan per lead.
                      </p>
                    </div>
                  </div>
                  )}

                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 800, marginBottom: '8px', color: 'var(--text-primary)' }}>
                      <ClipboardPaste size={16} style={{ color: 'var(--primary)' }} /> Plakken uit Google Sheets of Excel
                    </label>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 10px 0' }}>
                      {mode === 'enrich'
                        ? 'Plak rijen met minimaal een bedrijfsnaam, telefoonnummer of website (om te matchen) plus de nieuwe info. Tabellen uit Perplexity of ChatGPT (met | strepen) kun je direct plakken - bronverwijzingen en "geen naam gevonden" worden automatisch opgeruimd. Alleen lege velden worden aangevuld.'
                        : 'Selecteer je rijen in Google Sheets of Excel (inclusief kopregel), kopieer ze (Cmd+C) en plak ze hieronder (Cmd+V). Tabellen uit Perplexity of ChatGPT (met | strepen) kunnen ook direct.'}
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
                    <button
                      onClick={handleAiParse}
                      disabled={!pasteText.trim() || aiParsing}
                      className="btn btn-outline btn-block"
                      title="Voor tekst zonder nette kolommen: een AI haalt de bedrijven en contactgegevens eruit. Alleen wat er letterlijk in de tekst staat wordt gebruikt."
                      style={{ marginTop: '8px', padding: '11px', fontWeight: 800, opacity: (pasteText.trim() && !aiParsing) ? 1 : 0.5 }}
                    >
                      <Sparkles size={15} /> {aiParsing ? 'AI leest je tekst...' : 'Geen nette tabel? Herken met AI'}
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
                                {FIELDS.map(f => <option key={f.id} value={f.id}>{f.id === 'name' ? nameFieldLabel : f.label}</option>)}
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

                  {/* Validatie-samenvatting (import) */}
                  {mode === 'import' && (
                    <>
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
                      {(!mappingHasNameOrContact || !mappingHasPhone) && (
                        <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontSize: '0.82rem', fontWeight: 700 }}>
                          Wijs minimaal een kolom toe aan {!mappingHasNameOrContact && `"${nameFieldLabel}" of "Contactpersoon"`}{!mappingHasNameOrContact && !mappingHasPhone && ' en '}{!mappingHasPhone && '"Telefoonnummer"'}.
                        </div>
                      )}
                    </>
                  )}

                  {/* v31: verrijk-overzicht - precies zien wat er bij welke lead bijkomt */}
                  {mode === 'enrich' && (
                    <>
                      {!enrichHasKeyColumn && (
                        <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontSize: '0.82rem', fontWeight: 700 }}>
                          Wijs minimaal een kolom toe aan "Bedrijfsnaam", "Telefoonnummer" of "Website" - daarmee zoek ik de juiste bestaande lead erbij.
                        </div>
                      )}
                      {loadingExisting ? (
                        <div style={{ padding: '16px', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem' }}>Bestaande leads laden om op te matchen...</div>
                      ) : enrichHasKeyColumn && (
                        <>
                          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '160px', padding: '14px', borderRadius: '12px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
                              <div style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--success)' }}>{activeEnrichCount}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>leads krijgen nieuwe info</div>
                            </div>
                            {enrichPlan.noNews > 0 && (
                              <div style={{ flex: 1, minWidth: '160px', padding: '14px', borderRadius: '12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                                <div style={{ fontWeight: 900, fontSize: '1.3rem', color: 'var(--text-muted)' }}>{enrichPlan.noNews}</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>rijen zonder nieuwe info - de gekozen velden zijn bij die leads al gevuld (bestaande data wordt nooit overschreven)</div>
                              </div>
                            )}
                            {enrichPlan.unmatched.length > 0 && (
                              <div style={{ flex: 2, minWidth: '240px', padding: '14px', borderRadius: '12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                                <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <AlertTriangle size={14} /> {enrichPlan.unmatched.length} rijen niet gematcht
                                </div>
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px', maxHeight: '70px', overflowY: 'auto' }}>
                                  {enrichPlan.unmatched.slice(0, 8).map((u, i) => <div key={i}>Rij {u.rowNr}: {u.name} - {u.reason}</div>)}
                                  {enrichPlan.unmatched.length > 8 && <div>… en {enrichPlan.unmatched.length - 8} meer</div>}
                                </div>
                              </div>
                            )}
                          </div>

                          {activeEnrichCount === 0 && (enrichPlan.noNews > 0 || enrichPlan.unmatched.length > 0) && (
                            <div style={{ padding: '12px 14px', borderRadius: '10px', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                              <strong style={{ color: 'var(--primary)' }}>Tip:</strong> controleer de kolom-toewijzing bovenaan. Staat een kolom met namen op "Extra info 1"? Kies dan <strong>"Contactpersoon"</strong> - naam en functie worden er automatisch uit gehaald. Wil je dat de info er hoe dan ook bijkomt, ook als de velden al gevuld zijn? Kies dan <strong>"Verrijking (altijd toevoegen)"</strong> - die komt als extra regel bij de notities van de lead.
                            </div>
                          )}

                          {enrichPlan.matches.length > 0 && (
                            <div style={{ border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                              <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                Dit komt erbij - vink uit wat je niet wilt
                              </div>
                              <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                {enrichPlan.matches.map(m => {
                                  const off = excludedRows.has(m.rowNr)
                                  return (
                                    <div key={m.rowNr} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', borderTop: '1px solid var(--border)', opacity: off ? 0.45 : 1 }}>
                                      <input
                                        type="checkbox"
                                        checked={!off}
                                        onChange={() => setExcludedRows(prev => {
                                          const next = new Set(prev)
                                          next.has(m.rowNr) ? next.delete(m.rowNr) : next.add(m.rowNr)
                                          return next
                                        })}
                                        style={{ width: '16px', height: '16px', marginTop: '3px', cursor: 'pointer', flexShrink: 0 }}
                                      />
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                                          {m.lead.name}
                                          <span style={{ marginLeft: '8px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--primary)', background: 'rgba(59,130,246,0.12)', padding: '2px 7px', borderRadius: '6px' }}>match op {m.via}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                                          {Object.entries(m.additions).map(([f, v]) => {
                                            // Bij notities alleen tonen wat er NIEUW bijkomt, niet de bestaande notities
                                            let disp = String(v)
                                            if (f === 'decision_maker') disp = 'ja'
                                            else if (f === 'website') disp = displayWebsite(v)
                                            else if (f === 'notes' && m.lead?.notes && disp.startsWith(m.lead.notes)) {
                                              disp = disp.slice(m.lead.notes.length).replace(/^\n+/, '')
                                            }
                                            return (
                                              <span key={f} style={{ fontSize: '0.72rem', fontWeight: 700, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: 'var(--success)', padding: '3px 8px', borderRadius: '8px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                + {(FIELDS.find(x => x.id === f)?.label || f).replace(' (ja/nee)', '').replace(' (altijd toevoegen)', '')}: {disp}
                                              </span>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={() => setStep(1)} className="btn btn-outline" style={{ padding: '13px 20px' }}><ArrowLeft size={16} /> Terug</button>
                    {mode === 'import' ? (
                      <button
                        onClick={runImport}
                        disabled={importing || !parsedLeads.leads.length || !mappingHasNameOrContact || !mappingHasPhone || !targetCampaignId || (targetCampaignId === '__new__' && !newCampaignName.trim()) || (!targetListId && !newListName.trim())}
                        className="btn btn-primary"
                        style={{ flex: 1, padding: '13px', fontWeight: 900, fontSize: '1rem', opacity: (importing || !parsedLeads.leads.length || !mappingHasNameOrContact || !mappingHasPhone || !targetCampaignId || (targetCampaignId === '__new__' && !newCampaignName.trim()) || (!targetListId && !newListName.trim())) ? 0.5 : 1 }}
                      >
                        {importing ? 'Bezig met importeren...' : `Importeer ${parsedLeads.leads.length} leads`}
                      </button>
                    ) : (
                      <button
                        onClick={runEnrich}
                        disabled={importing || loadingExisting || !enrichHasKeyColumn || activeEnrichCount === 0}
                        className="btn btn-primary"
                        style={{ flex: 1, padding: '13px', fontWeight: 900, fontSize: '1rem', opacity: (importing || loadingExisting || !enrichHasKeyColumn || activeEnrichCount === 0) ? 0.5 : 1 }}
                      >
                        {importing ? 'Bezig met verrijken...' : `Verrijk ${activeEnrichCount} lead${activeEnrichCount === 1 ? '' : 's'}`}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* ===== STAP 3: RESULTAAT ===== */}
              {step === 3 && result && result.mode === 'enrich' && (
                <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                  <CheckCircle2 size={54} style={{ color: 'var(--success)', marginBottom: '16px' }} />
                  <h3 style={{ color: 'var(--text-primary)', marginBottom: '8px', fontSize: '1.4rem' }}>Verrijken gelukt!</h3>
                  <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
                    <strong style={{ color: 'var(--success)' }}>{result.enriched} leads</strong> aangevuld met nieuwe info. Bestaande gegevens zijn niet overschreven.
                    {result.noNews > 0 && <><br />{result.noNews} rijen hadden niets nieuws (alles stond er al).</>}
                    {result.unmatched > 0 && <><br />{result.unmatched} rijen konden niet aan een bestaande lead gekoppeld worden.</>}
                    {result.deselected > 0 && <><br />{result.deselected} rijen door jou uitgevinkt en overgeslagen.</>}
                    {result.failures > 0 && <><br /><span style={{ color: 'var(--warning)' }}>{result.failures} leads konden niet bijgewerkt worden (geen rechten of inmiddels verwijderd).</span></>}
                  </p>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button onClick={() => { setStep(1); setPasteText(''); setRows([]); setResult(null); setExcludedRows(new Set()) }} className="btn btn-outline">Nog een keer verrijken</button>
                    <button onClick={close} className="btn btn-primary" style={{ fontWeight: 800 }}>Klaar</button>
                  </div>
                </div>
              )}

              {step === 3 && result && result.mode !== 'enrich' && (
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
