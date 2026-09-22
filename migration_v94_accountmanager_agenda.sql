-- LEADGEN v94 (2026-09-22): Rol 'accountmanager' + Agenda met tijdsblokkades (agenda_blocks).
-- Accountmanagers beheren hun eigen leadbord en afsprakenagenda.
-- Ze kunnen tijdvakken blokkeren waarin bellers geen afspraken mogen inplannen.

-- 1. profiles_role_check uitbreiden met 'accountmanager'
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['employee','manager','admin','recruiter','backoffice','planning','extern','accountmanager']));

-- 2. Tabel voor tijdsblokkades in de agenda
create table if not exists public.agenda_blocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  title text,
  created_at timestamptz not null default now(),
  constraint agenda_blocks_valid_range check (end_at > start_at)
);

comment on table public.agenda_blocks is
  'Geblokkeerde tijdvakken van accountmanagers waarin bellers geen afspraak kunnen inplannen.';

-- Indices voor snelle overlap-checks en weergave in de kalender
create index if not exists idx_agenda_blocks_user_time
  on public.agenda_blocks (user_id, start_at, end_at);

create index if not exists idx_agenda_blocks_org
  on public.agenda_blocks (organization_id);

-- RLS inschakelen
alter table public.agenda_blocks enable row level security;

-- Iedereen binnen de organisatie mag geblokkeerde tijden inzien (nodig voor bellers die inplannen)
drop policy if exists "agenda_blocks_select" on public.agenda_blocks;
create policy "agenda_blocks_select" on public.agenda_blocks for select to authenticated
  using (not (organization_id is distinct from my_org_id()));

-- Accountmanager mag eigen blokkades aanmaken; admin mag alles
drop policy if exists "agenda_blocks_insert" on public.agenda_blocks;
create policy "agenda_blocks_insert" on public.agenda_blocks for insert to authenticated
  with check (
    not (organization_id is distinct from my_org_id())
    and (user_id = auth.uid() or public.is_admin())
  );

-- Accountmanager mag eigen blokkades bijwerken; admin mag alles
drop policy if exists "agenda_blocks_update" on public.agenda_blocks;
create policy "agenda_blocks_update" on public.agenda_blocks for update to authenticated
  using (
    not (organization_id is distinct from my_org_id())
    and (user_id = auth.uid() or public.is_admin())
  ) with check (
    not (organization_id is distinct from my_org_id())
    and (user_id = auth.uid() or public.is_admin())
  );

-- Accountmanager mag eigen blokkades verwijderen; admin mag alles
drop policy if exists "agenda_blocks_delete" on public.agenda_blocks;
create policy "agenda_blocks_delete" on public.agenda_blocks for delete to authenticated
  using (
    not (organization_id is distinct from my_org_id())
    and (user_id = auth.uid() or public.is_admin())
  );

grant select, insert, update, delete on public.agenda_blocks to authenticated;

-- Voeg agenda_blocks toe aan realtime publicatie zodat de agenda direct up-to-date blijft
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agenda_blocks'
  ) then
    alter publication supabase_realtime add table public.agenda_blocks;
  end if;
end $$;
