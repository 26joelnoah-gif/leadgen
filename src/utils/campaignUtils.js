export const CAMPAIGN_TYPES = {
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: '🔗',
    color: 'var(--primary)',
    description: 'LinkedIn berichten en connecties'
  },
  cold_call: {
    id: 'cold_call',
    name: 'Koude Belletjes',
    icon: '📞',
    color: 'var(--success)',
    description: 'Koude belletjes outbound',
    hasBudget: true
  },
  data_enrichment: {
    id: 'data_enrichment',
    name: 'Data Verrijken',
    icon: '📊',
    color: 'var(--warning)',
    description: 'Data verrijken en updaten'
  }
}

export const CAMPAIGN_STATUS = {
  draft: { label: 'Draft', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  active: { label: 'Actief', color: 'var(--success)', bg: 'var(--success-bg)' },
  paused: { label: 'Gepauzeerd', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  completed: { label: 'Afgerond', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' }
}