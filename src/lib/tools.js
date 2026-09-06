// v60: register van tools die per project aan medewerkers gegeven kunnen worden.
// De sleutel (key) staat in public.campaign_tools; de rest is puur weergave.
// Een nieuwe tool toevoegen = hier een regel, en de admin kan hem meteen aan
// projecten hangen in de projectinstellingen.
export const TOOLS = [
  {
    key: 'offerte_bestelplatform',
    label: 'Offerte-tool bestelplatform',
    description: 'Pakket en modules kiezen, ROI laten zien, klant tekent op het scherm. Werkt het best op telefoon of tablet. Na tekenen: "Print / PDF" en de PDF mailen naar de klant en naar Noah.',
    href: '/tools/offerte-tool.html',
    cta: 'Nieuwe offerte',
    icon: 'FileSignature',
    color: '#00ff95',
    bg: 'rgba(0,255,149,0.12)',
    primary: true,
    newTab: false,
  },
  {
    key: 'presentatie_bestelplatform',
    label: 'Klantpresentatie bestelplatform',
    description: 'De presentatie met Dr. Shawarma als voorbeeld: wat het systeem is, wat het de zaak oplevert en hoe de uitrol gaat. Laat zien vóór je de offerte opent.',
    href: '/tools/presentatie-bestelplatform.pdf',
    cta: 'Open presentatie',
    icon: 'Presentation',
    color: 'var(--primary)',
    bg: 'rgba(59,130,246,0.15)',
    primary: false,
    newTab: true,
  },
  {
    key: 'commissie_teamtool',
    label: 'Commissie berekenen',
    description: 'Teamtool: de commissieladder (12,5% tot 20% op deals én orderwaarde per maand), wat één deal je oplevert, je maandplanning, de traineebonus en de salesmanager-regeling. Alleen voor het team, nooit aan de klant laten zien.',
    href: '/tools/commissie.html',
    cta: 'Bereken commissie',
    icon: 'Calculator',
    color: '#ffb020',
    bg: 'rgba(255,176,32,0.12)',
    primary: false,
    newTab: true,
  },
  {
    key: 'outside',
    label: 'Outside (buitendienst)',
    description: 'Kaart en lijst van de leads in je project, gesorteerd op afstand vanaf waar je staat. Klik op een adres voor bellen, route, afboeken aan de deur en de offerte. Werkt op de telefoon.',
    href: '/outside',
    cta: 'Open Outside',
    icon: 'MapPin',
    color: '#5BB98C',
    bg: 'rgba(91,185,140,0.15)',
    primary: true,
    newTab: false,
  },
]

export const ALL_TOOL_KEYS = TOOLS.map(t => t.key)
