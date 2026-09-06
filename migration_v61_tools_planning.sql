-- v61: tools ook voor planning-accounts, 2026-09-06.
-- Bug: my_tool_keys() (v60) liep via my_team_ids(), en die geeft sinds v52 voor
-- rol 'planning' bewust '{}' terug (planning zit in een team voor het rooster,
-- maar mag daar geen leads/lijsten uit zien). Gevolg: planning-accounts in
-- TEAM KASSA kregen nul tools en zagen de tab Tools niet.
-- Fix: de team-route voor tools leest direct uit team_members. De planning-
-- uitzondering blijft gelden voor leads/lijsten (my_team_ids/my_list_ids),
-- alleen niet voor tools.

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
      or exists (
        select 1 from public.campaign_teams t
        join public.team_members tm on tm.team_id = t.team_id
        where t.campaign_id = c.id and tm.profile_id = auth.uid()
      )
    );
$$;
grant execute on function public.my_tool_keys() to authenticated;
