# Google Agenda koppelen (v114, 30-09-2026)

Elke accountmanager kan zijn eigen Google Agenda koppelen aan ReachConnect.
De koppeling werkt twee kanten op en gebruikt zo min mogelijk rechten.

## Wat de koppeling doet

**Heen (ReachConnect naar Google).** ReachConnect maakt bij het koppelen een
aparte agenda aan in het Google-account met de naam "ReachConnect afspraken".
Alleen daar komen de afspraken in te staan. ReachConnect kan door het gekozen
recht (`calendar.app.created`) alleen bij agenda's die het zelf heeft gemaakt,
dus nooit bij de privé-agenda van die persoon. Een afspraak inplannen,
verzetten, naar een andere accountmanager zetten of verwijderen gaat meteen
mee. Een afboeking (wil nadenken / deal / betaald) komt in de omschrijving.

**Terug (Google naar ReachConnect).** ReachConnect vraagt elk kwartier op
wanneer die persoon bezet is in zijn eigen agenda. Met het recht
`calendar.freebusy` krijg je alleen begin- en eindtijden, geen titels,
omschrijvingen of deelnemers. Die tijd komt in `agenda_blocks` met
`bron = 'google'` en heet in de agenda "Bezet (Google Agenda)". Bellers
kunnen er geen afspraak overheen plannen: de bestaande conflictcontrole
(`findAppointmentConflict`) kijkt gewoon naar alle blokkades.

Blokkades uit Google zijn in ReachConnect grijs, niet te verslepen en niet te
verwijderen (ook niet via de database: de RLS-policies eisen
`bron = 'reachconnect'`). Je haalt ze weg door de afspraak in Google te
verzetten; binnen een kwartier klopt het hier weer.

## Eenmalig instellen in Google Cloud

1. Maak op console.cloud.google.com een project, bijvoorbeeld "ReachConnect".
2. Zet de **Google Calendar API** aan.
3. Vul het **OAuth-toestemmingsscherm** in:
   - Google Workspace op een eigen domein? Kies **Intern**. Dan is er geen
     goedkeuring van Google nodig en ziet niemand een waarschuwing.
   - Anders **Extern**. Voeg iedereen die gaat koppelen toe als testgebruiker
     (tot 100 mensen). Zij zien eenmalig "Google heeft deze app niet
     geverifieerd" en klikken op Geavanceerd > Doorgaan.
4. Rechten (scopes) toevoegen, precies deze twee:
   - `https://www.googleapis.com/auth/calendar.app.created`
   - `https://www.googleapis.com/auth/calendar.freebusy`
5. Maak een **OAuth-client-ID** van het type Webtoepassing met als
   geautoriseerde omleidings-URI:
   `https://zboyxwwrbtpjnlgquhzs.supabase.co/functions/v1/google-agenda-oauth`
6. Zet in Supabase onder Edge Functions > Secrets:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   (`APP_URL` stond er al.)

Daarna staat op /agenda het blok "Google Agenda" met de knop
"Koppel Google Agenda". Iedereen doet dat voor zichzelf.

## Wat waar staat

| Onderdeel | Waar |
|---|---|
| Tokens per medewerker | `public.google_agenda_accounts` (RLS aan, geen policies: alleen service_role) |
| Koppeling afspraak - Google-event | `public.google_agenda_events` |
| Tijdelijke state bij koppelen | `public.google_agenda_oauth_states` (15 min geldig) |
| Status voor de browser | RPC `google_agenda_status()` - geeft nooit tokens terug |
| Aan- en uitzetten per richting | RPC `google_agenda_instellen(p_push, p_busy)` |
| Koppelen / ontkoppelen | Edge Function `google-agenda-oauth` (verify_jwt uit) |
| Afspraak naar Google | Edge Function `google-agenda-push`, aangeroepen door trigger `tr_leads_google_agenda` via pg_net |
| Bezet uit Google | Edge Function `google-agenda-busy`, pg_cron `reachconnect-google-agenda-busy` (elk kwartier) |
| Sleutel db -> functies | Vault `google_agenda_key`, uitleesbaar via `public.google_agenda_key()` (alleen service_role) |
| Frontend | `src/components/GoogleAgendaKoppeling.jsx`, ingehaakt in `src/pages/Agenda.jsx` |

## Waarom het zo gebouwd is

- **Nooit in `public.leads` schrijven.** De koppeling bewaart het event-id in
  een eigen tabel. Een update op `leads` zou de lock-, eigenaar- en
  compliance-triggers raken en kan zelfs een lus met deze trigger geven.
- **De trigger zit in de database, niet in de frontend.** Inplannen kan uit
  het belscherm, van het bord, uit de agendapicker en door het verslepen in de
  agenda. Eén trigger op `leads` vangt ze allemaal.
- **Elke ronde opnieuw zetten in plaats van bijhouden.** De bezet-blokkades
  van de komende 28 dagen worden elke keer weggegooid en opnieuw geschreven.
  Zo verdwijnt een blokkade vanzelf als de afspraak in Google verdwijnt, en is
  er niets te synchroniseren dat scheef kan lopen.

## Bij problemen

- "Koppelverzoek niet herkend": de state is verlopen of al gebruikt. Opnieuw
  op koppelen klikken.
- "Google gaf geen blijvende toegang": Google geeft alleen een refresh_token
  bij de eerste toestemming. Haal ReachConnect weg in het Google-account
  (myaccount.google.com > Beveiliging > Apps van derden) en koppel opnieuw.
- Foutmeldingen komen in `google_agenda_accounts.last_error` en zijn in het
  koppelblok op /agenda te zien.
- Handmatig een ronde draaien kan met een POST op `google-agenda-busy` met de
  header `x-google-agenda-key` (sleutel uit de Vault) en body `{ "user_id": "..." }`.
