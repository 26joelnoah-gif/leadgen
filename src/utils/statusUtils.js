export const STATUS_MAP = {
  new: { label: 'Nieuw', color: 'var(--primary)', bg: 'var(--info-bg)' },
  later_bellen: { label: 'Later bellen', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  mailen: { label: 'Mailen', color: 'var(--success)', bg: 'var(--success-bg)' },
  voicemail: { label: 'Voicemail', color: 'var(--info)', bg: 'var(--info-bg)' },
  terugbelafspraak: { label: 'Terugbelafspraak', color: 'var(--success)', bg: 'var(--success-bg)' },
  geen_gehoor: { label: 'Geen gehoor', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  verkeerd_nummer: { label: 'Verkeerd nummer', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  geen_interesse: { label: 'Geen interesse', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  afspraak_gemaakt: { label: 'Afspraak gemaakt', color: 'var(--success)', bg: 'var(--success-bg)' },
  deal: { label: 'Deal!', color: 'var(--success)', bg: 'var(--success-bg)' },
  ptfu: { label: 'PTFU', color: 'var(--info)', bg: 'var(--info-bg)', description: 'Power Through Follow Ups' },
  goed_op_weg: { label: 'Goed Op Weg', color: 'var(--success)', bg: 'var(--success-bg)', description: 'Goede voortgang' },
  verbetering_nodig: { label: 'Verbetering Nodig', color: 'var(--warning)', bg: 'var(--warning-bg)', description: 'Moet beter' }
};

export const getStatusDetails = (status) => {
  return STATUS_MAP[status] || { label: status, color: 'var(--text-muted)', bg: 'var(--bg-elevated)' };
};