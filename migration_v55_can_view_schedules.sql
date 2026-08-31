-- v55: per-medewerker vinkje "Teamroosters inzien" (patroon van can_view_earnings, v51).
-- Wens Noah (31-08): Wiam (rol 'planning') moet het teamoverzicht in /roosters kunnen zien,
-- zonder dat alle planning-accounts dat krijgen.

alter table public.profiles
  add column if not exists can_view_schedules boolean not null default false;

create or replace function public.can_view_schedules()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.can_view_schedules from public.profiles p where p.id = auth.uid()), false)
$$;

-- availability: teamoverzicht ook zichtbaar voor accounts met het vinkje.
-- Org-scoping blijft exact zoals v46 (geldt ook voor admin).
drop policy if exists availability_select on public.availability;
create policy availability_select on public.availability for select using (
  (not (organization_id is distinct from my_org_id()))
  and (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = any (array['admin','manager','recruiter'])
    )
    or public.can_view_schedules()
  )
);

-- campaigns: het Project-filter in Roosters > Teamoverzicht leest campagnenamen.
-- Voor 'planning' geeft my_team_ids() '{}' terug (v52), dus zonder deze clause blijft
-- die dropdown leeg. Dit geeft alleen leesrecht op de campagne-rij (naam/type) binnen
-- de eigen org; leads/lijsten blijven dicht via my_list_ids()/my_team_ids().
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select using (
  (not (organization_id is distinct from my_org_id()))
  and (
    is_admin()
    or created_by = auth.uid()
    or exists (select 1 from campaign_teams ct where ct.campaign_id = campaigns.id and ct.team_id = any (my_team_ids()))
    or exists (select 1 from campaign_managers cm where cm.campaign_id = campaigns.id and cm.manager_id = auth.uid())
    or exists (select 1 from lead_lists ll where ll.campaign_id = campaigns.id and ll.id = any (my_managed_list_ids()))
    or public.can_view_schedules()
  )
);
