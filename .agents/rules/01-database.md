# Database migraties — LEADGEN

Alle migraties staan als losse .sql bestanden in de root van het project: `migration_vNN_naam.sql`. Er is geen migrations/-map, dat is bewust zo gelaten om niets te breken. Laat de bestanden waar ze staan.

## Voordat je een nieuwe migratie maakt
Run: `node scripts/next-migration.mjs`

Dat script leest alle bestaande migratiebestanden en zegt je het eerstvolgende vrije nummer. Gebruik altijd dat nummer, ook als een lager nummer vrij lijkt.

## Bekende dubbele nummers uit het verleden (laat met rust)
v18, v64, v65, v71 en v78 hebben elk twee bestanden. Dat is een oude vergissing uit een periode met meerdere AI's tegelijk aan het werk. Vul die nummers niet verder aan en hergebruik ze niet. Een nieuwe migratie krijgt altijd een nummer dat nog nooit gebruikt is.

## Hoe een migratie wordt toegepast
Noah past migraties toe via de Supabase SQL Editor, of via de Supabase MCP-tool als die beschikbaar is. Een migratiebestand aanmaken is niet hetzelfde als hem uitvoeren. Zeg er in je antwoord duidelijk bij of de migratie al is toegepast of nog moet worden uitgevoerd (zie CLAUDE.md voor het patroon: daar staat achter elke toegepaste migratie "toegepast").

## RLS
Nieuwe tabellen met lead- of klantdata krijgen altijd Row Level Security. Scope de policy op organization_id of campaign/project, nooit alleen op auth.uid(). Kijk naar een recente migratie (v87 of v94) voor het huidige patroon.
