-- v99 (2026-09-23): "In nieuw kwartaal bellen"
-- Per project aan te zetten (campaigns.kwartaal_bellen_enabled). In het
-- belscherm kiest de beller dan "NIEUW KWARTAAL" + een kwartaal. De lead gaat
-- naar de lijst "Q<n> <jaar>" binnen hetzelfde project (wordt aangemaakt als
-- hij nog niet bestaat) en komt op 'later_bellen' met als opvolgdatum de eerste
-- werkdag van dat kwartaal om 09:00. De afboeking zelf (status, call_log) loopt
-- via de gewone flow in useLeads.handleLeadDisposition; deze functie doet
-- alleen het verplaatsen en rekent de datum uit.

alter table public.campaigns
  add column if not exists kwartaal_bellen_enabled boolean not null default false;

-- Aan voor PROSELL
update public.campaigns set kwartaal_bellen_enabled = true
where name = 'PROSELL' and deleted_at is null;

create or replace function public.lead_naar_kwartaal(p_lead_id uuid, p_kwartaal_start date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_lead public.leads;
  v_lijst public.lead_lists;
  v_aan boolean;
  v_vandaag date := (now() at time zone 'Europe/Amsterdam')::date;
  v_huidig date := date_trunc('quarter', (now() at time zone 'Europe/Amsterdam'))::date;
  v_start date;
  v_dag date;
  v_naam text;
  v_doel uuid;
  v_opvolg timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd' using errcode = '42501';
  end if;

  select * into v_lead from public.leads l
  where l.id = p_lead_id
    and l.deleted_at is null
    and (
      public.is_admin()
      or l.assigned_to = auth.uid()
      or l.locked_by = auth.uid()
      or l.lead_list_id = any (public.my_list_ids())
      or l.lead_list_id = any (public.my_managed_list_ids())
    );
  if v_lead.id is null then
    raise exception 'Lead niet gevonden of geen toegang' using errcode = '42501';
  end if;
  if v_lead.locked_by is not null and v_lead.locked_by <> auth.uid() and not public.is_admin() then
    raise exception 'Deze lead is in behandeling bij een collega.' using errcode = '42501';
  end if;

  select * into v_lijst from public.lead_lists where id = v_lead.lead_list_id;
  if v_lijst.campaign_id is null then
    raise exception 'Deze lead hoort niet bij een project' using errcode = '22023';
  end if;
  select kwartaal_bellen_enabled into v_aan from public.campaigns where id = v_lijst.campaign_id;
  if not coalesce(v_aan, false) then
    raise exception 'Nieuw kwartaal bellen staat niet aan voor dit project' using errcode = '22023';
  end if;

  -- Welk kwartaal: standaard het volgende; anders moet het een kwartaalstart
  -- in de toekomst zijn (max 2 jaar vooruit).
  if p_kwartaal_start is null then
    v_start := (v_huidig + interval '3 months')::date;
  else
    v_start := p_kwartaal_start;
    if v_start <> date_trunc('quarter', v_start)::date
       or v_start <= v_huidig
       or v_start > v_huidig + interval '2 years' then
      raise exception 'Ongeldig kwartaal' using errcode = '22023';
    end if;
  end if;

  v_naam := 'Q' || extract(quarter from v_start)::int || ' ' || extract(year from v_start)::int;

  -- Opvolgdatum: eerste werkdag van het kwartaal (niet op 1 januari) om 09:00 NL
  v_dag := v_start;
  while extract(isodow from v_dag) > 5 or (extract(month from v_dag) = 1 and extract(day from v_dag) = 1) loop
    v_dag := v_dag + 1;
  end loop;
  v_opvolg := (v_dag + time '09:00') at time zone 'Europe/Amsterdam';

  -- Lijst zoeken of aanmaken (zelfde project). Advisory lock tegen dubbele
  -- lijsten als twee bellers tegelijk dezelfde nieuwe lijst nodig hebben.
  perform pg_advisory_xact_lock(hashtext('kwartaal:' || v_lijst.campaign_id || ':' || v_naam));
  select id into v_doel from public.lead_lists
  where campaign_id = v_lijst.campaign_id and name = v_naam and deleted_at is null
  order by created_at limit 1;

  if v_doel is null then
    insert into public.lead_lists (name, description, campaign_id, organization_id,
      assigned_to, assigned_team_id, rate_per_appointment, rate_per_deal, rate_per_hour)
    values (v_naam, 'Automatisch: leads die in dit kwartaal opnieuw gebeld moeten worden',
      v_lijst.campaign_id, v_lijst.organization_id,
      v_lijst.assigned_to, v_lijst.assigned_team_id, v_lijst.rate_per_appointment, v_lijst.rate_per_deal, v_lijst.rate_per_hour)
    returning id into v_doel;
  end if;

  if v_doel <> v_lead.lead_list_id then
    perform set_config('leadgen.systeem', '1', true);
    update public.leads set lead_list_id = v_doel, updated_at = now() where id = v_lead.id;
    perform set_config('leadgen.systeem', '', true);
  end if;

  return jsonb_build_object(
    'list_id', v_doel,
    'list_name', v_naam,
    'kwartaal_start', v_start,
    'next_contact_date', v_opvolg
  );
end;
$$;

revoke all on function public.lead_naar_kwartaal(uuid, date) from public, anon;
grant execute on function public.lead_naar_kwartaal(uuid, date) to authenticated;
