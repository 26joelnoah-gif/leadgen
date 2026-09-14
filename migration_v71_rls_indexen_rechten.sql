-- v71: betrouwbaarheid - toegangsregels sneller, indexen erbij, rechten strak
-- Toegepast op zboyxwwrbtpjnlgquhzs op 2026-09-14.
-- Terugdraaien van de policies kan met de bewaarde definities in
-- public.policy_backup_v71 (die tabel staat dicht voor de app).

-- ---------------------------------------------------------------- 1 backup
create table if not exists public.policy_backup_v71 as
select now() as gemaakt_op, schemaname, tablename, policyname, permissive,
       roles::text as roles, cmd, qual, with_check
from pg_policies where schemaname='public';

alter table public.policy_backup_v71 enable row level security;
revoke all on public.policy_backup_v71 from anon, authenticated;

-- ------------------------------------------------- 2 toegangsregels sneller
-- auth.uid() werd per rij opnieuw uitgerekend. Met (select auth.uid()) doet
-- Postgres dat een keer. Zelfde rechten, sneller bij grotere lijsten.
do $$
declare r record; nieuw_qual text; nieuw_check text; stmt text;
begin
  for r in select * from pg_policies
            where schemaname='public' and tablename <> 'policy_backup_v71' loop
    nieuw_qual := replace(replace(replace(r.qual,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),'auth.jwt()','(select auth.jwt())');
    nieuw_check := replace(replace(replace(r.with_check,'auth.uid()','(select auth.uid())'),'auth.role()','(select auth.role())'),'auth.jwt()','(select auth.jwt())');
    if r.qual like '%( SELECT auth.uid()%' or r.with_check like '%( SELECT auth.uid()%' then continue; end if;
    if (r.qual is distinct from nieuw_qual) or (r.with_check is distinct from nieuw_check) then
      execute format('drop policy %I on public.%I', r.policyname, r.tablename);
      stmt := format('create policy %I on public.%I as %s for %s to %s',
        r.policyname, r.tablename,
        case when r.permissive='PERMISSIVE' then 'permissive' else 'restrictive' end,
        case r.cmd when 'ALL' then 'all' when 'SELECT' then 'select' when 'INSERT' then 'insert'
                   when 'UPDATE' then 'update' when 'DELETE' then 'delete' end,
        array_to_string(r.roles, ', '));
      if nieuw_qual is not null then stmt := stmt || ' using (' || nieuw_qual || ')'; end if;
      if nieuw_check is not null then stmt := stmt || ' with check (' || nieuw_check || ')'; end if;
      execute stmt;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------- 3 indexen
create index if not exists leads_created_by_idx on public.leads (created_by);
create index if not exists activities_user_id_idx on public.activities (user_id);
create index if not exists activities_lead_id_idx on public.activities (lead_id);
create index if not exists call_logs_lead_id_idx on public.call_logs (lead_id);
create index if not exists call_logs_lead_list_id_idx on public.call_logs (lead_list_id);
create index if not exists enrichment_logs_requested_by_idx on public.enrichment_logs (requested_by);
create index if not exists messages_channel_id_idx on public.messages (channel_id);
create index if not exists team_members_profile_id_idx on public.team_members (profile_id);
create index if not exists campaign_managers_manager_id_idx on public.campaign_managers (manager_id);
create index if not exists campaign_teams_team_id_idx on public.campaign_teams (team_id);
create index if not exists chat_channel_members_user_id_idx on public.chat_channel_members (user_id);
create index if not exists payouts_user_id_idx on public.payouts (user_id);
create index if not exists payouts_organization_id_idx on public.payouts (organization_id);
create index if not exists mailservice_logs_campaign_id_idx on public.mailservice_logs (campaign_id);
create index if not exists lead_sources_created_by_idx on public.lead_sources (created_by);
create index if not exists lead_lists_assigned_to_idx on public.lead_lists (assigned_to);
create index if not exists campaigns_created_by_idx on public.campaigns (created_by);
create index if not exists campaigns_organization_id_idx on public.campaigns (organization_id);

-- dubbele index op flow_settings opruimen
do $$
declare v_naam text;
begin
  select indexname into v_naam from pg_indexes
   where schemaname='public' and tablename='flow_settings'
     and indexname='flow_settings_disposition_key';
  if v_naam is not null and not exists (select 1 from pg_constraint where conname=v_naam) then
    execute 'drop index public.' || quote_ident(v_naam);
  end if;
end $$;

-- --------------------------------------------------- 4 search_path vastzetten
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
             join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public'
              and p.proname in ('xp_for','offertes_freeze','leads_reset_geocode','lead_distance_m') loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

-- ------------------------------------------------------- 5 rechten strakker
-- Trigger-functies hoeft niemand rechtstreeks aan te roepen.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
             join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public'
              and p.proname in ('add_channel_creator_as_member','guard_referral_bonus_approval',
                                'protect_list_rates','leads_geocode_enqueue','offertes_freeze',
                                'leads_reset_geocode','guard_profile_privileges') loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- Alles wat iets doet of teamgegevens teruggeeft: alleen ingelogd.
-- unlatched_intake blijft open (wervingssite roept aan met eigen sleutel).
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as sig from pg_proc p
             join pg_namespace n on n.oid=p.pronamespace
            where n.nspname='public' and p.prosecdef
              and p.proname in (
                'am_auto_release','am_claim_lead','am_release_lead','am_list_ids',
                'claim_lead','claim_next_backoffice_lead','claim_next_lead','delete_leads',
                'move_or_copy_leads','release_lead','release_my_leads','set_campaign_queue_mode',
                'xp_leaderboard','lead_call_history','lead_lock_names','create_organization',
                'my_tool_keys','my_managed_list_ids','my_owned_org_ids','my_list_ids',
                'my_team_ids','my_org_id','is_admin','is_planning','can_view_schedules',
                'can_access_chat_channel','can_manage_chat_channel','purge_app_errors') loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;
