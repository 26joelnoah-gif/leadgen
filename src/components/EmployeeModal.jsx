import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, UserPlus, Mail, Lock, Shield } from 'lucide-react'

// fixedRole: verberg de rolkeuze en gebruik altijd deze rol (bijv. 'employee'
// wanneer een manager een beller toevoegt). title: kop van de modal.
export default function EmployeeModal({ isOpen, onClose, onAdd, fixedRole = null, title = 'Nieuwe Medewerker' }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('employee')
  const [loading, setLoading] = useState(false)

  // v30: leeg de velden bij elk openen, zodat er nooit gegevens van een
  // vorige (mislukte) poging of van de ingelogde gebruiker blijven staan.
  useEffect(() => {
    if (isOpen) {
      setName('')
      setEmail('')
      setPassword('')
      setRole('employee')
    }
  }, [isOpen])

  if (!isOpen) return null

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name || !email || !password) return
    setLoading(true)
    await onAdd({ name, email, password, role: fixedRole || role })
    setName('')
    setEmail('')
    setPassword('')
    setRole('employee')
    setLoading(false)
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-overlay"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="modal glass-panel"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '450px' }}
      >
        <div className="modal-header">
          <h2><UserPlus size={18} /> {title}</h2>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* v30: autoComplete uit - dit formulier maakt een account aan voor
            iemand anders; de browser mag hier nooit de eigen inloggegevens
            van de ingelogde gebruiker invullen. */}
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="form-group">
            <label><Mail size={14} /> Naam</label>
            <input
              type="text"
              name="nieuwe-beller-naam"
              autoComplete="off"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Volledige naam"
              required
            />
          </div>

          <div className="form-group">
            <label><Mail size={14} /> Email</label>
            <input
              type="email"
              name="nieuwe-beller-email"
              autoComplete="off"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@voorbeeld.nl"
              required
            />
          </div>

          <div className="form-group">
            <label><Lock size={14} /> Wachtwoord</label>
            <input
              type="password"
              name="nieuwe-beller-wachtwoord"
              autoComplete="new-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimaal 6 tekens"
              minLength={6}
              required
            />
          </div>

          {!fixedRole && (
            <div className="form-group">
              <label><Shield size={14} /> Rol</label>
              <select value={role} onChange={e => setRole(e.target.value)}>
                <option value="employee">Beller (medewerker)</option>
                <option value="backoffice">Backoffice</option>
                <option value="manager">Manager</option>
                <option value="recruiter">Recruiter</option>
                <option value="admin">Admin</option>
              </select>
              {role === 'manager' && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Koppel de manager na het aanmaken aan projecten via de knop "Projecten" op zijn kaart.
                </p>
              )}
              {role === 'recruiter' && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Er wordt automatisch een sollicitatieproject "Sollicitanten" voor deze recruiter aangemaakt.
                </p>
              )}
              {role === 'backoffice' && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                  Belt gemaakte sales na om de monteur in te plannen. Koppel deze medewerker net als een beller aan een project/team zodat hij de sales van dat project ziet.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button type="button" className="btn btn-outline" onClick={onClose} style={{ flex: 1 }}>
              Annuleren
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>
              {loading ? 'Toevoegen...' : 'Toevoegen'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}
