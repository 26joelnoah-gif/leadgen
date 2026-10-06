-- v130 (06-10-2026): opvolg-meldingen + leads voor jezelf verbergen
--
-- 1. lead_user_state: per beller per lead
--    hidden_until   = lead is voor deze beller verborgen tot dit moment
--                     ("Verbergen tot opvolging"); daarna komt hij vanzelf terug
--    snoozed_until  = het Te doen-paneel toont deze lead pas weer na dit moment ("Straks")
--    snoozed_due    = voor welke opvolgdatum die "Straks" gold; verandert de
--                     opvolgdatum, dan telt de snooze niet meer
-- 2. notify_followups_today(): elke ochtend een melding in het belletje met
--    het aantal terugbelafspraken/opvolgingen/afspraken van vandaag + achterstallig.

create table if not exists public.lead_user_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  hidden_until timestamptz,
  snoozed_until timestamptz,
  snoozed_due timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, lead_id)
);
create index if not exists lead_user_state_lead_idx on public.lead_user_state(lead_id);

alter table public.lead_user_state enable row level security;
drop policy if exists lead_user_state_own on public.lead_user_state;
create policy lead_user_state_own on public.lead_user_state
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
grant select, insert, update, delete on public.lead_user_state to authenticated;

-- Index voor het Te doen-paneel (eigen leads met een opvolgdatum)
create index if not exists leads_assigned_next_contact_idx
  on public.leads(assigned_to, next_contact_date) where deleted_at is null;

create or replace function public.notify_followups_today()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count integer := 0;
  v_start timestamptz := date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam';
  v_end   timestamptz := v_start + interval '1 day';
begin
  with mijn as (
    select coalesce(l.assigned_to, l.locked_by) as profile_id, l.status, l.next_contact_date, l.appointment_at
    from public.leads l
    join public.lead_lists ll on ll.id = l.lead_list_id and ll.deleted_at is null
    join public.campaigns c on c.id = ll.campaign_id
    where l.deleted_at is null
      and coalesce(c.type, 'sales') <> 'recruitment'
      and coalesce(l.assigned_to, l.locked_by) is not null
  ),
  telling as (
    select profile_id,
      count(*) filter (where status in ('terugbelafspraak','later_bellen','onjuiste_timing','mail_verstuurd')
                         and next_contact_date < v_start) as achterstallig,
      count(*) filter (where status = 'terugbelafspraak' and next_contact_date >= v_start and next_contact_date < v_end) as tba,
      count(*) filter (where status in ('later_bellen','onjuiste_timing','mail_verstuurd')
                         and next_contact_date >= v_start and next_contact_date < v_end) as opvolg,
      count(*) filter (where status = 'afspraak_gemaakt' and appointment_at >= v_start and appointment_at < v_end) as afspraken
    from mijn group by profile_id
  ),
  ins as (
    insert into public.notifications (profile_id, actor_id, lead_id, type, title, body)
    select t.profile_id, null, null, 'opvolg_vandaag',
      'Vandaag te doen: ' || (t.tba + t.opvolg + t.afspraken + t.achterstallig) || ' leads',
      concat_ws(', ',
        case when t.tba > 0 then t.tba || ' terugbelafspraak' || case when t.tba = 1 then '' else 'en' end end,
        case when t.opvolg > 0 then t.opvolg || ' opvolging' || case when t.opvolg = 1 then '' else 'en' end end,
        case when t.afspraken > 0 then t.afspraken || ' afspra' || case when t.afspraken = 1 then 'ak' else 'ken' end end,
        case when t.achterstallig > 0 then t.achterstallig || ' achterstallig' end
      ) || '. Je vindt ze bovenaan bij Leads (lijst).'
    from telling t
    join public.profiles p on p.id = t.profile_id and coalesce(p.is_active, true) and p.deleted_at is null
    where (t.tba + t.opvolg + t.afspraken + t.achterstallig) > 0
      and not exists (
        select 1 from public.notifications n
        where n.profile_id = t.profile_id and n.type = 'opvolg_vandaag' and n.created_at >= v_start
      )
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$function$;

revoke all on function public.notify_followups_today() from public, anon, authenticated;

-- Elke werkdag om 06:30 UTC (08:30 zomertijd, 07:30 wintertijd)
select cron.unschedule(jobid) from cron.job where jobname = 'reachconnect-opvolg-vandaag';
select cron.schedule('reachconnect-opvolg-vandaag', '30 6 * * 1-6', 'select public.notify_followups_today()');
