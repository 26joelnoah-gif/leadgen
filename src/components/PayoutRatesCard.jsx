import { useState, useEffect } from 'react'
import { Euro, Save, Target } from 'lucide-react'

// De uitbetalingstarieven waren tot nu toe alleen als constante aanwezig:
// er was geen scherm om ze te wijzigen, en ze stonden per browser in
// localStorage. Dit is het scherm dat er hoort te zijn.

export default function PayoutRatesCard({ settings, loading, onSave, toast }) {
  const [form, setForm] = useState(settings)
  const [saving, setSaving] = useState(false)

  // Waarden komen asynchroon uit de database, dus het formulier volgt ze
  // zodra ze binnen zijn.
  useEffect(() => { setForm(settings) }, [settings])

  const dirty =
    Number(form.dealValue) !== Number(settings.dealValue) ||
    Number(form.appointmentValue) !== Number(settings.appointmentValue) ||
    Number(form.monthlyTarget) !== Number(settings.monthlyTarget)

  async function handleSave() {
    if (Number(form.dealValue) < 0 || Number(form.appointmentValue) < 0 || Number(form.monthlyTarget) < 0) {
      toast('Bedragen kunnen niet negatief zijn', 'error')
      return
    }

    setSaving(true)
    const { error } = await onSave({
      dealValue: Number(form.dealValue),
      appointmentValue: Number(form.appointmentValue),
      monthlyTarget: Number(form.monthlyTarget),
    })
    setSaving(false)

    if (error) toast(`Opslaan mislukt: ${error.message}`, 'error')
    else toast('Tarieven opgeslagen voor het hele team', 'success')
  }

  const field = (key, label, prefix) => (
    <label className="rates-field">
      <span className="rates-field__label">{label}</span>
      <span className="rates-field__input">
        {prefix && <span className="rates-field__prefix">{prefix}</span>}
        <input
          type="number"
          min="0"
          step={key === 'monthlyTarget' ? '1' : '0.5'}
          value={form[key] ?? ''}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          disabled={loading || saving}
          className="form-control"
        />
      </span>
    </label>
  )

  return (
    <div className="card mt-8">
      <div className="flex items-center gap-2 mb-2">
        <Euro size={18} style={{ color: 'var(--secondary)' }} />
        <h2 className="text-xl font-bold">Uitbetalingstarieven</h2>
      </div>
      <p className="text-sm text-muted mb-4">
        Geldt voor het hele team. Reeds goedgekeurde uitbetalingen houden het
        tarief dat op dat moment gold.
      </p>

      <div className="rates-grid">
        {field('dealValue', 'Per deal', '€')}
        {field('appointmentValue', 'Per afspraak', '€')}
        {field('monthlyTarget', 'Maanddoel (deals)', null)}
      </div>

      <div className="flex items-center gap-3 mt-4" style={{ flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={!dirty || saving || loading}
          className="btn btn-primary"
        >
          <Save size={16} /> {saving ? 'Opslaan…' : 'Tarieven opslaan'}
        </button>
        {dirty && !saving && (
          <span className="text-sm" style={{ color: 'var(--secondary)' }}>
            Niet-opgeslagen wijzigingen
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 text-sm text-muted">
        <Target size={14} />
        <span>
          Een beller met 10 deals en 20 afspraken verdient hiermee{' '}
          <strong style={{ color: 'var(--text-main)' }}>
            €{(10 * Number(form.dealValue || 0) + 20 * Number(form.appointmentValue || 0)).toFixed(2)}
          </strong>
        </span>
      </div>
    </div>
  )
}
