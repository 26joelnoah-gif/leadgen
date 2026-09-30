-- ReachConnect v116 (30-09-2026): betaaltermijn per offerte, met een standaard
-- per merk. 1 = binnen 24 uur.
--
-- Waarom niet vast in de voorwaarden: een termijn van 24 uur mag zakelijk, maar
-- past niet bij elke klant (weekend, boekhouder die wekelijks betaalt). De
-- voorwaarden verwijzen daarom naar wat op de offerte staat, met 14 dagen als
-- terugval. Zo kies je per klant zonder de voorwaarden aan te passen.
alter table public.organizations
  add column if not exists betaaltermijn_dagen integer not null default 14;

alter table public.offertes
  add column if not exists betaaltermijn_dagen integer;

comment on column public.organizations.betaaltermijn_dagen is
  'Standaard betaaltermijn in dagen voor nieuwe offertes van dit merk; 1 = binnen 24 uur';
comment on column public.offertes.betaaltermijn_dagen is
  'Betaaltermijn in dagen zoals gekozen op deze offerte; 1 = binnen 24 uur, leeg = 14 dagen';

-- offerte_merk() en offerte_merken() geven het veld mee aan de offerte-tool.
-- Beide returntabellen veranderen, dus eerst droppen. De volledige definities
-- staan in deze migratie zoals ze op 30-09-2026 zijn toegepast; zie
-- migration_v112 / v113 / v114 voor de eerdere versies.

drop function if exists public.offerte_merk(uuid, uuid);

create function public.offerte_merk(p_campaign uuid default null, p_lead uuid default null)
returns table (
  org_id uuid, naam text, afzender_naam text, afzender_email text, logo_url text,
  kvk text, btw_nummer text, adres text, telefoon text, website text, iban text,
  btw_percentage numeric, offerte_geldigheid_dagen integer,
  offerte_akkoord_tekst text, offerte_voorwaarden jsonb,
  accent_kleur text, accent_tekst_kleur text,
  offerte_handtekening text, offerte_sjablonen jsonb,
  betaaltermijn_dagen integer
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
         o.offerte_handtekening, o.offerte_sjablonen,
         o.betaaltermijn_dagen
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

drop function if exists public.offerte_merken();

create function public.offerte_merken()
returns table (
  campaign_id uuid, campaign_naam text,
  org_id uuid, naam text, afzender_naam text, afzender_email text, logo_url text,
  kvk text, btw_nummer text, adres text, telefoon text, website text, iban text,
  btw_percentage numeric, offerte_geldigheid_dagen integer,
  offerte_akkoord_tekst text, offerte_voorwaarden jsonb,
  accent_kleur text, accent_tekst_kleur text,
  offerte_handtekening text, offerte_sjablonen jsonb,
  betaaltermijn_dagen integer
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name,
         o.id, o.name, o.afzender_naam, o.afzender_email, o.logo_url,
         o.kvk, o.btw_nummer, o.adres, o.telefoon, o.website, o.iban,
         o.btw_percentage, o.offerte_geldigheid_dagen,
         o.offerte_akkoord_tekst, o.offerte_voorwaarden,
         o.accent_kleur, o.accent_tekst_kleur,
         o.offerte_handtekening, o.offerte_sjablonen,
         o.betaaltermijn_dagen
  from public.campaigns c
  join public.organizations o on o.id = c.offerte_org_id
  where auth.uid() is not null
    and c.deleted_at is null
    and c.is_active is not false
  order by c.name;
$$;

revoke all on function public.offerte_merken() from anon, public;
grant execute on function public.offerte_merken() to authenticated;
