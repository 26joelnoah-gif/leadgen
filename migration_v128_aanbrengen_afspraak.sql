-- v128 (2026-10-05): een aanbrenger kan bij het aanbrengen meteen een afspraak
-- inplannen bij een accountmanager van het project. Hij ziet alleen WANNEER
-- iemand bezet is (geen namen), via aanbreng_bezet(). De conflictcheck zit
-- ook hier in de database, zodat een dubbele boeking nooit kan.
-- Draaien in de SQL-editor (geen zware sloten, kan in een keer).

-- 1. accountmanagers die een aanbrenger mag kiezen (zelfde lijst als het
--    belscherm: rol accountmanager of admin, actief)
create or replace function public.aanbreng_accountmanagers(p_campaign uuid)
returns table (id uuid, full_name text, role text)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_ik public.profiles;
begin
  select * into v_ik from public.profiles where profiles.id = auth.uid();
  if v_ik.id is null then raise exception 'Niet ingelogd'; end if;
  if v_ik.role <> 'admin' and not exists (
    select 1 from public.campaign_aanbrengers ca where ca.campaign_id = p_campaign and ca.profile_id = v_ik.id
  ) then
    raise exception 'Je bent niet gekoppeld aan dit project';
  end if;
  return query
    select p.id, coalesce(p.full_name, p.email), p.role
    from public.profiles p
    where p.role in ('accountmanager', 'admin')
      and p.deleted_at is null and p.is_active is not false
      and (p.organization_id is not distinct from v_ik.organization_id)
    order by coalesce(p.full_name, p.email);
end;
$$;
revoke all on function public.aanbreng_accountmanagers(uuid) from anon, public;
grant execute on function public.aanbreng_accountmanagers(uuid) to authenticated;

-- 2. duur per afspraaksoort (spiegel van src/lib/appointmentConfig.js)
create or replace function public.afspraak_minuten(p_type text)
returns integer language sql immutable
as $$ select case when p_type = 'bezoek' then 60 else 150 end; $$;

-- 3. wanneer is deze accountmanager bezet? Alleen tijden, geen namen.
create or replace function public.aanbreng_bezet(p_am uuid, p_van timestamptz, p_tot timestamptz)
returns table (soort text, start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_ik public.profiles;
begin
  select * into v_ik from public.profiles where profiles.id = auth.uid();
  if v_ik.id is null then raise exception 'Niet ingelogd'; end if;
  if v_ik.role not in ('aanbrenger', 'admin') and not exists (
    select 1 from public.campaign_aanbrengers ca where ca.profile_id = v_ik.id
  ) then
    raise exception 'Geen toegang';
  end if;
  return query
    select 'afspraak'::text, l.appointment_at,
           l.appointment_at + make_interval(mins => public.afspraak_minuten(l.appointment_type))
    from public.leads l
    join public.lead_lists ll on ll.id = l.lead_list_id
    join public.campaigns c on c.id = ll.campaign_id
    where l.assigned_to = p_am
      and l.status = 'afspraak_gemaakt'
      and l.deleted_at is null
      and c.appointment_scheduling_enabled
      and l.appointment_at >= p_van - interval '3 hours'
      and l.appointment_at <= p_tot
    union all
    select 'blok'::text, b.start_at, b.end_at
    from public.agenda_blocks b
    where b.user_id = p_am
      and b.end_at >= p_van and b.start_at <= p_tot;
end;
$$;
revoke all on function public.aanbreng_bezet(uuid, timestamptz, timestamptz) from anon, public;
grant execute on function public.aanbreng_bezet(uuid, timestamptz, timestamptz) to authenticated;

-- 4. lead_aanbrengen met optionele afspraak. De oude versie (7 parameters)
--    moet weg, anders bestaan er twee en weet PostgREST niet welke hij moet
--    aanroepen.
drop function if exists public.lead_aanbrengen(uuid, text, text, text, text, text, text);

create or replace function public.lead_aanbrengen(
  p_campaign uuid, p_bedrijf text, p_contact text default null, p_telefoon text default null,
  p_email text default null, p_plaats text default null, p_toelichting text default null,
  p_am uuid default null, p_at timestamptz default null, p_type text default null,
  p_straat text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_ik      public.profiles;
  v_camp    public.campaigns;
  v_lijst   uuid;
  v_lead    uuid;
  v_notes   text;
  v_type    text := coalesce(nullif(trim(coalesce(p_type, '')), ''), 'shoot');
  v_einde   timestamptz;
  v_bezet   text;
begin
  select * into v_ik from public.profiles where id = auth.uid();
  if v_ik.id is null then raise exception 'Niet ingelogd'; end if;
  if v_ik.is_active is false or v_ik.deleted_at is not null then raise exception 'Dit account is niet actief'; end if;
  if v_ik.role <> 'aanbrenger' and v_ik.role <> 'admin' then
    raise exception 'Alleen een aanbrenger-account kan bedrijven aanbrengen';
  end if;
  if nullif(trim(p_bedrijf), '') is null then raise exception 'Vul de bedrijfsnaam in'; end if;
  if nullif(trim(coalesce(p_telefoon, '')), '') is null and nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'Vul een telefoonnummer of e-mailadres in';
  end if;

  select * into v_camp from public.campaigns where id = p_campaign and deleted_at is null and is_active;
  if v_camp.id is null then raise exception 'Project niet gevonden'; end if;
  if v_ik.role <> 'admin' and not exists (
    select 1 from public.campaign_aanbrengers where campaign_id = p_campaign and profile_id = v_ik.id
  ) then
    raise exception 'Je bent niet gekoppeld aan dit project';
  end if;

  -- afspraak erbij? dan extra controles
  if p_at is not null then
    if not coalesce(v_camp.appointment_scheduling_enabled, false) then
      raise exception 'In dit project kunnen geen afspraken worden ingepland';
    end if;
    if p_am is null then raise exception 'Kies een accountmanager'; end if;
    if v_type not in ('shoot', 'bezoek') then raise exception 'Onbekende soort afspraak'; end if;
    if p_at < now() then raise exception 'Kies een moment in de toekomst'; end if;
    if nullif(trim(coalesce(p_contact, '')), '') is null then raise exception 'Vul de contactpersoon in voor een afspraak'; end if;
    if nullif(trim(coalesce(p_plaats, '')), '') is null then raise exception 'Vul de plaats in voor een afspraak'; end if;
    if not exists (
      select 1 from public.profiles p where p.id = p_am and p.role in ('accountmanager', 'admin')
        and p.deleted_at is null and p.is_active is not false
    ) then
      raise exception 'Accountmanager niet gevonden';
    end if;
    v_einde := p_at + make_interval(mins => public.afspraak_minuten(v_type));
    -- blokkade?
    if exists (select 1 from public.agenda_blocks b where b.user_id = p_am and b.start_at < v_einde and b.end_at > p_at) then
      raise exception 'Dit moment is niet beschikbaar, kies een ander moment';
    end if;
    -- andere afspraak?
    if exists (
      select 1 from public.leads l
      where l.assigned_to = p_am and l.status = 'afspraak_gemaakt' and l.deleted_at is null
        and l.appointment_at < v_einde
        and l.appointment_at + make_interval(mins => public.afspraak_minuten(l.appointment_type)) > p_at
    ) then
      raise exception 'Op dit moment staat al een afspraak, kies een ander moment';
    end if;
  end if;

  if public.rate_limit_hit('aanbrengen:' || v_ik.id::text, 30, 3600) then
    raise exception 'Even rustig aan: maximaal 30 aanbrengingen per uur';
  end if;

  select id into v_lijst from public.lead_lists
   where campaign_id = p_campaign and deleted_at is null and name = 'Aangebracht'
   order by created_at limit 1;
  if v_lijst is null then
    insert into public.lead_lists (name, description, campaign_id, organization_id)
    values ('Aangebracht', 'Automatisch: bedrijven die door klanten (aanbrengers) zijn aangebracht',
            p_campaign, v_camp.organization_id)
    returning id into v_lijst;
  end if;

  v_notes := 'Aangebracht door ' || coalesce(v_ik.full_name, v_ik.email, 'klant') || ' op ' || to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM-YYYY');
  if p_at is not null then
    v_notes := v_notes || E'\nAfspraak (' || v_type || ') ingepland door de aanbrenger op '
      || to_char(p_at at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI');
  end if;
  if nullif(trim(coalesce(p_toelichting, '')), '') is not null then
    v_notes := v_notes || E'\n' || trim(p_toelichting);
  end if;

  insert into public.leads (name, contact_person, phone, email, city, address, notes, status,
                            lead_list_id, organization_id, lead_source, referred_by,
                            assigned_to, appointment_at, appointment_type, owner_since)
  values (trim(p_bedrijf), nullif(trim(coalesce(p_contact, '')), ''),
          nullif(trim(coalesce(p_telefoon, '')), ''), nullif(lower(trim(coalesce(p_email, ''))), ''),
          nullif(trim(coalesce(p_plaats, '')), ''), nullif(trim(coalesce(p_straat, '')), ''), v_notes,
          case when p_at is not null then 'afspraak_gemaakt' else 'new' end,
          v_lijst, v_camp.organization_id, 'aanbrenger', v_ik.id,
          case when p_at is not null then p_am else null end,
          p_at,
          case when p_at is not null then v_type else null end,
          case when p_at is not null then now() else null end)
  returning id into v_lead;

  return v_lead;
end;
$$;
revoke all on function public.lead_aanbrengen(uuid, text, text, text, text, text, text, uuid, timestamptz, text, text) from anon, public;
grant execute on function public.lead_aanbrengen(uuid, text, text, text, text, text, text, uuid, timestamptz, text, text) to authenticated;

-- 5. mijn_aanbrengingen: afspraakmoment erbij zodat de aanbrenger ziet wanneer
--    de afspraak staat
drop function if exists public.mijn_aanbrengingen();
create or replace function public.mijn_aanbrengingen()
returns table (id uuid, bedrijf text, contact text, plaats text, aangebracht_op timestamptz,
               status text, project text, afgemeld boolean, afspraak_op timestamptz, afspraak_soort text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select l.id, l.name, l.contact_person, l.city, l.created_at, l.status, c.name,
         (l.afgemeld_at is not null), l.appointment_at, l.appointment_type
  from public.leads l
  left join public.lead_lists ll on ll.id = l.lead_list_id
  left join public.campaigns c on c.id = ll.campaign_id
  where l.referred_by = auth.uid()
    and l.lead_source = 'aanbrenger'
    and l.deleted_at is null
  order by l.created_at desc;
$$;
revoke all on function public.mijn_aanbrengingen() from anon, public;
grant execute on function public.mijn_aanbrengingen() to authenticated;
