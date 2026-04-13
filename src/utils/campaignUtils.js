export const CAMPAIGN_TYPES = {
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '🔗',
    color: '#0A66C2',
    description: 'LinkedIn berichten en connecties'
  },
  cold_call: {
    id: 'cold_call',
    name: 'Koude Belletjes',
    icon: '📞',
    color: '#10B981',
    description: 'Koude belletjes outbound',
    hasBudget: true
  },
  data_enrichment: {
    id: 'data_enrichment',
    name: 'Data Verrijken',
    icon: '📊',
    color: '#F59E0B',
    description: 'Data verrijken en updaten'
  }
}

export const CAMPAIGN_STATUS = {
  draft: { label: 'Draft', color: '#6B7280', bg: '#F3F4F6' },
  active: { label: 'Actief', color: '#10B981', bg: '#D1FAE5' },
  paused: { label: 'Gepauzeerd', color: '#F59E0B', bg: '#FEF3C7' },
  completed: { label: 'Afgerond', color: '#6B7280', bg: '#E5E7EB' }
}