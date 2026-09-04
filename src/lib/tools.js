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
]

export const ALL_TOOL_KEYS = TOOLS.map(t => t.key)
