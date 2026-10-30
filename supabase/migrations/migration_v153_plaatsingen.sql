-- v153 (2026-10-30): plaatsingen - waar werkt iedereen?
-- Wens Noah: overzicht wie waar geplaatst is (callcenter Arnhem, appointment
-- setters bij opdrachtgever Rocher, buitendienst op andere plekken).
-- Weergave "Plaatsingen" op /recruitment (bord: kolom per locatie + "Nog niet
-- geplaatst"). Een persoon is een account (profile_id) of een aangenomen
-- sollicitant zonder account (lead_id). Per persoon max 1 lopende plaatsing
-- (eind_op leeg); verplaatsen = oude afsluiten + nieuwe rij, zo blijft de
-- geschiedenis staan.

create or replace function public.mag_plaatsingen()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active is not false and deleted_at is null
      and role in ('admin', 'manager', 'recruiter')
  );
$$;
revoke execute on function public.mag_plaatsingen() from anon, public;
grant execute on function public.mag_plaatsingen() to authenticated;

create table if not exists public.plaatsing_locaties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.my_org_id() references public.organizations(id) on delete cascade,
  naam text not null check (length(trim(naam)) between 1 and 80),
  soort text not null default 'opdrachtgever' check (soort in ('callcenter', 'opdrachtgever', 'buitendienst', 'anders')),
  plaats text check (plaats is null or length(plaats) <= 80),
  notitie text check (notitie is null or length(notitie) <= 500),
  volgorde integer not null default 0,
  actief boolean not null default true,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.plaatsingen (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.my_org_id() references public.organizations(id) on delete cascade,
  locatie_id uuid not null references public.plaatsing_locaties(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  lead_id uuid references public.leads(id) on delete set null,
  naam text not null check (length(trim(naam)) between 1 and 120),
  functie text check (functie is null or length(functie) <= 80),
  start_op date not null default current_date,
  eind_op date,
  notitie text check (notitie is null or length(notitie) <= 1000),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plaatsingen_persoon check (profile_id is not null or lead_id is not null),
  constraint plaatsingen_datums check (eind_op is null or eind_op >= start_op)
);

create unique index if not exists plaatsingen_profiel_lopend on public.plaatsingen (profile_id) where eind_op is null and profile_id is not null;
create unique index if not exists plaatsingen_lead_lopend on public.plaatsingen (lead_id) where eind_op is null and lead_id is not null and profile_id is null;
create index if not exists plaatsingen_locatie_idx on public.plaatsingen (locatie_id) where eind_op is null;

drop trigger if exists tr_plaatsingen_updated_at on public.plaatsingen;
create trigger tr_plaatsingen_updated_at before update on public.plaatsingen
  for each row execute function public.update_updated_at();

alter table public.plaatsing_locaties enable row level security;
alter table public.plaatsingen enable row level security;

drop policy if exists plaatsing_locaties_all on public.plaatsing_locaties;
create policy plaatsing_locaties_all on public.plaatsing_locaties for all to authenticated
  using ((select public.mag_plaatsingen()) and not (organization_id is distinct from (select public.my_org_id())))
  with check ((select public.mag_plaatsingen()) and not (organization_id is distinct from (select public.my_org_id())));

drop policy if exists plaatsingen_all on public.plaatsingen;
create policy plaatsingen_all on public.plaatsingen for all to authenticated
  using ((select public.mag_plaatsingen()) and not (organization_id is distinct from (select public.my_org_id())))
  with check ((select public.mag_plaatsingen()) and not (organization_id is distinct from (select public.my_org_id())));

-- Startlocaties voor de organisatie van de admin (Noah).
insert into public.plaatsing_locaties (organization_id, naam, soort, plaats, volgorde)
select o.org, v.naam, v.soort, v.plaats, v.volgorde
from (select organization_id as org from public.profiles where role = 'admin' and deleted_at is null limit 1) o
cross join (values ('Callcenter Arnhem', 'callcenter', 'Arnhem', 1), ('Rocher', 'opdrachtgever', null, 2)) as v(naam, soort, plaats, volgorde)
where not exists (select 1 from public.plaatsing_locaties);
