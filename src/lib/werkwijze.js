// v152 (21-10-2026): werkwijze voor bellers.
//  - 'bord' = de beller kiest zelf leads op de pagina Leads (bord, lijst, kaart)
//  - 'lvl'  = lead voor lead: de beller krijgt de volgende lead uit de
//             wachtrij (claim_next_lead) en kan niet zelf leads uitzoeken
// Per project: campaigns.werkwijze (standaard 'bord').
// Per medewerker kan een admin het overrulen: profiles.werkwijze
// (null = volg het project). Admin en manager werken altijd met het bord,
// zij moeten overzicht houden.
// Let op: dit staat los van campaigns.board_view_enabled. Die vlag bepaalt
// ook de eigenaar-regels (v79/v144) en blijft dus gewoon staan.
export const WERKWIJZEN = [
  { id: 'bord', label: 'Bord', kort: 'Bord', uitleg: 'Bellers kiezen zelf leads op het bord of in de lijst' },
  { id: 'lvl', label: 'Lead voor lead', kort: 'LVL', uitleg: 'Bellers krijgen steeds de volgende lead, zonder zelf te kiezen' },
]

export function werkwijzeLabel(id, kort = false) {
  const w = WERKWIJZEN.find(x => x.id === id) || WERKWIJZEN[0]
  return kort ? w.kort : w.label
}

export function isBeheerRol(profile) {
  return profile?.role === 'admin' || profile?.role === 'manager'
}

// Welke werkwijze geldt voor deze medewerker in dit project?
export function werkwijzeVoor(profile, campaign) {
  if (isBeheerRol(profile)) return 'bord'
  if (profile?.werkwijze === 'lvl' || profile?.werkwijze === 'bord') return profile.werkwijze
  return campaign?.werkwijze === 'lvl' ? 'lvl' : 'bord'
}
