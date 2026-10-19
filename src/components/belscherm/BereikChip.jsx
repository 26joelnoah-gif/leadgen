// v150: "Nu goed bereik" in de kopbalk van het belscherm, op basis van hoe
// vaak mensen in dit uur opnemen (eigen cijfers, laatste 6 weken).
import { Signal } from 'lucide-react'
import { useBereik } from '../../hooks/useBereik'

export default function BereikChip() {
  const { nu, besteUren } = useBereik()
  if (!nu?.oordeel) return null
  const pct = Math.round(nu.kans * 100)
  const tip = besteUren.length ? ` Beste uren: ${besteUren.map(u => `${u}:00`).join(' en ')}.` : ''
  return (
    <span className="bereik-chip" style={{ color: nu.oordeel.kleur, background: nu.oordeel.bg }}
      title={`In dit uur neemt ${pct}% op (laatste 6 weken).${tip}`}>
      <Signal size={14} aria-hidden="true" /> {nu.oordeel.label} <span className="bereik-pct">{pct}%</span>
    </span>
  )
}
