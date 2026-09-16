-- v79 (16-09-2026) - Lead-eigenaar in bord-projecten + melding bij 2 weken stilte
--
-- Regels (Noah):
-- 1. Nieuwe leads (zonder eigenaar) ziet iedereen in het project.
-- 2. Geeft iemand een lead een status, dan is die lead van hem: alleen hij
--    ziet hem op /leads en de wachtrij geeft hem niet aan een collega.
-- 3. Ligt een lead na een mail / terugbelopdracht langer dan 2 weken stil,
--    dan krijgen de managers van het project een melding (of de admins als
--    het project geen manager heeft). Elke 2 weken opnieuw zolang er niets gebeurt.
--
-- Geldt ALLEEN voor projecten met campaigns.board_view_enabled = true
-- (nu MarketingKiezer). Andere projecten houden de flow_settings-regels.

-- ---------- 1. eigenaar bij statuswijziging ----------
create or replace function public.lead_is_board_project(p_list_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select c.board_view_enabled from public.lead_lists ll
                   join public.campaigns c on c.id = ll.campaign_id
                   where ll.id = p_list_id), false);
$$;

create or replace function public.leads_owner_on_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Edge Functions / cron (geen ingelogde gebruiker): niets doen
  if auth.uid() is null then return new; end if;
  if not public.lead_is_board_project(new.lead_list_id) then return new; end if;

  -- Status gegeven door een ingelogde gebruiker -> die is de eigenaar
  if new.status is distinct from old.status and new.status <> 'new' then
    new.assigned_to := auth.uid();
  end if;
  -- Overname (v75): de lead ging van een collega naar jou -> eigenaar mee
  if old.locked_by is not null and new.locked_by is not null
     and new.locked_by <> old.locked_by then
    new.assigned_to := new.locked_by;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_leads_owner_on_status on public.leads;
create trigger tr_leads_owner_on_status
  before update on public.leads
  for each row execute function public.leads_owner_on_status();

-- Backfill: gemailde / geplande leads zonder eigenaar krijgen de beller die
-- de mail stuurde of bewaarde (mailservice_logs / mail_queue), anders de
-- laatste beller uit call_logs.
update public.leads l set assigned_to = coalesce(
    (select q.agent_id from public.mail_queue q where q.lead_id = l.id order by q.created_at desc limit 1),
    (select m.agent_id from public.mailservice_logs m where m.lead_id = l.id and m.ok order by m.created_at desc limit 1),
    (select c.agent_id from public.call_logs c where c.lead_id = l.id order by c.created_at desc limit 1))
where l.assigned_to is null and l.deleted_at is null
  and l.status in ('mail_verstuurd', 'mail_gepland')
  and public.lead_is_board_project(l.lead_list_id);

-- ---------- 2. wachtrij slaat leads van collega's over (bord-projecten) ----------
CREATE OR REPLACE FUNCTION public.claim_next_lead(p_list_id uuid, p_lock_minutes integer DEFAULT 10)
 RETURNS SETOF leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lead public.leads;
  v_mode text := 'fifo';
  v_board boolean := false;
BEGIN
  IF NOT (
    public.is_admin()
    OR p_list_id = ANY (public.my_list_ids())
    OR p_list_id = ANY (public.my_managed_list_ids())
  ) THEN
    RETURN;
  END IF;

  SELECT coalesce(c.queue_mode, 'fifo'), coalesce(c.board_view_enabled, false) INTO v_mode, v_board
  FROM public.lead_lists ll
  LEFT JOIN public.campaigns c ON c.id = ll.campaign_id
  WHERE ll.id = p_list_id;

  SELECT * INTO v_lead
  FROM public.leads l
  WHERE l.lead_list_id = p_list_id
    AND l.deleted_at IS NULL
    AND l.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer','cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal','mail_gepland')
    AND (
      (l.status = 'terugbelafspraak' AND (
        (l.assigned_to = auth.uid() AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
        OR (NOT v_board AND l.next_contact_date IS NOT NULL AND l.next_contact_date <= now() - interval '24 hours')
      ))
      OR (l.status <> 'terugbelafspraak' AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
    )
    AND (l.locked_by IS NULL OR l.locked_by = auth.uid())
    -- v79: in bord-projecten is een lead met eigenaar alleen voor die eigenaar
    AND (NOT v_board OR l.assigned_to IS NULL OR l.assigned_to = auth.uid())
  ORDER BY
    (l.status = 'terugbelafspraak' AND l.assigned_to = auth.uid()) DESC,
    (l.locked_by = auth.uid()) DESC NULLS LAST,
    CASE WHEN v_mode = 'score' THEN
      (CASE l.lead_source WHEN 'referral' THEN 15 WHEN 'linkedin' THEN 10 WHEN 'cold' THEN 5 ELSE 0 END)
      + (CASE WHEN l.decision_maker THEN 20 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l.contact_person), '') <> '' THEN 15 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l."function"), '') <> '' THEN 5 ELSE 0 END)
      + (CASE WHEN coalesce(trim(l.email), '') <> '' THEN 5 ELSE 0 END)
    ELSE 0 END DESC,
    l.created_at ASC
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

-- ---------- 3. melding na 2 weken stilte ----------
-- Draait dagelijks via pg_cron. Een lead telt als "stil" als de laatste
-- actie (lead-update, gesprek, activiteit, mail) ouder is dan 14 dagen en
-- de status mail_verstuurd / mail_gepland / terugbelafspraak / later_bellen is.
-- Ontvangers: campaign_managers van het project, anders alle admins.
-- Per ontvanger en lead hooguit 1 melding per 14 dagen.
create or replace function public.notify_stale_leads(p_days integer default 14)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_count integer := 0;
begin
  with stil as (
    select l.id as lead_id, l.name, l.status, l.assigned_to, ll.campaign_id, ll.name as lijst,
      greatest(
        coalesce(l.updated_at, l.created_at),
        coalesce((select max(c.created_at) from public.call_logs c where c.lead_id = l.id), '-infinity'),
        coalesce((select max(a.created_at) from public.activities a where a.lead_id = l.id), '-infinity'),
        coalesce((select max(m.created_at) from public.mailservice_logs m where m.lead_id = l.id), '-infinity')
      ) as laatste
    from public.leads l
    join public.lead_lists ll on ll.id = l.lead_list_id
    join public.campaigns c on c.id = ll.campaign_id
    where l.deleted_at is null
      and c.board_view_enabled
      and c.is_active
      and l.status in ('mail_verstuurd', 'mail_gepland', 'terugbelafspraak', 'later_bellen')
  ),
  kandidaten as (
    select s.*, p.full_name as beller
    from stil s
    left join public.profiles p on p.id = s.assigned_to
    where s.laatste < now() - make_interval(days => p_days)
  ),
  ontvangers as (
    select k.lead_id, cm.manager_id as profile_id
    from kandidaten k
    join public.campaign_managers cm on cm.campaign_id = k.campaign_id
    union
    select k.lead_id, pr.id
    from kandidaten k
    join public.profiles pr on pr.role = 'admin' and coalesce(pr.is_active, true)
    where not exists (select 1 from public.campaign_managers cm where cm.campaign_id = k.campaign_id)
  ),
  ins as (
    insert into public.notifications (profile_id, actor_id, lead_id, type, title, body)
    select o.profile_id, null, k.lead_id, 'lead_stil',
      'Lead ligt al ' || extract(day from now() - k.laatste)::int || ' dagen stil',
      coalesce(k.name, 'Lead') || ' (' || k.lijst || ') staat sinds ' || to_char(k.laatste, 'DD-MM-YYYY')
        || ' op "' || k.status || '"' || coalesce(' bij ' || k.beller, ' zonder eigenaar') || '. Niemand heeft er sindsdien iets mee gedaan.'
    from ontvangers o
    join kandidaten k on k.lead_id = o.lead_id
    where not exists (
      select 1 from public.notifications n
      where n.lead_id = o.lead_id and n.profile_id = o.profile_id and n.type = 'lead_stil'
        and n.created_at > now() - make_interval(days => p_days)
    )
    returning 1
  )
  select count(*) into v_count from ins;
  return v_count;
end;
$$;

revoke all on function public.notify_stale_leads(integer) from public, anon, authenticated;

create extension if not exists pg_cron;
grant usage on schema cron to postgres;
select cron.unschedule(jobid) from cron.job where jobname = 'leadgen-stille-leads';
select cron.schedule('leadgen-stille-leads', '0 6 * * *', $$select public.notify_stale_leads(14)$$); -- 06:00 UTC = 08:00 NL
