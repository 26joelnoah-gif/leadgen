-- ReachConnect v112 (2026-09-30): merk/afzender van een offerte per organisatie,
-- gekoppeld per project. Aanleiding: Noah wil vanuit ReachConnect een digitale
-- offerte kunnen sturen voor ProSell Marketing, met ProSell als afzender, en
-- later hetzelfde voor elk volgend bedrijf zonder nieuwe code.
--
-- Twee dingen bewust gescheiden:
--   organizations.id als TENANT (offertes.organization_id, RLS, my_org_id())
--   -> blijft precies zoals hij was; iedereen zit nu in "eigen omgeving" (null).
--   organizations als MERK (afzender, logo, voorwaarden op de offerte)
--   -> nieuwe kolommen + campaigns.offerte_org_id + offertes.branding_org_id.
-- Zo kan een beller zonder organisatie gewoon een ProSell-offerte sturen zonder
-- dat de RLS van v59 omvalt.

-- 1. Merkgegevens op de organisatie -------------------------------------------
alter table public.organizations
  add column if not exists kvk text,
  add column if not exists btw_nummer text,
  add column if not exists adres text,
  add column if not exists telefoon text,
  add column if not exists website text,
  add column if not exists iban text,
  add column if not exists btw_percentage numeric not null default 21,
  add column if not exists offerte_akkoord_tekst text,
  add column if not exists offerte_voorwaarden jsonb not null default '[]'::jsonb;

comment on column public.organizations.offerte_voorwaarden is
  'Kleine letters onder de offerte: [{"titel":"...","tekst":"..."}]';

-- 2. Welk merk hoort bij welk project -----------------------------------------
alter table public.campaigns
  add column if not exists offerte_org_id uuid references public.organizations(id) on delete set null;

comment on column public.campaigns.offerte_org_id is
  'Namens welke organisatie de offertes van dit project de deur uit gaan (afzender, logo, voorwaarden).';

-- 3. Het merk vastleggen op de offerte zelf ------------------------------------
--    Snapshot-gedachte van v59: een latere wijziging aan het merk verandert een
--    verstuurde offerte niet van afzender.
alter table public.offertes
  add column if not exists branding_org_id uuid references public.organizations(id) on delete set null,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists idx_offertes_campaign on public.offertes(campaign_id);

-- 4. Admin mag merken beheren --------------------------------------------------
--    (was: alleen de owner van de organisatie; policies volgen de v101-regel)
drop policy if exists organizations_select on public.organizations;
create policy organizations_select on public.organizations for select using (
  id = (select public.my_org_id())
  or owner_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists organizations_update on public.organizations;
create policy organizations_update on public.organizations for update using (
  owner_id = (select auth.uid()) or (select public.is_admin())
) with check (
  owner_id = (select auth.uid()) or (select public.is_admin())
);

-- 5. Het merk ophalen in de offerte-tool ---------------------------------------
--    De tool draait in de browser met de sessie van de beller/AM. Die heeft geen
--    leesrecht op organizations (hij zit in "eigen omgeving"), dus gaat het via
--    deze functie. Zij geeft alleen gegevens terug die de klant sowieso op de
--    offerte ziet: naam, afzender, logo, KvK/btw/adres, voorwaarden.
create or replace function public.offerte_merk(p_campaign uuid default null, p_lead uuid default null)
returns table (
  org_id uuid, naam text, afzender_naam text, afzender_email text, logo_url text,
  kvk text, btw_nummer text, adres text, telefoon text, website text, iban text,
  btw_percentage numeric, offerte_geldigheid_dagen integer,
  offerte_akkoord_tekst text, offerte_voorwaarden jsonb
)
language sql
security definer
set search_path = public
as $$
  select o.id, o.name, o.afzender_naam, o.afzender_email, o.logo_url,
         o.kvk, o.btw_nummer, o.adres, o.telefoon, o.website, o.iban,
         o.btw_percentage, o.offerte_geldigheid_dagen,
         o.offerte_akkoord_tekst, o.offerte_voorwaarden
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

-- 6. Bij welk project hoort een lead (de tool heeft dit nodig om het merk en het
--    projectnummer te bepalen; leads-RLS bepaalt of je de lead mag zien)
create or replace function public.campaign_van_lead(p_lead uuid)
returns uuid
language sql
stable
security invoker
as $$
  select ll.campaign_id
  from public.leads l
  join public.lead_lists ll on ll.id = l.lead_list_id
  where l.id = p_lead;
$$;

revoke all on function public.campaign_van_lead(uuid) from anon, public;
grant execute on function public.campaign_van_lead(uuid) to authenticated;

-- 7. Nieuwe offertesoort 'vrij' (offerte op maat, public/tools/offerte-vrij.html)
alter table public.offertes drop constraint if exists offertes_soort_check;
alter table public.offertes add constraint offertes_soort_check
  check (soort in ('bestelplatform','verduurzaming','vrij'));

-- 8. Gegevens die hierbij horen (uitgevoerd op 30-09-2026):
--    organizations 'ProsellMarketing' -> naam/afzender ProSell Marketing
--    campaigns PROSELL.offerte_org_id -> die organisatie
--    campaign_tools PROSELL           -> offerte_vrij
