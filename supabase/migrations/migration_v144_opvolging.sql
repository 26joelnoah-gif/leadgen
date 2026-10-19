-- v144 (2026-10-19): opvolging van leads beter en sneller
-- 1. Geen gehoor = terug naar de leadlijst, van niemand (bordprojecten).
-- 2. Wachtrij: eigen terugbelafspraken, dan te late opvolgingen (oudste eerst),
--    dan nieuw + geen gehoor. Geen gehoor gaat achteraan (op moment van de poging).
-- 3. Opvolgingen die 2 werkdagen te laat zijn, of van een inactieve/verwijderde
--    medewerker, gaan automatisch terug naar de leadlijst (pg_cron, elk uur) + melding.
-- 4. RPC opvolg_overzicht() voor het dashboardblok "Vandaag opvolgen".

-- 1a. hulpfunctie: tijdstip + n werkdagen (ma-vr, NL-tijd)
create or replace function public.plus_werkdagen(p_ts timestamptz, p_n int)
returns timestamptz language plpgsql stable set search_path to 'public' as $$
declare d timestamptz := p_ts; i int := 0;
begin
  if p_ts is null then return null; end if;
  while i < coalesce(p_n, 0) loop
    d := d + interval '1 day';
    if extract(isodow from (d at time zone 'Europe/Amsterdam')) < 6 then i := i + 1; end if;
  end loop;
  return d;
end $$;

-- 1b. eigenaar-trigger: geen gehoor maakt de lead weer vrij
create or replace function public.leads_owner_on_status()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or public.leadgen_systeem() then return new; end if;
  if not public.lead_is_board_project(new.lead_list_id) then return new; end if;
  if new.status = 'afspraak_gemaakt' and public.lead_is_afspraak_project(new.lead_list_id) then
    return new;
  end if;
  if new.status is distinct from old.status and new.status not in ('new', 'geen_gehoor', 'voicemail') then
    new.assigned_to := auth.uid();
  end if;
  if old.locked_by is not null and new.locked_by is not null
     and new.locked_by <> old.locked_by then
    new.assigned_to := new.locked_by;
  end if;
  -- v144: geen gehoor = terug in de leadlijst als nieuw, van niemand
  if new.status in ('geen_gehoor', 'voicemail')
     and (new.status is distinct from old.status
          or new.geen_gehoor_reeks is distinct from old.geen_gehoor_reeks) then
    new.assigned_to := null;
  end if;
  return new;
end;
$function$;

-- 2. wachtrij
create or replace function public.claim_next_lead(p_list_id uuid, p_lock_minutes integer default 10)
returns setof leads language plpgsql security definer set search_path to 'public' as $function$
DECLARE
  v_lead public.leads;
  v_mode text := 'fifo';
  v_board boolean := false;
  v_doelgroep text;
  v_rvmodus text;
BEGIN
  IF NOT (
    public.is_admin()
    OR p_list_id = ANY (public.my_list_ids())
    OR p_list_id = ANY (public.my_managed_list_ids())
  ) THEN
    RETURN;
  END IF;

  SELECT coalesce(c.queue_mode, 'fifo'), coalesce(c.board_view_enabled, false), c.doelgroep, c.rechtsvorm_modus
    INTO v_mode, v_board, v_doelgroep, v_rvmodus
  FROM public.lead_lists ll
  LEFT JOIN public.campaigns c ON c.id = ll.campaign_id
  WHERE ll.id = p_list_id;

  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer','cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal','mail_gepland','remote_thuis')
    AND coalesce(l.geen_gehoor_reeks, 0) < 5
    AND public.lead_belstatus_basis(l.afgemeld_at, l.opt_in_at, l.rechtsvorm, v_doelgroep, v_rvmodus) IN ('ok','kvk_check')
    AND (
      (l.status = 'terugbelafspraak' AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()) AND (
        l.assigned_to = auth.uid()
        OR l.assigned_to IS NULL  -- v144: vrijgegeven terugbelafspraak, mag iedereen
        OR (NOT v_board AND l.next_contact_date IS NOT NULL AND l.next_contact_date <= now() - interval '24 hours')
      ))
      OR (l.status <> 'terugbelafspraak' AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
    )
    AND (l.locked_by IS NULL OR l.locked_by = auth.uid())
    AND (NOT v_board OR l.assigned_to IS NULL OR l.assigned_to = auth.uid())
  ORDER BY
    (l.status = 'terugbelafspraak' AND l.assigned_to = auth.uid()) DESC,
    (l.locked_by = auth.uid()) DESC NULLS LAST,
    -- v144: opvolgingen waarvan de tijd om is gaan voor nieuwe leads, oudste eerst
    (l.status NOT IN ('new','geen_gehoor','voicemail') AND l.next_contact_date IS NOT NULL) DESC,
    CASE WHEN l.status NOT IN ('new','geen_gehoor','voicemail') THEN l.next_contact_date END ASC NULLS LAST,
    (l.rechtsvorm IS NOT NULL AND l.rechtsvorm <> 'onbekend') DESC,
    CASE WHEN v_mode = 'score' THEN
      (CASE l.lead_source WHEN 'referral' THEN 15 WHEN 'linkedin' THEN 10 WHEN 'cold' THEN 5 ELSE 0 END)
      + (CASE WHEN l.decision_maker THEN 20 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l.contact_person), '') <> '' THEN 15 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l."function"), '') <> '' THEN 5 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l.email), '') <> '' THEN 5 ELSE 0 END)
    ELSE 0 END DESC,
    -- v144: geen gehoor sluit achteraan aan, alsof hij net is toegevoegd
    CASE WHEN l.status IN ('geen_gehoor','voicemail') THEN coalesce(l.updated_at, l.created_at) ELSE l.created_at END ASC
  FOR UPDATE OF l SKIP LOCKED
  LIMIT 1;

  IF v_lead.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.leads
  SET locked_by = auth.uid(), locked_at = now(), call_status = 'calling'
  WHERE id = v_lead.id
  RETURNING * INTO v_lead;

  RETURN NEXT v_lead;
END;
$function$;

-- 3. te late opvolgingen vrijgeven
create or replace function public.opvolgingen_vrijgeven()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_n int := 0;
begin
  perform set_config('leadgen.systeem', '1', true);

  with kand as (
    select l.id, l.assigned_to as eigenaar, c.id as campaign_id, c.name as proj,
      case
        when l.status in ('geen_gehoor', 'voicemail') then 'geen_gehoor'
        when p.id is null or p.deleted_at is not null or not coalesce(p.is_active, false) then 'eigenaar_weg'
        else 'te_laat'
      end as reden
    from public.leads l
    join public.lead_lists ll on ll.id = l.lead_list_id and ll.deleted_at is null
    join public.campaigns c on c.id = ll.campaign_id and c.deleted_at is null
    left join public.profiles p on p.id = l.assigned_to
    where l.deleted_at is null
      and l.assigned_to is not null
      and coalesce(c.board_view_enabled, false)
      and coalesce(c.type, 'sales') not in ('recruitment', 'accountmanagement', 'backoffice')
      and (
        l.status in ('geen_gehoor', 'voicemail')
        or (l.status in ('terugbelafspraak', 'later_bellen', 'mail_verstuurd', 'onjuiste_timing')
            and (p.id is null or p.deleted_at is not null or not coalesce(p.is_active, false)
                 or (l.next_contact_date is not null
                     and public.plus_werkdagen(l.next_contact_date, 2) < now())))
      )
    for update of l skip locked
  ), upd as (
    update public.leads l
       set assigned_to = null, locked_by = null, locked_at = null, call_status = 'available'
      from kand where l.id = kand.id
    returning l.id
  ), meld_eigenaar as (
    insert into public.notifications (profile_id, type, title, body)
    select k.eigenaar, 'opvolging_vrijgegeven',
           count(*) || case when count(*) = 1 then ' lead terug in de leadlijst' else ' leads terug in de leadlijst' end,
           'Je opvolging was meer dan 2 werkdagen te laat. Een collega kan ze nu bellen. Project: '
             || string_agg(distinct k.proj, ', ')
    from kand k
    join public.profiles p on p.id = k.eigenaar and p.deleted_at is null and coalesce(p.is_active, false)
    where k.reden = 'te_laat'
    group by k.eigenaar
    returning 1
  ), meld_manager as (
    insert into public.notifications (profile_id, type, title, body)
    select cm.manager_id, 'opvolging_vrijgegeven',
           count(*) || ' opvolging' || case when count(*) = 1 then '' else 'en' end || ' terug in de leadlijst (' || k.proj || ')',
           'Te laat of de beller is gestopt: ' || string_agg(distinct coalesce(p.full_name, 'onbekend'), ', ')
    from kand k
    join public.campaign_managers cm on cm.campaign_id = k.campaign_id
    left join public.profiles p on p.id = k.eigenaar
    where k.reden in ('te_laat', 'eigenaar_weg') and cm.manager_id <> k.eigenaar
    group by cm.manager_id, k.proj
    returning 1
  )
  select count(*) into v_n from upd;

  -- sloten van gestopte medewerkers, en sloten ouder dan 12 uur op een vrije lead
  update public.leads l
     set locked_by = null, locked_at = null, call_status = 'available'
    from public.profiles p
   where p.id = l.locked_by
     and l.deleted_at is null
     and (p.deleted_at is not null or not coalesce(p.is_active, false)
          or (l.assigned_to is null and l.locked_at < now() - interval '12 hours'
              and l.status in ('new', 'geen_gehoor', 'voicemail')));

  perform set_config('leadgen.systeem', '', true);
  return v_n;
end $$;

revoke all on function public.opvolgingen_vrijgeven() from public, anon, authenticated;

-- 4. dashboardblok
create or replace function public.opvolg_overzicht()
returns table (profile_id uuid, naam text, vandaag int, te_laat int, oudste timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_admin boolean := public.is_admin();
  v_campaigns uuid[] := coalesce(public.my_managed_campaign_ids(), '{}');
  v_org uuid := public.my_org_id();
  v_start timestamptz := (date_trunc('day', now() at time zone 'Europe/Amsterdam')) at time zone 'Europe/Amsterdam';
begin
  if auth.uid() is null then return; end if;
  return query
  select l.assigned_to,
         coalesce(p.full_name, 'Vrij in de leadlijst'),
         count(*) filter (where l.next_contact_date >= v_start)::int,
         count(*) filter (where l.next_contact_date < v_start)::int,
         min(l.next_contact_date)
  from public.leads l
  join public.lead_lists ll on ll.id = l.lead_list_id and ll.deleted_at is null
  join public.campaigns c on c.id = ll.campaign_id and c.deleted_at is null
  left join public.profiles p on p.id = l.assigned_to
  where l.deleted_at is null
    and l.status in ('terugbelafspraak', 'later_bellen', 'mail_verstuurd', 'onjuiste_timing', 'offerte_verzonden')
    and l.next_contact_date is not null
    and l.next_contact_date < v_start + interval '1 day'
    and coalesce(c.type, 'sales') not in ('recruitment', 'backoffice')
    and (
      l.assigned_to = auth.uid()
      or (v_admin and c.organization_id is not distinct from v_org)
      or c.id = any (v_campaigns)
    )
  group by l.assigned_to, p.full_name
  order by (l.assigned_to = auth.uid()) desc nulls last, count(*) filter (where l.next_contact_date < v_start) desc;
end $$;

revoke all on function public.opvolg_overzicht() from public, anon;
grant execute on function public.opvolg_overzicht() to authenticated;

-- cron: elk uur om :12
select cron.schedule('reachconnect-opvolgingen-vrijgeven', '12 * * * *', $$select public.opvolgingen_vrijgeven()$$);
