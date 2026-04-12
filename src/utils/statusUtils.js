export const STATUS_MAP = {
  new: { label: 'Nieuw', color: '#1565C0', bg: '#E3F2FD' },
  later_bellen: { label: 'Later bellen', color: '#E65100', bg: '#FFF3E0' },
  mailen: { label: 'Mailen', color: '#2E7D32', bg: '#E8F5E9' },
  voicemail: { label: 'Voicemail', color: '#7B1FA2', bg: '#F3E5F5' },
  terugbelafspraak: { label: 'Terugbelafspraak', color: '#00838F', bg: '#E0F7FA' },
  geen_gehoor: { label: 'Geen gehoor', color: '#546E7A', bg: '#ECEFF1' },
  verkeerd_nummer: { label: 'Verkeerd nummer', color: '#BF360C', bg: '#FBE9E7' },
  geen_interesse: { label: 'Geen interesse', color: '#C62828', bg: '#FFEBEE' },
  afspraak_gemaakt: { label: 'Afspraak gemaakt', color: '#1B5E20', bg: '#E8F5E9' },
  deal: { label: 'Deal!', color: '#1B5E20', bg: '#C8E6C9' },
  ptfu: { label: 'PTFU', color: '#6A1B9A', bg: '#E1BEE7', description: 'Power Through Follow Ups' },
  goed_op_weg: { label: 'Goed Op Weg', color: '#00695C', bg: '#B2DFDB', description: 'Goede voortgang' },
  verbetering_nodig: { label: 'Verbetering Nodig', color: '#E65100', bg: '#FFE0B2', description: 'Moet beter' }
};

export const getStatusDetails = (status) => {
  return STATUS_MAP[status] || { label: status, color: '#546E7A', bg: '#ECEFF1' };
};