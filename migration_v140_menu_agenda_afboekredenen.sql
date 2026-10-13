-- v140 (2026-10-09): menu links voor iedereen, Agenda/Mijn afspraken per medewerker,
-- eigen afboekredenen per project.

-- 1. Agenda + Mijn afspraken alleen voor wie het vinkje heeft (accountmanager en admin altijd).
alter table public.profiles add column if not exists can_view_agenda boolean not null default false;

-- Bellers die al afspraken inplanden houden het menu.
update public.profiles p set can_view_agenda = true
where p.deleted_at is null
  and exists (select 1 from public.leads l where l.appointment_by = p.id);

-- Alleen admin mag het vinkje zetten.
create or replace function public.guard_profile_privileges()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then return new; end if;
  if public.leadgen_systeem() then return new; end if;

  if (new.role is distinct from old.role
      or new.organization_id is distinct from old.organization_id)
     and not public.is_admin() then
    if not (new.role = old.role and old.organization_id is null) then
      raise exception 'Geen rechten om role of organization_id te wijzigen';
    end if;
  end if;

  if not public.is_admin() and (
    new.can_manage_leads IS DISTINCT FROM old.can_manage_leads or
    new.can_view_rates   IS DISTINCT FROM old.can_view_rates or
    new.can_manage_team  IS DISTINCT FROM old.can_manage_team or
    new.can_export_data  IS DISTINCT FROM old.can_export_data or
    new.can_edit_flows   IS DISTINCT FROM old.can_edit_flows or
    new.kpi_only         IS DISTINCT FROM old.kpi_only or
    new.can_manage_queue IS DISTINCT FROM old.can_manage_queue or
    new.is_active        IS DISTINCT FROM old.is_active or
    new.can_create_users IS DISTINCT FROM old.can_create_users or
    new.can_send_overeenkomsten IS DISTINCT FROM old.can_send_overeenkomsten or
    new.can_view_agenda  IS DISTINCT FROM old.can_view_agenda
  ) then
    raise exception 'Geen rechten om rechten-instellingen te wijzigen';
  end if;

  return new;
end
$function$;

-- 2. Eigen afboekreden kan aan 1 project hangen (null = alle projecten, zoals voorheen).
alter table public.custom_dispositions
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade;
create index if not exists custom_dispositions_campaign_idx on public.custom_dispositions(campaign_id);
