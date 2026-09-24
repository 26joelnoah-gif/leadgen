-- v101 (2026-09-24): RLS sneller + blokkeer_lead dicht + functies niet meer anoniem aan te roepen
--
-- Aanleiding: 98x "statement timeout" op /rest/v1/leads in 24 uur (Lily, Corne, Wiam...).
-- Oorzaak: RLS-policies riepen is_admin(), my_org_id(), my_list_ids() enz. PER RIJ aan
-- (ook in de geneste lead_lists/campaigns-policies). Gemeten als Lily: 4,8 s voor 1.326 leads.
-- Fix: elke aanroep in (SELECT ...) zetten, dan rekent Postgres hem 1x per query uit (InitPlan).
-- Gemeten na de fix: 0,06 s, zelfde rijen. Betekenis van de regels verandert niet.
-- Array-functies krijgen een cast (::uuid[]), anders leest Postgres "= ANY ((SELECT f()))" als subquery.
-- Script is idempotent: al ingepakte aanroepen worden overgeslagen.

-- 1. RLS-policies inpakken ------------------------------------------------------------
create or replace function pg_temp.rls_wrap(t text) returns text language sql immutable as $f$
 select regexp_replace(regexp_replace(regexp_replace(regexp_replace(t,
   '(?<!SELECT )\m(public\.)?(is_admin|my_org_id|can_view_schedules|is_planning)\(\)', '(SELECT \1\2())', 'g'),
   '(?<!SELECT )\m(public\.)?(my_list_ids|my_managed_list_ids|am_list_ids|my_team_ids|my_managed_campaign_ids)\(\)', '((SELECT \1\2())::uuid[])', 'g'),
   '(?<!SELECT )\m(public\.)?(my_tool_keys)\(\)', '((SELECT \1\2())::text[])', 'g'),
   '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(SELECT auth.\1())', 'g')
$f$;

do $$
declare r record;
begin
  for r in
    select * from (
      select tablename, policyname, qual, with_check,
             pg_temp.rls_wrap(qual) nq, pg_temp.rls_wrap(with_check) nw
      from pg_policies where schemaname = 'public'
    ) x
    where nq is distinct from qual or nw is distinct from with_check
  loop
    execute format('alter policy %I on public.%I %s %s', r.policyname, r.tablename,
      case when r.nq is not null then 'using (' || r.nq || ')' else '' end,
      case when r.nw is not null then 'with check (' || r.nw || ')' else '' end);
  end loop;
end $$;

-- 2. blokkeer_lead: alleen voor wie de lead mag zien/bewerken ---------------------------
-- Was: iedereen (zelfs anon) kon elke lead afmelden -> 48 uur later automatisch gewist.
-- auth.uid() leeg = service_role (Edge Function mailstatus) of cron: mag altijd.
create or replace function public.blokkeer_lead(p_lead_id uuid, p_bron text default 'handmatig', p_reden text default null)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare l public.leads; v_uid uuid := auth.uid();
begin
  select * into l from public.leads where id = p_lead_id;
  if not found then
    raise exception 'Lead niet gevonden' using errcode = '42501';
  end if;
  if v_uid is not null and not (
       public.is_admin()
    or l.assigned_to = v_uid
    or l.created_by = v_uid
    or l.lead_list_id = any(public.my_managed_list_ids())
    or (l.lead_list_id = any(public.my_list_ids())
        and (not (l.lead_list_id = any(public.am_list_ids())) or l.assigned_to is null))
  ) then
    raise exception 'Geen rechten op deze lead' using errcode = '42501';
  end if;
  perform set_config('leadgen.systeem', '1', true);
  update public.leads set afgemeld_at = coalesce(afgemeld_at, now()),
    afgemeld_bron = coalesce(afgemeld_bron, p_bron),
    status = case when public.is_klant_status(status) then status else 'blacklist' end,
    next_contact_date = null
  where id = p_lead_id;
  return public.blokkeer_contact(l.email, l.phone, l.website, p_bron, p_reden, l.name, l.lead_list_id) + 1;
end $function$;

-- 3. SECURITY DEFINER-functies niet meer zonder inloggen aan te roepen ------------------
-- unlatched_intake blijft open voor anon (externe intake met eigen geheim).
-- Triggerfuncties hebben geen EXECUTE-recht nodig om als trigger te draaien.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.proname in ('afgemelde_leads_wissen_nu','blokkeer_lead','claim_lead','lead_belstatus',
        'lead_is_board_project','lead_is_recruitment','leads_blacklist_afmelden','leads_check_afmeldlijst',
        'leads_compliance_guard','leads_lock_guard','leads_owner_on_status','mail_queue_kan_beheren',
        'my_managed_campaign_ids','tr_protect_payment_fields')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- (search_path-advies op de compliance-hulpfuncties bewust NIET gedaan: SET op een
--  SQL-functie blokkeert inlining en lead_belstatus_basis draait in de belwachtrij.)
