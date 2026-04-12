// Demo data for testing without Supabase

export const DEMO_LEADS = [
  {
    id: '1',
    name: 'Bakkerij Jansen',
    phone: '06-12345678',
    email: 'info@bakkerijjansen.nl',
    status: 'new',
    notes: 'Interesse in ons rundvlees assortiment',
    assigned_to: '1',
    assigned_to_profile: { full_name: 'Jan de Vries' },
    created_by: '2',
    created_at: '2026-04-10T09:00:00Z',
    updated_at: '2026-04-10T09:00:00Z'
  },
  {
    id: '2',
    name: 'Restaurant De Toren',
    phone: '06-23456789',
    email: 'contact@detoren.nl',
    status: 'later_bellen',
    notes: 'Willen eerst prijzen vergelijken, belt zelf terug',
    assigned_to: '1',
    assigned_to_profile: { full_name: 'Jan de Vries' },
    created_by: '2',
    created_at: '2026-04-09T14:30:00Z',
    updated_at: '2026-04-11T10:15:00Z'
  },
  {
    id: '3',
    name: 'Café De Linde',
    phone: '06-34567890',
    email: '',
    status: 'afspraak_gemaakt',
    notes: 'Afspraak op dinsdag 15 april om 10:00',
    assigned_to: '1',
    assigned_to_profile: { full_name: 'Jan de Vries' },
    created_by: '2',
    created_at: '2026-04-08T11:00:00Z',
    updated_at: '2026-04-12T08:30:00Z'
  },
  {
    id: '4',
    name: 'Hotel Amstel',
    phone: '06-45678901',
    email: 'inkoop@hotelamstel.nl',
    status: 'geen_interesse',
    notes: 'Werken al met vaste leverancier',
    assigned_to: '2',
    assigned_to_profile: { full_name: 'Maria Admin' },
    created_by: '2',
    created_at: '2026-04-07T16:00:00Z',
    updated_at: '2026-04-09T12:00:00Z'
  },
  {
    id: '5',
    name: 'Slagerij Van der Berg',
    phone: '06-56789012',
    email: 'info@vanderberg.nl',
    status: 'deal',
    notes: 'Contract getekend! Wekelijkse levering van start per 1 mei',
    assigned_to: '1',
    assigned_to_profile: { full_name: 'Jan de Vries' },
    created_by: '2',
    created_at: '2026-04-05T10:00:00Z',
    updated_at: '2026-04-11T15:45:00Z'
  },
  {
    id: '6',
    name: 'Catering Service Brabant',
    phone: '06-67890123',
    email: 'orders@brabantcatering.nl',
    status: 'mailen',
    notes: 'Stuur offerte voor 50 personen event',
    assigned_to: null,
    assigned_to_profile: null,
    created_by: '2',
    created_at: '2026-04-12T08:00:00Z',
    updated_at: '2026-04-12T08:00:00Z'
  },
  {
    id: '7',
    name: 'Feestcafé De Bruin',
    phone: '06-78901234',
    email: '',
    status: 'voicemail',
    notes: 'Bericht ingesproken om terug te bellen',
    assigned_to: '1',
    assigned_to_profile: { full_name: 'Jan de Vries' },
    created_by: '2',
    created_at: '2026-04-11T13:00:00Z',
    updated_at: '2026-04-12T09:00:00Z'
  },
  {
    id: '8',
    name: 'Zorginstelling De Eik',
    phone: '06-89012345',
    email: 'voeding@deeik.nl',
    status: 'geen_gehoor',
    lead_source: 'referral',
    decision_maker: true,
    contact_attempts: 2,
    company_size: '51+',
    next_contact_date: '2026-04-14T09:00:00Z',
    notes: '3x gebeld, geen gehoor',
    assigned_to: '2',
    assigned_to_profile: { full_name: 'Maria Admin' },
    created_by: '2',
    created_at: '2026-04-10T11:30:00Z',
    updated_at: '2026-04-12T10:00:00Z'
  },
  {
    id: '9',
    name: 'Snackbar De Hap',
    phone: '06-90123456',
    status: 'cold',
    lead_source: 'cold',
    decision_maker: false,
    contact_attempts: 3,
    company_size: '1-10',
    notes: '3 pogingen gedaan, geen interesse of gehoor',
    assigned_to: '1',
    created_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-12T10:00:00Z'
  }
]

export const DEMO_USERS = [
  { id: '1', email: 'jan@leadgen.nl', full_name: 'Jan de Vries', role: 'employee' },
  { id: '2', email: 'maria@leadgen.nl', full_name: 'Maria Admin', role: 'admin' }
]

export const DEMO_ACTIVITIES = [
  { id: 'a1', lead_id: '1', user_id: '1', action: 'call', notes: 'Eerste contact', created_at: '2026-04-12T10:00:00Z', user: { full_name: 'Jan de Vries' }, lead: { name: 'Bakkerij Jansen' } },
  { id: 'a2', lead_id: '2', user_id: '1', action: 'status_change', notes: 'Status gewijzigd naar: Later bellen', created_at: '2026-04-11T10:15:00Z', user: { full_name: 'Jan de Vries' }, lead: { name: 'Restaurant De Toren' } },
  { id: 'a3', lead_id: '5', user_id: '1', action: 'status_change', notes: 'Status gewijzigd naar: Deal!', created_at: '2026-04-11T15:45:00Z', user: { full_name: 'Jan de Vries' }, lead: { name: 'Slagerij Van der Berg' } },
  { id: 'a4', lead_id: '4', user_id: '2', action: 'status_change', notes: 'Status gewijzigd naar: Geen interesse', created_at: '2026-04-09T12:00:00Z', user: { full_name: 'Maria Admin' }, lead: { name: 'Hotel Amstel' } },
  { id: 'a5', lead_id: '3', user_id: '1', action: 'status_change', notes: 'Status gewijzigd naar: Afspraak gemaakt', created_at: '2026-04-12T08:30:00Z', user: { full_name: 'Jan de Vries' }, lead: { name: 'Café De Linde' } }
]

export const DEMO_LEADS_ADMIN_VIEW = [...DEMO_LEADS]