-- 2. is_planning() = "ziet geen leads/lijsten/chat": aanbrenger hoort daar ook bij.
create or replace function public.is_planning()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role in ('planning','extern','aanbrenger')); $$;

-- 3. welke aanbrenger hoort bij welk project
create table if not exists public.campaign_aanbrengers (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (campaign_id, profile_id)
);
alter table public.campaign_aanbrengers enable row level security;
drop policy if exists campaign_aanbrengers_select on public.campaign_aanbrengers;
create policy campaign_aanbrengers_select on public.campaign_aanbrengers for select
  using ((select is_admin()) or profile_id = (select auth.uid())
         or campaign_id = any ((select my_managed_campaign_ids())::uuid[]));
drop policy if exists campaign_aanbrengers_insert on public.campaign_aanbrengers;
create policy campaign_aanbrengers_insert on public.campaign_aanbrengers for insert
  with check ((select is_admin()) or campaign_id = any ((select my_managed_campaign_ids())::uuid[]));
drop policy if exists campaign_aanbrengers_delete on public.campaign_aanbrengers;
create policy campaign_aanbrengers_delete on public.campaign_aanbrengers for delete
  using ((select is_admin()) or campaign_id = any ((select my_managed_campaign_ids())::uuid[]));

-- 4. account aanmaken: manager / can_create_users mag ook een aanbrenger maken
--    (recruiter niet, die blijft op planning).
create or replace function public.nieuw_account_afronden(p_user uuid, p_role text default 'employee')
returns void language plpgsql security definer set search_path = public, pg_temp
as $function$
DECLARE
  v_maker    public.profiles;
  v_rol      text := coalesce(nullif(trim(p_role), ''), 'employee');
  v_is_admin boolean;
  v_n        integer;
BEGIN
  SELECT * INTO v_maker FROM public.profiles WHERE id = auth.uid();
  IF v_maker.id IS NULL THEN
    RAISE EXCEPTION 'Niet ingelogd';
  END IF;
  IF v_maker.is_active IS false OR v_maker.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Dit account is niet actief';
  END IF;

  v_is_admin := (v_maker.role = 'admin');

  IF NOT (v_is_admin OR v_maker.role = 'manager' OR coalesce(v_maker.can_create_users, false)) THEN
    RAISE EXCEPTION 'Je hebt geen recht om accounts aan te maken';
  END IF;

  -- v125: een recruiter maakt alleen planning-accounts (rooster-app) aan.
  IF NOT v_is_admin AND v_maker.role = 'recruiter' AND v_rol <> 'planning' THEN
    RAISE EXCEPTION 'Als recruiter maak je alleen een planning-account aan; geef het later een functie via Accounts';
  END IF;

  -- v127: aanbrenger erbij
  IF NOT v_is_admin AND v_rol NOT IN ('employee', 'backoffice', 'accountmanager', 'planning', 'aanbrenger') THEN
    RAISE EXCEPTION 'Je mag alleen een beller-, backoffice-, accountmanager-, planning- of aanbrenger-account aanmaken';
  END IF;

  PERFORM set_config('leadgen.systeem', '1', true);
  UPDATE public.profiles
     SET role            = v_rol,
         organization_id = v_maker.organization_id
   WHERE id = p_user
     AND role = 'employee'
     AND created_at > now() - interval '15 minutes';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  PERFORM set_config('leadgen.systeem', '', true);

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Dit account kan niet meer worden bijgewerkt (niet nieuw genoeg of al ingesteld)';
  END IF;
END;
$function$;

-- 5. de projecten waarvoor ik mag aanbrengen
create or replace function public.mijn_aanbreng_projecten()
returns table (id uuid, name text)
language sql stable security definer set search_path = public, pg_temp
as $$
  select c.id, c.name
  from public.campaign_aanbrengers ca
  join public.campaigns c on c.id = ca.campaign_id
  where ca.profile_id = auth.uid()
    and c.deleted_at is null and c.is_active
  order by c.name;
$$;
revoke all on function public.mijn_aanbreng_projecten() from anon, public;
grant execute on function public.mijn_aanbreng_projecten() to authenticated;

-- 6. een bedrijf aanbrengen
create or replace function public.lead_aanbrengen(
  p_campaign uuid, p_bedrijf text, p_contact text default null, p_telefoon text default null,
  p_email text default null, p_plaats text default null, p_toelichting text default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_ik      public.profiles;
  v_camp    public.campaigns;
  v_lijst   uuid;
  v_lead    uuid;
  v_notes   text;
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

  -- rem: 30 aanbrengingen per uur per account (rate_limit_hit faalt open bij fout)
  if public.rate_limit_hit('aanbrengen:' || v_ik.id::text, 30, 3600) then
    raise exception 'Even rustig aan: maximaal 30 aanbrengingen per uur';
  end if;

  -- lijst "Aangebracht" in dit project, aanmaken als hij er nog niet is
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
  if nullif(trim(coalesce(p_toelichting, '')), '') is not null then
    v_notes := v_notes || E'\n' || trim(p_toelichting);
  end if;

  -- created_by bewust leeg: anders mag de aanbrenger de lead via leads_update
  -- zelf aanpassen (created_by = auth.uid()). Hij ziet zijn stand via
  -- mijn_aanbrengingen().
  insert into public.leads (name, contact_person, phone, email, city, notes, status,
                            lead_list_id, organization_id, lead_source, referred_by)
  values (trim(p_bedrijf), nullif(trim(coalesce(p_contact, '')), ''),
          nullif(trim(coalesce(p_telefoon, '')), ''), nullif(lower(trim(coalesce(p_email, ''))), ''),
          nullif(trim(coalesce(p_plaats, '')), ''), v_notes, 'new',
          v_lijst, v_camp.organization_id, 'aanbrenger', v_ik.id)
  returning id into v_lead;

  return v_lead;
end;
$$;
revoke all on function public.lead_aanbrengen(uuid, text, text, text, text, text, text) from anon, public;
grant execute on function public.lead_aanbrengen(uuid, text, text, text, text, text, text) to authenticated;

-- 7. mijn aanbrengingen (beperkte velden, geen notities of telefoonnummers van anderen)
create or replace function public.mijn_aanbrengingen()
returns table (id uuid, bedrijf text, contact text, plaats text, aangebracht_op timestamptz,
               status text, project text, afgemeld boolean)
language sql stable security definer set search_path = public, pg_temp
as $$
  select l.id, l.name, l.contact_person, l.city, l.created_at, l.status, c.name,
         (l.afgemeld_at is not null)
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
