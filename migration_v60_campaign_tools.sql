-- v60: tools per project (campaign_tools), 2026-09-04.
-- Wens Noah: de tab Tools (v59: offerte-tool + klantpresentatie bestelplatform)
-- moet niet voor iedereen aanstaan, maar per project instelbaar zijn. Admin kiest
-- in de projectinstellingen welke bestaande tools bij een project horen. Wie aan
-- dat project hangt krijgt die tools: bellers via hun team (campaign_teams),
-- managers via campaign_managers, admin altijd alles. Tools verschillen per
-- project, dus geen vlag maar een koppeltabel; de tool-lijst zelf leeft in de
-- code (src/lib/tools.js) - hier alleen de sleutels.

create table if not exists public.campaign_tools (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  tool_key text not null,
  created_at timestamptz not null default now(),
  primary key (campaign_id, tool_key)
);

alter table public.campaign_tools enable row level security;

-- Lezen: iedereen in de org (nodig om je eigen tools te bepalen); schrijven: admin.
drop policy if exists campaign_tools_select on public.campaign_tools;
create policy campaign_tools_select on public.campaign_tools for select to authenticated using (
  exists (
    select 1 from public.campaigns c
    where c.id = campaign_tools.campaign_id
      and not (c.organization_id is distinct from public.my_org_id())
  )
);
drop policy if exists campaign_tools_write on public.campaign_tools;
create policy campaign_tools_write on public.campaign_tools for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.campaign_tools to authenticated;

-- Welke tool-sleutels heeft de ingelogde gebruiker? Union over actieve, niet-
-- verwijderde projecten waar hij manager van is of via een team aan hangt.
-- Admin krijgt hier niets speciaals: de UI en de RLS hieronder checken is_admin() apart.
create or replace function public.my_tool_keys()
returns text[]
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(array_agg(distinct ct.tool_key), '{}')
  from public.campaign_tools ct
  join public.campaigns c on c.id = ct.campaign_id
  where c.deleted_at is null
    and c.is_active
    and (
      exists (select 1 from public.campaign_managers cm where cm.campaign_id = c.id and cm.manager_id = auth.uid())
      or exists (select 1 from public.campaign_teams t where t.campaign_id = c.id and t.team_id = any (public.my_team_ids()))
    );
$$;
grant execute on function public.my_tool_keys() to authenticated;

-- Offerte aanmaken mag alleen met de offerte-tool in je toolset (of als admin).
drop policy if exists offertes_insert on public.offertes;
create policy offertes_insert on public.offertes for insert with check (
  (not (organization_id is distinct from public.my_org_id()))
  and user_id = auth.uid()
  and (public.is_admin() or 'offerte_bestelplatform' = any (public.my_tool_keys()))
);
