# OFFERTE-TEKENLINK (v65) — spec voor implementatie

Status: GEBOUWD op 06-09-2026 (migratie v65 toegepast, functies live, build OK, e2e getest zonder mail). Open: Resend-secrets zetten, git commit. Beslispagina: artifact "Offerte-tekenlink".
Doel: een offerte op afstand laten tekenen (klant "wil nadenken"), en de status
van elke offerte zichtbaar maken voor beller, accountmanager en admin.

Bouwt op migration_v59_offertes.sql (tabel public.offertes, offerte-tool in
public/tools/offerte-tool.html, overzicht in src/pages/Tools.jsx).
Nummering: v60 t/m v64 bestaan al, dit is v65.

## 0. Twee harde ontwerpregels

1. HET TEKENEN IS GENERIEK, DE OFFERTE-TOOL IS PRODUCT-SPECIFIEK.
   De Edge Functions en de tekenpagina werken UITSLUITEND met wat in de
   kolommen van public.offertes staat (regels, bedragen, akkoord_tekst,
   contactgegevens). Ze weten niets van pakketten, prijsmodel of
   "bestelplatform". De huidige tool is later gewoon de eerste template
   van één tenant.
2. AFZENDER EN BRANDING KOMEN UIT DE DB, NIET UIT DE CODE.
   Organisatienaam, afzendernaam/-adres en AM-contact komen uit
   organizations en profiles. Nu vullen we die voor ReachConnect; later
   per klant. Geen hardcoded "ReachConnect" in functies of tekenpagina.

De tekenpagina praat NOOIT rechtstreeks met public.offertes. Geen anon-RLS
op offertes. Alles via twee Edge Functions met service-role (patroon:
supabase/functions/manage-password).

## 1. Migratie: migration_v65_offerte_tekenlink.sql

```sql
-- offertes: koppeling aan lead + tekenlink-velden
alter table public.offertes
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists akkoord_tekst text,                -- letterlijke tekst die de klant ziet
  add column if not exists sign_token_hash text,              -- sha256 hex van het token, nooit het token zelf
  add column if not exists sign_token_expires_at timestamptz,
  add column if not exists verzonden_op timestamptz,
  add column if not exists verzonden_naar text,               -- e-mailadres waar de link heen ging
  add column if not exists verzonden_door uuid references public.profiles(id) on delete set null,
  add column if not exists geopend_op timestamptz,            -- eerste keer
  add column if not exists geopend_aantal integer not null default 0,
  add column if not exists herinnering_op timestamptz,        -- laatste (automatische of handmatige) herinnering
  add column if not exists afgewezen_reden text,
  add column if not exists inhoud_hash text;                  -- sha256 van de bevroren inhoud bij versturen

create index if not exists idx_offertes_lead on public.offertes(lead_id);
create unique index if not exists idx_offertes_token on public.offertes(sign_token_hash) where sign_token_hash is not null;

-- status uitbreiden
alter table public.offertes drop constraint if exists offertes_status_check;
alter table public.offertes add constraint offertes_status_check
  check (status in ('concept','verzonden','geopend','getekend','verlopen','afgewezen','geannuleerd'));

-- organisatie: afzender + branding (fase-2-proof)
alter table public.organizations
  add column if not exists afzender_naam text,     -- "ReachConnect"
  add column if not exists afzender_email text,    -- "offertes@reachconnect.nl" (moet geverifieerd domein in Resend zijn)
  add column if not exists logo_url text,
  add column if not exists offerte_geldigheid_dagen integer not null default 14,
  add column if not exists offerte_opvolg_dagen integer not null default 3,
  add column if not exists offerte_herinnering_dag integer not null default 5; -- 0 = geen automatische herinnering

-- profiles: telefoonnummer AM voor "Vragen? Bel me" (alleen toevoegen als hij nog niet bestaat)
alter table public.profiles add column if not exists phone text;

-- call_logs: bron van een automatische afboeking
alter table public.call_logs add column if not exists source text; -- null = belscherm, 'offerte_remote' = getekend via link
```

RLS op offertes: bestaande select-policy uitbreiden zodat een beller offertes
ziet van leads die aan hem toegewezen zijn (leads.assigned_to = auth.uid()),
managers die van campagnes waar ze manager van zijn (campaign_managers, v23),
admin alles binnen de org. Bedragen NIET verbergen voor bellers (Noah: niet nodig).
Update-policy: alleen eigenaar (user_id), manager van de campagne, admin.
De Edge Functions gebruiken service-role en omzeilen RLS; ze checken zelf.

STATUS_MAP (src/utils/statusUtils.js): één nieuwe lead-status toevoegen.
```js
offerte_verzonden: { label: 'Offerte verzonden', color: 'var(--info)', bg: 'var(--info-bg)',
  description: 'Offerte ligt bij de klant - komt op de opvolgdatum terug in de wachtrij' },
```
GEEN eindstatus (dus niet in de lijst met eindstatussen die de wachtrij
filtert). De lead komt terug via next_contact_date. Routing v17 blijft
onaangetast: lead blijft in zijn lijst, wordt nooit verplaatst.

## 2. Edge Function offerte-send (ingelogd)

Pad: supabase/functions/offerte-send/index.ts. CORS zoals manage-password.

Input: `{ offerteId, email? }` (email overschrijft offertes.email als opgegeven).

Stappen:
1. Auth via userClient.auth.getUser(); profiel ophalen (id, role, organization_id, is_active, full_name, phone).
2. Offerte ophalen met service-role. Checks: zelfde organization_id;
   caller is eigenaar (user_id) of admin of manager van de campagne van lead_id;
   status in ('concept','verzonden','geopend','verlopen') (verlengen/opnieuw sturen mag);
   e-mailadres aanwezig en geldig; zaak_naam aanwezig; regels niet leeg.
3. Token: 32 random bytes -> base64url. Opslaan: sign_token_hash = sha256(token) hex.
   Het token zelf staat alleen in de mail (en in de response voor "Link kopiëren").
4. Bevriezen: inhoud_hash = sha256 van JSON van {regels, upsell, korting, eenmalig_ex,
   btw, eenmalig_incl, maandbedrag_ex, akkoord_tekst, zaak_naam}. Als akkoord_tekst leeg is:
   vullen vanuit body.akkoordTekst (de tool stuurt zijn AKKOORD-tekst mee).
5. Update offerte: status='verzonden', verzonden_op=now(), verzonden_naar=email,
   verzonden_door=caller, sign_token_expires_at = now() + org.offerte_geldigheid_dagen,
   geopend_op=null, geopend_aantal=0, akkoord=null, getekend_op=null.
6. Lead (als lead_id): status='offerte_verzonden', next_contact_date = now() + org.offerte_opvolg_dagen
   (dagdeel: zelfde uur als versturen). Alleen als de lead nog geen eindstatus heeft
   (deal, bruto_deal, monteur_ingepland, geen_interesse, blacklist, verkeerd_nummer: dan lead ongemoeid).
   call_logs-rij: agent_id=caller, disposition='offerte_verzonden', duration_seconds=0,
   source='offerte_send', notes='Offerte <nummer> verstuurd naar <email>'.
7. Mail via Resend (secret RESEND_API_KEY). From: `${org.afzender_naam} <${org.afzender_email}>`,
   reply_to: e-mail van de caller. Onderwerp: "Offerte <nummer> van <org.afzender_naam> voor <zaak_naam>".
   Body: korte tekst, bedrag eenmalig + per maand, geldig tot <datum>, knop naar
   `${APP_URL}/tekenen/${token}`, naam + telefoon van de AM. Geen PDF-bijlage in v65.
8. Response: `{ ok: true, url, geldigTot }`.

Fouten in het Nederlands, zoals manage-password ("Deze offerte is al getekend", enz.).

## 3. Edge Function offerte-sign (publiek, geen auth)

Pad: supabase/functions/offerte-sign/index.ts. `verify_jwt = false` in config.toml.
Rate-limit simpel: max 30 requests per ip per 10 min (in-memory Map is genoeg).

### GET ?t=<token>
1. hash = sha256(token). Offerte zoeken op sign_token_hash. Niet gevonden -> 404 `{ error: 'onbekend' }`.
2. Verlopen (sign_token_expires_at < now()) en status in ('verzonden','geopend'):
   status='verlopen' zetten, 410 `{ error: 'verlopen', am: {naam, telefoon} }`.
3. Status 'getekend' -> 200 met `{ state: 'getekend', getekend_op, door }` (pagina toont "al getekend").
   Status 'afgewezen' / 'geannuleerd' -> 410 met die state.
4. Anders: als geopend_op null: geopend_op=now(), status='geopend'. geopend_aantal += 1.
   Response `{ state: 'open', offerte: {nummer, zaak_naam, contact_naam, adres, regels, upsell,
   korting, eenmalig_ex, btw, eenmalig_incl, maandbedrag_ex, speclijst, akkoord_tekst,
   geldig_tot}, org: {naam, logo_url}, am: {naam, telefoon, email} }`.
   NOOIT teruggeven: user_id, lead_id, notitie, roi, interne velden.

### POST body `{ t, actie: 'tekenen' | 'afwijzen', naam, functie?, png?, reden? }`
1. Zelfde token-checks als GET (verlopen/getekend/afgewezen -> zelfde codes).
2. actie 'tekenen': naam >= 2 tekens, png is een data:image/png van max 300 KB.
   akkoord = { door, functie, op: now(), png, ua: user-agent header, ip: x-forwarded-for,
   tekst: offerte.akkoord_tekst, inhoud_hash, verzonden_naar, methode: 'op_afstand' }.
   Update: status='getekend', getekend_op=now(), sign_token_hash=null.
   Lead (als lead_id en lead niet al deal/bruto_deal/monteur_ingepland):
   status = 'bruto_deal' als de campagne type 'backoffice' is, anders 'deal'
   (zelfde regel als WorkInterface v47); next_contact_date=null.
   call_logs: agent_id = offerte.user_id (de AM krijgt de deal), disposition = die status,
   duration_seconds=0, source='offerte_remote', notes='Offerte <nummer> getekend op afstand door <naam>'.
   duration 0 + source zorgen dat dit NIET als beltijd telt (callTimeUtils v24 negeert 0).
   Mails via Resend: bevestiging naar klant (met samenvatting, tijdstip, naam; link blijft
   werken in read-only via GET state 'getekend') en naar de AM (reply_to van de org).
3. actie 'afwijzen': status='afgewezen', afgewezen_reden=reden (max 500 tekens),
   sign_token_hash=null. Lead: ongemoeid (beller boekt zelf af na nabellen).
   Mail naar AM.
4. Response `{ ok: true, state }`.

## 4. Tekenpagina /tekenen/:token

Nieuwe route in src/App.jsx BUITEN ProtectedRoute: `<Route path="/tekenen/:token" element={<Tekenen />} />`.
Bestand: src/pages/Tekenen.jsx. Geen AuthContext nodig; roept offerte-sign aan via fetch
naar `${SUPABASE_URL}/functions/v1/offerte-sign` met de anon key als apikey-header.

Opbouw (mobile-first, één lange pagina, licht thema zoals Outside; wrapper `data-tool="outside"`
zodat de bestaande lichte tokens gelden):
- Header: org.logo_url of org.naam, offertenummer, "Geldig tot <datum>".
- Blok "Vragen? Bel <AM-naam>" met tel:-link en mailto.
- Offerte read-only: zaak, contact, adres; tabel regels (omschrijving, aantal, prijs);
  upsell; korting; totaal eenmalig ex/btw/incl; maandbedrag ex. Speclijst als inklapbaar blok.
  Rendering NIET overnemen uit offerte-tool.html (die kent pakketten); nieuw en generiek
  vanuit de kolommen.
- Akkoordtekst (offerte.akkoord_tekst) volledig zichtbaar, geen scrollbox.
- Formulier: naam (verplicht), functie (optioneel), handtekening-canvas (touch + muis,
  "Wis"), checkbox "Ik heb de offerte en de voorwaarden gelezen".
- Sticky onderaan: primaire knop "Akkoord en ondertekenen" (52px, volle breedte).
  Daaronder tekstlink "Ik ga niet akkoord" -> klein veld voor reden + knop "Afwijzen".
- States: laden; open; getekend ("Getekend op <datum> door <naam>. Je ontvangt een
  bevestiging per mail."); verlopen ("Deze offerte is verlopen. Bel <AM>."); afgewezen;
  onbekend ("Deze link is niet geldig.").
- noindex meta op deze route (app heeft al X-Robots-Tag via Netlify, v33).

## 5. Wijzigingen in de app

### offerte-tool (public/tools/offerte-tool.html)
- Leest `?lead=<uuid>` uit de URL. Als aanwezig: lead ophalen via de ingelogde sessie
  (zelfde origin, zoals lgUser nu al werkt) en zaak/contact/e-mail/telefoon/adres
  voorinvullen; lead_id meesturen in dbSave (row.lead_id).
- Nieuwe knop naast "Akkoord en ondertekenen": "Verstuur ter ondertekening".
  Enabled als er een e-mailadres en een zaak is en de offerte in de DB staat (dbId).
  Roept offerte-send aan met { offerteId: dbId, akkoordTekst: AKKOORD }.
  Bij succes: statusbalk "Verstuurd naar <email>, geldig tot <datum>", knop "Link kopiëren",
  tool vergrendelt (lockAll) net als na tekenen. Opnieuw bewerken = "Nieuwe versie"
  (kopie als nieuw concept met nieuw nummer; de verzonden offerte blijft staan).
- dbSave stuurt voortaan ook akkoord_tekst: AKKOORD mee, en bij tekenen op locatie
  akkoord.methode = 'op_locatie'.
- Ingangen met ?lead=: vanuit LeadDetailModal (knop "Offerte maken") en vanuit Outside
  (bestaande knop "Offerte maken" krijgt de lead-id mee).

### Contactkaart (src/components/LeadDetailModal.jsx)
Nieuw blok "Offertes" naast de afboek-geschiedenis: per offerte nummer, statuschip,
eenmalig / maand, verstuurd op + door, geopend op (+ aantal), geldig tot, getekend op.
Knoppen (alleen eigenaar/manager/admin): "Herinnering" (roept offerte-send opnieuw
aan met { offerteId, herinnering: true }: zelfde token, alleen mail + herinnering_op),
"Link kopiëren", "Intrekken" (status geannuleerd, token weg). Knop "Offerte maken"
opent de tool met ?lead=.

### Belscherm (src/components/WorkInterface.jsx)
Als de huidige lead een offerte heeft met status in ('verzonden','geopend','verlopen'):
briefing-regel bovenaan (bestaande briefing-tabs v29), stijl zoals de bliksem-badge maar
oranje: "Open offerte <nummer> · € <eenmalig> eenmalig · verstuurd <datum> · geopend
<datum> (<n>x) · niet getekend". Bij 'verlopen': "verlopen op <datum>".
Quick-dispositie "Nog nadenken (+N dagen)" alleen tonen als er een open offerte is:
zet next_contact_date = now()+N (N = org.offerte_opvolg_dagen), status blijft
offerte_verzonden, call_log met disposition 'offerte_verzonden'.
Realtime: subscribe op offertes (filter lead_id = huidige lead) zodat een handtekening
tijdens het gesprek direct zichtbaar is.

### Offerte-overzicht (src/pages/Tools.jsx)
Bestaande lijst krijgt: statuschips (kleuren per status, zie beslispagina), filters
"Wacht op klant" (verzonden+geopend), "Getekend", "Verloopt deze week", "Alle";
kolommen zaak, bedrag, status, verstuurd, geopend, geldig tot, AM; knop Herinnering.
Admin ziet alles, AM zijn eigen (bestaand gedrag).

### Toast
Realtime op offertes (org-breed voor admin, eigen user_id voor AM): bij status ->
'getekend' toast "<zaak> heeft offerte <nummer> getekend". Patroon: bestaande Toast.jsx.

## 6. Automatische herinnering

Supabase pg_cron dagelijks 09:00 Europe/Amsterdam: selecteer offertes met status in
('verzonden','geopend'), herinnering_op is null, verzonden_op < now() - org.offerte_herinnering_dag
dagen, sign_token_expires_at > now() + 1 dag. Voor elk: offerte-send aanroepen met
{ offerteId, herinnering: true, system: true } via pg_net, of (eenvoudiger, voorkeur)
een aparte Edge Function offerte-remind die dit in één keer doet en met een cron-secret
beveiligd is. Precies één automatische herinnering per verzending. Daarna is het aan
de beller (opvolgdatum).

## 7. Secrets en config

- RESEND_API_KEY (Supabase secrets). Domein reachconnect.nl verifiëren in Resend
  (SPF + DKIM) VOOR de eerste test, anders komt de mail in spam.
- APP_URL = https://leadgendash.netlify.app (secret, zodat de tekenlink klopt).
- organizations voor ReachConnect vullen: afzender_naam, afzender_email, logo_url.
- profiles.phone vullen voor Noah (en later per AM).
- config.toml: `[functions.offerte-sign] verify_jwt = false`.

## 8. Testscript (handmatig)

1. Maak in de tool een offerte vanuit een lead (?lead=), zie voorinvulling, sla op.
2. Verstuur ter ondertekening -> mail komt aan, lead staat op offerte_verzonden met
   next_contact_date +3 dagen, call_log-rij met source 'offerte_send'.
3. Open link op telefoon -> status geopend, geopend_aantal 1; nog een keer -> 2.
4. Wijzig niets, teken -> offerte getekend, lead bruto_deal/deal, call_log source
   'offerte_remote' met duration 0, toast bij AM, twee mails.
5. Link opnieuw openen -> "al getekend"-pagina.
6. Tweede offerte: verlopen forceren (sign_token_expires_at in het verleden) ->
   verlopen-pagina, status verlopen; verlengen vanuit contactkaart -> nieuw token, status verzonden.
7. Derde offerte: afwijzen met reden -> status afgewezen, lead ongemoeid, mail naar AM.
8. Rapportage/Payouts/XP: de remote deal telt mee als deal, beltijd blijft 0.

## 9. Buiten scope v65

PDF-generatie (klant krijgt link, geen bijlage), e-mailcode als extra slot
(voorbereid: akkoord.methode kan later 'op_afstand_otp' worden), externe tekendienst,
eigen afzenderdomein per tenant (kolommen bestaan al, alleen Resend-verificatie later),
meerdere ondertekenaars.
