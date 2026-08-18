import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, X, AlertTriangle, CheckCircle2, FileText, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { parseCSV, buildLeads, IMPORT_FIELDS, normalizePhone } from '../utils/importUtils'
import LoadingSpinner from './LoadingSpinner'

const BATCH_SIZE = 200

export default function ImportLeadsModal({ open, onClose, leadLists, onImported, toast }) {
  const { user, profile, isDemoMode } = useAuth()

  const [step, setStep] = useState('upload')   // upload -> mapping -> done
  const [fileName, setFileName] = useState('')
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [existingPhones, setExistingPhones] = useState([])
  const [targetList, setTargetList] = useState('')
  const [newListName, setNewListName] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const { valid, problems } = useMemo(() => {
    if (!parsed) return { valid: [], problems: [] }
    return buildLeads(parsed.rows, mapping, { existingPhones })
  }, [parsed, mapping, existingPhones])

  // Zonder tijdslimiet kan een trage of onbereikbare verbinding het hele
  // importscherm op de spinner laten staan.
  async function lookupExistingPhones() {
    if (isDemoMode) return []
    try {
      const query = supabase.from('leads').select('phone').is('deleted_at', null)
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('tijdslimiet')), 8000))
      const { data, error } = await Promise.race([query, timeout])
      if (error) throw error
      return (data || []).map(r => r.phone).filter(Boolean)
    } catch (err) {
      console.warn('Dubbelcheck overgeslagen:', err.message)
      return []
    }
  }

  function reset() {
    setStep('upload'); setParsed(null); setMapping({}); setFileName('')
    setTargetList(''); setNewListName(''); setResult(null); setExistingPhones([])
  }

  function handleClose() { reset(); onClose() }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setFileName(file.name)

    try {
      const text = await file.text()
      const p = parseCSV(text)

      if (p.headers.length === 0) {
        toast('Geen kolommen gevonden in dit bestand', 'error')
        setBusy(false)
        return
      }

      // Bestaande nummers ophalen om dubbelen te herkennen. RLS beperkt dit
      // tot wat deze gebruiker sowieso mag zien. Deze controle is een extra,
      // geen voorwaarde: als de query faalt of blijft hangen gaat de import
      // gewoon door, alleen zonder waarschuwing voor al bestaande nummers.
      setExistingPhones(await lookupExistingPhones())

      setParsed(p)
      setMapping(p.mapping)
      setStep('mapping')
    } catch (err) {
      toast(`Bestand lezen mislukt: ${err.message}`, 'error')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  function setColumn(colIndex, field) {
    setMapping(prev => {
      const next = { ...prev }
      // Eén veld kan maar aan één kolom hangen.
      Object.keys(next).forEach(k => { if (next[k] === field && k !== String(colIndex)) delete next[k] })
      if (field) next[colIndex] = field
      else delete next[colIndex]
      return next
    })
  }

  async function runImport() {
    if (valid.length === 0) {
      toast('Geen bruikbare regels om te importeren', 'error')
      return
    }
    setBusy(true)

    try {
      let listId = targetList

      if (!listId && newListName.trim()) {
        const { data, error } = await supabase
          .from('lead_lists')
          .insert({
            name: newListName.trim(),
            created_by: profile?.id ?? user?.id ?? null,
            organization_id: profile?.organization_id ?? null,
          })
          .select()
          .single()
        if (error) throw error
        listId = data.id
      }

      const rows = valid.map(l => ({
        ...l,
        status: 'new',
        call_status: 'available',
        created_by: user?.id ?? null,
        lead_list_id: listId || null,
        organization_id: profile?.organization_id ?? null,
        lead_source: l.lead_source || 'cold',
      }))

      // In blokken invoegen; één insert van duizenden rijen loopt tegen
      // limieten van de API aan.
      let inserted = 0
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE)
        const { error } = await supabase.from('leads').insert(chunk)
        if (error) throw new Error(`Blok ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
        inserted += chunk.length
      }

      setResult({ inserted, skipped: problems.filter(p => !p.warning).length, listId })
      setStep('done')
      onImported?.()
      toast(`${inserted} leads geïmporteerd`, 'success')
    } catch (err) {
      toast(`Import mislukt: ${err.message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  const previewRows = parsed?.rows.slice(0, 5) || []
  const hardProblems = problems.filter(p => !p.warning)
  const warnings = problems.filter(p => p.warning)
  const canImport = valid.length > 0 && (targetList || newListName.trim())

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="import-overlay" onClick={handleClose}
      >
        <motion.div
          initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="import-modal" onClick={e => e.stopPropagation()}
        >
          <div className="import-modal__head">
            <div className="flex items-center gap-2">
              <Upload size={18} style={{ color: 'var(--primary)' }} />
              <h2 className="text-xl font-bold">Leads importeren</h2>
            </div>
            <button onClick={handleClose} className="btn btn-sm btn-icon btn-ghost" aria-label="Sluiten">
              <X size={18} />
            </button>
          </div>

          <div className="import-modal__body">
            {busy && <div className="py-8 flex justify-center"><LoadingSpinner size="large" /></div>}

            {/* --- STAP 1: bestand kiezen --- */}
            {!busy && step === 'upload' && (
              <div>
                <p className="text-sm text-muted mb-4">
                  Kies een CSV-bestand. Puntkomma en komma als scheidingsteken
                  worden allebei herkend, net als bedrijfsnamen met een komma erin.
                  Exporteer vanuit Excel als <strong>CSV</strong>.
                </p>
                <label className="import-drop">
                  <FileText size={28} style={{ color: 'var(--text-muted)' }} />
                  <span className="font-bold">Klik om een bestand te kiezen</span>
                  <span className="text-sm text-muted">.csv of .txt</span>
                  <input type="file" accept=".csv,.txt,text/csv" onChange={handleFile} hidden />
                </label>
              </div>
            )}

            {/* --- STAP 2: kolommen koppelen --- */}
            {!busy && step === 'mapping' && parsed && (
              <div>
                <p className="text-sm text-muted mb-4">
                  <strong>{fileName}</strong> — {parsed.rows.length} regels gevonden.
                  Controleer of de kolommen goed staan.
                </p>

                <div className="table-scroll mb-4">
                  <table className="import-table">
                    <thead>
                      <tr>
                        {parsed.headers.map((h, i) => (
                          <th key={i}>
                            <div className="import-th">
                              <span className="import-th__orig">{h || `Kolom ${i + 1}`}</span>
                              <select
                                className="form-control"
                                value={mapping[i] || ''}
                                onChange={e => setColumn(i, e.target.value)}
                              >
                                <option value="">— niet importeren —</option>
                                {IMPORT_FIELDS.map(f => (
                                  <option key={f.key} value={f.key}>{f.label}</option>
                                ))}
                              </select>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, r) => (
                        <tr key={r}>
                          {parsed.headers.map((_, c) => (
                            <td key={c} className={mapping[c] ? '' : 'is-ignored'}>
                              {row[c] || ''}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="import-summary">
                  <div className="import-summary__item">
                    <CheckCircle2 size={16} style={{ color: 'var(--success)' }} />
                    <strong>{valid.length}</strong> klaar om te importeren
                  </div>
                  {hardProblems.length > 0 && (
                    <div className="import-summary__item">
                      <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />
                      <strong>{hardProblems.length}</strong> overgeslagen
                    </div>
                  )}
                </div>

                {hardProblems.length > 0 && (
                  <details className="import-problems">
                    <summary>Waarom zijn er {hardProblems.length} overgeslagen?</summary>
                    <ul>
                      {hardProblems.slice(0, 50).map((p, i) => (
                        <li key={i}>Regel {p.line}: {p.reason}</li>
                      ))}
                    </ul>
                    {hardProblems.length > 50 && (
                      <p className="text-sm text-muted">…en nog {hardProblems.length - 50}.</p>
                    )}
                  </details>
                )}

                {warnings.length > 0 && (
                  <p className="text-sm text-muted mt-2">
                    {warnings.length} veld{warnings.length === 1 ? '' : 'en'} genegeerd, de rest van die regels is wel geïmporteerd.
                  </p>
                )}

                <div className="import-target mt-4">
                  <label className="rates-field">
                    <span className="rates-field__label">In bestaande lijst</span>
                    <select
                      className="form-control"
                      value={targetList}
                      onChange={e => { setTargetList(e.target.value); if (e.target.value) setNewListName('') }}
                    >
                      <option value="">— kies —</option>
                      {leadLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                  </label>

                  <span className="import-target__or">of</span>

                  <label className="rates-field">
                    <span className="rates-field__label">Nieuwe lijst aanmaken</span>
                    <input
                      className="form-control"
                      placeholder="bijv. Horeca Utrecht maart"
                      value={newListName}
                      onChange={e => { setNewListName(e.target.value); if (e.target.value) setTargetList('') }}
                    />
                  </label>
                </div>
              </div>
            )}

            {/* --- STAP 3: klaar --- */}
            {!busy && step === 'done' && result && (
              <div className="text-center py-4">
                <CheckCircle2 size={48} style={{ color: 'var(--success)' }} />
                <h3 className="text-xl font-bold mt-3 mb-2">{result.inserted} leads toegevoegd</h3>
                <p className="text-sm text-muted">
                  {result.skipped > 0
                    ? `${result.skipped} regels overgeslagen wegens dubbelen of ontbrekende gegevens.`
                    : 'Alle regels zijn verwerkt.'}
                </p>
              </div>
            )}
          </div>

          <div className="import-modal__foot">
            {step === 'mapping' && (
              <>
                <button onClick={reset} className="btn btn-ghost">Ander bestand</button>
                <button onClick={runImport} disabled={!canImport || busy} className="btn btn-primary">
                  {valid.length} leads importeren <ArrowRight size={16} />
                </button>
              </>
            )}
            {step === 'done' && (
              <>
                <button onClick={reset} className="btn btn-ghost">Nog een bestand</button>
                <button onClick={handleClose} className="btn btn-primary">Klaar</button>
              </>
            )}
            {step === 'upload' && (
              <button onClick={handleClose} className="btn btn-ghost">Annuleren</button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
