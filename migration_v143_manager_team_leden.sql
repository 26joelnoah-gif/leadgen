-- v143 (13-10-2026): manager (met can_manage_team) mag bellers (rol employee)
-- toevoegen aan / verwijderen uit teams die gekoppeld zijn aan een project waar
-- hij manager van is. Geen backoffice, recruiter of andere functies.
create or replace function public.i_manage_team(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.profiles me
    join public.campaign_managers cm on cm.manager_id = me.id
    join public.campaign_teams ct on ct.campaign_id = cm.campaign_id
    join public.campaigns c on c.id = cm.campaign_id and c.deleted_at is null
    where me.id = auth.uid()
      and me.role = 'manager'
      and coalesce(me.can_manage_team, true)
      and coalesce(me.is_active, true)
      and ct.team_id = p_team_id
  );
$$;

create or replace function public.team_lid_toevoegbaar(p_profile_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_profile_id
      and p.role = 'employee'
      and p.deleted_at is null
      and not (p.organization_id is distinct from public.my_org_id())
  );
$$;

revoke all on function public.i_manage_team(uuid) from public, anon;
revoke all on function public.team_lid_toevoegbaar(uuid) from public, anon;
grant execute on function public.i_manage_team(uuid) to authenticated;
grant execute on function public.team_lid_toevoegbaar(uuid) to authenticated;

drop policy if exists team_members_manager_insert on public.team_members;
create policy team_members_manager_insert on public.team_members
  for insert to authenticated
  with check (public.i_manage_team(team_id) and public.team_lid_toevoegbaar(profile_id));

drop policy if exists team_members_manager_delete on public.team_members;
create policy team_members_manager_delete on public.team_members
  for delete to authenticated
  using (public.i_manage_team(team_id) and public.team_lid_toevoegbaar(profile_id));
