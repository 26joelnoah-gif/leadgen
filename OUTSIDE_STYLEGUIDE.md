# LEADGEN Outside — Styleguide (v0, 06-09-2026)

Outside is de buitendienst-/deur-aan-deur-tool binnen LEADGEN (kaart + lijst,
klik op lead -> offerte). Hij wordt op straat op een telefoon gebruikt, in
daglicht, vaak met een hand. Daarom krijgt hij een EIGEN, licht, rustig thema
dat lijkt op Salesdock Outside, los van het donkere dashboard-thema.

Referentie: Salesdock Outside (outside.salesdock.nl). We nemen de sfeer over
(licht, mintgroene header, witte lijstrijen, gekleurde statusbolletjes), niet
het logo of de merkkleuren letterlijk.

## 1. Principes

1. Altijd licht. Outside negeert de licht/donker-schakelaar van het dashboard.
   Buiten in de zon is donker onleesbaar.
2. Groot en duimvriendelijk. Minimale tap-target 44x44px, lijstrijen 72px hoog,
   primaire acties onderaan het scherm (bereikbaar met een duim).
3. Status = kleur = bolletje. Overal dezelfde vier kleuren voor lead-status,
   op de kaart en in de lijst.
4. Eén primaire actie per scherm. Op de lijst: "+ lead". Op de leadkaart:
   "Offerte maken". Al het andere is secundair (grijs).
5. Weinig chrome. Geen schaduwrijke kaarten of glas-effecten; witte vlakken,
   1px lijnen, veel witruimte.

## 2. Tokens

Alle Outside-schermen staan in een wrapper met `data-tool="outside"`. Daarbinnen
overschrijven onderstaande tokens de semantische tokens uit `src/styles/tokens.css`
(zelfde namen, dus bestaande componenten werken zonder wijziging). Voeg dit blok
toe aan `src/styles/tokens.css` (of `src/styles/outside.css`, geïmporteerd in
`index.css`).

```css
/* ---------- OUTSIDE (altijd licht, mint) ---------- */
[data-tool="outside"] {
  color-scheme: light;

  /* Merk */
  --outside-brand:        #5BB98C;   /* header, statusbalk, actieve staat */
  --outside-brand-dark:   #3E9A6E;   /* hover / pressed */
  --outside-brand-soft:   #E6F4EC;   /* zachte chips, geselecteerde rij */
  --outside-tint:         #EEF5F2;   /* paginagrond (mint-wit) */

  /* Achtergrondlagen */
  --bg-page:      var(--outside-tint);
  --bg-surface:   #FFFFFF;
  --bg-card:      #FFFFFF;
  --bg-elevated:  #F3F6F5;

  /* Tekst */
  --text-primary:   #1F2A2E;
  --text-secondary: #6B7A80;
  --text-on-accent: #FFFFFF;

  /* Lijnen */
  --border-subtle: #E3EAE7;
  --border-strong: #C9D4CF;

  /* Accent = primaire actie (blauw, zoals de "+"-knop) */
  --accent:       #2F8FDB;
  --accent-hover: #2477BA;
  --accent-soft:  rgba(47, 143, 219, 0.12);

  /* Secundaire knoppen (filter, sorteer) */
  --btn-neutral:       #6E7C82;
  --btn-neutral-hover: #59666B;

  /* Semantiek */
  --success: #2E9E6B;  --success-bg: rgba(46, 158, 107, 0.12);
  --warning: #E6A100;  --warning-bg: rgba(230, 161, 0, 0.14);
  --danger:  #D64545;  --danger-bg:  rgba(214, 69, 69, 0.10);
  --info:    #2F8FDB;  --info-bg:    rgba(47, 143, 219, 0.10);

  /* Lead-status (kaart + lijst), vaste set */
  --status-new:         #2F80ED;   /* Nieuw */
  --status-open:        #F2C94C;   /* Open / bezig */
  --status-appointment: #9B51E0;   /* Afspraak */
  --status-sale:        #27AE60;   /* Sale / deal */
  --status-closed:      #BDC7C3;   /* Eindstatus zonder resultaat (geen interesse, blacklist) */

  /* Vorm: iets zachter dan het dashboard */
  --shadow-sm: 0 1px 2px rgba(31, 42, 46, 0.06);
  --shadow-md: 0 2px 8px rgba(31, 42, 46, 0.08);
  --shadow-lg: 0 8px 24px rgba(31, 42, 46, 0.12);
  --page-glow: none;
  --glass: rgba(255,255,255,0.92);
}
```

Mapping op bestaande statussen (STATUS_MAP):
- Nieuw: `new`, nog niet benaderd
- Open: `geen_gehoor`, `onjuiste_timing`, `terugbellen` / TBA, alles met next_contact_date
- Afspraak: `afspraak`
- Sale: `deal`, `bruto_deal`, `monteur_ingepland`
- Gesloten (grijs): `geen_interesse`, `verkeerd_nummer`, blacklist

## 3. Typografie

Zelfde fonts als de rest (Inter body, Outfit display), maar één maat groter:
- Body 16px (nooit kleiner dan 16px in inputs, i.v.m. iOS-zoom)
- Rij-titel (huisnummer/naam) 18px, weight 500
- Meta (status, afstand) 14px, secondary
- Straatkop 14px, weight 600, secondary, uppercase uit (gewoon zinsopmaak)
- Schermtitel in header 20px Outfit 600, wit

## 4. Layout

Header (56px, `--outside-brand`, witte tekst/iconen): links logo/titel,
rechts max 3 iconen (sync-status, wisselen kaart/lijst, profiel). Direct
onder de header een dunne accentstreep van 3px in vier blokken
(`--status-new`, `--status-open`, `--status-appointment`, `--status-sale`):
dat is meteen de legenda.

Zoekbalk-rij (sticky onder header, wit): zoekveld met loep (radius 8px,
border-subtle), daarnaast filter- en sorteerknop (`--btn-neutral`, 44x44,
wit icoon) en rechts de blauwe "+"-knop (`--accent`, 44x44).

Lijst: gegroepeerd per straat. Groepskop is een lichte balk
(`--bg-elevated`, 36px) met "Straat, Plaats  POSTCODE". Rijen 72px, wit,
1px `--border-subtle` eronder:
- links huisnummer (18px)
- midden naam (of "Naam onbekend" in secondary) en daaronder
  statusbolletje 8px + statuslabel + "•" + afstand ("50 m", "1,2 km")
- rechts initialen-avatar 32px (`--bg-elevated`, tekst secondary) en een
  chevron. Chevron opent de leadkaart.

Kaart: volledig scherm onder de header. Leads als cirkels 22px in
statuskleur met witte rand 2px; geselecteerde lead 30px. Knoppen op de
kaart zijn witte vierkanten 44px met schaduw-md: "mijn locatie" rechtsboven,
kaart/satelliet-toggle linksonder, lijst-toggle rechtsonder. Onderaan een
witte "sheet" (radius 16px boven, schaduw-lg) met de geselecteerde lead.

Leadkaart / offerte: volledig scherm, witte grond, terugpijl in header.
Bovenaan adres + naam + statuschip. Dan de afboek-knoppen als grote
chips in een 2-koloms grid (elk 56px): Niet thuis, Geen interesse,
Terugkomen, Afspraak. Onderaan sticky de primaire knop "Offerte maken"
(`--accent`, 52px, radius 12, volle breedte). Offerte-stappen zelf:
één vraag per scherm, grote keuzekaarten (radius 12, border 2px, gekozen =
`--outside-brand` rand + `--outside-brand-soft` grond), voortgangsbalk
in de header in `--outside-brand-dark`.

## 5. Componenten (samenvatting)

| Component | Grond | Tekst | Rand | Radius | Hoogte |
|---|---|---|---|---|---|
| Primaire knop | --accent | wit | geen | 12 | 52 |
| Secundaire knop | wit | --text-primary | --border-strong | 12 | 48 |
| Icoonknop (filter/sort) | --btn-neutral | wit | geen | 8 | 44 |
| Input | wit | --text-primary | --border-subtle, focus --accent | 8 | 48 |
| Statuschip | status-bg 12% | statuskleur | geen | full | 24 |
| Lijstrij | wit | zie boven | onder 1px | 0 | 72 |
| Kaart-sheet | wit | | geen | 16 boven | auto |

Geen dark-mode varianten nodig: `[data-tool="outside"]` zet altijd licht.

## 6. Wat NIET

- Geen gradients, geen glas, geen glow (dashboard-stijl blijft daar).
- Geen tekst onder 14px, geen tap-targets onder 44px.
- Geen extra statuskleuren verzinnen; nieuwe afboekredenen mappen op een van
  de vijf bolletjes hierboven.
- Geen Salesdock-logo, -naam of -kleurstreep letterlijk overnemen.
