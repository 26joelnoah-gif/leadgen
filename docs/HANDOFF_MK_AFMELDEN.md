# Handoff: MarketingKiezer, afmelden en "later mailen" (vanuit ReachConnect v98)

Voor: een Cowork-sessie in de MarketingKiezer-repo.
Datum: 23-09-2026.

## Waarom

Sinds 1 juli 2026 gelden strengere regels voor bellen en mailen (art. 11.7 Telecommunicatiewet). ReachConnect is nu zo gebouwd dat **één afmelding voor beide kanalen geldt**. Meldt een bureau zich via een MarketingKiezer-mail af, dan wordt het in ReachConnect ook niet meer gebeld. Andersom: zegt iemand aan de telefoon "bel me niet meer", dan stopt ReachConnect de mails via `/stop` bij MarketingKiezer.

De ReachConnect-kant is af en live. Deze handoff gaat over wat MarketingKiezer zelf moet checken of afmaken.

## Wat ReachConnect nu verwacht van MarketingKiezer

MarketingKiezer post naar de bestaande Edge Function `mailstatus`, met dezelfde sleutel als nu (`LEADGEN_STATUS_KEY` in Netlify):

```
POST https://zboyxwwrbtpjnlgquhzs.supabase.co/functions/v1/mailstatus
Authorization: Bearer <LEADGEN_STATUS_KEY>
{ "lead_id": "...", "status": "...", "status_op": "ISO-datum", "email": "...", "bureau": "...", "mail_soort": "..." }
```

Wat ReachConnect doet bij elke status:

| status | Wat ReachConnect doet |
|---|---|
| `afgemeld` (ook `uitgeschreven` of `unsubscribe`) | De lead wordt afgemeld voor bellen en mailen. E-mail, telefoon en website gaan op een afmeldlijst, zodat een nieuwe import hem ook blokkeert. Geplande mails vervallen en de eigenaar krijgt een melding. Na 48 uur wordt de lead verwijderd. De afmelding zelf blijft staan in Admin > Compliance. |
| `later_mailen` | Alleen de mails pauzeren, bellen mag nog. **Nieuw optioneel veld `later_op`** (ISO-datum). Zonder dat veld is de pauze 90 dagen. |
| `terugbellen` | Werkt zoals voorheen (lead in de lijst "Bel mij terug"). Nieuw: dit telt in ReachConnect als vastgelegde toestemming om te bellen. |

Tot 23-09 kende ReachConnect `afgemeld` en `later_mailen` nog niet. Vier meldingen van 22-09 zijn achteraf verwerkt: Buro Philip van den Hurk, Online Klik en Cooper & Rothman (afgemeld), en GetBright (later mailen tot 21-12-2026).

## Taken voor MarketingKiezer

1. **Check wat /mailvoorkeur nu toont** na "afmelden" en na "later mailen". Laat het Noah zien voordat je iets aanpast.

2. **Bevestigingstekst op het scherm.** Hieronder staan de voorstellen. Noah heeft ze nog NIET goedgekeurd, dus leg ze eerst aan hem voor en plaats ze niet zelf.

   Na afmelden:
   > **Je bent afgemeld.**
   > We sturen je geen mails meer en bellen je ook niet meer. Dit gaat direct in. Heb je je per ongeluk afgemeld? Mail dan naar info@marketingkiezer.nl.

   Na later mailen:
   > **Helemaal goed.**
   > We mailen je pas weer na [datum]. Tot die tijd hoor je niets van ons per mail.

   Check of info@marketingkiezer.nl het juiste adres is.

3. **Geen afmeldmail sturen.** Iemand die zich afmeldt, wil juist geen mail meer. De bevestiging op het scherm is genoeg.

4. **Als /mailvoorkeur een datum laat kiezen bij "later mailen"**, stuur die dan mee als `later_op` naar ReachConnect. Anders gaat ReachConnect uit van 90 dagen. Zorg dat MarketingKiezer zelf dezelfde datum aanhoudt.

5. **MarketingKiezer moet de afmelding ook zelf onthouden.** Stuur na `afgemeld` of `later_mailen` geen opvolgmail of herinnering meer, ook niet de automatische herinnering na 5 dagen. ReachConnect blokkeert zijn eigen mails wel, maar de herinneringen verstuurt MarketingKiezer zelf. Check dit in `lib/leadgenMail.ts` en in de job die de herinneringen plant.

6. **Check de `/stop`-route.** De Edge Function `mailstop` in ReachConnect roept `MAILSERVICE_MARKETINGKIEZER_URL` aan met `/mail` vervangen door `/stop`, met body `{ lead_id, email, reden }`. Dat gebeurt als een beller afboekt op onder meer Blacklist ("Niet meer benaderen"), Geen interesse of Verkeerd nummer. Controleer dat MarketingKiezer daarna echt niets meer stuurt.

7. **List-Unsubscribe.** Controleer dat elke ReachConnect-mail de headers `List-Unsubscribe` en `List-Unsubscribe-Post: List-Unsubscribe=One-Click` heeft, en dat die klik ook `afgemeld` naar ReachConnect post.

8. **Testen.** Je kunt `scripts/testmails.ts` gebruiken om de mails na te lopen. Test afmelden met een testlead in ReachConnect, niet met een echt bureau. Een afgemelde lead wordt na 48 uur echt verwijderd, en daarbij komen ook alle leads met hetzelfde e-mailadres, telefoonnummer of dezelfde website op de afmeldlijst. Test dus met een verzonnen domein.

## Handig om te weten

- ReachConnect verstuurt zelf nooit mail. Alles gaat via MarketingKiezer.
- ReachConnect-code: `supabase/functions/mailstatus/index.ts`, `supabase/functions/mailstop/index.ts` en `migration_v98_compliance.sql`. Uitleg staat in `CLAUDE.md` onder v98.
- Supabase-project van ReachConnect: `zboyxwwrbtpjnlgquhzs`.
- Schrijfstijl van Noah: simpel Nederlands, korte zinnen, geen em-dashes. Teksten die klanten zien eerst aan hem voorleggen.
