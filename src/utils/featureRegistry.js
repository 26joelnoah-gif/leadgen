// v44: centrale lijst van "functies" per rol - de enige plek die weet wat een
// account daadwerkelijk kan zien/doen. Wordt gebruikt door zowel de tutorial
// (OnboardingTutorial) als de "nieuwe functie beschikbaar"-melding
// (NewFeatureNotice), zodat die twee nooit uit sync kunnen raken: wat de
// tutorial toont is precies wat ooit een "nieuwe functie"-popup kan geven.
//
// Belangrijk: dit bestand filtert per individueel account, niet alleen per
// rol - een manager met kpi_only ziet minder dan een manager met alle
// rechten aan, en een beller ziet alleen de afboekredenen die admin actief
// heeft gezet. Zie FlowSettingsEditor.jsx (FLOW_GROUPS) en WorkInterface.jsx
// (dispositions/customButtons) voor de bronlogica die hier gespiegeld wordt.

import { getStatusDetails } from './statusUtils'

// Exact dezelfde basissets als WorkInterface.jsx gebruikt om de belknoppen
// te bouwen (zie de `dispositions`-const daar). Bewust hier gedupliceerd
// als expliciete lijst i.p.v. afgeleid van FLOW_GROUPS, want die laatste is
// de instellingen-indeling, niet de daadwerkelijke knoppenset per rol.
const CALLER_BASE_DISPOSITIONS = [
  'deal', 'bruto_deal', 'afspraak_gemaakt', 'terugbelafspraak', 'later_bellen',
  'geen_gehoor', 'verkeerd_nummer', 'geen_interesse', 'onjuiste_timing', 'blacklist'
]
const BACKOFFICE_BASE_DISPOSITIONS = [
  'monteur_ingepland', 'wil_annuleren', 'terugbelafspraak', 'later_bellen', 'geen_gehoor', 'verkeerd_nummer'
]

function dispositionFeatures(types, activeTypes, isRecruitment = false) {
  return types
    .filter(t => activeTypes.includes(t))
    .map(t => {
      const details = getStatusDetails(t, isRecruitment)
      return {
        key: `disp_${t}`,
        group: 'Afboekredenen',
        label: details.label,
        description: details.description || `Afboeken op "${details.label}".`
      }
    })
}

function customDispositionFeatures(customs, activeTypes) {
  return (customs || [])
    .filter(c => c.is_active && activeTypes.includes(c.base_status))
    .map(c => ({
      key: `custom_${c.id}`,
      group: 'Afboekredenen',
      label: c.label,
      description: `Eigen afboekreden - telt mee als "${getStatusDetails(c.base_status).label}".`
    }))
}

const ADMIN_FEATURES = [
  { key: 'adm_users', group: 'Team', label: 'Gebruikersbeheer', description: 'Accounts aanmaken, rollen en rechten instellen, wachtwoorden resetten, accounts activeren/deactiveren.' },
  { key: 'adm_projects', group: 'Leads', label: 'Projecten & Leads', description: 'Projecten aanmaken, leads importeren of verrijken, projectinstellingen (managers/teams/wachtrij) beheren.' },
  { key: 'adm_flows', group: 'Leads', label: 'Flows & afboekredenen', description: 'Instellen wat er gebeurt na elke afboekreden, en eigen afboekredenen toevoegen.' },
  { key: 'adm_move', group: 'Leads', label: 'Leads verplaatsen of terugzetten', description: 'Leads handmatig naar een andere lijst zetten, of terug de wachtrij in.' },
  { key: 'adm_enrich', group: 'Leads', label: 'AI-verrijking', description: 'Leads automatisch aanvullen met bedrijfsinfo.' },
  { key: 'adm_reports', group: 'Rapportage', label: 'Rapportage', description: 'Volledige rapportage met filters op elk team en elke beller.' },
  { key: 'adm_payouts', group: 'Financieel', label: 'Payouts', description: 'Uitbetalingen per beller berekenen, tarieven per project instellen.' },
  { key: 'adm_telemetry', group: 'Overig', label: 'Telemetrie', description: 'Activiteit en ingelogde tijd per gebruiker.' },
  { key: 'adm_kanban', group: 'Recruitment', label: 'Kanban-bord', description: 'Sollicitanten-pipeline over alle recruitment-projecten heen.' },
  { key: 'adm_leaderboard', group: 'Overig', label: 'Leaderboard & live feed', description: 'XP-ranglijst en live activiteit van alle bellers.' },
  { key: 'adm_chat', group: 'Overig', label: 'Chatkanalen', description: 'Kanalen per project beheren en leden toevoegen of verwijderen.' }
]

function getManagerFeatures(profile) {
  const kpiOnly = !!profile.kpi_only
  const features = [
    { key: 'mgr_stats', group: 'Basis', label: 'Statistieken per beller', description: 'Gesprekken, beltijd, afspraken en deals per beller op "Mijn Projecten".' },
    { key: 'mgr_trends', group: 'Basis', label: 'Trends', description: 'Verloop van resultaten over tijd.' },
    { key: 'mgr_reports', group: 'Basis', label: 'Rapportage', description: 'Uitgebreide rapportage-pagina, gefilterd op jouw team.' }
  ]
  if (!kpiOnly) {
    features.push(
      { key: 'mgr_calls', group: 'Basis', label: 'Alle gesprekken', description: 'Elk gesprek van je team, met notitie en afboekreden.' },
      { key: 'mgr_results', group: 'Basis', label: 'Resultaten', description: 'Afspraken, deals, geen interesse en blacklist van je projecten.' },
      { key: 'mgr_team', group: 'Basis', label: 'Team & projecten', description: 'Overzicht van je projecten en welke bellers eraan gekoppeld zijn.' }
    )
  }
  if (profile.can_manage_leads) {
    features.push({ key: 'mgr_import', group: 'Leads', label: 'Leads importeren en verrijken', description: 'Nieuwe leads toevoegen aan een project, of bestaande verrijken met extra info.' })
    if (!kpiOnly) features.push({ key: 'mgr_move', group: 'Leads', label: 'Leads verplaatsen of opnieuw laten bellen', description: 'Leads handmatig naar een andere lijst zetten, of terugzetten in de wachtrij.' })
  }
  if (profile.can_export_data !== false) {
    features.push({ key: 'mgr_export', group: 'Leads', label: 'Export CSV', description: 'Resultaten van je projecten downloaden als CSV.' })
  }
  if (profile.can_view_rates) {
    features.push({ key: 'mgr_rates', group: 'Financieel', label: 'Tarieven en kosten inzien', description: 'Kosten per project en per beller, naast de resultaten.' })
  }
  if (profile.can_manage_team !== false && !kpiOnly) {
    features.push({ key: 'mgr_assign', group: 'Team', label: 'Bellers toewijzen', description: 'Bellers koppelen aan of loskoppelen van je projecten.' })
  }
  if (profile.can_manage_queue) {
    features.push({ key: 'mgr_queue', group: 'Team', label: 'Wachtrij-modus beheren', description: 'Instellen hoe leads verdeeld worden binnen een project (bijv. "beste leads eerst").' })
  }
  if (profile.can_edit_flows && !kpiOnly) {
    features.push({ key: 'mgr_flows', group: 'Flows', label: 'Flows aanpassen', description: 'Bepalen wat er gebeurt na elke afboekreden, en eigen afboekredenen aanmaken.' })
  }
  return features
}

const RECRUITER_FEATURES_BASE = [
  { key: 'rec_pipeline', group: 'Sollicitanten', label: 'Sollicitanten-bord', description: 'Kanban-overzicht van elke fase in de sollicitatieprocedure.' },
  { key: 'rec_call', group: 'Bellen', label: 'Belscherm', description: 'Sollicitanten bellen met eigen labels ("Gesprek gepland", "Aangenomen", enz.).' },
  { key: 'rec_import', group: 'Sollicitanten', label: 'Import en export', description: 'Sollicitanten toevoegen via CSV of plakken, en de lijst exporteren.' },
  { key: 'rec_tba', group: 'Terugbellen', label: "TBA's", description: 'Terugbelafspraken met sollicitanten die je nog moet bellen.' }
]

const CALLER_FEATURES_BASE = [
  { key: 'blr_call', group: 'Bellen', label: 'Belmodus', description: 'Met de knop "Werk" starten en leads uit je wachtrij bellen.' },
  { key: 'blr_briefing', group: 'Bellen', label: 'Briefing bij elke lead', description: 'Gespreksgeschiedenis en achtergrondinfo direct in het belscherm.' },
  { key: 'blr_leaddetail', group: 'Bellen', label: 'Contactkaart', description: 'Klik op een lead in een lijst voor de volledige afboek-geschiedenis.' },
  { key: 'blr_tba_own', group: 'Terugbellen', label: "Mijn TBA's", description: 'Je eigen terugbelafspraken, alleen door jou te claimen tot 24 uur na het moment.' },
  { key: 'blr_tba_public', group: 'Terugbellen', label: "Openbare TBA's", description: 'Terugbelafspraken van anderen die niet zijn nagekomen, na 24 uur voor iedereen claimbaar.' },
  { key: 'blr_earnings', group: 'Verdiensten', label: 'Verdiensten', description: 'Je eigen afspraken, deals en verdiende bedrag.' }
]

const BACKOFFICE_FEATURES_BASE = [
  { key: 'bo_call', group: 'Bellen', label: 'Backoffice-belscherm', description: 'Klanten met een gemaakte sale nabellen om de monteur in te plannen.' },
  { key: 'bo_queue', group: 'Bellen', label: 'Eigen wachtrij', description: 'FIFO op verkoopdatum - de oudste sale wordt als eerste gebeld.' },
  { key: 'bo_tba', group: 'Terugbellen', label: "TBA's", description: 'Terugbelafspraken die je hebt ingepland.' },
  { key: 'bo_earnings', group: 'Verdiensten', label: 'Verdiensten', description: 'Je eigen resultaten en verdiende bedrag.' }
]

// v52: planning-account - alleen de roosterpagina, verder niets.
const PLANNING_FEATURES = [
  { key: 'pl_rooster', group: 'Rooster', label: 'Mijn beschikbaarheid', description: 'Geef per week door op welke dagen en tijden je kunt werken.' },
  { key: 'pl_week', group: 'Rooster', label: 'Week vooruit/terug', description: 'Blader naar een andere week om die alvast in te vullen.' },
  { key: 'pl_note', group: 'Rooster', label: 'Notitie per dag', description: 'Zet er een opmerking bij, bijvoorbeeld "kan pas vanaf 10:00".' }
]

// `extra.activeDispositionTypes` = disposition_type van elke flow_settings-rij
// met is_active !== false (dus wat er daadwerkelijk als knop verschijnt).
// `extra.customDispositions` = rijen uit custom_dispositions.
export function getFeaturesForProfile(profile, extra = {}) {
  if (!profile) return []
  const activeTypes = extra.activeDispositionTypes || CALLER_BASE_DISPOSITIONS.concat(BACKOFFICE_BASE_DISPOSITIONS)
  const customs = extra.customDispositions || []

  switch (profile.role) {
    case 'admin':
      return ADMIN_FEATURES
    case 'manager':
      return getManagerFeatures(profile)
    case 'recruiter':
      return [
        ...RECRUITER_FEATURES_BASE,
        ...dispositionFeatures(CALLER_BASE_DISPOSITIONS, activeTypes, true),
        ...customDispositionFeatures(customs, activeTypes)
      ]
    case 'planning':
      return PLANNING_FEATURES
    case 'backoffice':
      return [
        ...BACKOFFICE_FEATURES_BASE,
        ...dispositionFeatures(BACKOFFICE_BASE_DISPOSITIONS, activeTypes, false)
      ]
    default: // 'employee' = beller
      return [
        ...CALLER_FEATURES_BASE,
        ...dispositionFeatures(CALLER_BASE_DISPOSITIONS, activeTypes, false),
        ...customDispositionFeatures(customs, activeTypes)
      ]
  }
}

export const ROLE_LABELS = {
  admin: 'Admin',
  manager: 'Manager',
  recruiter: 'Recruiter',
  backoffice: 'Backoffice',
  planning: 'Planning',
  employee: 'Beller'
}
