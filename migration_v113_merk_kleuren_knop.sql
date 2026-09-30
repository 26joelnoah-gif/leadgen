-- ReachConnect v113 (30-09-2026): merk verder aankleden en ondertekenen zonder
-- handtekening. Aanleiding: de ProSell-offerte moet in hun eigen kleuren staan,
-- de klant moet met een knop kunnen ondertekenen (met een bevestigingsstap in
-- plaats van een krabbel), en maandregels zoals hosting moeten een looptijd
-- kunnen hebben.

-- 1. Kleuren, vaste regels en de manier van ondertekenen per organisatie
alter table public.organizations
  add column if not exists accent_kleur text,
  add column if not exists accent_tekst_kleur text,
  add column if not exists offerte_sjablonen jsonb not null default '[]'::jsonb;

alter table public.organizations
  add column if not exists offerte_handtekening text not null default 'knop';
alter table public.organizations drop constraint if exists organizations_offerte_handtekening_check;
alter table public.organizations add constraint organizations_offerte_handtekening_check
  check (offerte_handtekening in ('knop','tekenen'));

comment on column public.organizations.offerte_handtekening is
  'knop = klant tekent met een akkoordknop (naam + vinkje + bevestiging); tekenen = klant zet een handtekening op het scherm';
comment on column public.organizations.offerte_sjablonen is
  'Snelknoppen in de offerte-tool: [{"naam":"Hosting","periode":"maand","prijs":null,"looptijd":12}]';

-- 2. Per offerte vastleggen of er een handtekening nodig is. offerte-sign kijkt
--    hiernaar: false = png mag leeg blijven, maar het akkoord-vinkje is verplicht.
alter table public.offertes
  add column if not exists handtekening_vereist boolean not null default true;

comment on column public.offertes.handtekening_vereist is
  'false = ondertekenen mag met een akkoordknop zonder handtekeningafbeelding (offerte-sign laat png dan leeg toe)';

-- 3. offerte_merk() geeft de nieuwe velden mee aan de offerte-tool.
--    Let op: de returntabel verandert, dus eerst droppen.
drop function if exists public.offerte_merk(uuid, uuid);

create function public.offerte_merk(p_campaign uuid default null, p_lead uuid default null)
returns table (
  org_id uuid, naam text, afzender_naam text, afzender_email text, logo_url text,
  kvk text, btw_nummer text, adres text, telefoon text, website text, iban text,
  btw_percentage numeric, offerte_geldigheid_dagen integer,
  offerte_akkoord_tekst text, offerte_voorwaarden jsonb,
  accent_kleur text, accent_tekst_kleur text,
  offerte_handtekening text, offerte_sjablonen jsonb
)
language sql
security definer
set search_path = public
as $$
  select o.id, o.name, o.afzender_naam, o.afzender_email, o.logo_url,
         o.kvk, o.btw_nummer, o.adres, o.telefoon, o.website, o.iban,
         o.btw_percentage, o.offerte_geldigheid_dagen,
         o.offerte_akkoord_tekst, o.offerte_voorwaarden,
         o.accent_kleur, o.accent_tekst_kleur,
         o.offerte_handtekening, o.offerte_sjablonen
  from public.organizations o
  where auth.uid() is not null
    and o.id = coalesce(
      (select c.offerte_org_id from public.campaigns c where c.id = p_campaign),
      (select c.offerte_org_id
         from public.leads l
         join public.lead_lists ll on ll.id = l.lead_list_id
         join public.campaigns c on c.id = ll.campaign_id
        where l.id = p_lead)
    );
$$;

revoke all on function public.offerte_merk(uuid, uuid) from anon, public;
grant execute on function public.offerte_merk(uuid, uuid) to authenticated;

-- 4. Gegevens die hierbij horen (uitgevoerd op 30-09-2026):
--    ProSell Marketing: afzender samenwerken@prosellmarketing.nl,
--    accentkleur #C8F542 met donkere tekst #0B0B0C (van prosellmarketing.nl),
--    ondertekenen met de akkoordknop, en 10 vaste regels (website, social
--    media content, hosting, SEO, short form video, advertenties, UGC,
--    LinkedIn, filmen op locatie).
