# LEADGEN — lees dit eerst

Dit is een CRM/belsysteem voor sales teams, gebouwd door Noah (geen programmeerachtergrond). Er werken meerdere AI's tegelijk aan dit project: Claude (Cowork), en in Antigravity Minimax en Gemini Flash. Een fout hier kost Noah tijd om op te sporen, dus volg deze regels precies.

## Verplicht: lees CLAUDE.md eerst
CLAUDE.md in de root bevat de volledige projectgeschiedenis en de actuele architectuurbeslissingen (routing, mailingservice, agenda, offertes, enzovoort). Lees dat bestand ALTIJD voordat je een bestaand systeem aanpast. Het wordt na elke grote wijziging bijgewerkt, dus het is de bron van waarheid. Niet je eigen aannames, en niet oude briefings.

## Negeer .claude/shared/inbox_*.md
Die bestanden zijn verouderd (van april 2026) en beschrijven een oude staat van de app. Ze staan nu in .claude/shared/_archief/. Gebruik ze niet als instructie. Actuele coordinatie staat in .claude/shared/STATUS.md.

## Niet-onderhandelbare regels
- Disposition-IDs moeten EXACT matchen met de keys in STATUS_MAP (src/utils/statusUtils.js). Een typefout hierin breekt de hele pipeline stil, zonder foutmelding.
- State-updates op leads: altijd `setLeads(prev => prev.map(...))`, nooit `setLeads(leads.map(...))`. Deze bug (stale closure) is meerdere keren teruggekomen in dit project.
- Nooit `alert()` of `confirm()` gebruiken. Gebruik de `useToast()` hook.
- Geen hardcoded kleuren in CSS of JSX. Gebruik de variabelen uit src/index.css en src/styles/tokens.css.
- RLS: elke nieuwe tabel met lead- of klantdata krijgt Row Level Security, gescoped op organization/project. Nooit alleen op user_id. Kijk naar een recente migratie (bijvoorbeeld v87 of v94) voor het patroon dat nu gebruikt wordt.
- Database migraties: zie .agents/rules/01-database.md. Run altijd eerst `node scripts/next-migration.mjs` om het eerstvolgende vrije nummer te weten, voor je een nieuw migratiebestand maakt.
- Grote bestanden: src/components/WorkInterface.jsx, src/pages/Admin.jsx, src/components/ImportLeadsModal.jsx, src/pages/LeadBoard.jsx, src/pages/LeadManagement.jsx en src/pages/Recruitment.jsx zijn allemaal 55KB of groter. Lees eerst het hele relevante deel voor je erin wijzigt. Niet blind een losse regel patchen zonder de context eromheen te zien.
- Voor je een taak als afgerond beschouwt: run `npm run build` lokaal. Als dat faalt, is de taak niet klaar.
- Commit na elke afgeronde wijziging met een duidelijke, beschrijvende message (bijvoorbeeld `fix: ...` of `feat: ...`). Niet alles in een enkele grote commit proppen.

## Als je aan iets werkt waar een andere agent ook mee bezig kan zijn
Zet een kort briefje in .claude/shared/STATUS.md: wat je doet, welke bestanden je aanraakt, en sinds wanneer. Overschrijf je eigen vorige regel, laat het bestand niet aangroeien tot een archief.
