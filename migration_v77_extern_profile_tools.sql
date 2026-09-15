-- LEADGEN v77 (2026-09-15): rol 'extern' + tools per medewerker (profile_tools).
-- Extern = iemand van buiten (bv. een installateur) die alleen de tab Tools ziet.
-- Tools kun je nu ook per medewerker toewijzen, los van projecten.

-- 1. rol extern
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role = any (array['employee','manager','admin','recruiter','backoffice','planning','extern']));

-- 2. extern wordt in de DB net zo afgesloten als planning: geen teams, lijsten, leads, chat.
create or replace function public.is_planning()
returns boolean language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('planning','extern')); $$;

-- 3. tools per medewerker
create table if not exists public.profile_tools (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tool_key text not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, tool_key)
);
alter table public.profile_tools enable row level security;
drop policy if exists profile_tools_select on public.profile_tools;
create policy profile_tools_select on public.profile_tools for select to authenticated
  using (profile_id = auth.uid() or public.is_admin()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager'));
drop policy if exists profile_tools_write on public.profile_tools;
create policy profile_tools_write on public.profile_tools for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.profile_tools to authenticated;

-- 4. my_tool_keys: projecten (v61) + persoonlijke toewijzing
create or replace function public.my_tool_keys()
returns text[]
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array_agg(distinct k), '{}') from (
    select ct.tool_key as k
    from public.campaign_tools ct
    join public.campaigns c on c.id = ct.campaign_id
    where c.deleted_at is null
      and c.is_active
      and (
        exists (select 1 from public.campaign_managers cm where cm.campaign_id = c.id and cm.manager_id = auth.uid())
        or exists (
          select 1 from public.campaign_teams t
          join public.team_members tm on tm.team_id = t.team_id
          where t.campaign_id = c.id and tm.profile_id = auth.uid()
        )
      )
    union
    select pt.tool_key from public.profile_tools pt where pt.profile_id = auth.uid()
  ) x;
$$;
grant execute on function public.my_tool_keys() to authenticated;
revoke all on function public.my_tool_keys() from public, anon;

-- 5. offertes aanmaken mag met elke offerte-tool (v60 eiste alleen offerte_bestelplatform)
drop policy if exists offertes_insert on public.offertes;
create policy offertes_insert on public.offertes for insert with check (
  (not (organization_id is distinct from public.my_org_id()))
  and user_id = auth.uid()
  and (public.is_admin()
       or 'offerte_bestelplatform' = any (public.my_tool_keys())
       or 'offerte_verduurzaming' = any (public.my_tool_keys()))
);
