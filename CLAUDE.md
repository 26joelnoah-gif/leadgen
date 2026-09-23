# LEADGEN — Project Visie & Context

> Werk je hier vanuit Antigravity (Minimax of Gemini)? Lees eerst `.agents/rules/00-start-here.md`, dat wordt automatisch geladen en verwijst hierheen terug. Dit bestand blijft de volledige bron van waarheid voor alle AI's op dit project.

## Eigenaar
Noah Ando — noah.ando1@icloud.com
Bouwt zonder programmeerervaring, dag 3-4 op moment van documenteren.
Gebruikt Minimax (Claude terminal in Antigravity), Gemini 2.0 Flash (apart venster in Antigravity), en Claude (Cowork) parallel.

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
LeadGen wordt een platform waar **bedrijven zich aanmelden**.
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
- Styling: Custom CSS dark theme (--bg-dark: #0F1117, --primary: #3B82F6, --secondary: #F59E0B)

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
  Migratie: migration_v69_mailingservice.sql. LEADGEN doet niets met betalingen.

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
  MailStatusBlok op de contactkaart. LEADGEN verandert leads.status NIET op
  een mailstatus - 'getekend'/'betaald' bij MK is geen LEADGEN-deal.
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
  leadgen-mailqueue-runner roept elke 5 min public.mail_queue_kick() aan, die
  via pg_net de Edge Function mailqueue-runner (verify_jwt uit, eigen sleutel
  uit Vault 'mailqueue_cron_key' via public.mailqueue_cron_key(), alleen
  service_role) aanroept. De runner verstuurt ALLEEN op werkdagen 08:00-18:00
  NL, naar dezelfde bron als handmatig (MAILSERVICE_<BRON>_*), met dezelfde
  remmen (40/uur per beller, 1x per 24u per mailsoort). Gelukt: rij
  'verzonden', lead mail_verstuurd + opvolgdatum, activiteit op naam van de
  beller. Mislukt: rij status 'fout' + last_error, lead blijft mail_gepland;
  Mailinglijst toont de fout met "Opnieuw" en een klok-knop om het moment te
  wijzigen. LEADGEN mailt zelf nooit; niets gaat via ReachConnect.
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
  verwijderd door public.chat_cleanup(24) via pg_cron-job leadgen-chat-cleanup;
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
  pg_cron-job leadgen-profiles-trash-purge draait dagelijks 03:30 UTC
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
  wist nu ook leadgen-effective-role/leadgen-project-roles uit localStorage,
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
     pg_cron leadgen-afgemeld-wissen (elk uur, 48 uur na afmelden) en
     leadgen-bewaartermijn (02:45 UTC, 12 maanden niets mee gebeurd +
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
