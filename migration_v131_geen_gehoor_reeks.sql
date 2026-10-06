-- v131 (06-10-2026): geen gehoor in bordprojecten
-- * Geen gehoor verandert NOOIT de eigenaar (v131b, wens Noah: wie al contact
--   had, raakt zijn lead niet kwijt bij een volgend geen gehoor).
--   Vrije lead + geen gehoor = blijft vrij, kolom Nieuw.
--   Eigen lead + geen gehoor = blijft van de beller, kolom Opvolgen.
-- * leads.geen_gehoor_reeks telt hoe vaak achter elkaar geen gehoor.
--   De app verhoogt hem bij elke geen-gehoor-afboeking in een bordproject;
--   elke andere status zet hem via de trigger terug op 0.
-- * Vanaf 5 op een rij: kolom "Niet bereikbaar", niet meer in de wachtrij.

alter table public.leads add column if not exists geen_gehoor_reeks integer not null default 0;

create or replace function public.leads_geen_gehoor_reeks_reset()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status is distinct from old.status and new.status not in ('geen_gehoor', 'voicemail') then
    new.geen_gehoor_reeks := 0;
  end if;
  return new;
end $$;
drop trigger if exists tr_leads_geen_gehoor_reeks on public.leads;
create trigger tr_leads_geen_gehoor_reeks before update of status on public.leads
  for each row execute function public.leads_geen_gehoor_reeks_reset();

-- Eigenaar-trigger (v79/v110): geen gehoor maakt je GEEN eigenaar meer.
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
  return new;
end;
$function$;

-- Wachtrij: 5x of vaker geen gehoor op een rij = niet meer automatisch bellen.
create or replace function public.claim_next_lead(p_list_id uuid, p_lock_minutes integer default 10)
returns setof public.leads language plpgsql security definer set search_path to 'public' as $function$
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
      (l.status = 'terugbelafspraak' AND (
        (l.assigned_to = auth.uid() AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
        OR (NOT v_board AND l.next_contact_date IS NOT NULL AND l.next_contact_date <= now() - interval '24 hours')
      ))
      OR (l.status <> 'terugbelafspraak' AND (l.next_contact_date IS NULL OR l.next_contact_date <= now()))
    )
    AND (l.locked_by IS NULL OR l.locked_by = auth.uid())
    AND (NOT v_board OR l.assigned_to IS NULL OR l.assigned_to = auth.uid())
  ORDER BY
    (l.status = 'terugbelafspraak' AND l.assigned_to = auth.uid()) DESC,
    (l.locked_by = auth.uid()) DESC NULLS LAST,
    (l.rechtsvorm IS NOT NULL AND l.rechtsvorm <> 'onbekend') DESC,
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

-- Backfill in bordprojecten
do $$
begin
  perform set_config('leadgen.systeem', '1', true);

  -- reeks uit call_logs: aantal geen gehoor sinds de laatste andere afboeking
  update public.leads l set geen_gehoor_reeks = sub.reeks
  from (
    select b.id, (
      select count(*) from public.call_logs c
      where c.lead_id = b.id and c.disposition in ('geen_gehoor', 'voicemail')
        and c.created_at > coalesce((select max(c2.created_at) from public.call_logs c2
          where c2.lead_id = b.id and c2.disposition not in ('geen_gehoor', 'voicemail')), '-infinity')
    ) as reeks
    from public.leads b
    join public.lead_lists ll on ll.id = b.lead_list_id
    join public.campaigns c on c.id = ll.campaign_id
    where c.board_view_enabled and b.deleted_at is null
      and (b.status in ('geen_gehoor', 'voicemail')
        or (b.status = 'cold' and (select c3.disposition from public.call_logs c3 where c3.lead_id = b.id order by c3.created_at desc limit 1) = 'geen_gehoor'))
  ) sub
  where l.id = sub.id;

  -- oude regel (2x geen gehoor = koud) terugdraaien: terug in de leadlijst
  update public.leads l set status = 'geen_gehoor', next_contact_date = null
  from public.lead_lists ll, public.campaigns c
  where ll.id = l.lead_list_id and c.id = ll.campaign_id and c.board_view_enabled
    and l.deleted_at is null and l.status = 'cold' and l.geen_gehoor_reeks > 0;

  -- De oude eigenaar-trigger maakte je eigenaar bij ELK geen gehoor. Leads
  -- waarmee nog nooit echt contact is geweest (alleen geen gehoor/voicemail
  -- in call_logs) gaan terug naar niemand. Was er wel ooit contact, dan
  -- blijft de lead van zijn beller. Niet als iemand hem nu open heeft.
  update public.leads l set assigned_to = null
  from public.lead_lists ll, public.campaigns c
  where ll.id = l.lead_list_id and c.id = ll.campaign_id and c.board_view_enabled
    and l.deleted_at is null and l.status in ('geen_gehoor', 'voicemail')
    and l.assigned_to is not null and l.locked_by is null
    and not exists (
      select 1 from public.call_logs cl
      where cl.lead_id = l.id and cl.disposition not in ('geen_gehoor', 'voicemail', 'new', 'teruggezet')
    );
end $$;
