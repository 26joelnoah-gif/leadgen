-- v87 (2026-09-21): claim_lead beschermt nu ook assigned_to, niet alleen
-- locked_by. Aanleiding: Noah opende een lead die aan Lily toegewezen was
-- (via mail_gepland, dus niet meer actief vergrendeld) en kreeg hem zonder
-- waarschuwing of melding zelf als "Jouw lead". Nu telt een lead die eerder
-- aan iemand anders is toegewezen ook als "bezet": zonder p_force krijg je
-- hem niet, met p_force (overnemen) krijgen jullie allebei een melding,
-- precies zoals bij een actief vergrendelde lead (v75).
create or replace function public.claim_lead(p_lead_id uuid, p_lock_minutes integer default 10, p_force boolean default false)
returns setof leads
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
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

  -- v87: een lead telt als "van een ander" zodra hij nu vastligt bij iemand
  -- anders OF eerder aan iemand anders is toegewezen (assigned_to) - ook als
  -- hij nu even niet actief vergrendeld is.
  v_vorige := coalesce(v_lead.locked_by, v_lead.assigned_to);

  -- Bezet bij een ander en geen overname gevraagd? Dan niets teruggeven.
  if v_vorige is not null and v_vorige <> auth.uid() and not coalesce(p_force, false) then
    return;
  end if;

  update public.leads
  set locked_by = auth.uid(), locked_at = now(), call_status = 'calling'
  where id = v_lead.id
  returning * into v_lead;

  -- Overname: allebei een melding.
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
$function$;
