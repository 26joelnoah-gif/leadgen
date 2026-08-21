# LEADGEN — Restyle-plan & styleguide-fundament

*Opgesteld 21 augustus 2026 · status: ter goedkeuring, nog niets gebouwd*

## 1. Advies in het kort

De beste route is een **totale makeover, maar incrementeel uitgevoerd**: eerst een robuust fundament (design-tokens met licht én donker thema, een kleine componentenbibliotheek), daarna pagina voor pagina overzetten. Geen big-bang-herbouw — de app draait in productie en wordt dagelijks gebruikt door bellers; elke fase moet een werkende, geteste app opleveren.

De kern van het probleem is namelijk niet dat de huidige stijl "lelijk" is, maar dat er **geen systeem** onder zit. Drie stijllagen lopen door elkaar (custom CSS-klassen, Tailwind-utilities en honderden inline styles), waardoor elke pagina nét anders oogt en elke wijziging onvoorspelbaar is. Een nieuwe verflaag daaroverheen lost dat niet op; een tokens-en-componenten-fundament wel — en dat fundament maakt de gewenste thema-schakelaar (licht/donker) er gratis bij mogelijk.

## 2. Audit: wat er nu staat

Bevindingen uit de codebase (stand 21-08-2026):

**Stijllagen door elkaar.** De app gebruikt tegelijk: (a) custom klassen in `index.css` (`.btn`, `.card`, `.form-dark`, `.tab-bar`, `.modal`, `.table`, …), (b) Tailwind v4-utilities (zonder preflight), en (c) **± 700 inline `style={{...}}`-blokken** verspreid over vrijwel elk bestand. Uitschieters:

| Bestand | Inline styles | Regels |
|---|---|---|
| `components/WorkInterface.jsx` | 84 | 572 |
| `pages/Payouts.jsx` | 68 | 680 |
| `components/ImportLeadsModal.jsx` | 65 | 519 |
| `pages/Dashboard.jsx` | 55 | 604 |
| `pages/Earnings.jsx` | 53 | 416 |
| `pages/Manager.jsx` | 50 | 664 |

**Page-scoped `<style>`-blokken** in 9 bestanden (LeadManagement, Payouts, TBAs, Telemetry, ActivityFeed, Header, MobileNav, TeamLeaderboard, Toast) — dezelfde soort regels worden per pagina opnieuw uitgevonden en kunnen elkaar overschrijven.

**Dubbel tokensysteem.** `index.css` (1.183 regels) definieert kleuren twee keer: in het Tailwind `@theme`-blok én als losse `:root`-variabelen (`--primary`, `--bg-card`, enz.). De namen zijn bovendien niet semantisch-themable: `--bg-white` is in werkelijkheid donkergrijs (`#1E2028`) — een licht thema is met deze naamgeving niet te bouwen.

**Hardcoded hexkleuren in JSX**: tientallen losse `#EF4444`, `#3B82F6`, `#eab308` enz. in pagina's en componenten, buiten elk token om.

**Eén hardcoded dark theme** met relatief veel decoratie (gradients, glow-schaduwen, achtergrondpattern via `body::before`), Outfit als enige font voor alles.

**Geen preflight**: Tailwind draait bewust zonder reset; een eigen mini-reset in `index.css` vangt formulier-elementen op. Dat was destijds de juiste noodgreep, maar het betekent dat browser-defaults nog overal doorheen kunnen lekken.

Wat er al wél goed staat en behouden blijft: de gedeelde `Header`, de `.tab-bar`/`.page-title`-klassen uit de vorige opschoonronde, `statusUtils.js` dat statuskleuren al via CSS-variabelen aanstuurt, en het tekst-afkap-beleid (niets valt onzichtbaar weg).

## 3. Doelarchitectuur

### 3.1 Design-tokens in twee lagen

Eén bron van waarheid in `src/styles/tokens.css`, in twee lagen:

**Laag 1 — primitieven** (thema-onafhankelijk): de ruwe schaal. `--blue-500`, `--gray-50…950`, `--green-500`, spacing-stappen, radius-waarden, font-sizes. Deze verander je zelden.

**Laag 2 — semantische tokens** (per thema anders): de namen die de app gebruikt. Voorbeeldset:

```css
:root, [data-theme="dark"] {
  --bg-page: #0F1117;        /* app-achtergrond */
  --bg-surface: #1A1D23;     /* panelen/secties */
  --bg-card: #1E2028;        /* kaarten */
  --bg-elevated: #252A33;    /* inputs, hover, dropdowns */
  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
  --border-subtle: #2A2D35;
  --border-strong: #3D424D;
  --accent: #3B82F6;         /* + hover/pressed-varianten */
  --success / --warning / --danger / --info (+ bijbehorende -bg's);
}
[data-theme="light"] {
  --bg-page: #F7F8FA;  --bg-surface: #FFFFFF;  --bg-card: #FFFFFF;
  --bg-elevated: #F1F3F6;
  --text-primary: #0F172A;  --text-secondary: #64748B;
  --border-subtle: #E2E8F0;  --border-strong: #CBD5E1;
  /* accent/status: zelfde tinten, iets donkerder voor AA-contrast op wit */
}
```

Componenten en pagina's gebruiken **uitsluitend laag 2**. De bestaande namen (`--bg-card`, `--text-muted`, …) blijven tijdens de migratie als alias bestaan zodat niets breekt, en verdwijnen in de laatste fase.

Het Tailwind `@theme`-blok verwijst naar deze variabelen (`--color-card: var(--bg-card)` enz.), zodat utilities als `bg-card` en `text-secondary` automatisch mee-themen. Hardcoded utilities als `bg-white/5` en `text-white` worden bij de paginamigratie vervangen door token-varianten.

### 3.2 Thema-schakelaar

`data-theme` op `<html>`, gezet door een klein `ThemeContext`/hook: leest voorkeur uit `localStorage`, valt terug op `prefers-color-scheme`, standaard **dark** (huidige gebruikers merken niets). Toggle-knop (zon/maan) in de `Header` en in `MobileNav`. Eén `color-scheme: dark|light`-regel zorgt dat scrollbars, date-pickers en autofill meekleuren. De decoratieve `body::before`-gradient wordt per thema gedempt of uitgezet.

### 3.3 Componentenbibliotheek `src/components/ui/`

Kleine, domme componenten die de custom klassen en inline styles vervangen. Beoogde set (dekt vrijwel alles wat de app nu ad-hoc doet):

| Component | Vervangt |
|---|---|
| `Button` (variant: primary/secondary/ghost/danger; size: sm/md/lg) | `.btn*` + tientallen inline-gestylede buttons |
| `Card`, `PageHeader`, `Section` | `.card`, `.page-title`-constructies, losse divs |
| `Field` + `Input`/`Select`/`Textarea` (label, hint, error) | `.form-dark`, `.form-control`, kale inputs |
| `Modal` (header/body/footer, ESC, focus-trap) | `.modal*` + per-modal eigen markup |
| `Tabs` | `.tab-bar`/`.tab-btn` |
| `Table` (sticky header, lege-staat, responsive scroll) | `.table*` + per-pagina tabellen |
| `Badge`/`StatusPill` (gevoed door `statusUtils`) | `.status` + inline pills |
| `KpiCard`, `StatBar` | stat-kaarten in Admin/Manager/Reports/Dashboard |
| `EmptyState`, `Spinner`, `Toast` | bestaande varianten, geüniformeerd |

Bestaande componenten (`EmptyState`, `Toast`, `LoadingSpinner`, `StatusSelector`, `FlowSettingsEditor`) schuiven hierin op of gaan de nieuwe ui-componenten gebruiken; gedrag en logica veranderen niet.

### 3.4 Preflight: nu wél aanzetten

De afspraak "geen preflight" beschermde de oude styling. In fase 1 — wanneer formulier-elementen toch via `Field`/`Input` gaan lopen — is hét moment om `@import "tailwindcss"` volledig te laden en de eigen mini-reset te schrappen. Dit is de meest riskante enkele stap van het plan en krijgt daarom een eigen visuele controle-ronde over alle routes in beide thema's. Levert wel het meeste robuustheid op: geen lekkende browser-defaults meer.

### 3.5 Styleguide-regels (de afspraken, komen ook in CLAUDE.md)

1. Kleuren, spacing, radius en schaduwen alleen via semantische tokens of token-gedreven Tailwind-utilities — **nooit** hex/rgb in JSX.
2. Inline `style={{}}` alleen voor écht dynamische waarden (breedte van een voortgangsbalk, chart-kleuren) — nooit voor layout of vaste opmaak.
3. Geen nieuwe `<style>`-blokken in componenten; gedeelde stijl hoort in `ui/`-componenten of `index.css`.
4. Statuskleuren uitsluitend via `statusUtils.js` → tokens.
5. Tekst-afkap-beleid blijft: geen `truncate`/`nowrap` op inhoudelijke tekst zonder wrap-alternatief of tooltip.
6. Elke nieuwe UI gebruikt de `ui/`-componenten; een nieuwe variant = uitbreiding van het component, geen kopie ernaast.

## 4. Visuele richting

Doel: rustiger, scherper, professioneler — "Linear/Notion-niveau" in plaats van "gaming-dashboard". Concreet:

- **Typografie**: Outfit alleen voor headings en KPI-cijfers (gewichten 600–700, geen 800/900 meer); **Inter** voor alle lopende tekst, labels en tabellen (leesbaarder op kleine maten); tabellencijfers met `font-variant-numeric: tabular-nums`. Vaste typografische schaal (bijv. 12/13/14/16/20/24/32) in plaats van losse rem-waarden overal.
- **Kleur**: één accentkleur (het bestaande blauw) als enige "merk"-kleur in de interface; het goud/amber wordt teruggebracht tot puur functioneel (warning, prijzen/awards in leaderboard) in plaats van tweede sierkleur. Statuskleuren iets ontzadigd zodat tabellen rustig blijven.
- **Decoratie**: gradients op knoppen en glow-schaduwen vervallen; vlakke accentkleur + subtiele 1px-borders + kleine schaduwen. Diepte komt van achtergrond-lagen (page → surface → card → elevated), niet van schaduwspektakel.
- **Spacing & radius**: 4px-grid; radius terug naar drie waarden (8 voor inputs/knoppen, 12 voor kaarten, 16 voor modals) in plaats van de huidige zes.
- **States & toegankelijkheid**: elk interactief element krijgt hover-, active-, focus-visible- en disabled-staat uit het systeem; contrast minimaal WCAG AA in beide thema's (belangrijk voor bellers die er de hele dag naar kijken).
- **Dark** blijft de sfeer van nu maar strakker; **light** wordt de frisse kantoor-variant (wit op lichtgrijs, zelfde hiërarchie) — beide uit exact dezelfde tokens, dus per definitie consistent.

## 5. Levende styleguide-pagina

Nieuwe route `/styleguide` (alleen zichtbaar voor admin): toont alle tokens, componenten en states naast elkaar, met een thema-toggle bovenaan. Dit is tegelijk documentatie én testpagina — elke fase wordt daar eerst visueel goedgekeurd voordat pagina's overgaan. Kost weinig (het zijn de componenten zelf) en voorkomt dat de guide een verouderend document wordt.

## 6. Fasering

Elke fase eindigt met: `npx vite build` op de Mac (Desktop Commander), `vite preview` + screenshots van de geraakte routes in **beide thema's**, en pas dan push naar main (Netlify). Volgorde van paginamigratie is op gebruiksintensiteit: eerst wat bellers de hele dag zien.

**Fase 0 — Beslissingen bevriezen** *(½ sessie)*. Dit plan goedkeuren; definitieve licht-thema-tinten en typografie-schaal vastklikken op de `/styleguide`-route met een handvol proefcomponenten. Go/no-go op preflight.

**Fase 1 — Fundament** *(1 sessie, meeste risico)*. `tokens.css` (beide thema's, incl. aliassen voor oude namen), Tailwind `@theme` erop aansluiten, preflight aan + mini-reset weg, `ThemeContext` + toggle in Header/MobileNav, `body::before` en font-import aanpassen. Daarna volledige visuele regressieronde over alle routes.

**Fase 2 — Componenten + app-chrome** *(1–2 sessies)*. `ui/`-set bouwen en tonen op `/styleguide`; `Header`, `MobileNav`, `Login` en `Toast` als eerste echte afnemers (hun `<style>`-blokken vervallen).

**Fase 3 — Pagina's** *(4–6 sessies, per stuk shipbaar)*:
1. `WorkInterface` + `Dashboard` (bellers, 84+55 inline styles) — grootste zichtbare winst;
2. `Manager` + `Reports` (dagelijkse management-schermen);
3. `Admin` + `LeadManagement` + de grote modals (ImportLeads, NewProjectWizard, ManagerProjectsModal, LeadListModal);
4. `Payouts` + `Earnings` + `PayoutSettings`;
5. Restant: `TBAs`, `Kanban`, `Telemetry`, `Setup`, `Chat`, `ActivityFeed`, `TeamLeaderboard`.

**Fase 4 — Opschonen & borgen** *(½–1 sessie)*. Oude aliassen, dode CSS-klassen en laatste inline styles verwijderen; `index.css` hoort dan ruim onder de ~400 regels uit te komen; styleguide-regels in `CLAUDE.md`; korte grep-check (`style={{`, `#`-hexen, `<style>`) als vaste controle bij toekomstige wijzigingen.

Totaal grofweg **7–10 werksessies**, maar na fase 1 is elk tussenresultaat gewoon bruikbaar en deploybaar — er is geen langlopende "verbouwing" waarin de app half af is.

## 7. Risico's en aandachtspunten

- **Preflight aanzetten** kan op elke route iets verschuiven → daarom geïsoleerd in fase 1 met volledige screenshotronde; bij te veel breuk is het terugdraaibaar (mini-reset terug) zonder de rest van het plan te raken.
- **Licht thema en statuskleuren**: de huidige status-achtergronden zijn rgba op donker; die krijgen per thema eigen waarden, anders zijn pills op wit onleesbaar.
- **Alleen visueel, geen gedrag**: routing v17, manager-rechten v20, payouts v19 en alle datalogica blijven onaangeroerd; dit plan raakt uitsluitend presentatie.
- **Build/test altijd op de Mac** (vite build werkt niet in de Linux-VM); visueel testen via preview + Chrome-screenshots zoals bij v17–v20.

## 8. Openstaande keuzes voor Noah

1. Akkoord met **Inter** voor lopende tekst (Outfit blijft voor headings/cijfers), of alles in één font?
2. Standaardthema voor bestaande gebruikers: **dark** (mijn voorstel, niemand schrikt) of light?
3. Mag het **goud/amber** als sierkleur grotendeels verdwijnen (alleen nog functioneel)?
4. Startmoment fase 0/1 — fase 1 kan het beste op een moment dat er even niet gebeld wordt, zodat een eventuele visuele misser niemand stoort.
