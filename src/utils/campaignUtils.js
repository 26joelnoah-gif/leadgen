export const CAMPAIGN_TYPES = {
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '🔗',
    color: '#0A66C2',
    description: 'LinkedIn berichten en connecties'
  },
  phone: {
    id: 'phone',
    name: 'Telefoon',
    icon: '📞',
    color: '#10B981',
    description: 'Koude belletjes'
  },
  email: {
    id: 'email',
    name: 'Email',
    icon: '✉️',
    color: '#3B82F6',
    description: 'Email campagn es'
  },
  sms: {
    id: 'sms',
    name: 'SMS',
    icon: '💬',
    color: '#8B5CF6',
    description: 'SMS blast'
  }
}

export const CAMPAIGN_STATUS = {
  draft: { label: 'Draft', color: '#6B7280', bg: '#F3F4F6' },
  active: { label: 'Actief', color: '#10B981', bg: '#D1FAE5' },
  paused: { label: 'Gepauzeerd', color: '#F59E0B', bg: '#FEF3C7' },
  completed: { label: 'Afgerond', color: '#6B7280', bg: '#E5E7EB' }
}