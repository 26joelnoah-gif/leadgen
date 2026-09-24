# Plan: nieuw design doorvoeren zonder iets kapot te maken

Stand 24-09-2026. Voorbeeld: design-artifact "LEADGEN nieuw design" (stijl "Rustig werkblad").
Dit plan is leidend voor elke AI die aan het design werkt (Claude, Antigravity).

## De drie regels

1. **Uiterlijk en werking blijven gescheiden.** Een design-stap verandert nooit een
   Supabase-call, hook, handler, status-key of RLS. Alleen markup, classes en CSS.
   Zie je in een design-diff een `supabase.`, `useEffect`, `handle...` of een
   status veranderen: stoppen, apart oppakken.
2. **Alles achter een schakelaar.** Het nieuwe design zit achter
   `<html data-design="v2">`. Uit = de app ziet er precies zo uit als nu.
   Eerst alleen Noah, dan een paar bellers, dan iedereen.
3. **Kleine stappen, elke stap live te testen en terug te draaien.**
   Een scherm per commit. Terugdraaien = schakelaar uit (direct) of `git revert`.

## Wat er nu is (waar het mis kan gaan)

| Risico | Omvang | Aanpak |
|---|---|---|
| Inline styles in JSX | ~2.100 | Niet in een keer omzetten. Per scherm, alleen wat dat scherm raakt. |
| Losse hex-kleuren in JSX | ~140 | Vervangen door tokens, per scherm. Anders klopt licht/donker niet. |
| Gedeelde classes (`.btn` 287x, `.glass-panel` 80x, `.form-control` 89x) | hele app | Nieuwe look via CSS onder `[data-design="v2"]`, zodat oude schermen niet omvallen. |
| WorkInterface.jsx (1.700 regels, veel hooks) | belscherm | Alleen presentatie-stukjes afsplitsen naar kleine componenten. Hooks blijven boven de early return (bekende crash-oorzaak). |
| CSS-lagen (Tailwind v4) | hele app | Nieuwe CSS alleen met eigen classes; geen kale element-selectors buiten `@layer base` (zie leadgen_css_layers). |
| Parallelle sessies (Antigravity) in dezelfde bestanden | alles | Voor elke stap `git status`; werk van een ander nooit meecommitten. Taak melden in `.claude/shared/STATUS.md`. |
| Publieke pagina's (`/tekenen`, `/aanmelden`, homepage, offerte-PDF's) | klantzichtbaar | Buiten v2 houden tot Noah de klanttekst en look apart goedkeurt. |
| Modals, PersonSelect (portal), Leaflet-kaart, Agenda-raster | los van pagina | Apart nalopen: z-index, scrollen, kleuren in beide thema's. |
| Telefoon | bellers buiten | Elke stap ook op 390 px breed checken. |

## Fases

### Fase 0: vangnet (eerst, geen zichtbare verandering)
- Schakelaar bouwen: `data-design` op `<html>`, instelbaar per gebruiker
  (profiel-veld `ui_design`, standaard `v1`) plus een snelle wissel voor admin.
  Uitloggen/inloggen houdt de keuze.
- Checklijst per scherm maken (zie Testen) en de overflow-check als klein script
  in `scripts/` zetten, zodat elke stap hetzelfde getest wordt.
- `npm run smoketest` en `vite build` moeten groen zijn voor elke push.

### Fase 1: kleuren en letters (alleen tokens)
- In `src/styles/tokens.css` een blok `[data-design="v2"]` met de nieuwe waarden
  op de BESTAANDE token-namen (`--bg-page`, `--bg-card`, `--accent`, statuskleuren...).
  Geen JSX-wijziging: alles wat al tokens gebruikt, kleurt vanzelf mee.
- Fonts (Manrope koppen, IBM Plex Sans tekst, IBM Plex Mono cijfers) alleen
  laden en toepassen onder v2.
- Check: licht en donker, alle rollen. Nog niets aan layout.

### Fase 2: basisonderdelen (alleen CSS)
- `.btn`, `.card`/`.glass-panel`, `.form-control`, `.table`, `.modal`, `.tab-bar`,
  `.stat-card`, statuslabels: nieuwe look onder `[data-design="v2"]`.
- Nieuwe kleine React-onderdelen in `src/components/ui/` (Button, Chip, Panel,
  Field, Segmented). Worden pas gebruikt in fase 3; bestaan naast de oude.

### Fase 3: scherm voor scherm (markup)
Volgorde op belang voor de bellers, een scherm per commit:
1. **Belscherm** (WorkInterface): kopregel met grote Bellen-knop en nummer,
   Contactkaart, Notities + geschiedenis, afboekbalk in 3 groepen met "Meer ...".
   Presentatie in `src/components/belscherm/*` (alleen props, geen eigen data).
2. **Leadbord** (/leads): kolommen en kaarten, werkbalk.
3. **Projecten & leads** (Admin): projectkaarten, lijsttabel.
4. **Dashboard**: "Nu te doen", team vandaag, live.
5. **Sollicitanten**, **Agenda**, **Rapportage**, **Roosters**, **Tools**, **Admin > Team**.
6. Modals en kleine schermen als laatste.
Na elk scherm: schakelaar alleen voor Noah aan, hij klikt het door, dan pas verder.

### Fase 4: iedereen over en opruimen
- Schakelaar voor iedereen op v2. Een week laten staan met v1 als noodknop.
- Daarna: v1-CSS, oude token-aliassen, `polish.css`-overrides en losse hex-kleuren weg.
- CLAUDE.md bijwerken met de nieuwe regels.

## Afboekknoppen (hoort bij het belscherm)
- Per project aan/uit: gebouwd in v104 (`campaigns.hidden_dispositions`,
  Projectinstellingen > "Afboekknoppen in het belscherm").
- In het nieuwe belscherm: de eerste 8 zichtbare knoppen direct in beeld, de rest
  onder "Meer ...". Op de telefoon de eerste 5 plus "Meer ...".
- Sneltoetsen 1 t/m 8 alleen als je NIET in een invoerveld typt, anders komen
  cijfers in de notitie. Eerst voorleggen aan Noah.

## Testen per stap
- `npx vite build` groen, `npm run smoketest` groen.
- Doorklikken als: admin, beller, recruiter, accountmanager, planning, extern.
- Belscherm: lead openen, notitie opslaan, elke afboeking die aan staat een keer
  (op een testlead), "Meer ...", afspraak met agendakeuze, sluiten (lock weg).
- Leadbord: slepen naar elke kolom (telt als bord-actie in Rapportage), Toon meer,
  contactkaart, mail-knop.
- Breedtes 1440, 1280 en 390 px; donker en licht; overflow-script geeft niets.
- Foutlogboek (Admin) na een dag nalopen op nieuwe fouten.

## Terugdraaien
- Direct: schakelaar op v1 (per persoon of voor iedereen).
- Code: `git revert <commit>` van dat ene scherm; Netlify zet het binnen 2 minuten live.
