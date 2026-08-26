export const STATUS_MAP = {
  new: { label: 'Nieuw', color: 'var(--primary)', bg: 'var(--info-bg)' },
  later_bellen: { label: 'Later bellen', color: 'var(--warning)', bg: 'var(--warning-bg)' },
  mailen: { label: 'Mailen', color: 'var(--success)', bg: 'var(--success-bg)' },
  voicemail: { label: 'Voicemail', color: 'var(--info)', bg: 'var(--info-bg)' },
  terugbelafspraak: { label: 'Terugbelafspraak', color: 'var(--success)', bg: 'var(--success-bg)' },
  geen_gehoor: { label: 'Geen gehoor', color: 'var(--text-muted)', bg: 'var(--bg-elevated)' },
  verkeerd_nummer: { label: 'Verkeerd nummer', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  blacklist: { label: 'Blacklist', color: 'var(--danger)', bg: 'var(--danger-bg)', description: 'Dit nummer mag niet meer benaderd worden binnen het project' },
  geen_interesse: { label: 'Geen interesse', color: 'var(--danger)', bg: 'var(--danger-bg)' },
  onjuiste_timing: { label: 'Onjuiste timing', color: 'var(--info)', bg: 'var(--info-bg)', description: 'Nu niet relevant, later opnieuw benaderen' },
  cold: { label: 'Cold', color: 'var(--text-muted)', bg: 'var(--bg-elevated)', description: 'Na 3 pogingen geen contact' },
  afspraak_gemaakt: { label: 'Afspraak gemaakt', color: 'var(--success)', bg: 'var(--success-bg)' },
  deal: { label: 'Deal!', color: 'var(--success)', bg: 'var(--success-bg)' },
  bruto_deal: { label: 'Bruto deal', color: 'var(--success)', bg: 'var(--success-bg)', description: 'Sale is gemaakt, monteur moet nog worden ingepland - telt al mee als deal' },
  ptfu: { label: 'PTFU', color: 'var(--info)', bg: 'var(--info-bg)', description: 'Power Through Follow Ups' },
  goed_op_weg: { label: 'Goed Op Weg', color: 'var(--success)', bg: 'var(--success-bg)', description: 'Goede voortgang' },
  verbetering_nodig: { label: 'Verbetering Nodig', color: 'var(--warning)', bg: 'var(--warning-bg)', description: 'Moet beter' },
  // v38: backoffice - monteur inplannen na een gemaakte sale (status 'deal')
  monteur_ingepland: { label: 'Monteur ingepland', color: 'var(--success)', bg: 'var(--success-bg)', description: 'Monteur is ingepland - sale is doorgezet' },
  wil_annuleren: { label: 'Wil annuleren', color: 'var(--danger)', bg: 'var(--danger-bg)', description: 'Klant wil annuleren - reden vastgelegd' }
};

// v36: recruitment-projecten gebruiken dezelfde statussen/dispositie-flow
// (TBA, wachtrij, rapportage) als sales - alleen de LABELS lezen anders.
// De onderliggende status-key (bv. 'deal') blijft overal hetzelfde.
export const RECRUITMENT_LABELS = {
  afspraak_gemaakt: 'Gesprek gepland',
  deal: 'Aangenomen',
  geen_interesse: 'Afgewezen',
  terugbelafspraak: 'Terugbelafspraak (TBA)',
  onjuiste_timing: 'Nu niet, later opnieuw',
  blacklist: 'Niet meer benaderen'
};

export const getStatusDetails = (status, isRecruitment = false) => {
  const base = STATUS_MAP[status] || { label: status, color: 'var(--text-muted)', bg: 'var(--bg-elevated)' };
  if (isRecruitment && RECRUITMENT_LABELS[status]) {
    return { ...base, label: RECRUITMENT_LABELS[status] };
  }
  return base;
};