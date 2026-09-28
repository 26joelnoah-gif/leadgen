-- LEADGEN v110 (2026-09-28): Mijn afspraken + commissie per afspraak.
--
-- Waarom: een beller die een afspraak inplant zag daarna niets meer terug van
-- die afspraak. De accountmanager boekt hem af (wil nadenken / deal / betaald),
-- maar de beller wist niet wat eruit kwam en dus ook niet wat hij ervoor krijgt.
--
-- 1. leads.appointment_by = de beller die de afspraak inplande. Die blijft van
--    hem staan, ook als de accountmanager de lead daarna overneemt. Basis voor
--    de pagina "Mijn afspraken" en voor de uitbetaling.
-- 2. leads.appointment_commission = wat die beller voor deze afspraak krijgt.
--    Per afspraak in te stellen (elke deal is anders), alleen door een admin of
--    een manager van dat project - een beller kan zijn eigen bedrag niet zetten.
-- 3. Melding voor de beller zodra de accountmanager afboekt of zodra de
--    commissie wordt vastgesteld.
-- 4. Fix: in een bordproject met afspraken zette tr_leads_owner_on_status de
--    lead bij het afboeken op naam van de BELLER. Daardoor verdween de afspraak
--    uit de agenda van de accountmanager (die staat op assigned_to). Bij status
--    'afspraak_gemaakt' in een afspraak-project blijft de lead nu van de
--    accountmanager.

-- 1) Kolommen ---------------------------------------------------------------
alter table public.leads
  add column if not exists appointment_by uuid references public.profiles(id) on delete set null,
  add column if not exists appointment_commission numeric(10,2),
  add column if not exists appointment_commission_at timestamptz,
  add column if not exists appointment_commission_by uuid references public.profiles(id) on delete set null;

create index if not exists idx_leads_appointment_by
  on public.leads (appointment_by, appointment_at desc);

-- Backfill: wie plande de bestaande afspraken in? De laatste afboeking
-- 'afspraak_gemaakt' in call_logs is daarvoor de bron.
update public.leads l
set appointment_by = cl.agent_id
from (
  select distinct on (lead_id) lead_id, agent_id
  from public.call_logs
  where disposition = 'afspraak_gemaakt' and agent_id is not null
  order by lead_id, disposed_at desc
) cl
where cl.lead_id = l.id
  and l.appointment_by is null
  and (l.appointment_at is not null or l.appointment_outcome is not null);

-- 2) Commissie alleen door admin of manager van het project ------------------
create or replace function public.leads_commissie_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null or public.leadgen_systeem() then return new; end if;

  if new.appointment_commission is distinct from old.appointment_commission
     or new.appointment_approved is distinct from old.appointment_approved then
    if not (
      public.is_admin()
      or new.lead_list_id = any ((public.my_managed_list_ids())::uuid[])
    ) then
      raise exception 'Alleen een admin of een manager van dit project mag de uitbetaling van een afspraak aanpassen.'
        using errcode = '42501';
    end if;
  end if;

  if new.appointment_commission is distinct from old.appointment_commission then
    new.appointment_commission_at := now();
    new.appointment_commission_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists tr_leads_commissie_guard on public.leads;
create trigger tr_leads_commissie_guard
  before update on public.leads
  for each row execute function public.leads_commissie_guard();

-- 3) Melding voor de beller --------------------------------------------------
create or replace function public.leads_afspraak_melding()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_label text;
  v_klant text := coalesce(new.name, 'Lead');
  v_bedrag text;
begin
  if new.appointment_by is null then return new; end if;

  if new.appointment_outcome is distinct from old.appointment_outcome
     and new.appointment_outcome is not null
     and new.appointment_by is distinct from auth.uid() then
    v_label := case new.appointment_outcome
                 when 'deal' then 'Deal'
                 when 'betaald' then 'Betaald'
                 when 'wil_nadenken' then 'Wil nadenken'
                 else new.appointment_outcome end;
    insert into public.notifications (profile_id, actor_id, lead_id, type, title, body)
    values (new.appointment_by, auth.uid(), new.id, 'afspraak_uitkomst',
            'Je afspraak bij ' || v_klant || ' is afgeboekt als "' || v_label || '"',
            case when new.appointment_commission is not null
                 then 'Jouw uitbetaling: € ' || to_char(new.appointment_commission, 'FM999999990D00')
                 else 'De uitbetaling wordt nog vastgesteld' end);
  end if;

  if new.appointment_commission is distinct from old.appointment_commission
     and new.appointment_commission is not null
     and new.appointment_by is distinct from auth.uid() then
    v_bedrag := to_char(new.appointment_commission, 'FM999999990D00');
    insert into public.notifications (profile_id, actor_id, lead_id, type, title, body)
    values (new.appointment_by, auth.uid(), new.id, 'afspraak_commissie',
            'Uitbetaling vastgesteld: € ' || v_bedrag,
            'Voor je afspraak bij ' || v_klant);
  end if;

  return new;
end;
$$;

drop trigger if exists tr_leads_afspraak_melding on public.leads;
create trigger tr_leads_afspraak_melding
  after update on public.leads
  for each row execute function public.leads_afspraak_melding();

-- 4) Afspraak blijft van de accountmanager ----------------------------------
create or replace function public.lead_is_afspraak_project(p_list_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((
    select c.appointment_scheduling_enabled
    from public.lead_lists ll
    join public.campaigns c on c.id = ll.campaign_id
    where ll.id = p_list_id
  ), false);
$$;
revoke all on function public.lead_is_afspraak_project(uuid) from public;
grant execute on function public.lead_is_afspraak_project(uuid) to authenticated;

create or replace function public.leads_owner_on_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or public.leadgen_systeem() then return new; end if;
  if not public.lead_is_board_project(new.lead_list_id) then return new; end if;
  -- v110: een ingeplande afspraak hoort bij de accountmanager (assigned_to),
  -- niet bij de beller die hem afboekt. Anders staat hij in de verkeerde agenda.
  if new.status = 'afspraak_gemaakt' and public.lead_is_afspraak_project(new.lead_list_id) then
    return new;
  end if;
  if new.status is distinct from old.status and new.status <> 'new' then
    new.assigned_to := auth.uid();
  end if;
  if old.locked_by is not null and new.locked_by is not null
     and new.locked_by <> old.locked_by then
    new.assigned_to := new.locked_by;
  end if;
  return new;
end;
$$;

-- 5) De beller blijft zijn eigen afspraken zien -----------------------------
-- (ook als de accountmanager de lead overneemt of de lijst niet meer van hem is)
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select to authenticated
  using (
    not (organization_id is distinct from (select public.my_org_id()))
    and (
      (select public.is_admin())
      or assigned_to = (select auth.uid())
      or created_by = (select auth.uid())
      or appointment_by = (select auth.uid())
      or lead_list_id = any ((select public.my_managed_list_ids())::uuid[])
      or (
        lead_list_id = any ((select public.my_list_ids())::uuid[])
        and (
          not (lead_list_id = any ((select public.am_list_ids())::uuid[]))
          or assigned_to is null
        )
      )
    )
  );
