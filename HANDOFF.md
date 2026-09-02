# Handoff — sessie 2 september 2026

Branch: `claude/voortgang-tools-yh2k21` (5 commits, alles gepusht, werkboom schoon)
Supabase project: `zboyxwwrbtpjnlgquhzs` ("26joelnoah-gif's Project")

---

## ⚠️ EERST DIT CONTROLEREN

De database staat in een **onbekende, mogelijk half-toegepaste staat**. Begin
hier, want alles hieronder hangt ervan af.

Migratie v14 en v15 zijn door mij **niet** toegepast — de goedkeuring voor de
Supabase-tool kwam nooit door. Maar meten via de REST API geeft een
tegenstrijdig beeld:

| Object | Migratie | Bestaat? |
|---|---|---|
| `is_admin()`, `my_org_id()`, `my_list_ids()` | v12 | ja |
| `create_organization()` | v13 | ja |
| `org_settings` | v14 | **nee** |
| `lead_list_assignees` | v15 | **nee** |
| `claim_next_lead()` | v15 | **ja** ← klopt niet |
| `release_lead()` | v15 | onduidelijk |

`claim_next_lead` bestaat dus wél terwijl de tabel uit dezelfde migratie
ontbreekt. En hij is aanroepbaar door anonieme gebruikers, terwijl mijn script
dat juist intrekt. Vermoedelijk heeft een andere agent (Minimax of Gemini
draaien parallel op dezelfde codebase) of een handmatige actie hier iets
gedaan.

**Draai dit eerst en beoordeel de uitkomst:**

```sql
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       p.prosecdef as security_definer, p.proconfig,
       array(select r.rolname from pg_roles r
             where has_function_privilege(r.rolname, p.oid, 'EXECUTE')
               and r.rolname in ('anon','authenticated')) as mag_uitvoeren
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('claim_next_lead','release_lead')
order by p.proname;

select to_regclass('public.org_settings')        as org_settings,
       to_regclass('public.lead_list_assignees') as lead_list_assignees;
```

Is `claim_next_lead` niet identiek aan de versie in
`migration_v15_multi_assign_and_queue.sql`, **drop hem dan** en draai v15
opnieuw in zijn geheel. Anders krijg je twee bellers op dezelfde lead.

Daarna in deze volgorde draaien in de Supabase SQL Editor:
1. `migration_v14_settings_and_payouts.sql`
2. `migration_v15_multi_assign_and_queue.sql`

---

## Wat er in deze sessie is gebeurd

### 1. Beveiliging — `4f8f6cd` (v12, v12b toegepast ✅)

De aanleiding: `public.leads` had een policy `leads_all` met `USING true` voor
rol `public`. Meerdere policies worden met OR gecombineerd, dus die ene
overrulede alles eronder. Samen met `profiles` waar RLS helemaal uit stond
betekende dat: **iedereen met de anon key — die in de frontend bundle zit, dus
publiek is — kon alle leads met NAW-gegevens lezen én aanpassen zonder in te
loggen, en zichzelf admin maken.**

Geverifieerd na de fix, met echte HTTP-calls met de publieke anon key:

| | vóór | nu |
|---|---|---|
| leads lezen zonder login | 8 leads met NAW | geweigerd |
| profielen lezen | 3 profielen | geweigerd |
| lead aanmaken | lukte | 42501 |
| medewerker maakt zichzelf admin | lukte | geblokkeerd door trigger |

Verder: alle dubbele/tegenstrijdige policies vervangen door één coherente set
op `authenticated` in plaats van `public`; trigger tegen role-escalatie;
`vw_leads_with_teams` van SECURITY DEFINER naar invoker; vaste `search_path` op
functies.

**Nog open:** zet *Leaked Password Protection* aan in Supabase → Auth. Eén
vinkje, kan ik niet voor je doen.

### 2. Kapotte dataroutes — `4f8f6cd`

`teams`, `team_members` en `flow_settings` hadden RLS aan met **nul policies**.
Alles dicht. Gevolg:

- `useLeads` haalde je teams op → kreeg niets → viel terug op alleen direct
  toegewezen leads. Dát is waarom medewerkers bijna niks zagen.
- `handleLeadDisposition` las `flow_settings` → altijd `null` → **je hele
  automated-flow systeem heeft nooit gedraaid.** De 5 regels stonden er wel.
- Teams aanmaken, leden toevoegen, lijsten koppelen: faalden stil.

Frontend meegefixt: client-side zichtbaarheidslogica eruit (RLS doet het nu),
`.single()` → `.maybeSingle()` op flow_settings, `useLeadLists` filterde op de
verkeerde kolom, `useActivities` vuurde vóór de sessie rond was, adminpaneel
toont nu fouten in plaats van ze in te slikken.

### 3. Design en mobiel — `9608ed8`

Grootste vondst: **grote delen van de app zijn geschreven met Tailwind-klassen
terwijl Tailwind nooit is geïnstalleerd.** Ruim 300 klassen (`text-4xl`, `p-6`,
`md:grid-cols-3`, `rounded-2xl`) deden niets. Dat verklaarde de scheve marges en
ontbrekende kolommen. Er staat nu een eigen utility-laag in `index.css` van
~290 regels.

Ook: demo-modus crashte met een wit scherm (`createClient` met lege URL gooide
vóór de demo-check); felblauwe header vervangen; Reports/Payouts/Earnings/TBAs
hadden eigen onvolledige kopieën van de header, nu allemaal de gedeelde
component; emoji vervangen door lucide-iconen; cursieve koppen rechtop.

Mobiel getest op 390px, alle 9 schermen zonder horizontale overflow. Twee echte
bugs daarbij: de conversiefunnel viel buiten zijn kaart (stappen hadden
`min-width: auto`) en Recharts-grafieken groeiden mee met hun container zonder
ooit terug te krimpen.

### 4. Tarieven en payouts — `bb29e70` (v14 NIET toegepast ⚠️)

Uitbetalingstarieven stonden in `localStorage`: per browser, en `saveSettings`
werd nooit aangeroepen dus ze waren niet eens te wijzigen. Nu tabel
`org_settings` + `useSettings` hook + `PayoutRatesCard` in Admin.

Ook ontdekt: `payouts` had RLS aan met nul policies — die pagina heeft dus ook
nooit gewerkt.

### 5. Meerdere bellers + import + analytics — `2b88d29`, `0ace788`

**Gelijktijdig bellen (v15 NIET toegepast ⚠️).** `WorkInterface` pakte de lead
op index uit lokale state: `listLeads[leadIndex]`. Twee bellers op dezelfde
lijst kregen allebei `listLeads[0]`. Opgelost met `claim_next_lead()` +
`FOR UPDATE SKIP LOCKED` en koppeltabel `lead_list_assignees` voor
many-to-many toewijzing. **Er zit een terugval in**: ontbreekt de RPC, dan valt
het belscherm terug op de oude werkwijze zodat bellen blijft werken.

**Import (werkt direct, geen migratie nodig).** Er was geen importscherm;
`parseCSV` werd geïmporteerd in Admin maar nooit aangeroepen. De oude parser
deed `split(',')` — breekt op Nederlandse Excel-exports (puntkomma) en op
`"Bakkerij Jansen, B.V."`. Nieuwe parser volgt RFC 4180, herkent het
scheidingsteken, 12 velden, dubbelcheck op genormaliseerd telefoonnummer.

**Afboektijd per agent (werkt direct).** Eerst moest een bug eruit:
afboekingen zonder flow-regel werden **helemaal niet gelogd** — alleen de tak
mét regel riep `logActivity` aan. Met 5 regels voor 13 disposities ontbrak het
merendeel in de rapportage. Nu tabel op `/admin/reports` met per beller:
afboekingen, mediane afboektijd, afspraken, deals, conversie, actieve tijd.
Pauzes >30 min tellen niet mee, en het is een mediaan zodat één lang gesprek
het beeld niet vertekent.

---

## Wat NIET af is

De laatste opdracht is onderbroken en **niet gebouwd**:

> "Fix alles wat je kan fixen om dit vandaag werkend te krijgen, ik wil ook voor
> agents een overzicht welke projecten ze mogen doen met het bestaande overzicht
> om te factureren maar dat moet beter."

Twee stukken:

1. **Projectoverzicht voor bellers.** Een pagina waar een beller ziet welke
   lijsten aan hem zijn toegewezen, hoeveel leads er nog open staan, wat hij
   al gedaan heeft en wat het waard is. Leunt op `lead_list_assignees` uit
   v15, dus die migratie moet eerst draaien.

2. **Beter factuuroverzicht.** `src/pages/Earnings.jsx` is nu één groot totaal
   met een "kopieer voor factuur"-knop. Noah wil een opsplitsing per
   project/lijst, met nette factuurregels. Tarieven komen uit `useSettings`
   (v14 nodig).

---

## Werkwijze die goed werkte

**Demo-modus om zonder wachtwoord in de app te komen.** Verplaats `.env`
tijdelijk, bouw, en log in met `admin@demo.nl` / `demo123` (of
`employee@demo.nl`). Let op: in demo-modus zit de sessie alleen in
React-geheugen, dus navigeer client-side (`history.pushState` +
`PopStateEvent`) — een `goto` gooit je terug naar login.

```bash
mv .env .env.hidden && npm run build && rm -rf dist-demo && mv dist dist-demo && mv .env.hidden .env
npx vite preview --outDir dist-demo --port 4174
```

Playwright staat klaar op `/opt/pw-browsers/chromium`. Testscripts uit deze
sessie staan in de scratchpad (niet in de repo).

**Overflow meten:** `overflow-x: hidden` op body maakt `scrollWidth` onbruikbaar
als maat. Zet het tijdelijk op `visible` en meet de rechterrand van elementen,
en negeer elementen binnen een eigen scrollcontainer.

---

## Patronen om op te letten in deze codebase

- **Dode imports.** Drie keer voorgekomen: `saveSettings`, `parseCSV`/
  `validateLeads`, en `assignListToAgent` werden geïmporteerd maar nooit
  aangeroepen. Als iets "er lijkt te zijn maar doet niets", check dit eerst.
- **Stil falen.** Veel `if (!error)` zonder else-tak. Fouten verdwenen daardoor.
- **RLS aan zonder policies** = alles dicht, zonder foutmelding in de UI. Dit
  was de oorzaak van meerdere "werkt niet echt"-klachten.
- **Parallelle agents.** Minimax en Gemini draaien volgens CLAUDE.md op dezelfde
  codebase. Controleer de git-log en de DB-staat voordat je aannames doet.
- De bundle is 1,1 MB (314 kB gzipped). Niet aangepakt; code-splitting is een
  aparte klus.
