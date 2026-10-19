-- LET OP: toegepast zijn de kolommen + leads_vrijgeven_van + de twee trigger-FUNCTIES.
-- De TRIGGERS zelf (tr_profiles_vrijgeven_bij_stoppen, tr_leads_overgenomen_wissen)
-- liepen via de MCP-tool vast en staan NIET in de database. De app doet hetzelfde:
-- Admin.jsx roept leads_vrijgeven_van aan na inactief zetten/verwijderen, en
-- useLeads/LeadBoard wissen overgenomen_van bij een nieuwe status. Wil je ze toch,
-- draai dan alleen de create trigger-regels in de SQL-editor.
--
-- v145 (2026-10-19): beller gestopt -> open leads terug naar de lijst als "overgenomen"
-- Zet je iemand op inactief (of in de prullenbak), dan gaan zijn open leads
-- meteen terug naar de lijst. Status en afgesproken moment blijven staan, dus
-- een collega ziet dat er al contact was. leads.overgenomen_van onthoudt van
-- wie hij kwam; dat verdwijnt zodra een collega de lead een nieuwe status geeft.

alter table public.leads add column if not exists overgenomen_van uuid references public.profiles(id) on delete set null;
alter table public.leads add column if not exists overgenomen_op timestamptz;
create index if not exists leads_overgenomen_van_idx on public.leads (overgenomen_van) where overgenomen_van is not null;

-- open leads van een medewerker vrijgeven
create or replace function public.leads_vrijgeven_van(p_profile uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_n int := 0; v_naam text; v_vlag text := current_setting('leadgen.systeem', true);
begin
  if auth.uid() is not null and not public.is_admin()
     and not exists (select 1 from public.profiles where id = auth.uid() and role = 'manager') then
    raise exception 'Alleen een admin of manager mag leads vrijgeven.' using errcode = '42501';
  end if;
  select coalesce(nullif(trim(full_name), ''), 'collega') into v_naam from public.profiles where id = p_profile;
  perform set_config('leadgen.systeem', '1', true);

  with kand as (
    select l.id, c.id as campaign_id, c.name as proj
    from public.leads l
    join public.lead_lists ll on ll.id = l.lead_list_id
    join public.campaigns c on c.id = ll.campaign_id
    where l.deleted_at is null
      and (l.assigned_to = p_profile or l.locked_by = p_profile)
      and coalesce(c.type, 'sales') <> 'recruitment'
      and l.status not in ('deal','bruto_deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer',
                           'blacklist','cold','remote_thuis','monteur_ingepland','wil_annuleren')
    for update of l skip locked
  ), upd as (
    update public.leads l
       set assigned_to = null, locked_by = null, locked_at = null, call_status = 'available',
           overgenomen_van = p_profile, overgenomen_op = now(),
           notes = trim(both E'\n' from coalesce(l.notes, '') || E'\n' ||
                   '[Overgenomen van ' || v_naam || ' (gestopt) op ' || to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM-YYYY') || ']')
      from kand where l.id = kand.id
    returning l.id
  ), meld as (
    insert into public.notifications (profile_id, type, title, body)
    select cm.manager_id, 'opvolging_vrijgegeven',
           count(*) || ' lead' || case when count(*) = 1 then '' else 's' end || ' van ' || v_naam || ' terug in de leadlijst (' || k.proj || ')',
           'Je vindt ze op het leadbord met het filter Overgenomen. De bellers krijgen ze vanzelf in de wachtrij.'
    from kand k join public.campaign_managers cm on cm.campaign_id = k.campaign_id
    where cm.manager_id <> p_profile
    group by cm.manager_id, k.proj
    returning 1
  )
  select count(*) into v_n from upd;

  perform set_config('leadgen.systeem', coalesce(v_vlag, ''), true);
  return v_n;
end $$;

revoke all on function public.leads_vrijgeven_van(uuid) from public, anon;
grant execute on function public.leads_vrijgeven_van(uuid) to authenticated;

-- automatisch bij inactief zetten of in de prullenbak
create or replace function public.profiles_vrijgeven_bij_stoppen()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (coalesce(old.is_active, true) and new.is_active = false)
     or (old.deleted_at is null and new.deleted_at is not null) then
    perform public.leads_vrijgeven_van(new.id);
  end if;
  return null;
end $$;

drop trigger if exists tr_profiles_vrijgeven_bij_stoppen on public.profiles;
create trigger tr_profiles_vrijgeven_bij_stoppen
  after update of is_active, deleted_at on public.profiles
  for each row execute function public.profiles_vrijgeven_bij_stoppen();

-- overgenomen-label weg zodra een collega er een nieuwe status aan geeft
create or replace function public.leads_overgenomen_wissen()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if public.leadgen_systeem() then return new; end if;
  if new.overgenomen_van is not null and new.status is distinct from old.status then
    new.overgenomen_van := null;
    new.overgenomen_op := null;
  end if;
  return new;
end $$;

drop trigger if exists tr_leads_overgenomen_wissen on public.leads;
create trigger tr_leads_overgenomen_wissen
  before update of status on public.leads
  for each row execute function public.leads_overgenomen_wissen();
