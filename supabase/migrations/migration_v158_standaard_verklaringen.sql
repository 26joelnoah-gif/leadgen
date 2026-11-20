-- v158 (2026-11-20): vier standaard verklaringen als snelkeuze op /overeenkomsten.
-- overeenkomst_sjablonen.snelkeuze = volgorde van de kaart (null = geen kaart),
-- .omschrijving = korte uitleg op de kaart. Teksten zijn bewust licht:
-- alleen betaling op netto resultaat, geen garantie op werk, per direct stoppen,
-- aansprakelijkheid begrensd. Bedragen die nog niet vaststaan staan leeg en
-- worden bij versturen ingevuld.

alter table public.overeenkomst_sjablonen add column if not exists snelkeuze int;
alter table public.overeenkomst_sjablonen add column if not exists omschrijving text;

-- Gedeelde artikelen 3 t/m 11 voor alle vier
create temporary table _v158_basis(tekst text) on commit drop;
insert into _v158_basis values ($t$
## 3. Geen vaste hoeveelheid werk
Wij beloven geen vast aantal leads, uren of opdrachten. Jij hoeft ook geen vast aantal uren te werken. Je verdient alleen aan resultaat, er is geen uurloon en geen minimum.

## 4. Factureren en betalen
Je stuurt ons zelf een factuur. Wij betalen uiterlijk 30 dagen nadat we je factuur ontvangen hebben. Je bent zelf verantwoordelijk voor btw, inkomstenbelasting en premies.

## 5. Je werkt zelfstandig
- Je hebt een eigen onderneming, ingeschreven bij de KvK.
- Je bepaalt zelf wanneer, waar en hoeveel je werkt.
- Je gebruikt je eigen spullen, zoals laptop, telefoon, headset en internet.
- Je kosten zijn voor jou.
- Je mag ook voor andere opdrachtgevers werken.
- Wij geven uitleg over de producten en de regels van onze klanten. Hoe je je werk doet, bepaal je zelf.

## 6. Verzekering
Je verklaart dat je een bedrijfsaansprakelijkheidsverzekering hebt. Arbeidsongeschiktheid en pensioen regel je zelf.

## 7. Geheimhouding en privacy
- Je gebruikt de gegevens van leads, klanten en kandidaten alleen voor dit werk.
- Je kopieert of bewaart ze niet buiten ReachConnect.
- Zegt iemand dat hij geen contact meer wil, dan zet je dat meteen in ReachConnect.

## 8. Klanten blijven van ons
Je benadert leads, klanten en kandidaten uit ReachConnect niet buiten ons om. Dat geldt ook tot 12 maanden nadat je gestopt bent.

## 9. Aansprakelijkheid
Schade die jij maakt bij je werk is voor jouw rekening. Zijn wij aansprakelijk, dan is dat nooit meer dan wat wij jou in de laatste 3 maanden voor dit werk betaald hebben.

## 10. Bedragen wijzigen en stoppen
- Willen we andere bedragen afspreken, dan sturen we een nieuwe verklaring. De nieuwe bedragen gelden vanaf het moment dat jij die tekent.
- Allebei kunnen we per direct stoppen. Wat je tot dan verdiend hebt en netto is, betalen we gewoon uit.

## 11. Welk recht geldt
Op deze verklaring is Nederlands recht van toepassing.$t$);

insert into public.overeenkomst_sjablonen
  (naam, titel, opdrachtgever_naam, opdrachtgever_plaats, opdrachtgever_kvk, ontvanger_rol, snelkeuze, omschrijving, tarieven, tekst)
select v.naam, v.titel, 'ReachConnect', 'Arnhem', '74769405', v.rol, v.volg, v.oms, v.tarieven::jsonb, v.kop || (select tekst from _v158_basis)
from (values
  ('Setter Recruitment', 'Verklaring zelfstandig appointment setter', 'Appointment setter', 1,
   'Belt sollicitanten en plant sollicitatiegesprekken.',
   '[{"project":"Recruitment","afspraak":null,"sale":null,"sale_procent":null}]',
   $t$## 1. Wat je doet
Je belt zelfstandig mensen die gesolliciteerd hebben of interesse hebben in werk bij ons of bij onze opdrachtgevers. Je plant sollicitatiegesprekken in ReachConnect.

## 2. Wat je verdient
Je krijgt een vast bedrag per gesprek of per kandidaat die begint:
{{tarieven}}
- Een afspraak telt als de kandidaat echt op het sollicitatiegesprek komt.
- Een sale telt als de kandidaat begonnen is en minimaal 2 weken gewerkt heeft.
- Of iets telt, stellen wij vast met de gegevens in ReachConnect.
$t$),
  ('Setter Marketing', 'Verklaring zelfstandig appointment setter', 'Appointment setter', 2,
   'Belt bedrijven voor ProSell, MarketingKiezer en andere marketingprojecten.',
   '[{"project":"PROSELL","afspraak":null,"sale":null,"sale_procent":10}]',
   $t$## 1. Wat je doet
Je belt zelfstandig bedrijven voor onze marketingprojecten, zoals ProSell en MarketingKiezer. Je maakt afspraken voor een closer of stuurt via ReachConnect een mail.

## 2. Wat je verdient
Je krijgt een bedrag per netto afspraak of sale:
{{tarieven}}
- Een sale is netto als de klant niet heeft geannuleerd. Heeft de klant bedenktijd, dan is de sale pas netto als die bedenktijd voorbij is.
- Staat er een percentage, dan is dat een percentage van de orderwaarde zonder btw.
- Een afspraak of mail die geen sale wordt, levert alleen iets op als er een bedrag per afspraak staat.
- Of iets netto is, stellen wij vast met de gegevens in ReachConnect en van onze klant.
- Wat je verdiend hebt, zie je in ReachConnect onder "Mijn afspraken".
$t$),
  ('Setter BeautyInfo', 'Verklaring zelfstandig appointment setter', 'Appointment setter', 3,
   'Belt klinieken en beautyzaken voor BeautyInfo.',
   '[{"project":"BEAUTYINFO","afspraak":null,"sale":75,"sale_procent":null}]',
   $t$## 1. Wat je doet
Je belt zelfstandig klinieken en beautyzaken voor BeautyInfo. Je legt uit wat BeautyInfo doet, stuurt de aanmeldmail of plant een kennismakingsgesprek in ReachConnect.

## 2. Wat je verdient
Je krijgt een vast bedrag per netto sale:
{{tarieven}}
- Een sale is netto als de zaak zich heeft aangemeld en betaald heeft, en niet binnen de bedenktijd heeft opgezegd.
- Of iets netto is, stellen wij vast met de gegevens in ReachConnect en van BeautyInfo.
- Wat je verdiend hebt, zie je in ReachConnect onder "Mijn afspraken".
$t$),
  ('Closer', 'Verklaring zelfstandig closer', 'Closer', 4,
   'Voert de gesprekken die setters inplannen en sluit de deal. Voor marketing, BeautyInfo en andere projecten.',
   '[{"project":"PROSELL","afspraak":null,"sale":null,"sale_procent":20},{"project":"BEAUTYINFO","afspraak":null,"sale":null,"sale_procent":null}]',
   $t$## 1. Wat je doet
Je voert zelfstandig de gesprekken die setters voor je inplannen, bijvoorbeeld een videocall of een bezoek. Je legt de diensten uit, maakt offertes en sluit deals. Je afspraken staan in ReachConnect in je agenda.

## 2. Wat je verdient
Je krijgt een bedrag of percentage per netto deal die jij sluit:
{{tarieven}}
- Staat er een percentage, dan is dat een percentage van de orderwaarde zonder btw. Staan er maandbedragen in de offerte, dan telt het bedrag over de looptijd die in de offerte staat.
- Een deal is netto als de klant niet heeft geannuleerd. Heeft de klant bedenktijd, dan is de deal pas netto als die bedenktijd voorbij is.
- Een gesprek dat geen deal wordt, levert niets op.
- Of iets netto is, stellen wij vast met de gegevens in ReachConnect en van onze klant.
- Tijden dat je niet kunt, blokkeer je zelf in je agenda.
$t$)
) as v(naam, titel, rol, volg, oms, tarieven, kop)
where not exists (select 1 from public.overeenkomst_sjablonen s where s.naam = v.naam);
