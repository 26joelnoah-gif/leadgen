# ReachConnect — Project Visie & Context

> Werk je hier vanuit Antigravity (Minimax of Gemini)? Lees eerst `.agents/rules/00-start-here.md`, dat wordt automatisch geladen en verwijst hierheen terug. Dit bestand blijft de volledige bron van waarheid voor alle AI's op dit project.

## Eigenaar
Noah Ando — info@reachconnect.nl

## Hoe er gewerkt wordt
- Claude Code is de standaard voor bouwen aan dit project.
- Antigravity wordt erbij gepakt als de Claude-usage vol zit, en om door de code te bladeren of even een .env-bestand erbij te halen.
- Noah bouwt zelf, zonder programmeerachtergrond. Leg keuzes kort uit in gewone taal, niet in jargon.

## Huidige Status
Werkend CRM/belsysteem voor eigen gebruik:
- Lead management + dialer (WorkInterface)
- Supabase backend (auth, realtime, PostgreSQL)
- Netlify deploy
- Multi-user met rollen (admin/employee)
- Teams, lijsten, flows, payouts

## Visie — Waar naartoe

### Fase 1 (Nu): Intern werkend CRM
Stabiel en betrouwbaar systeem voor eigen sales team.
Prioriteit: bugs fixen, core flows werkend, data betrouwbaar.

### Fase 2: SaaS — Bedrijven als klanten
ReachConnect wordt een platform waar **bedrijven zich aanmelden**.
- Elk bedrijf krijgt eigen omgeving (multi-tenant)
- Eigen leads, eigen team, eigen flows
- Maandelijks abonnement

### Fase 3: Marketplace
Twee-zijdig platform:
- **Bedrijven** plaatsen klussen (lead lijsten die gebeld moeten worden)
- **Freelance appointment setters / sales freelancers** schrijven in op klussen
- Freelancers verdienen **per lead** (deal/afspraak = uitbetaling)
- Platform verdient commissie op elke transactie

### Fase 4: Data Verrijking
- Integraties: Apollo, LinkedIn, KVK, scrapers
- Bedrijven kunnen ruwe data uploaden → platform verrijkt automatisch
- Verrijkte data direct inzetbaar voor bellers

## Kernwaarden van het Platform
- Snelheid voor bellers (minimale clicks per dispositie)
- Transparantie voor opdrachtgevers (realtime stats)
- Eerlijke uitbetaling voor freelancers (per resultaat)

## Tech Stack
- Frontend: React + Vite + Framer Motion
- Backend: Supabase (PostgreSQL + Auth + Realtime)
- Deploy: Netlify
- Styling: Custom CSS dark theme (--bg-dark: #0F1117, --primary: #22C55E, --secondary: #F59E0B)

## Agent Taakverdeling
- **Minimax** (Claude terminal Antigravity): complexe refactors, hooks, logica
- **Gemini Flash** (apart venster Antigravity): snelle targeted fixes, CSS, simpele wijzigingen
- **Claude (Cowork)**: architectuur, bugs vinden, directe fixes, visie bewaken

**2026-09-22:** regels voor Antigravity staan nu ook los in `.agents/rules/` (wordt automatisch geladen, geen copy-paste meer nodig). Losse taak-briefings gaan in `.claude/shared/STATUS.md` (korte momentopname, overschrijven bij elke update). De oude `inbox_*.md`-bestanden zijn verouderd en verplaatst naar `.claude/shared/_archief/`.

## Belangrijke Beslissingen
- WorkInterface = globale overlay via AuthContext (niet prop-based)
- Calling mode = WorkInterface met listId, itereert door leads
- Disposities matchen exact met STATUS_MAP keys
- **ROUTING V17 (2026-08-20):** een lead blijft ALTIJD in zijn projectlijst.
  Een afboeking verandert alleen de status + schrijft een call_log-rij.
  Er worden nooit automatisch lijsten aangemaakt of leads verplaatst.
  flow_settings bepaalt alleen nog toewijzing (agent/none/keep) + notitie-tag.
  DB-trigger tr_lead_flow_automation (v9) is verwijderd — dispositie-logica
  leeft uitsluitend in useLeads.handleLeadDisposition.
- Belwachtrij in WorkInterface = leads uit de lijst zonder eindstatus en
  zonder toekomstige next_contact_date; volgende lead is altijd listLeads[0].
- Quick-disposities (1 klik, geen modal): geen_interesse, onjuiste_timing,
  geen_gehoor, verkeerd_nummer.
- Rapportage (/admin/reports) draait volledig op call_logs:
  beltijd per beller + resultaat per gesprek/lead.

- **BACKOFFICE / MONTEUR-INPLANNEN (v47, 2026-08-26):** sales die nog
  nagebeld moeten worden om de monteur in te plannen staan NIET meer op
  status 'deal' (die is in de gewone verkoop-wachtrij een eindstatus en
  dus onbelbaar voor een gewone beller). Nieuwe status 'bruto_deal' voor
  precies dat tussenmoment. Telt overal (Payouts/Earnings/Dashboard/
  Reports/XP) net zo mee als 'deal' - alleen de sleutel is anders.
  claim_next_backoffice_lead + de backoffice-wachtrij in WorkInterface
  filteren nu op 'bruto_deal'. Import van een backoffice-project
  (ImportLeadsModal) en het live sluiten van een DEAL binnen een
  campagne van het type 'backoffice' (WorkInterface) zetten beide
  'bruto_deal'. Recruitment gebruikt 'deal' nog gewoon voor "aangenomen"
  - andere betekenis van dezelfde status-key, bewust ongemoeid.

- **OFFERTE-TEKENLINK (v65, 2026-09-06, GEBOUWD):** offertes op
  afstand tekenen via /tekenen/<token>. Migratie toegepast, Edge Functions
  offerte-send/offerte-sign live, end-to-end getest. Secrets nog zetten:
  RESEND_API_KEY, RESEND_FROM, APP_URL. Spec: docs/OFFERTE_TEKENLINK_SPEC.md.
  Twee regels: het tekenen (offerte-send / offerte-sign Edge Functions +
  tekenpagina) werkt ALLEEN met de kolommen van public.offertes en kent geen
  pakketten/prijsmodel; afzender en branding komen uit organizations/profiles,
  nooit hardcoded. offertes.lead_id koppelt aan de lead; nieuwe lead-status
  offerte_verzonden (geen eindstatus, komt terug via next_contact_date);
  tekenen via link zet lead automatisch op bruto_deal/deal met call_log
  source='offerte_remote' en duration 0.

- **OFFERTE VANUIT LEAD PER PROJECT (v66, 2026-09-06):** "Offerte maken"
  staat nu in het belscherm (WorkInterface, sub-header, nieuw tabblad), op de
  contactkaart en in Outside, en verschijnt ALLEEN als offerte_bestelplatform
  in campaign_tools van het project van die lead staat (admin altijd). Hook:
  src/hooks/useProjectTools.js (lead_list_id -> campaign_id -> campaign_tools)
  + offerteHrefForLead(). useToolAccess (union) blijft alleen voor de Tools-tab.
  De tool zelf vult naam/contact/mail/tel/adres al in via ?lead= (v65).

- **MAILINGSERVICE (v69, 2026-09-11):** knop "Mailingservice" bij de
  afboekingen in het belscherm, per project aan te zetten in de
  projectinstellingen (tabel campaign_mail_services, alleen admin schrijft).
  Per project een BRON (bijv. MARKETINGKIEZER); URL en sleutel van een bron
  staan alleen in Supabase secrets MAILSERVICE_<BRON>_URL / _KEY, nooit in de
  DB of browser. Edge Function mailingservice checkt login + lead via RLS +
  project, remt (40/uur per beller, 1x per 24u per lead, log in
  mailservice_logs) en roept de bron aan. De bron bepaalt de tekst (MK:
  lib/leadgenMail.ts in de MK-repo). Na succes boekt WorkInterface af op
  nieuwe status 'mail_verstuurd' via handleLeadDisposition: geen eindstatus,
  geen deal, terug in de wachtrij na follow_up_days (standaard 5).
  Migratie: migration_v69_mailingservice.sql. ReachConnect doet niets met betalingen.

- **MAILSTATUS + TWEE MAILSOORTEN (v70, 2026-09-14):** de bron meldt terug hoe
  ver een gemailde lead komt. Edge Function `mailstatus` (verify_jwt = false,
  eigen sleutel in Supabase secret MAILSTATUS_KEY, bij de bron LEADGEN_STATUS_KEY)
  neemt POSTs aan van MarketingKiezer:
  { lead_id, email, bureau, mail_soort, status, status_op, offerte_url }.
  Sleutel mag in Authorization: Bearer, x-leadgen-key of x-api-key.
  Stappen: gemaild -> link_geklikt -> offerte_open -> getekend -> betaald.
  Opslag in public.lead_mail_status, één rij per lead + bron + mailsoort, met
  een eigen datumkolom per stap en status_rank als bewaking: een late of dubbele
  melding zet de lead nooit terug. Alleen de functie (service role) schrijft;
  lezen mag iedereen binnen de organisatie. Tabel zit in supabase_realtime.
  Tonen: MailStatusBriefing in het belscherm (onder OfferteBriefing) en
  MailStatusBlok op de contactkaart. ReachConnect verandert leads.status NIET op
  een mailstatus - 'getekend'/'betaald' bij MK is geen ReachConnect-deal.
  Daarnaast: campaign_mail_services.mail_types (standaard
  {introductie,aanmelden}) bepaalt welke mailsoorten een beller mag kiezen;
  MailingserviceModal toont daar knoppen voor (Infomail / Aanmeldmail) en stuurt
  de keuze als `mail` naar de functie mailingservice, die valideert tegen
  mail_types. mail_type blijft de standaardkeuze. De 24-uursrem geldt nu per
  mailsoort, zodat na de infomail dezelfde dag nog een aanmeldmail kan.
  Labels van de soorten staan in src/lib/mailSources.js (MAIL_TYPES).
  Migratie: migration_v70_mailstatus.sql.

- **MAILS AUTOMATISCH LATER VERSTUREN (v83, 2026-09-18):** in de
  Mailingservice-popup kiest de beller "Later versturen" (morgen 09:00, over
  3 dagen, volgende week, zelf kiezen) of "Handmatig". Dat komt in
  mail_queue.send_at (null = handmatig, v78). pg_cron-job
  reachconnect-mailqueue-runner roept elke 5 min public.mail_queue_kick() aan, die
  via pg_net de Edge Function mailqueue-runner (verify_jwt uit, eigen sleutel
  uit Vault 'mailqueue_cron_key' via public.mailqueue_cron_key(), alleen
  service_role) aanroept. De runner verstuurt ALLEEN op werkdagen 08:00-18:00
  NL, naar dezelfde bron als handmatig (MAILSERVICE_<BRON>_*), met dezelfde
  remmen (40/uur per beller, 1x per 24u per mailsoort). Gelukt: rij
  'verzonden', lead mail_verstuurd + opvolgdatum, activiteit op naam van de
  beller. Mislukt: rij status 'fout' + last_error, lead blijft mail_gepland;
  Mailinglijst toont de fout met "Opnieuw" en een klok-knop om het moment te
  wijzigen. ReachConnect mailt zelf nooit; niets gaat via ReachConnect.
  Migratie: migration_v83_mail_queue_send_at.sql (toegepast).

- **MAILRAPPORTAGE, WARME LEADS, AUTO-VERRIJKING, MAILTELLER (v82,
  2026-09-18):** vier dingen voor de MarketingKiezer-bellers.
  1. Tabblad "Mails" op /admin/reports (Reports.jsx): per beller mails
     verstuurd (per soort), leads gemaild, link geklikt, offerte open,
     getekend, betaald (uit lead_mail_status, hoogste stap per lead+soort),
     nog gepland (open rijen in mail_queue) en klikpercentage; KPI-kaarten
     wisselen mee; CSV-export; lijst met de laatste mails (niet bij kpi_only).
     RLS: mailservice_logs_select laat nu ook campaign_managers van het project
     lezen (functie my_managed_campaign_ids, security definer).
  2. Warme leads (LeadBoard.jsx): lead_mail_status rang 2 of 3 (geklikt /
     offerte open) en geen eindstatus = warm. Staat bovenaan in lijst, bord-
     kolom en kaart, vlammetje op de kaart, filterknop "Warm (n)", regel
     "n warme leads: bel die eerst". Edge Function mailstatus (v5) schrijft bij
     elke echte stap vooruit vanaf rang 2 een melding (notifications, type
     lead_warm) voor assigned_to/locked_by van de lead, anders de managers van
     het project. Getekend/betaald geeft ook een melding, maar is niet "warm".
  3. Auto-verrijking (campaigns.auto_enrich, aan voor de bord-projecten):
     na een import in zo'n project draait ImportLeadsModal op de achtergrond
     enrich-lead met { auto: true } in blokjes van 10 (max 100) voor leads met
     website maar zonder e-mail of contactpersoon; voortgang op het
     "Import gelukt"-scherm. Edge Function enrich-lead (v7): toegang is nu
     admin, of can_manage_leads (elke rol), of auto=true voor leads in
     projecten met auto_enrich (via de RLS van de gebruiker); auto doet ALLEEN
     de gratis website-scan, nooit Perplexity. Vinkje in ProjectSettingsModal.
     enrichment_logs_insert: elke actieve gebruiker mag eigen regels loggen.
  4. Mailteller (src/components/MyMailStats.jsx) op het beller-dashboard:
     mails vandaag/week/totaal, link geklikt, warme leads, nog te versturen;
     verschijnt pas na de eerste mail via de Mailingservice.
  Migratie: migration_v82_mailrapportage_warm_enrich.sql (toegepast).

- **MAILINGSERVICE-POPUP EEN KEUZE + EEN KNOP (v84, 2026-09-18):** in
  MailingserviceModal staat nu een keuze "Wanneer versturen?" (Nu versturen
  standaard aan, Morgen 09:00, Over 3 dagen, Volgende week, Zelf kiezen,
  Handmatig) met een knop die meebeweegt (nu versturen / inplannen / bewaren
  in Mailinglijst). Handmatig = bewaren zonder send_at, niet "nu". De popup
  heeft maxHeight + overflowY zodat hij op kleine schermen scrolt.

- **TEAMCHAT LIVE + 24 UUR (v85, 2026-09-18):** oorzaak van "chat werkt niet":
  tabel messages zat niet in de publicatie supabase_realtime, dus berichten van
  collega's kwamen nooit live binnen en eigen berichten bleven op
  "verzenden..." staan. Fix: messages in de publicatie, Chat.jsx laadt de
  NIEUWSTE 50 (was de oudste 50), vervangt het tijdelijke bericht door de
  echte rij (insert().select() + dedupe op id in realtime), en escapet geen
  < > meer (React doet dat al). Berichten ouder dan 24 uur worden elk uur
  verwijderd door public.chat_cleanup(24) via pg_cron-job reachconnect-chat-cleanup;
  de app haalt alleen de laatste 24 uur op en toont dat onder het invoerveld.
  Migratie: migration_v85_chat_realtime_cleanup.sql (toegepast).

- **PRULLENBAK VOOR MEDEWERKERS (v86, 2026-09-20):** aanleiding: drie profielen
  per ongeluk verwijderd, met cascade van team_members/availability. Nu zet
  "Verwijderen" op de medewerkerskaart (Admin > Team) profiles.deleted_at +
  is_active=false: kan niet inloggen, staat nergens meer in lijsten (alle
  profiles-selects filteren .is('deleted_at', null); Admin splitst users /
  trashedUsers), maar rechten, teams, roosterdagen en gekoppelde leads blijven
  staan. Paneel "Prullenbak" naast Organisaties: Terugzetten (deleted_at null +
  is_active true) of Definitief verwijderen (2x klikken = de oude v31-delete).
  pg_cron-job reachconnect-profiles-trash-purge draait dagelijks 03:30 UTC
  public.profiles_trash_purge(30). Nieuwe lijsten met medewerkers: altijd ook
  op deleted_at is null filteren. Migratie: migration_v86_prullenbak_medewerkers.sql
  (toegepast). Terugzetten maakt altijd actief, ook als iemand vóór het
  verwijderen al inactief stond.

- **LEAD BLIJFT VAN DE EIGENAAR, OOK BUITEN ACTIEVE VERGRENDELING (v87,
  2026-09-21):** aanleiding: Noah opende een lead ("Havas Media", status
  mail_gepland) die aan Lily was toegewezen maar op dat moment niet actief
  vergrendeld was (locked_by leeg). claim_lead pakte hem zonder waarschuwing
  en zonder melding aan Lily, en het bord toonde hem meteen als "Jouw lead".
  Fix: claim_lead (migration_v87) telt een lead nu ook als "bezet" wanneer
  hij eerder aan iemand anders is toegewezen (assigned_to), ook zonder
  actieve locked_by - net als bij een actief vergrendelde lead (v75) krijg
  je hem zonder p_force niet, en met overnemen krijgen jullie allebei een
  melding. LeadBoard.jsx: openLead/handleBoardDrop tonen nu ook de
  "Lead overnemen?"-popup wanneer een lead alleen assigned_to is (niet
  locked_by) aan een collega; de popup-tekst en de "wie heeft hem"-naam in
  doeOvername vallen terug op assignedNames als er geen actieve lock is.

- **ACCOUNTMANAGER ROL, AGENDA & TIJDSBLOKKADES (v94, 2026-09-22, migratie toegepast):**
  Nieuwe rol 'accountmanager' in profiles_role_check.
  1. Werkplek accountmanager: landt direct op het leadbord (/leads) en heeft
     een afsprakenagenda (/agenda) met week- en lijstweergave.
  2. Blokkades: accountmanager kan tijdvakken blokkeren via tabel agenda_blocks
     (start_at, end_at, title), met RLS (inzage hele org, beheer eigen regels + admin).
  3. Inplannen door bellers: WorkInterface en LeadBoard controleren realtime
     tegen agenda_blocks en bestaande afspraken van de gekozen accountmanager.
     Bij conflict wordt inplannen geblokkeerd en toont het scherm een duidelijke
     waarschuwing.
  4. Rol-switcher voor admin: Noah kan via een subtiele pill in de header
     en op het Dashboard direct wisselen tussen Admin, Beller en Accountmanager
     (globaal en per project) zonder uit te loggen.
  Migratie: migration_v94_accountmanager_agenda.sql (toegepast op Supabase).

- **v94-NAZORG (2026-09-22): drie regressies van de eerste Antigravity-poging
  gefixt.** Antigravity had de rol-switcher (effectiveRole) en de bijbehorende
  UI gebouwd, maar drie dingen gingen mis:
  1. Sollicitanten (en de rest van het Beheer-menu: Rapportage, Payouts, etc.)
     verdwenen uit de header zodra admin naar Beller/Accountmanager schakelde,
     en dat bleef hangen in localStorage (ook na herladen/opnieuw inloggen).
     Oorzaak: Header.jsx toonde het Beheer-menu op `isAdmin` (= de GEKOZEN
     werkmodus), niet op de echte rol. Gefixt: het Beheer-menu gebruikt nu
     altijd `isRealAdmin` (de echte profile.role), dus een admin kan het nooit
     meer kwijtraken, ongeacht welke werkmodus actief is.
  2. Sollicitanten-tellers stonden op (bijna) 0: Recruitment.jsx liet admin
     altijd maar 1 recruitment-lijst zien (`recruitmentLists[0]`), niet alle
     lijsten gepoold. Antigravity's eerste poging om dit te fixen voegde een
     eigen ongepagineerde query toe (`fetchRecruitmentLeads`) die tegen
     Supabase's default limiet van 1000 rijen kon aanlopen - dezelfde bug als
     v93 net had opgelost. Vereenvoudigd: baseApplicants poolt nu gewoon alle
     recruitment-lijsten uit de leads die useLeads() al compleet en
     gepagineerd ophaalt voor admin, met een dropdown om te filteren op 1
     lijst. Geen aparte query meer nodig.
  3. De migratie (profiles_role_check + tabel agenda_blocks) stond wel in de
     repo maar was nog niet uitgevoerd in Supabase, dus de rol 'accountmanager'
     opslaan of de agenda gebruiken zou een DB-fout hebben gegeven. Nu
     toegepast.
  Klein: Agenda.jsx gebruikte window.confirm() bij het verwijderen van een
  blokkade - dat mag niet (zie CLAUDE.md-regels), vervangen door hetzelfde
  "klik nogmaals" patroon als Admin > Prullenbak. En AuthContext.signOut()
  wist nu ook reachconnect-effective-role/reachconnect-project-roles uit localStorage,
  zodat een nieuwe sessie altijd met de echte rol start.

- **"ZET IN AGENDA" - VISUELE AGENDAKEUZE BIJ AFSPRAAK GEMAAKT (v96,
  2026-09-22):** bij "Afspraak gemaakt" in het belscherm (projecten met
  appointment_scheduling_enabled) typte de beller voorheen blind een datum/tijd
  en zag pas na een losse conflictcheck of de accountmanager al bezet was.
  Nieuwe knop "Zet in agenda" naast dat veld opent AgendaPickerModal.jsx: een
  compacte weekagenda (zelfde databronnen als Agenda.jsx - leads met
  status afspraak_gemaakt in projecten met appointment_scheduling_enabled, en
  agenda_blocks) met een keuzemenu voor de accountmanager. Bezette/geblokkeerde
  tijd is niet aanklikbaar (client-side overlapcheck tegen dezelfde
  APPOINTMENT_DURATION_MINUTES als de bestaande conflictcheck); klikken op een
  vrij moment + "Bevestig dit moment" vult gewoon selectedAmId en
  nextContactDate in WorkInterface.jsx (via toDatetimeLocalValue) - de
  bestaande conflictcheck-useEffect en de rest van de afhandel-flow blijven
  ongewijzigd. Puur een fijnere manier om bij die twee velden te komen, geen
  nieuwe databronnen of migratie nodig.

- **AFSPRAAKDETAILS, NAVIGATIE, AFBOEKEN DOOR AM, VERPLAATSEN/VERWIJDEREN
  (v97, 2026-09-22, migratie toegepast):**
  1. Inplannen (belscherm WorkInterface EN bord LeadBoard confirmDatePrompt,
     alleen projecten met appointment_scheduling_enabled): contactpersoon,
     straat, plaats en sentiment zijn verplicht (huisnr/postcode optioneel).
     Sentiment = nieuwe kolom leads.appointment_sentiment
     (positief/neutraal/negatief). Adres gaat in de bestaande adreskolommen.
  2. Agenda: klik op een afspraak opent AppointmentModal.jsx met bel-link,
     adres als navigatieknop (Google Maps dir-link) en afboeken.
  3. Afboeken door de accountmanager van de afspraak (of admin/manager):
     leads.appointment_outcome = wil_nadenken | deal | betaald (+ _at/_by).
     deal/betaald zetten leads.status op 'deal' (sale_date als die leeg is),
     wil_nadenken laat status op afspraak_gemaakt. Agenda toont nu status
     afspraak_gemaakt EN deal, gekleurd per uitkomst.
  4. Verplaatsen (slepen of via de popup, incl. andere AM) en verwijderen mag
     alleen profile.role admin/manager. Verplaatsen doet de conflictcheck
     (findAppointmentConflict in src/lib/appointments.js). Verwijderen =
     appointment_at leeg, status later_bellen, next_contact_date nu,
     assigned_to leeg (lead terug in de pool), met activity-log.
  Migratie: migration_v97_afspraak_details_uitkomst.sql.

- **AVG/ACM-COMPLIANCE (v98, 2026-09-23, migratie toegepast, Edge Functions
  mailstatus v8 / mailingservice v9 / mailqueue-runner v2 live):**
  Aanleiding: sinds 1 juli 2026 (art. 11.7 Tw) mag je zonder toestemming
  alleen rechtspersonen bellen (bv, nv, stichting, vereniging, cooperatie).
  Eenmanszaak, vof, cv, maatschap = opt-in zoals consumenten.
  1. leads.rechtsvorm (+_bron naam|import|kvk_beller|handmatig, _at, _by).
     Trigger haalt hem uit de naam ("B.V.", "VOF") bij insert/naamwijziging.
     Import herkent kolom "Rechtsvorm" (ook bij Verrijken). Toestemming =
     bestaande opt_in_* (v65) + opt_in_bewijs; alleen admin/manager mag
     opt-in zetten (behalve Outside 'door'), trigger leads_compliance_guard.
  2. campaigns.doelgroep (zakelijk | particulier | geen_telemarketing | null =
     niet ingesteld = geen filter) + rechtsvorm_modus (waarschuwen | streng) +
     compliance_checklist/compliance_ok_at. Regel: lead_belstatus_basis() ->
     ok | kvk_check | toestemming_nodig | afgemeld; zelfde regel in JS
     (src/lib/compliance.js leadBelstatus). claim_next_lead laat alleen ok en
     kvk_check door. Belscherm verbergt het nummer tot de beller de
     rechtsvorm kiest (KvK-link), knop "Niet bellen, volgende lead".
  3. Afmeldlijst public.contact_blokkades (sha256 van e-mail/telefoon(9
     cijfers)/domein). blokkeer_contact()/blokkeer_lead() markeren ALLE
     leads met die gegevens: afgemeld_at + status blacklist (klantstatussen
     houden hun status). Beller zet blacklist -> trigger meldt af. Nieuwe lead
     of gewijzigd adres die op de lijst staat -> meteen afgemeld. Recruitment
     doet niet mee. Systeemupdates zetten set_config('leadgen.systeem','1')
     zodat lock-/eigenaar-triggers ze doorlaten.
  4. mailstatus: 'afgemeld' = blokkeer_lead + melding; 'later_mailen' =
     leads.mail_pauze_tot (later_op of +90 dagen), geplande mails weg.
     'terugbellen' zet nu opt_in (web) op de terugbel-lead. mailingservice en
     mailqueue-runner checken mail_geblokkeerd() (afgemeld, e-mail/domein op
     de lijst, mailpauze).
  5. Wissen: leads_wissen_intern() verwijdert echt (call_logs.notes leeg,
     mailservice_logs.email leeg, rest via FK), logt aantal in lead_wis_log.
     pg_cron reachconnect-afgemeld-wissen (elk uur, 48 uur na afmelden) en
     reachconnect-bewaartermijn (02:45 UTC, 12 maanden niets mee gebeurd +
     prullenbak ouder dan 12 maanden). Nu wissen: RPC
     afgemelde_leads_wissen_nu (admin/manager) via filter "Afgemeld" op /leads.
  6. Klachtenlog: public.compliance_meldingen (klacht|bezwaar|avg_verzoek|acm|
     anders, tekst, datum, afgehandeld). Knop "Compliance-melding" in
     belscherm en contactkaart, overzicht in Admin > Compliance.
  7. Checklist: src/components/ComplianceChecklist.jsx, stap 4 in
     NewProjectWizard en blok in ProjectSettingsModal. Cijfers via
     project_compliance_stats(). Migratie: migration_v98_compliance.sql.
  8. (v98f) Tabel public.afmeldingen: bedrijfsnaam + bron + reden + project per
     afmelding, blijft staan na het wissen van de lead (Admin > Compliance).
     Mailpauze (later_mailen) zichtbaar als chip + filter "Later mailen" op
     /leads, blok in belscherm/contactkaart en lijst in Admin > Compliance.
     norm_domein neemt alleen het echte domein ("x.nl](https://x.nl" -> x.nl).

- **IN NIEUW KWARTAAL BELLEN (v99, 2026-09-23, migratie toegepast):**
  Per project aan te zetten in ProjectSettingsModal (campaigns.kwartaal_bellen_enabled),
  aan voor PROSELL. Belscherm (WorkInterface) toont dan de knop "NIEUW KWARTAAL":
  beller kiest een van de komende 4 kwartalen. RPC public.lead_naar_kwartaal(lead, kwartaalstart)
  (security definer, zelfde toegangsregel als claim_lead) zoekt of maakt de lijst
  "Q<n> <jaar>" in hetzelfde project (kopie van assigned_to/team/tarieven van de bronlijst),
  verplaatst de lead en geeft de opvolgdatum terug: eerste werkdag van het kwartaal
  (niet 1 januari) 09:00 NL. Daarna gewone afboeking 'later_bellen' met die datum en
  notitie "Nieuw kwartaal: bellen in Q1 2027". Bewuste uitzondering op ROUTING V17
  (lead blijft in zijn lijst): hier verplaatst de beller hem zelf met deze knop.
  Geen activate_at op de kwartaallijst, anders ziet de beller de lead niet meer.
  Migratie: migration_v99_nieuw_kwartaal.sql.

- **RATE LIMITING + OPEN NETLIFY-FUNCTIE DICHT (v100, 2026-09-24, migratie
  toegepast, Edge Functions live):**
  1. netlify/functions/create-user.js maakte met de service-role key accounts
     (ook admin) aan ZONDER te checken wie belde. Nu uitgeschakeld (altijd
     410). SUPABASE_SERVICE_ROLE_KEY hoort NIET in de Netlify-omgeving.
  2. Tabel public.rate_limit_hits + public.rate_limit_hit(key, max,
     window_seconds) -> true = te veel (vast venster, alleen service_role).
     pg_cron reachconnect-rate-limit-cleanup ruimt rijen ouder dan 2 dagen op.
     In Edge Functions: helper teVeel() (faalt open) + clientIp().
  3. Limieten: signup-freelancer 5/uur per IP, 3/uur per e-mail, 50/uur
     totaal; check-signup-status 120 per 10 min per IP; enrich-lead 30
     aanroepen/uur per gebruiker (handmatig en auto apart, 1 aanroep = max
     10 leads); parse-paste 30/uur per gebruiker. Bestond al: mailingservice/
     mailqueue-runner 40/uur per beller, offerte-sign 40 per 10 min per IP
     (in-memory). Nieuwe publieke of betaalde functies: altijd teVeel() erin.
  Migratie: migration_v100_rate_limit.sql.


- **RLS SNELLER + BLOKKEER_LEAD DICHT (v101, 2026-09-24, migratie toegepast):**
  Aanleiding: 98x "statement timeout" (8 s) op /rest/v1/leads in 24 uur bij
  bellers. Oorzaak: RLS-policies riepen is_admin()/my_org_id()/my_list_ids()/
  my_managed_list_ids()/am_list_ids() enz. PER RIJ aan, ook in de geneste
  lead_lists- en campaigns-policies. Lily: 4,8 s voor 1.326 leads, na de fix 27 ms.
  Fix: alle policies in public herschreven naar (SELECT f()) - array-functies als
  ((SELECT f())::uuid[]), anders leest Postgres "= ANY ((SELECT ..))" als subquery.
  REGEL: nieuwe policies ALTIJD zo schrijven: (SELECT is_admin()),
  lead_list_id = ANY ((SELECT my_list_ids())::uuid[]), (SELECT auth.uid()).
  Het script in migration_v101 is idempotent en mag opnieuw gedraaid worden na
  een migratie die policies toevoegt.
  Verder: blokkeer_lead checkt nu of de aanroeper de lead mag zien (was: iedereen
  kon elke lead afmelden -> 48 u later gewist). auth.uid() leeg = service_role.
  14 SECURITY DEFINER-functies niet meer uitvoerbaar door anon/public
  (unlatched_intake blijft open voor de externe intake).
  Migratie: migration_v101_rls_snelheid_rechten.sql.

- **SCHAALBARE MEDEWERKER-KIEZERS + TEAM-OVERZICHT (v102, 2026-09-24):**
  src/components/PersonSelect.jsx = zoekbare kiezer (naam/e-mail/rol, pijltjes +
  Enter, dropdown via portal zodat hij niet in modals wordt afgeknipt). Props:
  people, value, onChange(id), emptyLabel (waarde ''), extraOptions
  ([{value:'all',label:'Alle bellers'}]), showRole, showEmail, className, style.
  REGEL: nooit meer een <select> met alle medewerkers - altijd PersonSelect.
  Vervangen in o.a. WorkInterface (AM-keuze), AgendaPicker, BlockTime,
  AppointmentModal, Agenda, LeadBoard ("van wie"), Reports/Manager (beller-filter),
  Manager/LeadListModal (beller op lijst), LeadManagement, Admin/Dashboard (lead
  toewijzen), Recruitment (referral), ReferralOverview, Chat, IntensityModal,
  NewProjectWizard. useChecklistSearch() geeft vinkjeslijsten (managers/teams/
  tools in ProjectSettingsModal en NewProjectWizard) een zoekveld vanaf 7 items.
  Admin > Team: zoekveld, filters rol/team (ook "Zonder team")/project/actief,
  teller "x van y", en een compacte lijstweergave (standaard, onthouden in
  localStorage 'reachconnect-team-view') waarin je per medewerker de volledige kaart
  openklapt. Kaartweergave bestaat nog via de knop "Kaarten".

- **BORD TELT ALS WERK + STRAKKER BORD/PROJECTEN/BELSCHERM (v103, 2026-09-24,
  geen migratie):**
  1. Slepen op een bord (LeadBoard /leads en het sollicitantenbord in
     Recruitment) schrijft nu ook een call_logs-rij via src/lib/boardLog.js:
     source='bord', duration_seconds=0, max 1x per medewerker+lead+status.
     Telt dus mee in Rapportage/Dashboard/Manager/agent_daily_stats als actie,
     NIET als beltijd. Reports.jsx toont bord-acties apart ("+n bord") en telt
     ze niet als gesprek (pogingen per uur blijft eerlijk), wel in afspraken/
     deals en slagingspercentage. Uitbetaling loopt zoals altijd via de tarieven
     per lijst (project zonder tarief, zoals recruitment = 0).
  2. Robuust: LeadBoard laadt leads in blokken van 1000 (was max 1000, PROSELL
     viel af), laat bij een laadfout de oude leads staan, poll 30s i.p.v. 8s
     (realtime + 1,2s debounce doet het werk), lead_mail_status in stukjes van
     150 ids. Reports haalt call_logs gepagineerd op (was limit 1000).
     LeadMap: OSM-tegels kregen "Blocked" door no-referrer; tileLayer heeft nu
     referrerPolicy 'strict-origin-when-cross-origin'. LeadManagement-zoeken
     crasht niet meer op een lead zonder naam/telefoon.
  3. Opmaak in src/styles/polish.css (geimporteerd in main.jsx, alleen eigen
     classes): .kb-* kanban (lege kolommen klappen in tot strook en gaan open
     tijdens slepen, 40 kaarten per kolom + "Toon meer"), .lc-* leadkaart,
     .lb-* werkbalk /leads (2 rijen, pills, segmented weergave), .pm-*
     Projecten & Leads (projectkaart, lijstknop, tabel), .wi-* belscherm
     (rustige kaartkoppen, snelle acties Bellen/Mail/Route/Website,
     afboekknoppen). Compliance-melding staat in de kopregel van het belscherm
     (ComplianceLeadBlok losseKnop={false}); chatknop verborgen in belmodus.

- **AFBOEKKNOPPEN PER PROJECT (v104, 2026-09-24, migratie toegepast):**
  campaigns.hidden_dispositions text[] (leeg = alles zichtbaar). Sleutels uit
  src/lib/dispositions.js (SALES_DISPOSITION_KEYS; 'deal' dekt ook bruto_deal)
  en eigen redenen als 'custom:<uuid>'. ProjectSettingsModal: blok
  "Afboekknoppen in het belscherm" (niet bij backoffice/recruitment).
  WorkInterface filtert visibleDispositions erop, bovenop de globale
  flow_settings.is_active; veiligheidsklep: alles uit = toch alles tonen.
  Backoffice-knoppenset doet niet mee. Migratie: migration_v104_hidden_dispositions.sql.

- **NIEUW DESIGN ACHTER SCHAKELAAR (v105, 2026-09-24, migratie toegepast):**
  Plan: docs/DESIGN_UITROL_PLAN.md (LEES DIT voor elke design-klus).
  profiles.ui_design ('v1' standaard | 'v2'); src/lib/design.js applyDesign()
  zet <html data-design>, AuthContext volgt het profiel, index.html zet hem
  vooraf uit localStorage 'reachconnect-design'. Admin wisselt voor zichzelf met
  het palet-icoon in de kopbalk. ALLE nieuwe opmaak staat in
  src/styles/design-v2.css onder [data-design="v2"]; v1 blijft ongewijzigd.
  Design-stappen raken nooit Supabase-calls, hooks of statussen.
  Test-hulpje: scripts/overflow-check.browser.js (plakken in console).

- **TERUGBELMOMENT UIT BELSCHERM 2 UUR TE LAAT (v106, 2026-09-25, geen
  migratie):** het datetime-local-veld in WorkInterface gaf "2026-09-28T16:28"
  zonder tijdzone door aan handleLeadDisposition, en die schreef dat kaal naar
  leads.next_contact_date / appointment_at. Postgres las het als UTC, dus elke
  terugbelafspraak en afspraak uit het belscherm stond 2 uur (zomertijd) te laat.
  Het bord (LeadBoard confirmDatePrompt) deed het al goed met toISOString().
  Fix: handleLeadDisposition zet een nextDate zonder tijdzone altijd eerst om
  via new Date(...).toISOString(). REGEL: een waarde uit een datetime-local
  nooit rechtstreeks naar Supabase sturen, altijd eerst new Date(v).toISOString().

- **ACCOUNTS AANMAKEN PER MEDEWERKER + AFBOEKREDEN REMOTE (v107, 2026-09-28,
  migratie toegepast):**
  1. profiles.can_create_users (vinkje "Accounts aanmaken" op de
     medewerkerskaart in Admin > Team, niet bij admins). Iemand met dat recht
     krijgt de knop "Nieuw account" op zijn Dashboard, en een recruiter ook op
     de sollicitantenpagina. Aanmaken loopt overal via src/lib/accounts.js:
     auth.signUp met een TIJDELIJKE client (anders raak je je eigen sessie
     kwijt) en daarna RPC public.nieuw_account_afronden(p_user, p_role) voor
     rol + organisatie. Die RPC is nodig omdat profiles_update alleen een admin
     andermans profiel laat aanpassen; hij controleert zelf het recht (admin,
     manager of can_create_users), staat een niet-admin alleen
     employee/backoffice/accountmanager toe, en werkt alleen een account bij dat
     jonger is dan 15 minuten en nog op rol 'employee' staat - zo kun je er geen
     bestaand account mee kapen. EmployeeModal heeft daarvoor de prop
     allowedRoles. Manager.jsx maakt bellers nu ook via deze helper, waardoor
     het account eindelijk in de organisatie van de manager komt.
     REGEL: nieuwe plek waar een account aangemaakt wordt = maakAccount() uit
     src/lib/accounts.js gebruiken, nooit los auth.signUp + update op profiles.
  2. Nieuwe status 'remote_thuis' (label "Remote / thuiswerk", recruitment-label
     "Wil remote werken"). Knop "WIL REMOTE WERKEN" in het belscherm, alleen bij
     projecten van het type recruitment (1 klik, quick). Is een eindstatus: hij
     staat in DONE_STATUSES van WorkInterface en in de NOT IN-lijst van
     claim_next_lead, dus de sollicitant komt niet meer in de belwachtrij.
     Sollicitantenbord (Recruitment.jsx BOARD_COLUMNS) heeft een kolom "Remote"
     met dropStatus 'remote_thuis' plus een teller in de statistiekenrij.
     Migratie: migration_v107_accounts_aanmaken_remote.sql (leads_status_check
     uitgebreid + claim_next_lead opnieuw, identiek aan v98 met deze status erbij).

- **NAAM WORDT REACHCONNECT (v109, 2026-09-28, migratie toegepast):** het product
  heette LEADGEN en heet nu **ReachConnect**. Schrijfwijze overal: `ReachConnect`
  (hoofdletter R en C, geen spatie). Logo = blokje met monogram `RC` +
  woordmerk ReachConnect (src/components/Logo.jsx).
  1. Zichtbaar: browsertitel, logo, Setup, Home, versiemelding in App.jsx,
     ErrorBoundary, tutorial, /aanmelden, Tools, tekenpagina, compliance-
     checklist, de CSV-exports (`ReachConnect_Bellers_…`) en de twee
     offertetools in public/tools. Ook de mailteksten en afzendernamen in de
     Edge Functions (Mollie-omschrijving, RESEND_FROM-fallback, User-Agent).
  2. Opslag in de browser: alle keys heten nu `reachconnect-*` in plaats van
     `leadgen-*` (theme, design, effective-role, project-roles, location-on,
     team-view, leads-project, leads-list, leads-view, en `reachconnect_settings`).
     In index.html staat bovenaan een klein blokje dat de oude waarde eenmalig
     overzet en de oude key weghaalt, zodat niemand zijn thema, gekozen project
     of weergave kwijtraakt. Dat blokje mag weg ruim na 01-01-2027.
     Ook omgezet: DOM-event `reachconnect:open-tutorial`,
     `window.__reachconnectErrorHandlers`, Maps-callback
     `__reachconnectGmapsReady`, font-element `reachconnect-v2-fonts`,
     vite-plugin `reachconnect-version-file`, package.json name.
     REGEL: nieuwe localStorage-keys en events altijd `reachconnect-…`.
  3. Database: alleen de pg_cron-jobs zijn hernoemd naar `reachconnect-*`
     (zelfde schema en commando). Migratie: migration_v109_naam_reachconnect.sql.
  4. BEWUST NIET omgezet, en waarom:
     - `set_config('leadgen.systeem')` + `public.leadgen_systeem()`: zit in 11
       DB-functies waaronder leads_compliance_guard, leads_lock_guard en
       leads_owner_on_status. Niemand ziet die naam en één gemiste plek
       blokkeert systeemupdates (stille fouten bij afmelden en lead-eigenaar).
     - `x-leadgen-key` en `LEADGEN_STATUS_KEY` (Edge Function mailstatus):
       MarketingKiezer stuurt daarmee mee. Pas samen met de MK-repo te
       veranderen, anders valt de mailstatus-terugkoppeling stil.
     - `MAILSERVICE_<BRON>_URL` = `https://marketingkiezer.nl/api/leadgen/mail`:
       dat is een route in de MK-repo, niet van ons.
     - `leadgendash.netlify.app`: echte URL, verandert pas bij een nieuw domein.
     - `BRIEF-leadgen` en `lib/leadgenMail.ts`: bestandsnamen elders.

- **MIJN AFSPRAKEN + UITBETALING PER AFSPRAAK (v110, 2026-09-28, migratie
  toegepast):** een beller die een afspraak inplande zag daarna niets meer van
  die afspraak: de accountmanager boekte hem af (v97) maar de beller wist niet
  wat eruit kwam en dus ook niet wat hij ervoor kreeg.
  1. leads.appointment_by = de beller die de afspraak inplande. Gezet in
     useLeads.handleLeadDisposition (belscherm) en in LeadBoard.confirmDatePrompt
     (bord). Blijft van hem, ook als de accountmanager de lead overneemt.
     Backfill uit call_logs (laatste 'afspraak_gemaakt' per lead).
  2. leads.appointment_commission (+_at/_by) = wat die beller voor DEZE afspraak
     krijgt; elke deal is anders, dus het is een bedrag per afspraak. Zetten kan
     alleen een admin of een manager van dat project - trigger
     tr_leads_commissie_guard bewaakt dat (geldt ook voor appointment_approved)
     en vult _at/_by. Invoer staat in AppointmentModal (blok "Uitbetaling
     beller", met het afspraaktarief van de lijst als voorstel).
  3. Melding: tr_leads_afspraak_melding schrijft naar notifications zodra
     appointment_outcome verandert (type afspraak_uitkomst) of het bedrag wordt
     gezet (afspraak_commissie), voor appointment_by.
  4. Pagina /mijn-afspraken (src/pages/MijnAfspraken.jsx, menu-item "Mijn
     afspraken"): eigen afspraken met stand (Staat gepland / Wacht op uitkomst /
     Wil nadenken / Deal / Betaald - helper afspraakStand in src/lib/appointments.js),
     bedrag per afspraak, totalen, periodefilter en voor admin/manager een filter
     per medewerker (zo zie je wat je moet uitbetalen). Blok op het dashboard:
     src/components/MyAppointmentStats.jsx (verschijnt pas na de eerste afspraak).
  5. FIX: in een bordproject met afspraken zette tr_leads_owner_on_status (v79)
     de lead bij het afboeken op naam van de BELLER, waardoor de afspraak uit de
     agenda van de accountmanager verdween (die draait op assigned_to). Bij
     status 'afspraak_gemaakt' in een project met appointment_scheduling_enabled
     blijft de lead nu van de accountmanager (nieuwe helper
     public.lead_is_afspraak_project). LET OP: afspraken van vóór v110 kunnen nog
     op de verkeerde naam staan - die verzet je in de agenda.
  6. leads_select heeft er "or appointment_by = auth.uid()" bij, zodat een beller
     zijn eigen afspraken blijft zien ook als de lead van iemand anders wordt.
  Migratie: migration_v110_mijn_afspraken_commissie.sql.

- **MERKKLEUR GROEN + NIEUWE FAVICON (v109c, 2026-09-28):** de accentkleur is
  van blauw naar groen gegaan. Donker thema `--accent: #22C55E` (hover #1BA84E),
  licht thema `--accent: #15803D` (hover #166534) omdat wit op het felle groen
  niet leesbaar is. Aangepast in src/styles/tokens.css EN src/styles/design-v2.css,
  allebei in het donkere en het lichte blok, plus `--primary-dark`. Verder niets:
  Logo.jsx en de rest gebruiken al `var(--primary)` / `var(--accent)`.
  `--info` blijft blauw, dat is een betekeniskleur en geen merkkleur.
  REGEL: nooit een kleur hardcoden in een component, altijd het token gebruiken.
  Favicons in public/ opnieuw gemaakt: groen afgerond vierkant met RC
  (favicon.svg, favicon-16.png, favicon-32.png, favicon.ico, apple-touch-icon.png).
  De browser bewaart favicons lang, dus een harde ververs (cmd+shift+R) kan nodig
  zijn voordat je het nieuwe icoon ziet.

- **LAATSTE LOGIN + LAATST ACTIEF PER ACCOUNT (v111, 2026-09-30, migratie
  toegepast):** in Admin > Team was niet te zien wanneer iemand voor het laatst
  inlogde of voor het laatst echt bezig was. Twee losse gegevens:
  1. **Laatste login** komt uit `auth.users.last_sign_in_at` - dat houdt Supabase
     zelf al bij, dus het werkt met terugwerkende kracht en er wordt niets extra
     weggeschreven. De browser kan niet bij auth.users, dus het gaat via
     `public.team_aanwezigheid()` (security definer, alleen admin/manager binnen
     de eigen org krijgt alle rijen; een beller krijgt alleen zijn eigen rij;
     REVOKE van anon/public per v101-regel). Let op: mensen blijven ingelogd,
     dus deze datum kan ouder zijn dan "laatst actief" - dat is geen bug.
  2. **Laatst actief** = nieuwe kolom `profiles.last_seen_at`, gezet door
     trigger `profielen_last_seen_bij()` op INSERT in `activity_pings`
     (klik-heartbeat v43, ~1 rij per 60s zolang er geklikt wordt) en in
     `call_logs` (gesprek of bord-actie). De kolomnaam met "wie" verschilt per
     tabel (user_id vs agent_id), die geeft de trigger als argument mee. De tijd
     schuift alleen vooruit, nooit terug. GEEN extra write uit de frontend, dus
     een vergeten openstaand tabblad schuift "laatst actief" niet op.
     Eenmalig gebackfilld uit activity_pings + call_logs.
  UI: `src/lib/aanwezigheid.js` (fmtGeleden "nu / 12 min / gisteren 16:12 / 4
  dagen", fmtVolledig, aanwezigheidsStand voor het bolletje groen/oranje/grijs/
  rood). Admin > Team lijstweergave heeft de kolommen "laatst actief" (met
  bolletje) en "login <geleden>", de uitgeklapte kaart een blok met beide, en de
  filterbalk een select "Sorteer: naam / laatst actief / laatste login" zodat je
  ziet wie het langst niets gedaan heeft. Admin.jsx haalt de RPC 1x op in
  fetchData, in een eigen try zodat een fout daar het teamoverzicht niet sloopt.
  Migratie: migration_v111_laatste_login_actief.sql.

- **GOOGLE AGENDA-KOPPELING (v114, 2026-09-30, migratie toegepast, Edge
  Functions google-agenda-oauth / -push / -busy live):** elke accountmanager
  koppelt zijn eigen Google Agenda op /agenda. Twee kanten op, met zo min
  mogelijk rechten: ReachConnect maakt een APARTE agenda "ReachConnect
  afspraken" in zijn Google-account (recht `calendar.app.created`, dus geen
  toegang tot zijn privé-agenda) en zet daar de afspraken in; andersom haalt
  het alleen op WANNEER hij bezet is (recht `calendar.freebusy`, geen titels)
  en schrijft dat weg als `agenda_blocks` met `bron='google'`.
  1. Tokens in `public.google_agenda_accounts`: RLS aan en BEWUST GEEN
     policies, dus alleen service_role komt erbij. De browser leest zijn
     status via RPC `google_agenda_status()` en zet de twee richtingen aan of
     uit met `google_agenda_instellen(p_push, p_busy)`.
  2. De koppeling schrijft NOOIT in `public.leads` (dat zou de lock-,
     eigenaar- en compliance-triggers raken en een lus geven); lead <-> event
     staat in `public.google_agenda_events`.
  3. Heen: trigger `tr_leads_google_agenda` op leads (alleen in projecten met
     `appointment_scheduling_enabled`) roept via pg_net
     `google-agenda-push` aan bij elke wijziging van appointment_at,
     assigned_to, status, deleted_at, uitkomst, naam of adres. Die functie
     kijkt zelf naar de huidige stand en maakt het event aan, werkt het bij of
     haalt het weg (ook bij een andere accountmanager). Eén plek dus, in
     plaats van in belscherm, bord, agendapicker en AppointmentModal apart.
  4. Terug: pg_cron `reachconnect-google-agenda-busy` (elk kwartier) roept
     `google-agenda-busy` aan. Die zet de blokkades van de komende 28 dagen
     elke ronde opnieuw, zodat een verdwenen afspraak in Google hier vanzelf
     weer vrijkomt. Blokkades met `bron='google'` zijn in de UI grijs, niet te
     slepen en niet te verwijderen; de RLS-policies van agenda_blocks eisen nu
     `bron='reachconnect'` bij insert, update en delete.
  5. Google Cloud moet eenmalig ingesteld worden (project, Calendar API,
     toestemmingsscherm met precies die twee scopes, OAuth-client met
     omleidings-URI `<supabase>/functions/v1/google-agenda-oauth`) en de
     secrets `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` moeten in Supabase
     staan. Zonder die secrets doet de knop netjes niets en geeft hij een
     uitleg. Volledige handleiding: docs/GOOGLE_AGENDA_KOPPELING.md.
  Migratie: migration_v114_google_agenda.sql.

- **ONDERHOUDSMODUS (v117, 2026-10-01, migratie toegepast):** de software is
  tijdelijk op slot te zetten met de melding "We zijn bezig met onderhoud".
  1. Eén rij in `public.app_onderhoud` (id=1, kolom `actief`). Lezen mag anon
     EN authenticated (de inlogpagina moet de stand ook kunnen opvragen, er
     staat niets gevoeligs in). Er is BEWUST geen insert/update/delete-policy:
     aan- en uitzetten gaat via RPC `public.onderhoud_zetten(p_actief)`
     (security definer), die zelf controleert of de aanroeper een actieve
     admin is. Tabel zit in de publicatie supabase_realtime.
  2. Frontend: `src/hooks/useOnderhoud.js` (realtime + poll elke 60s + bij
     focus; faalt OPEN - een leesfout zet de app nooit zelf op slot) en
     `src/components/Onderhoud.jsx` met drie onderdelen: OnderhoudScherm
     (fullscreen melding), OnderhoudBanner (pil links onderin voor de admin
     die doorwerkt, met "Uitzetten") en OnderhoudSchakelaar (blok in
     Admin > Dashboard, aanzetten vraagt twee klikken, geen window.confirm).
  3. De grens zit in `AppRoutes` (App.jsx): staat onderhoud aan en is de
     gebruiker geen echte admin (`profile.role`, niet de v94-werkmodus), dan
     krijgt hij het onderhoudsscherm. Vrijgesteld blijven `/tekenen/*` (klanten
     moeten hun offerte kunnen blijven ondertekenen), `/privacy`,
     `/voorwaarden` en `/login` (anders kan de admin zelf niet meer inloggen om
     het weer uit te zetten). Bij een ingelogde gebruiker wachten we op het
     profiel, anders ziet een admin eerst even de melding.
  Migratie: migration_v117_onderhoud.sql.

- **TWEEDE MAILBRON: BEAUTYINFO (v118, 2026-10-01, migratie toegepast):** de
  Mailingservice werkt nu ook voor het project BEAUTYINFO. Er is GEEN nieuwe
  code in de Edge Functions nodig: mailingservice, mailqueue-runner en mailstop
  lezen de bron uit campaign_mail_services.source en halen URL + sleutel uit de
  secrets MAILSERVICE_<BRON>_URL / _KEY. Voor BeautyInfo:
  MAILSERVICE_BEAUTYINFO_URL = https://beautyinfo.nl/api/reachconnect/mail
  (mailstop maakt daar zelf .../stop van).
  1. src/lib/mailSources.js: bron BEAUTYINFO erbij, en elke bron heeft nu een
     eigen lijstje `types` met de mailsoorten die hij kent. BeautyInfo kent
     alleen 'aanmelding' (aanmeldmail met afrekenlink) en 'opvolging'
     (herinnering), geen infomail. Helper: mailTypesVanBron(bronsleutel).
     REGEL: nieuwe bron = regel hier + die twee secrets, verder niets.
  2. ProjectSettingsModal: mail_types is eindelijk in te stellen per project
     (vinkjes, beperkt tot wat de bron kent). Van bron wisselen zet de vinkjes
     op alle soorten van die bron. De eerste aangevinkte soort in de volgorde
     van de bron wordt mail_type (de standaardkeuze in de popup).
  3. Terugkoppeling: BeautyInfo post naar dezelfde Edge Function mailstatus,
     met "source": "BEAUTYINFO" in de body en de sleutel uit MAILSTATUS_KEY.
     Zonder source gaat mailstatus uit van MARKETINGKIEZER.
  Migratie: migration_v118_mailbron_beautyinfo.sql.
  4. mailstatus (v12 live, 01-10): accepteert de sleutel nu ook in de header
     `x-reachconnect-key`. `x-leadgen-key` en `x-api-key` blijven werken, want
     MarketingKiezer stuurt daarmee - die kan pas weg samen met de MK-repo.
     Nieuwe bronnen krijgen `Authorization: Bearer <sleutel>`, dan speelt de
     naamgeving geen rol. Ook de notitie bij een terugbelverzoek noemt nu de
     echte bron in plaats van altijd "MarketingKiezer".

- **MAILINGSERVICE PER PROJECT INSTELBAAR (v119, 2026-10-01, migratie
  toegepast, mailingservice v14 / mailstop v8 / mailqueue-runner v7 live):**
  een nieuwe bron koppelen vroeg code plus twee Supabase secrets. Nu zet een
  admin alles in de projectinstellingen.
  1. `campaign_mail_services.webhook_url`, `.stop_url` en `.body_template`
     (jsonb). Geen stop-URL ingevuld = afgeleid van de webhook-URL
     (.../mail -> .../stop), net als voorheen.
  2. De token staat APART in `public.campaign_mail_secrets` (1 rij per project,
     RLS: alleen `is_admin()` mag lezen en schrijven). De Edge Functions lezen
     hem met de service role. Het scherm leest hem NOOIT terug: leeg laten bij
     opslaan = ongewijzigd.
  3. Terugval: is webhook_url of de token leeg, dan pakt de functie alsnog
     `MAILSERVICE_<BRON>_URL` / `_KEY` uit de secrets. Zo blijft een bestaande
     koppeling werken tot de token is overgezet.
  4. Body-template: vrije JSON met `{{mail}} {{lead_id}} {{email}}
     {{bedrijfsnaam}} {{contactpersoon}} {{stad}} {{website}} {{telefoon}}
     {{beller_naam}} {{beller_telefoon}} {{bron}}`. Helper `vulTemplate()` zit
     identiek in mailingservice en mailqueue-runner. Een waarde die ALLEEN uit
     een lege placeholder bestaat valt uit de body (dus geen lege strings), en
     een object dat daardoor leeg raakt valt ook weg. Geen template = de oude
     vaste body.
  5. Veiligheid: `veiligeUrl()` laat alleen https met een gewone domeinnaam
     door, geen kaal IP-adres, localhost, .local of .internal; plus de bestaande
     `redirect: "error"` en timeout. Een CHECK op de kolommen doet hetzelfde in
     de database. REGEL: nieuwe plek die een webhook uit de database aanroept =
     altijd eerst veiligeUrl().
  Migratie: migration_v119_webhook_per_project.sql.

- **TESTKNOP + DUIDELIJKE FOUTMELDING BIJ DE MAILINGSERVICE (v120, 2026-10-01,
  geen migratie; mailservice-test v1 en mailingservice v15 live):**
  aanleiding: bij een mislukte mail stond er alleen "Versturen via BRON mislukt
  (401)" en was er geen manier om te proberen zonder een echte lead af te boeken.
  1. Nieuwe Edge Function `mailservice-test` (verify_jwt aan, ALLEEN rol admin,
     20 tests per uur via rate_limit_hit). Doet precies dezelfde POST als de
     echte Mailingservice en geeft terug: URL, HTTP-status, het ANTWOORD van de
     bron (eerste 1000 tekens), duur in ms, de body die wij stuurden, uitleg in
     gewone taal per statuscode, en opmerkingen (waar de token vandaan komt,
     zijn lengte, en of er een spatie of regeleinde aan vastzit - de meest
     voorkomende oorzaak van een 401). Schrijft NIETS weg: geen mailservice_logs
     en geen afboeking. Lukt de aanroep, dan stuurt de bron wel echt een mail,
     standaard naar het e-mailadres van de admin zelf.
     De token wordt nooit teruggegeven in het antwoord.
  2. Knop "Testen" in ProjectSettingsModal onder de Mailingservice, met een veld
     voor het testadres. Velden die nog NIET zijn opgeslagen (webhook-URL, token,
     template) gaan mee in de test, zodat je kan proberen voor je bewaart.
  3. mailingservice leest het antwoord van de bron nu eerst als TEKST (een 401 is
     vaak geen JSON, dus die melding ging voorheen verloren). De volledige reden
     (`HTTP <status> - <melding van de bron>`) gaat altijd in
     mailservice_logs.error; een admin of manager ziet hem ook in de melding op
     het scherm, een gewone beller krijgt een korte zin. Bij 401/403 staat er nu
     letterlijk dat de bron de token niet accepteert.

- **VERZOEK EN ANTWOORD ZICHTBAAR BIJ EEN MISLUKTE MAIL (v121, 2026-10-01,
  geen migratie; mailingservice v16 en mailservice-test v2 live):** bij een fout
  wil je zien WAT er precies de deur uit ging. mailingservice geeft bij een
  mislukte verzending nu een `debug`-blok mee in het antwoord, maar ALLEEN aan
  een admin of manager: `{ verzoek: { url, methode, headers, body }, antwoord:
  { status, body }, reden }`. De Authorization-header staat er gemaskeerd in
  (`Bearer ****<laatste4> (n tekens)`) via helper `gemaskeerd()`.
  REGEL: een token komt nooit onafgekort in een antwoord, een logregel of een
  melding - altijd door gemaskeerd() heen.
  In het belscherm (MailingserviceModal) zit onder de foutmelding een knop
  "Technische details tonen" met het volledige verzoek en antwoord; in de
  Mailinglijst (MailQueueView) gaat hetzelfde blok naar de console, want in een
  toast past het niet. De testknop in de projectinstellingen toont nu ook de
  headers, niet alleen de body.

- **STATUSUPDATES VAN BEAUTYINFO (v122, 2026-10-02, migratie toegepast,
  mailstatus v14 live):** BeautyInfo stuurt vanaf nu 19 statusupdates per
  gemailde lead (spec van 02-10) naar de bestaande Edge Function `mailstatus`:
  `{ lead_id, status, event_id, occurred_at, stage, details }`. Callback-URL
  voor hen: `https://zboyxwwrbtpjnlgquhzs.supabase.co/functions/v1/mailstatus?source=BEAUTYINFO`
  met `Authorization: Bearer <MAILSTATUS_KEY>` (zelfde sleutel als eerder).
  1. Herkenning nieuw formaat = er zit een `event_id` in. Dan: `source` ook uit
     `?source=` in de URL, `occurred_at` = tijd van de stap, ALTIJD 200 (ook bij
     onbekende lead, status "test" of rare body), alleen een verkeerde sleutel
     geeft 401. Synoniemen (o.a. `geopend` = offerte open) gelden ALLEEN voor
     het oude MK-formaat; bij BeautyInfo is `geopend` = mail geopend (rang 1).
  2. `public.lead_mail_events`: elke update ruw (uniek op source + event_id ->
     herhaalpoging = `{dubbel:true}`, niets opnieuw). RLS: lezen binnen org,
     alleen service role schrijft. Realtime aan.
  3. `lead_mail_status` erbij: `laatste_event(_op)` (nieuwste op occurred_at),
     `fase` (mail|bezoek|betaling|klant|einde), `pagina_actief_op` /
     `pagina_verlaten_op` (live = actief > verlaten, UI vangnet 15 min),
     `actie_nodig(_op)` (bounced, mail_mislukt, spam_melding, checkout_verlaten,
     betaling_mislukt, abonnement_opgezegd; een latere gewone stap wist hem).
     Funnel (status_rank 1-5) blijft: `checkout_gestart` = rang 3 (zelfde
     warmte als offerte_open), `pagina_bekeken/actief/verlaten` = rang 2,
     `bezorgd/geopend/herinnering_verstuurd` = rang 1, `welkomstmail_verstuurd`
     en `abonnement_verlengd` = rang 5. Tabel EVENTS in de functie.
  4. `afgemeld` in het nieuwe formaat = echo van ONZE /stop-aanroep (beller
     zette geen interesse), dus GEEN blokkeer_lead en geen wissen; alleen
     vastleggen (fase einde). In het oude formaat blijft afgemeld een echte
     afmelding (v98). REGEL: nooit een status van een bron blind op de
     afmeldlijst zetten; eerst kijken wie de stap veroorzaakte.
  5. Meldingen (notifications): `lead_warm` bij checkout_gestart (eerste keer)
     en bij de overgang naar pagina_actief (max 1x per 20 min per lead);
     `mail_actie` bij een nieuwe terugbel-vlag; `mailstatus_onbekend` max 1x
     per lead + status (was: elke keer).
  6. UI (src/components/MailStatus.jsx): voortgangsbalk Mail > Bezoek >
     Betaling > Klant (MailFaseBalk), chip "Nu op de pagina" (MailLiveChip,
     .ms-live in polish.css), rode chip "Terugbellen: ..." (MailActieChip),
     tijdlijn uit lead_mail_events op de contactkaart (useMailEvents). Bord
     (LeadBoard.jsx): warm = rang 3 OF live op de pagina; signaal "Bel nu:
     klant is op de pagina" / "Bel nu: bij het betalen"; terugbel-chip.
  Niet getest met de echte sleutel vanuit Cowork (geen netwerk naar Supabase);
  de 401-route is via pg_net gecontroleerd. Migratie:
  migration_v122_mail_events_beautyinfo.sql (uitgevoerd in losse statements,
  de MCP-tool liep vast op de FK naar leads in een batch; FK is daarom eerst
  NOT VALID aangemaakt en daarna gevalideerd).

- **PLAATS VERPLICHT BIJ BEAUTYINFO-MAIL (v123, 2026-10-05, geen migratie):**
  BeautyInfo weigert een mail zonder `stad` ("email, bedrijfsnaam, stad and
  lead_id are required"). Een lege placeholder valt uit de body (v119), dus bij
  een lead zonder plaats kwam die melding pas NA het klikken, van de bron.
  Nu: `MAIL_SOURCES[].verplicht` in src/lib/mailSources.js (BeautyInfo:
  ['stad']) + helper verplichteVeldenVanBron(). MailingserviceModal toont dan
  een veld "Plaats" (voorgevuld met leads.city), de knop blijft uit tot hij is
  ingevuld, en bewaarStad() schrijft hem eerst naar leads.city voordat de mail
  gaat of in de Mailinglijst komt. De Edge Functions lezen de plaats uit de lead,
  dus geplande mails (mailqueue-runner) kloppen daardoor ook.
  REGEL: eist een bron een extra leadveld, zet het in `verplicht`; niet in de
  Edge Function afdwingen, want daar is de beller al weg.

- **SOORT AFSPRAAK: SHOOT OF BEZOEK (v124, 2026-10-05, kolom + check toegepast,
  google-agenda-push v8 live):** elke afspraak was een shoot van 2,5 uur. Nu
  kiest de beller bij "Afspraak gemaakt" (belscherm WorkInterface en bord
  LeadBoard confirmDatePrompt) de soort: Shoot (2,5 uur) of Bezoek (1 uur).
  1. `leads.appointment_type` ('shoot' | 'bezoek' | null = shoot, voor oude
     afspraken). Soorten + duur staan in src/lib/appointmentConfig.js
     (APPOINTMENT_TYPES, appointmentMinutes(lead|id), appointmentLabel,
     duurTekst) en gespiegeld in supabase/functions/*/google.ts
     (AFSPRAAK_SOORTEN, afspraakSoort). REGEL: nieuwe soort = die twee plekken
     + de CHECK leads_appointment_type_check, verder niets. De oude constanten
     APPOINTMENT_LABEL / APPOINTMENT_DURATION_MINUTES zijn de shoot-waarden en
     worden nergens meer geimporteerd.
  2. Conflictcheck (WorkInterface, LeadBoard, findAppointmentConflict in
     src/lib/appointments.js met nieuwe parameter `type`) rekent met de duur
     van de NIEUWE afspraak en met de eigen duur van elke bestaande afspraak;
     hij kijkt zo ver terug als de langste soort. Agenda.jsx, AgendaPickerModal
     (prop `type`), AppointmentModal en MijnAfspraken tonen de juiste lengte
     en het label; het bord toont "Shoot 5 okt" / "Bezoek 5 okt".
  3. AppointmentModal: admin/manager kan de soort van een bestaande afspraak
     wijzigen (blok "Soort afspraak", met conflictcheck op de nieuwe duur).
     Die update stuurt appointment_at (ongewijzigd) mee, zodat de Google
     Agenda-trigger hem oppikt.
  4. Google Agenda: google-agenda-push gebruikt label en duur per soort.
     Functie leads_google_agenda_kick kijkt nu ook naar appointment_type. De
     TRIGGER-kolomlijst is nog NIET bijgewerkt (drop trigger op leads bleef via
     MCP hangen); het statement staat in migration_v124_afspraaksoort.sql en
     moet nog in de SQL-editor gedraaid worden. Tot dan: wie appointment_type
     schrijft, schrijft appointment_at mee (gebeurt al overal).


- **lead_score IS GEEN KOLOM (v125, 2026-10-05, geen migratie):** melding
  "Wijziging niet opgeslagen: Could not find the 'lead_score' column of
  'leads'" bij een afboeking in het belscherm. useLeads rekent lead_score
  zelf uit en plakt hem aan elke lead; de verse DB-rij (v63 applyFreshLead)
  heeft dat veld niet, dus saveLeadEdits zag hem als gewijzigd en stuurde
  hem mee. Fix: constante CLIENT_ONLY_LEAD_FIELDS (lead_score, lead_lists)
  bovenin WorkInterface.jsx wordt overgeslagen, net als elk veld dat een
  object/array is (joins). De afboeking zelf ging al wel door; alleen
  notities/veldwijzigingen van dat moment gingen niet mee.
  REGEL: een veld dat de app zelf aan een lead toevoegt hoort in
  CLIENT_ONLY_LEAD_FIELDS.
