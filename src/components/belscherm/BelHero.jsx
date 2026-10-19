// v149: kop van het nieuwe belscherm (design v2, canvas "ReachConnect
// design-upgrade", artboard 1). Alleen opmaak: alle data en handlers komen als
// props uit WorkInterface. Hier staat GEEN supabase-call en geen status-logica.
import { Phone, Mail, MapPin, Globe, ShieldCheck, Clock } from 'lucide-react'
import { normalizeWebsite } from '../../utils/urlUtils'
import { kvkZoekUrl, rechtsvormLabel } from '../../lib/compliance'
import { relativeDue } from '../../lib/followUps'

// Waarom bel je deze lead? Kort zinnetje bovenaan.
function redenVan(lead) {
  if (!lead) return null
  const wanneer = lead.next_contact_date ? relativeDue(lead.next_contact_date) : ''
  switch (lead.status) {
    case 'terugbelafspraak': return { kleur: 'var(--warning)', bg: 'var(--warning-bg)', titel: 'Terugbelafspraak', tekst: wanneer }
    case 'later_bellen': return { kleur: 'var(--warning)', bg: 'var(--warning-bg)', titel: 'Later bellen', tekst: wanneer }
    case 'onjuiste_timing': return { kleur: 'var(--warning)', bg: 'var(--warning-bg)', titel: 'Kwam toen niet uit', tekst: wanneer }
    case 'mail_verstuurd': return { kleur: 'var(--info)', bg: 'var(--info-bg)', titel: 'Opvolgen na mail', tekst: wanneer }
    case 'offerte_verzonden': return { kleur: 'var(--info)', bg: 'var(--info-bg)', titel: 'Offerte verstuurd', tekst: wanneer }
    case 'geen_gehoor':
    case 'voicemail': return { kleur: 'var(--text-secondary)', bg: 'var(--bg-elevated)', titel: 'Eerder niet opgenomen', tekst: lead.geen_gehoor_reeks ? `${lead.geen_gehoor_reeks}x geen gehoor` : '' }
    case 'new': return { kleur: 'var(--accent)', bg: 'var(--accent-soft)', titel: 'Nieuwe lead', tekst: 'nog niet eerder gebeld' }
    default: return null
  }
}

export default function BelHero({ lead, magBellen, isMobile, kopieKnop, acties }) {
  if (!lead) return null
  const reden = redenVan(lead)
  const adres = [lead.address, lead.house_number, lead.postal_code, lead.city].filter(Boolean).join(' ')
  const sub = [lead.contact_person, lead.function, lead.city].filter(Boolean).join(' · ')
  const website = lead.website ? (normalizeWebsite(lead.website) || lead.website) : null
  const rv = lead.rechtsvorm && lead.rechtsvorm !== 'onbekend' ? rechtsvormLabel(lead.rechtsvorm) : null

  return (
    <div className="bh">
      {reden && (
        <div className="bh-reden" style={{ '--rk': reden.kleur, background: reden.bg }}>
          <Clock size={16} aria-hidden="true" />
          <strong>{reden.titel}</strong>
          {reden.tekst && <span>{reden.tekst}</span>}
        </div>
      )}

      <div className="bh-kaart">
        <div className="bh-rij">
          <div className="bh-wie">
            <div className="bh-naamrij">
              <h1 className="bh-naam">{lead.name || 'Naam onbekend'}</h1>
              {rv && <span className="bh-chip">{rv}</span>}
            </div>
            {sub && <div className="bh-sub">{sub}</div>}
          </div>
          <div className="bh-nummer">
            {magBellen ? (
              <>
                <span className="bh-tel">{lead.phone || 'Geen nummer'}</span>
                {lead.phone && kopieKnop}
              </>
            ) : (
              <span className="bh-verborgen" title="Zie het blok hieronder">Nummer verborgen</span>
            )}
          </div>
        </div>

        <div className="bh-knoppen">
          {!isMobile && magBellen && lead.phone && (
            <a href={`tel:${lead.phone}`} className="bh-bel"><Phone size={18} aria-hidden="true" /> Bellen</a>
          )}
          {lead.email && <a href={`mailto:${lead.email}`} className="bh-knop" title={lead.email}><Mail size={15} aria-hidden="true" /> Mail</a>}
          {adres && (
            <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(adres)}`} target="_blank" rel="noopener noreferrer" className="bh-knop" title={adres}>
              <MapPin size={15} aria-hidden="true" /> Route
            </a>
          )}
          {website && (
            <a href={website} target="_blank" rel="nofollow noopener noreferrer" referrerPolicy="no-referrer" className="bh-knop" title={lead.website}>
              <Globe size={15} aria-hidden="true" /> Website
            </a>
          )}
          {lead.name && (
            <a href={kvkZoekUrl(lead.name)} target="_blank" rel="noopener noreferrer" className="bh-knop" title="Zoek op kvk.nl">
              <ShieldCheck size={15} aria-hidden="true" /> KvK
            </a>
          )}
          <span className="bh-spacer" />
          {acties}
        </div>
      </div>
    </div>
  )
}
