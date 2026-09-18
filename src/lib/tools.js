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
    // v76: verduurzaming (zonnepanelen, thuisbatterij, airco, laadpaal, elektra-uren).
    // Bedrijfsgegevens en standaardprijzen per gebruiker in public.tool_settings.
    key: 'offerte_verduurzaming',
    label: 'Offerte-tool verduurzaming',
    description: 'Zonnepanelen, thuisbatterij, airco, laadpaal en elektrawerk in één offerte, met verwachte besparing en terugverdientijd. Klant tekent op het scherm, daarna PDF downloaden. Eigen bedrijfsgegevens en prijzen stel je in op het tabblad Instellingen.',
    href: '/tools/verduurzaming-tool.html',
    cta: 'Nieuwe offerte',
    icon: 'Sun',
    color: '#5cb149',
    bg: 'rgba(92,177,73,0.14)',
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
  {
    // v81: onboarding-deck voor nieuwe bellers op het MarketingKiezer-project.
    // PDF-export van de Slides-deck "Onboarding beller MarketingKiezer".
    key: 'onboarding_marketingkiezer',
    label: 'Onboarding beller MarketingKiezer',
    description: 'De inwerkpresentatie: wat MarketingKiezer is, hoe de matching werkt, de prijs, het gesprek, de mails, bezwaren, huisregels en je eerste week. Lees dit voor je gaat bellen.',
    href: '/tools/onboarding-marketingkiezer.pdf',
    cta: 'Open onboarding',
    icon: 'GraduationCap',
    color: '#f97316',
    bg: 'rgba(249,115,22,0.14)',
    primary: false,
    newTab: true,
  },
]

export const ALL_TOOL_KEYS = TOOLS.map(t => t.key)
