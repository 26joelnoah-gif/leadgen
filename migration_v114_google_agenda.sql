-- ReachConnect v114 (2026-09-30): Google Agenda-koppeling voor accountmanagers.
--
-- Twee kanten op, met zo min mogelijk rechten bij Google:
--  1. HEEN: elke afspraak in ReachConnect komt in een APARTE agenda
--     ("ReachConnect afspraken") die de koppeling zelf aanmaakt in het
--     Google-account van de accountmanager. Recht: calendar.app.created.
--     ReachConnect kan daardoor nooit bij zijn privé-agenda.
--  2. TERUG: ReachConnect vraagt alleen op WANNEER hij bezet is in zijn
--     eigen agenda (recht: calendar.freebusy - geen titels, geen deelnemers)
--     en schrijft die tijd weg als agenda_blocks met bron='google', zodat
--     bellers er niet overheen kunnen inplannen.
--
-- Tokens staan in public.google_agenda_accounts. Die tabel heeft RLS aan en
-- GEEN policies: alleen service_role (de Edge Functions) komt erbij, de
-- browser nooit. De UI leest zijn status via de RPC google_agenda_status().
--
-- Edge Functions: google-agenda-oauth (koppelen/ontkoppelen),
-- google-agenda-push (afspraak heen), google-agenda-busy (bezet terug).
-- Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL.

-- ---------------------------------------------------------------------------
-- 1. Gekoppelde Google-accounts (tokens - nooit naar de browser)
-- ---------------------------------------------------------------------------
create table if not exists public.google_agenda_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  calendar_id text,
  push_enabled boolean not null default true,
  busy_import_enabled boolean not null default true,
  connected_at timestamptz not null default now(),
  last_push_at timestamptz,
  last_busy_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz
);

comment on table public.google_agenda_accounts is
  'ReachConnect v114: gekoppelde Google-agenda per medewerker. Alleen service_role leest dit, nooit de browser.';

alter table public.google_agenda_accounts enable row level security;
-- Bewust GEEN policies: met RLS aan en zonder policy ziet authenticated niets.
revoke all on public.google_agenda_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tijdelijke state bij het koppelen (beschermt tegen CSRF op de callback)
-- ---------------------------------------------------------------------------
create table if not exists public.google_agenda_oauth_states (
  state_hash text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes'
);
alter table public.google_agenda_oauth_states enable row level security;
revoke all on public.google_agenda_oauth_states from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Welke afspraak hoort bij welk Google-event
--    (eigen tabel, zodat de koppeling nooit in public.leads hoeft te
--     schrijven en dus geen lock-, eigenaar- of compliance-trigger raakt)
-- ---------------------------------------------------------------------------
create table if not exists public.google_agenda_events (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  calendar_id text not null,
  event_id text not null,
  updated_at timestamptz not null default now()
);
create index if not exists idx_google_agenda_events_user on public.google_agenda_events (user_id);
alter table public.google_agenda_events enable row level security;
revoke all on public.google_agenda_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. agenda_blocks: waar komt een blokkade vandaan?
-- ---------------------------------------------------------------------------
alter table public.agenda_blocks
  add column if not exists bron text not null default 'reachconnect';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agenda_blocks_bron_check'
  ) then
    alter table public.agenda_blocks add constraint agenda_blocks_bron_check
      check (bron in ('reachconnect', 'google'));
  end if;
end $$;

create index if not exists idx_agenda_blocks_bron
  on public.agenda_blocks (user_id, bron, start_at);

-- Blokkades die uit Google komen mag je in ReachConnect niet met de hand
-- weggooien of aanpassen: bij de volgende synchronisatie staan ze er toch
-- weer. Je haalt ze weg in je eigen Google-agenda. (v101-vorm: (SELECT f()))
drop policy if exists "agenda_blocks_update" on public.agenda_blocks;
create policy "agenda_blocks_update" on public.agenda_blocks for update to authenticated
  using (
    bron = 'reachconnect'
    and not (organization_id is distinct from (select my_org_id()))
    and (user_id = (select auth.uid()) or (select public.is_admin()))
  ) with check (
    bron = 'reachconnect'
    and not (organization_id is distinct from (select my_org_id()))
    and (user_id = (select auth.uid()) or (select public.is_admin()))
  );

drop policy if exists "agenda_blocks_delete" on public.agenda_blocks;
create policy "agenda_blocks_delete" on public.agenda_blocks for delete to authenticated
  using (
    bron = 'reachconnect'
    and not (organization_id is distinct from (select my_org_id()))
    and (user_id = (select auth.uid()) or (select public.is_admin()))
  );

drop policy if exists "agenda_blocks_insert" on public.agenda_blocks;
create policy "agenda_blocks_insert" on public.agenda_blocks for insert to authenticated
  with check (
    bron = 'reachconnect'
    and not (organization_id is distinct from (select my_org_id()))
    and (user_id = (select auth.uid()) or (select public.is_admin()))
  );

drop policy if exists "agenda_blocks_select" on public.agenda_blocks;
create policy "agenda_blocks_select" on public.agenda_blocks for select to authenticated
  using (not (organization_id is distinct from (select my_org_id())));

-- ---------------------------------------------------------------------------
-- 5. Status en instellingen voor de browser (zonder tokens)
-- ---------------------------------------------------------------------------
create or replace function public.google_agenda_status()
returns table (
  google_email text,
  push_enabled boolean,
  busy_import_enabled boolean,
  connected_at timestamptz,
  last_push_at timestamptz,
  last_busy_sync_at timestamptz,
  last_error text,
  last_error_at timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select g.google_email, g.push_enabled, g.busy_import_enabled, g.connected_at,
         g.last_push_at, g.last_busy_sync_at, g.last_error, g.last_error_at
  from public.google_agenda_accounts g
  where g.user_id = (select auth.uid());
$$;
revoke all on function public.google_agenda_status() from public, anon;
grant execute on function public.google_agenda_status() to authenticated;

create or replace function public.google_agenda_instellen(p_push boolean, p_busy boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  update public.google_agenda_accounts
     set push_enabled = coalesce(p_push, push_enabled),
         busy_import_enabled = coalesce(p_busy, busy_import_enabled)
   where user_id = auth.uid();
  -- bezet-import uit: de uit Google gehaalde blokkades meteen opruimen
  if p_busy is false then
    delete from public.agenda_blocks
     where user_id = auth.uid() and bron = 'google' and start_at >= now();
  end if;
end $$;
revoke all on function public.google_agenda_instellen(boolean, boolean) from public, anon;
grant execute on function public.google_agenda_instellen(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Sleutel waarmee de database de Edge Functions aanroept (Vault)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'google_agenda_key') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'google_agenda_key',
      'ReachConnect v114: sleutel waarmee de database de Google-agenda-functies aanroept');
  end if;
end $$;

create or replace function public.google_agenda_key()
returns text language sql stable security definer set search_path = public, vault as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'google_agenda_key' limit 1;
$$;
revoke all on function public.google_agenda_key() from public, anon, authenticated;
grant execute on function public.google_agenda_key() to service_role, postgres;

-- ---------------------------------------------------------------------------
-- 7. HEEN: elke wijziging aan een afspraak duwt hem naar Google
-- ---------------------------------------------------------------------------
create or replace function public.google_agenda_push(p_lead uuid)
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare sleutel text;
begin
  if p_lead is null then return; end if;
  select public.google_agenda_key() into sleutel;
  if sleutel is null then return; end if;
  perform net.http_post(
    url := 'https://zboyxwwrbtpjnlgquhzs.supabase.co/functions/v1/google-agenda-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-google-agenda-key', sleutel),
    body := jsonb_build_object('lead_id', p_lead),
    timeout_milliseconds := 30000);
end $$;
revoke all on function public.google_agenda_push(uuid) from public, anon, authenticated;

create or replace function public.leads_google_agenda_kick()
returns trigger language plpgsql security definer set search_path = public, extensions, vault as $$
declare lijst uuid;
begin
  -- trigger staat op INSERT en UPDATE, dus NEW bestaat altijd
  lijst := new.lead_list_id;
  -- alleen projecten waar met een agenda gewerkt wordt
  if not public.lead_is_afspraak_project(lijst) then return null; end if;

  if tg_op = 'UPDATE'
     and new.appointment_at is not distinct from old.appointment_at
     and new.assigned_to is not distinct from old.assigned_to
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at
     and new.appointment_outcome is not distinct from old.appointment_outcome
     and new.name is not distinct from old.name
     and new.contact_person is not distinct from old.contact_person
     and new.phone is not distinct from old.phone
     and new.address is not distinct from old.address
     and new.house_number is not distinct from old.house_number
     and new.postal_code is not distinct from old.postal_code
     and new.city is not distinct from old.city then
    return null;
  end if;

  -- niets te doen als er nooit een afspraak was en er nu ook geen is
  if new.appointment_at is null
     and not exists (select 1 from public.google_agenda_events where lead_id = new.id) then
    return null;
  end if;

  perform public.google_agenda_push(new.id);
  return null;
end $$;

drop trigger if exists tr_leads_google_agenda on public.leads;
create trigger tr_leads_google_agenda
after insert or update of appointment_at, assigned_to, status, deleted_at,
  appointment_outcome, name, contact_person, phone, address, house_number, postal_code, city
on public.leads for each row execute function public.leads_google_agenda_kick();

-- ---------------------------------------------------------------------------
-- 8. TERUG: elk kwartier de bezette tijd uit Google ophalen
-- ---------------------------------------------------------------------------
create or replace function public.google_agenda_busy_kick()
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare sleutel text;
begin
  if not exists (select 1 from public.google_agenda_accounts where busy_import_enabled) then
    return;
  end if;
  select public.google_agenda_key() into sleutel;
  if sleutel is null then raise warning 'google_agenda_busy_kick: geen sleutel in vault'; return; end if;
  perform net.http_post(
    url := 'https://zboyxwwrbtpjnlgquhzs.supabase.co/functions/v1/google-agenda-busy',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-google-agenda-key', sleutel),
    body := jsonb_build_object('bron', 'pg_cron'),
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.google_agenda_busy_kick() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'reachconnect-google-agenda-busy';
select cron.schedule('reachconnect-google-agenda-busy', '*/15 * * * *', $$select public.google_agenda_busy_kick()$$);

-- Oude koppelpogingen opruimen
select cron.unschedule(jobid) from cron.job where jobname = 'reachconnect-google-agenda-states';
select cron.schedule('reachconnect-google-agenda-states', '20 3 * * *',
  $$delete from public.google_agenda_oauth_states where expires_at < now()$$);
