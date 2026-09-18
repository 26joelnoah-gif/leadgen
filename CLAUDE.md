# LEADGEN — Project Visie & Context

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
