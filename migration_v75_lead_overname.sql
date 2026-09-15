-- v75 (15-09-2026) - lead in behandeling houden en netjes overnemen
--
-- Regel: iedereen mag een lead pakken. Zodra iemand hem heeft, kan alleen die
-- persoon hem nog aanpassen. Een collega kan hem wel OVERNEMEN, maar dat gaat
-- bewust (claim_lead met p_force) en dan krijgen allebei een melding.
-- Het slot verloopt niet meer vanzelf na 10 minuten; het gaat eraf bij afboeken
-- (handleLeadDisposition) of bij het sluiten van het belscherm (release_my_leads).
--
-- Deze migratie is op 15-09-2026 toegepast op zboyxwwrbtpjnlgquhzs
-- (als v75_lead_overname_meldingen + v75_wachtrij_slot_verloopt_niet).

-- 1) Meldingen -------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.leads(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists idx_notifications_profile on public.notifications (profile_id, created_at desc);
alter table public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select using (profile_id = (select auth.uid()));

drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications
  for update using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));
-- bewust GEEN insert-policy: alleen security definer functies schrijven meldingen.

-- 2) Slot bewaken ----------------------------------------------------------
create or replace function public.leads_lock_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then return new; end if;                -- Edge Functions, cron
  if old.locked_by is null or old.locked_by = auth.uid() then return new; end if;
  if new.locked_by = auth.uid() and new.locked_by is distinct from old.locked_by then return new; end if;
  if public.is_admin() then return new; end if;
  raise exception 'Deze lead is in behandeling bij een collega. Neem hem eerst over.' using errcode = '42501';
end;
$$;

drop trigger if exists tr_leads_lock_guard on public.leads;
create trigger tr_leads_lock_guard
  before update on public.leads
  for each row execute function public.leads_lock_guard();

-- 3) claim_lead met overname ----------------------------------------------
drop function if exists public.claim_lead(uuid, integer);
create or replace function public.claim_lead(
  p_lead_id uuid,
  p_lock_minutes integer default 10,   -- blijft staan voor oude aanroepen, niet meer gebruikt
  p_force boolean default false
)
returns setof public.leads
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lead public.leads;
  v_vorige uuid;
  v_ik text;
  v_hij text;
begin
  select * into v_lead
  from public.leads l
  where l.id = p_lead_id
    and l.deleted_at is null
    and (
      public.is_admin()
      or l.assigned_to = auth.uid()
      or l.lead_list_id = any (public.my_list_ids())
      or l.lead_list_id = any (public.my_managed_list_ids())
    )
  for update of l skip locked;

  if v_lead.id is null then return; end if;

  v_vorige := v_lead.locked_by;

  if v_vorige is not null and v_vorige <> auth.uid() and not coalesce(p_force, false) then
    return;
  end if;

  update public.leads
  set locked_by = auth.uid(), locked_at = now(), call_status = 'calling'
  where id = v_lead.id
  returning * into v_lead;

  if v_vorige is not null and v_vorige <> auth.uid() then
    select full_name into v_ik from public.profiles where id = auth.uid();
    select full_name into v_hij from public.profiles where id = v_vorige;
    insert into public.notifications (profile_id, actor_id, lead_id, type, title, body) values
      (v_vorige, auth.uid(), v_lead.id, 'lead_overgenomen',
       coalesce(v_ik, 'Een collega') || ' heeft een lead van je overgenomen',
       coalesce(v_lead.name, 'Lead')),
      (auth.uid(), v_vorige, v_lead.id, 'lead_overname',
       'Je hebt een lead overgenomen van ' || coalesce(v_hij, 'een collega'),
       coalesce(v_lead.name, 'Lead'));
  end if;

  return next v_lead;
end;
$$;

grant execute on function public.claim_lead(uuid, integer, boolean) to authenticated;

-- 4) Slot verloopt niet meer vanzelf --------------------------------------
-- lead_lock_names zonder tijdsfilter, en claim_next_lead /
-- claim_next_backoffice_lead pakken geen lead meer over die bij een collega
-- ligt. De volledige tekst van die twee functies staat in de migratie die is
-- toegepast (v75_wachtrij_slot_verloopt_niet); alleen deze regel veranderde:
--   AND (l.locked_by IS NULL OR l.locked_by = auth.uid())
create or replace function public.lead_lock_names(p_list_id uuid, p_lock_minutes integer default 10)
returns table(lead_id uuid, locked_by uuid, locked_at timestamptz, full_name text)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select l.id, l.locked_by, l.locked_at, p.full_name
  from public.leads l
  join public.profiles p on p.id = l.locked_by
  where l.lead_list_id = p_list_id
    and l.deleted_at is null
    and l.locked_by is not null
    and (
      public.is_admin()
      or p_list_id = any (public.my_list_ids())
      or p_list_id = any (public.my_managed_list_ids())
    );
$$;

-- 5) Meldingen live
-- alter publication supabase_realtime add table public.notifications;  (al gedaan)
