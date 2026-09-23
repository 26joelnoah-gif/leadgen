-- v98: AVG/ACM-compliance voor outreach (2026-09-23).
--
-- Waarom: sinds 1 juli 2026 (art. 11.7 Telecommunicatiewet) mag je zonder
-- voorafgaande toestemming alleen nog rechtspersonen bellen (bv, nv, stichting,
-- vereniging, cooperatie). Eenmanszaak, vof, cv en maatschap vallen onder
-- dezelfde opt-in als consumenten.
--
-- Wat erin zit:
--   1. leads.rechtsvorm (+ bron/datum/wie), opt_in_bewijs, afgemeld_at/_bron,
--      mail_pauze_tot. Toestemming = de bestaande opt_in_*-kolommen (v65).
--   2. campaigns.doelgroep + rechtsvorm_modus + compliance-checklist.
--   3. contact_blokkades: afmeldlijst op hash van e-mail/telefoon/domein. Blijft
--      werken als de lead zelf al gewist is, en vangt her-imports af.
--   4. Triggers: blacklist = afmelden (overal), nieuwe/gewijzigde lead wordt
--      tegen de afmeldlijst gecheckt.
--   5. lead_belstatus() + claim_next_lead slaat niet-belbare leads over.
--   6. compliance_meldingen (klachtenlog) + lead_wis_log.
--   7. leads_wissen(): echt verwijderen, statistiek (call_logs) blijft.
--      afgemelde_leads_wissen(48) elk uur, leads_bewaartermijn(12) elke nacht.

-- ---------- 1. leads ----------
alter table public.leads
  add column if not exists rechtsvorm text,
  add column if not exists rechtsvorm_bron text,          -- import | naam | kvk_beller | handmatig
  add column if not exists rechtsvorm_at timestamptz,
  add column if not exists rechtsvorm_by uuid references public.profiles(id) on delete set null,
  add column if not exists opt_in_bewijs text,
  add column if not exists afgemeld_at timestamptz,
  add column if not exists afgemeld_bron text,            -- mail | beller | import | handmatig | melding
  add column if not exists mail_pauze_tot timestamptz;

do $$ begin
  alter table public.leads add constraint leads_rechtsvorm_check check (
    rechtsvorm is null or rechtsvorm in
    ('bv','nv','stichting','vereniging','cooperatie','eenmanszaak','vof','cv','maatschap','particulier','onbekend'));
exception when duplicate_object then null; end $$;

create index if not exists leads_afgemeld_idx on public.leads (afgemeld_at) where afgemeld_at is not null;

-- ---------- 2. campaigns ----------
alter table public.campaigns
  add column if not exists doelgroep text,                -- zakelijk | particulier | geen_telemarketing | null = nog niet ingesteld
  add column if not exists rechtsvorm_modus text not null default 'waarschuwen', -- waarschuwen | streng
  add column if not exists compliance_checklist jsonb not null default '{}'::jsonb,
  add column if not exists compliance_ok_at timestamptz,
  add column if not exists compliance_ok_by uuid references public.profiles(id) on delete set null;

do $$ begin
  alter table public.campaigns add constraint campaigns_doelgroep_check
    check (doelgroep is null or doelgroep in ('zakelijk','particulier','geen_telemarketing'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.campaigns add constraint campaigns_rechtsvorm_modus_check
    check (rechtsvorm_modus in ('waarschuwen','streng'));
exception when duplicate_object then null; end $$;

-- ---------- 3. afmeldlijst ----------
create or replace function public.norm_telefoon(p text) returns text
language sql immutable as $$
  select case when length(d) >= 9 then right(d, 9) end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

create or replace function public.norm_email(p text) returns text
language sql immutable as $$
  select case when position('@' in t) > 1 then t end
  from (select lower(trim(coalesce(p, ''))) as t) x
$$;

create or replace function public.norm_domein(p text) returns text
language sql immutable as $$
  select case when position('.' in t) > 1 then t end
  from (select split_part(split_part(regexp_replace(regexp_replace(lower(trim(coalesce(p, ''))),
          '^[a-z]+://', ''), '^www\.', ''), '/', 1), '?', 1) as t) x
$$;

create or replace function public.blokkade_hash(p_soort text, p_waarde text) returns text
language sql immutable as $$
  select case when p_waarde is null then null
    else encode(sha256(convert_to(p_soort || ':' || p_waarde, 'UTF8')), 'hex') end
$$;

create table if not exists public.contact_blokkades (
  id uuid primary key default gen_random_uuid(),
  soort text not null check (soort in ('email','telefoon','domein')),
  hash text not null,
  bron text not null,          -- mail | beller | handmatig | melding
  reden text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  unique (soort, hash)
);
alter table public.contact_blokkades enable row level security;
drop policy if exists contact_blokkades_select on public.contact_blokkades;
create policy contact_blokkades_select on public.contact_blokkades for select to authenticated
  using (public.is_admin());
drop policy if exists contact_blokkades_delete on public.contact_blokkades;
create policy contact_blokkades_delete on public.contact_blokkades for delete to authenticated
  using (public.is_admin());
-- Toevoegen alleen via blokkeer_lead() / triggers (security definer).

-- Systeemvlag: laat lock- en eigenaar-triggers een systeemupdate doorlaten.
create or replace function public.leadgen_systeem() returns boolean
language sql stable as $$ select coalesce(current_setting('leadgen.systeem', true), '') = '1' $$;

create or replace function public.leads_lock_guard()
 returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if auth.uid() is null or public.leadgen_systeem() then return new; end if;
  if old.locked_by is null or old.locked_by = auth.uid() then return new; end if;
  if new.locked_by = auth.uid() and new.locked_by is distinct from old.locked_by then return new; end if;
  if public.is_admin() then return new; end if;
  raise exception 'Deze lead is in behandeling bij een collega. Neem hem eerst over.' using errcode = '42501';
end;
$function$;

create or replace function public.leads_owner_on_status()
 returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if auth.uid() is null or public.leadgen_systeem() then return new; end if;
  if not public.lead_is_board_project(new.lead_list_id) then return new; end if;
  if new.status is distinct from old.status and new.status <> 'new' then
    new.assigned_to := auth.uid();
  end if;
  if old.locked_by is not null and new.locked_by is not null
     and new.locked_by <> old.locked_by then
    new.assigned_to := new.locked_by;
  end if;
  return new;
end;
$function$;

-- Statussen van klanten: die worden wel geblokkeerd voor verkoop, maar nooit
-- op blacklist gezet of automatisch gewist.
create or replace function public.is_klant_status(p text) returns boolean
language sql immutable as $$
  select coalesce(p, '') in ('deal','bruto_deal','monteur_ingepland','actief','geaccepteerd','wil_annuleren')
$$;

create or replace function public.lead_is_recruitment(p_list_id uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select c.type = 'recruitment' from public.lead_lists ll
    join public.campaigns c on c.id = ll.campaign_id where ll.id = p_list_id), false)
$$;

-- Zet de contactgegevens van een lead op de afmeldlijst en markeert ALLE leads
-- met hetzelfde e-mailadres, telefoonnummer of domein als afgemeld.
create or replace function public.blokkeer_contact(p_email text, p_telefoon text, p_website text,
  p_bron text, p_reden text default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_e text := public.blokkade_hash('email', public.norm_email(p_email));
  v_t text := public.blokkade_hash('telefoon', public.norm_telefoon(p_telefoon));
  v_d text := public.blokkade_hash('domein', public.norm_domein(p_website));
  v_n integer := 0;
begin
  perform set_config('leadgen.systeem', '1', true);
  if v_e is not null then insert into public.contact_blokkades (soort, hash, bron, reden, created_by)
    values ('email', v_e, p_bron, p_reden, auth.uid()) on conflict do nothing; end if;
  if v_t is not null then insert into public.contact_blokkades (soort, hash, bron, reden, created_by)
    values ('telefoon', v_t, p_bron, p_reden, auth.uid()) on conflict do nothing; end if;
  if v_d is not null then insert into public.contact_blokkades (soort, hash, bron, reden, created_by)
    values ('domein', v_d, p_bron, p_reden, auth.uid()) on conflict do nothing; end if;

  update public.leads l set
    afgemeld_at = coalesce(l.afgemeld_at, now()),
    afgemeld_bron = coalesce(l.afgemeld_bron, p_bron),
    status = case when public.is_klant_status(l.status) then l.status else 'blacklist' end,
    next_contact_date = null,
    locked_by = null, locked_at = null
  where l.afgemeld_at is null
    and not public.lead_is_recruitment(l.lead_list_id)
    and (
      (v_e is not null and public.blokkade_hash('email', public.norm_email(l.email)) = v_e)
      or (v_t is not null and public.blokkade_hash('telefoon', public.norm_telefoon(l.phone)) = v_t)
      or (v_d is not null and public.blokkade_hash('domein', public.norm_domein(l.website)) = v_d)
    );
  get diagnostics v_n = row_count;

  -- Geplande mails voor deze leads gaan niet meer weg.
  delete from public.mail_queue q using public.leads l
  where q.lead_id = l.id and l.afgemeld_at is not null and q.status <> 'verzonden';

  perform set_config('leadgen.systeem', '', true);
  return v_n;
end $$;

-- Voor de app: lead afmelden (bijv. vanuit een compliance-melding).
create or replace function public.blokkeer_lead(p_lead_id uuid, p_bron text default 'handmatig', p_reden text default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare l public.leads;
begin
  -- Toegang via RLS van de aanroeper
  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'Lead niet gevonden' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id;
  perform set_config('leadgen.systeem', '1', true);
  update public.leads set afgemeld_at = coalesce(afgemeld_at, now()),
    afgemeld_bron = coalesce(afgemeld_bron, p_bron),
    status = case when public.is_klant_status(status) then status else 'blacklist' end,
    next_contact_date = null
  where id = p_lead_id;
  return public.blokkeer_contact(l.email, l.phone, l.website, p_bron, p_reden) + 1;
end $$;
grant execute on function public.blokkeer_lead(uuid, text, text) to authenticated;
revoke execute on function public.blokkeer_contact(text, text, text, text, text) from public, anon, authenticated;

-- ---------- 4. triggers ----------
-- a) Beller zet een lead op blacklist ("niet meer benaderen") = afmelden, overal.
create or replace function public.leads_blacklist_afmelden()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.leadgen_systeem() then return null; end if;
  if new.status = 'blacklist' and old.status is distinct from 'blacklist'
     and not public.lead_is_recruitment(new.lead_list_id) then
    perform public.blokkeer_contact(new.email, new.phone, new.website, 'beller', 'Niet meer benaderen (afboeking)');
  end if;
  return null;
end $$;
drop trigger if exists tr_leads_blacklist_afmelden on public.leads;
create trigger tr_leads_blacklist_afmelden after update of status on public.leads
  for each row execute function public.leads_blacklist_afmelden();

-- b) Nieuwe lead of gewijzigde contactgegevens: staat hij op de afmeldlijst?
create or replace function public.leads_check_afmeldlijst()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.afgemeld_at is not null or public.leadgen_systeem() then return new; end if;
  if public.lead_is_recruitment(new.lead_list_id) then return new; end if;
  if exists (select 1 from public.contact_blokkades b where
       (b.soort = 'email' and b.hash = public.blokkade_hash('email', public.norm_email(new.email)))
    or (b.soort = 'telefoon' and b.hash = public.blokkade_hash('telefoon', public.norm_telefoon(new.phone)))
    or (b.soort = 'domein' and b.hash = public.blokkade_hash('domein', public.norm_domein(new.website))))
  then
    new.afgemeld_at := now();
    new.afgemeld_bron := 'import';
    if not public.is_klant_status(new.status) then new.status := 'blacklist'; end if;
    new.next_contact_date := null;
  end if;
  return new;
end $$;
drop trigger if exists tr_leads_check_afmeldlijst_ins on public.leads;
create trigger tr_leads_check_afmeldlijst_ins before insert on public.leads
  for each row execute function public.leads_check_afmeldlijst();
drop trigger if exists tr_leads_check_afmeldlijst_upd on public.leads;
create trigger tr_leads_check_afmeldlijst_upd before update of email, phone, website on public.leads
  for each row execute function public.leads_check_afmeldlijst();

-- c) Afgemeld is afgemeld: alleen admin (of het systeem) haalt het weg.
--    Toestemming (opt_in) vastleggen mag alleen admin/manager, of aan de deur (Outside).
create or replace function public.leads_compliance_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_role text;
begin
  if auth.uid() is null or public.leadgen_systeem() then return new; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if old.afgemeld_at is not null and new.afgemeld_at is null and coalesce(v_role, '') <> 'admin' then
    raise exception 'Deze lead is afgemeld. Alleen een admin kan dat terugdraaien.' using errcode = '42501';
  end if;
  if new.opt_in_at is distinct from old.opt_in_at and new.opt_in_at is not null
     and coalesce(new.opt_in_source, '') <> 'door'
     and coalesce(v_role, '') not in ('admin','manager') then
    raise exception 'Toestemming vastleggen mag alleen een admin of manager.' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists tr_leads_compliance_guard on public.leads;
create trigger tr_leads_compliance_guard before update on public.leads
  for each row execute function public.leads_compliance_guard();

-- ---------- 5. belbaarheid ----------
-- ok | kvk_check (rechtsvorm onbekend, beller moet eerst KvK checken) |
-- toestemming_nodig | afgemeld
create or replace function public.lead_belstatus_basis(
  p_afgemeld_at timestamptz, p_opt_in_at timestamptz, p_rechtsvorm text,
  p_doelgroep text, p_modus text)
returns text language sql immutable as $$
  select case
    when p_afgemeld_at is not null then 'afgemeld'
    when p_opt_in_at is not null then 'ok'
    when p_doelgroep is null or p_doelgroep = 'geen_telemarketing' then 'ok'
    when p_doelgroep = 'particulier' then 'toestemming_nodig'
    when p_rechtsvorm in ('bv','nv','stichting','vereniging','cooperatie') then 'ok'
    when p_rechtsvorm in ('eenmanszaak','vof','cv','maatschap','particulier') then 'toestemming_nodig'
    when coalesce(p_modus, 'waarschuwen') = 'streng' then 'toestemming_nodig'
    else 'kvk_check'
  end
$$;

create or replace function public.lead_belstatus(p_lead_id uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select public.lead_belstatus_basis(l.afgemeld_at, l.opt_in_at, l.rechtsvorm, c.doelgroep, c.rechtsvorm_modus)
  from public.leads l
  left join public.lead_lists ll on ll.id = l.lead_list_id
  left join public.campaigns c on c.id = ll.campaign_id
  where l.id = p_lead_id
$$;
grant execute on function public.lead_belstatus(uuid) to authenticated;

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
    AND l.status NOT IN ('deal','afspraak_gemaakt','geen_interesse','verkeerd_nummer','cold','blacklist','monteur_ingepland','wil_annuleren','bruto_deal','mail_gepland')
    -- v98: niet-belbare leads (afgemeld / toestemming nodig) nooit in de wachtrij
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
    -- v98: leads met bevestigde rechtsvorm eerst, KvK-check daarna
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

-- ---------- 6. klachtenlog ----------
create table if not exists public.compliance_meldingen (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  lead_naam text,                         -- blijft staan als de lead gewist wordt
  campaign_id uuid references public.campaigns(id) on delete set null,
  soort text not null check (soort in ('klacht','bezwaar','avg_verzoek','acm','anders')),
  tekst text not null,
  melding_op date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  afgehandeld_at timestamptz,
  afgehandeld_by uuid references public.profiles(id) on delete set null,
  afhandeling text
);
create index if not exists compliance_meldingen_lead_idx on public.compliance_meldingen (lead_id);
alter table public.compliance_meldingen enable row level security;

drop policy if exists compliance_meldingen_select on public.compliance_meldingen;
create policy compliance_meldingen_select on public.compliance_meldingen for select to authenticated
  using (public.is_admin() or created_by = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager'));
drop policy if exists compliance_meldingen_insert on public.compliance_meldingen;
create policy compliance_meldingen_insert on public.compliance_meldingen for insert to authenticated
  with check (created_by = auth.uid()
    and (lead_id is null or exists (select 1 from public.leads l where l.id = lead_id)));
drop policy if exists compliance_meldingen_update on public.compliance_meldingen;
create policy compliance_meldingen_update on public.compliance_meldingen for update to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager'));

create table if not exists public.lead_wis_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  aantal integer not null,
  reden text not null,          -- afgemeld_handmatig | afgemeld_48u | bewaartermijn
  door uuid references public.profiles(id) on delete set null
);
alter table public.lead_wis_log enable row level security;
drop policy if exists lead_wis_log_select on public.lead_wis_log;
create policy lead_wis_log_select on public.lead_wis_log for select to authenticated using (public.is_admin());

-- ---------- 7. wissen ----------
-- Echt verwijderen. call_logs en mailservice_logs blijven (zonder persoonsgegevens),
-- zodat beltijd, uitbetalingen en rapportage blijven kloppen.
create or replace function public.leads_wissen_intern(p_ids uuid[], p_reden text)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_n integer := 0;
begin
  if p_ids is null or array_length(p_ids, 1) is null then return 0; end if;
  perform set_config('leadgen.systeem', '1', true);
  update public.call_logs set notes = null where lead_id = any(p_ids) and notes is not null;
  update public.mailservice_logs set email = '' where lead_id = any(p_ids);
  update public.enrichment_logs set detail = null where lead_id = any(p_ids);
  update public.compliance_meldingen m set lead_naam = coalesce(m.lead_naam, l.name)
    from public.leads l where l.id = m.lead_id and m.lead_id = any(p_ids);
  delete from public.leads where id = any(p_ids);
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into public.lead_wis_log (aantal, reden, door) values (v_n, p_reden, auth.uid());
  end if;
  perform set_config('leadgen.systeem', '', true);
  return v_n;
end $$;
revoke execute on function public.leads_wissen_intern(uuid[], text) from public, anon, authenticated;

-- Knop "Nu verwijderen" op het bord: alleen afgemelde leads, alleen admin/manager.
create or replace function public.afgemelde_leads_wissen_nu(p_ids uuid[])
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_ids uuid[];
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','manager')) then
    raise exception 'Alleen admin of manager' using errcode = '42501';
  end if;
  select array_agg(id) into v_ids from public.leads
  where id = any(p_ids) and afgemeld_at is not null and not public.is_klant_status(status)
    and (public.is_admin() or lead_list_id = any(public.my_managed_list_ids()));
  return public.leads_wissen_intern(v_ids, 'afgemeld_handmatig');
end $$;
grant execute on function public.afgemelde_leads_wissen_nu(uuid[]) to authenticated;

create or replace function public.afgemelde_leads_wissen(p_uren integer default 48)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_ids uuid[];
begin
  select array_agg(id) into v_ids from public.leads
  where afgemeld_at is not null and afgemeld_at < now() - make_interval(hours => p_uren)
    and not public.is_klant_status(status);
  return public.leads_wissen_intern(v_ids, 'afgemeld_48u');
end $$;

-- Bewaartermijn: nooit gereageerd na X maanden -> weg.
create or replace function public.leads_bewaartermijn(p_maanden integer default 12)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare v_ids uuid[];
begin
  select array_agg(l.id) into v_ids from public.leads l
  where l.created_at < now() - make_interval(months => p_maanden)
    and (
      -- al eerder weggegooid (prullenbak)
      (l.deleted_at is not null and l.deleted_at < now() - make_interval(months => p_maanden))
      or (
        coalesce(l.status, 'new') in ('new','geen_gehoor')
        and l.opt_in_at is null and l.appointment_at is null and l.sale_date is null
        and not exists (select 1 from public.call_logs c where c.lead_id = l.id
                        and coalesce(c.disposition, '') not in ('geen_gehoor',''))
        and not exists (select 1 from public.lead_mail_status m where m.lead_id = l.id and m.status_rank >= 2)
        and not exists (select 1 from public.offertes o where o.lead_id = l.id)
        and not exists (select 1 from public.compliance_meldingen cm where cm.lead_id = l.id and cm.afgehandeld_at is null)
        and not public.lead_is_recruitment(l.lead_list_id)
      )
    );
  return public.leads_wissen_intern(v_ids, 'bewaartermijn');
end $$;
revoke execute on function public.afgemelde_leads_wissen(integer) from public, anon, authenticated;
revoke execute on function public.leads_bewaartermijn(integer) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('leadgen-afgemeld-wissen','leadgen-bewaartermijn');
select cron.schedule('leadgen-afgemeld-wissen', '15 * * * *', $$select public.afgemelde_leads_wissen(48)$$);
select cron.schedule('leadgen-bewaartermijn', '45 2 * * *', $$select public.leads_bewaartermijn(12)$$);

-- ---------- 8. startwaarden ----------
-- Rechtsvorm uit de bedrijfsnaam halen waar dat duidelijk is (bron 'naam').
update public.leads set rechtsvorm = 'bv', rechtsvorm_bron = 'naam', rechtsvorm_at = now()
where rechtsvorm is null and name ~* '(^|\s)b\.?\s?v\.?\s*$';
update public.leads set rechtsvorm = 'nv', rechtsvorm_bron = 'naam', rechtsvorm_at = now()
where rechtsvorm is null and name ~* '(^|\s)n\.?\s?v\.?\s*$';
update public.leads set rechtsvorm = 'vof', rechtsvorm_bron = 'naam', rechtsvorm_at = now()
where rechtsvorm is null and name ~* '(^|\s)v\.?\s?o\.?\s?f\.?\s*$';
update public.leads set rechtsvorm = 'stichting', rechtsvorm_bron = 'naam', rechtsvorm_at = now()
where rechtsvorm is null and name ~* '^\s*stichting\s';

-- Recruitment is geen telemarketing.
update public.campaigns set doelgroep = 'geen_telemarketing' where type = 'recruitment' and doelgroep is null;
-- MarketingKiezer-outreach: zakelijk, voorlopig in waarschuwmodus (KvK-check door beller).
update public.campaigns set doelgroep = 'zakelijk', rechtsvorm_modus = 'waarschuwen'
where id = 'bad07022-dfb3-4987-8896-6ade807b9303' and doelgroep is null;

-- ---------- 9. (v98b) rechtsvorm uit naam ook bij nieuwe leads ----------
create or replace function public.rechtsvorm_uit_naam(p text) returns text
language sql immutable as $$
  select case
    when p ~* '(^|\s)b\.?\s?v\.?\s*$' then 'bv'
    when p ~* '(^|\s)n\.?\s?v\.?\s*$' then 'nv'
    when p ~* '(^|\s)v\.?\s?o\.?\s?f\.?\s*$' then 'vof'
    when p ~* '(^|\s)c\.?\s?v\.?\s*$' then 'cv'
    when p ~* '^\s*stichting\s' then 'stichting'
    when p ~* '^\s*vereniging\s' then 'vereniging'
  end
$$;

create or replace function public.leads_rechtsvorm_uit_naam()
returns trigger language plpgsql as $$
begin
  if new.rechtsvorm is null and new.name is not null then
    new.rechtsvorm := public.rechtsvorm_uit_naam(new.name);
    if new.rechtsvorm is not null then
      new.rechtsvorm_bron := coalesce(new.rechtsvorm_bron, 'naam');
      new.rechtsvorm_at := coalesce(new.rechtsvorm_at, now());
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tr_leads_rechtsvorm_uit_naam on public.leads;
create trigger tr_leads_rechtsvorm_uit_naam before insert or update of name on public.leads
  for each row execute function public.leads_rechtsvorm_uit_naam();

-- ---------- 10. (v98c) check voor de mailfuncties ----------
create or replace function public.mail_geblokkeerd(p_lead_id uuid, p_email text)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when l.afgemeld_at is not null then 'Deze lead heeft zich afgemeld. Niet meer mailen of bellen.'
    when exists (select 1 from public.contact_blokkades b where b.soort = 'email'
                 and b.hash = public.blokkade_hash('email', public.norm_email(p_email)))
      then 'Dit e-mailadres staat op de afmeldlijst.'
    when exists (select 1 from public.contact_blokkades b where b.soort = 'domein'
                 and b.hash = public.blokkade_hash('domein', public.norm_domein(split_part(p_email, '@', 2)))
                 and public.norm_domein(l.website) = public.norm_domein(split_part(p_email, '@', 2)))
      then 'Dit bedrijf staat op de afmeldlijst.'
    when l.mail_pauze_tot is not null and l.mail_pauze_tot > now()
      then 'Dit bureau wil pas later weer mail (tot ' || to_char(l.mail_pauze_tot at time zone 'Europe/Amsterdam', 'DD-MM-YYYY') || ').'
  end
  from public.leads l where l.id = p_lead_id
$$;
revoke execute on function public.mail_geblokkeerd(uuid, text) from public, anon;
grant execute on function public.mail_geblokkeerd(uuid, text) to authenticated, service_role;

-- ---------- 11. (v98d) rechtsvorm niet zomaar omzetten ----------
create or replace function public.leads_compliance_guard()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_role text;
begin
  if auth.uid() is null or public.leadgen_systeem() then return new; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if old.afgemeld_at is not null and new.afgemeld_at is null and coalesce(v_role, '') <> 'admin' then
    raise exception 'Deze lead is afgemeld. Alleen een admin kan dat terugdraaien.' using errcode = '42501';
  end if;
  if new.opt_in_at is distinct from old.opt_in_at and new.opt_in_at is not null
     and coalesce(new.opt_in_source, '') <> 'door'
     and coalesce(v_role, '') not in ('admin','manager') then
    raise exception 'Toestemming vastleggen mag alleen een admin of manager.' using errcode = '42501';
  end if;
  if new.rechtsvorm is distinct from old.rechtsvorm
     and old.rechtsvorm is not null and old.rechtsvorm <> 'onbekend'
     and coalesce(old.rechtsvorm_bron, '') <> 'naam'
     and coalesce(v_role, '') not in ('admin','manager') then
    raise exception 'Een ingevulde rechtsvorm aanpassen mag alleen een admin of manager.' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- 12. (v98e) cijfers voor de checklist ----------
create or replace function public.project_compliance_stats(p_campaign_id uuid)
returns table(totaal bigint, ok bigint, kvk_check bigint, toestemming_nodig bigint, afgemeld bigint, rechtsvorm_uit_naam bigint)
language sql stable security definer set search_path to 'public' as $$
  select count(*),
    count(*) filter (where bs = 'ok'),
    count(*) filter (where bs = 'kvk_check'),
    count(*) filter (where bs = 'toestemming_nodig'),
    count(*) filter (where bs = 'afgemeld'),
    count(*) filter (where rechtsvorm_bron = 'naam')
  from (
    select l.rechtsvorm_bron,
      public.lead_belstatus_basis(l.afgemeld_at, l.opt_in_at, l.rechtsvorm, c.doelgroep, c.rechtsvorm_modus) as bs
    from public.leads l
    join public.lead_lists ll on ll.id = l.lead_list_id
    join public.campaigns c on c.id = ll.campaign_id
    where c.id = p_campaign_id and l.deleted_at is null
      and (public.is_admin() or p_campaign_id = any(public.my_managed_campaign_ids()))
  ) x
$$;
revoke execute on function public.project_compliance_stats(uuid) from public, anon;
grant execute on function public.project_compliance_stats(uuid) to authenticated;

-- ---------- 13. (v98f) afmeldingen blijvend terug te zien + domein-fix ----------
-- norm_domein pakt nu alleen het echte domein (ook bij rommel als "x.nl](https://x.nl").
-- Tabel afmeldingen: bedrijfsnaam, bron, reden, project. Blijft staan als de lead
-- na 48 uur gewist is. blokkeer_contact kreeg p_naam en p_list_id erbij.
create or replace function public.norm_domein(p text) returns text
language sql immutable as $$
  select case when position('.' in t) > 1 then t end
  from (select substring(regexp_replace(regexp_replace(lower(trim(coalesce(p, ''))),
          '^[a-z]+://', ''), '^www\.', '') from '^[a-z0-9.-]+') as t) x
$$;
create table if not exists public.afmeldingen (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  bedrijfsnaam text,
  bron text not null,
  reden text,
  campaign_id uuid references public.campaigns(id) on delete set null,
  door uuid references public.profiles(id) on delete set null
);
alter table public.afmeldingen enable row level security;
drop policy if exists afmeldingen_select on public.afmeldingen;
create policy afmeldingen_select on public.afmeldingen for select to authenticated
  using (public.is_admin() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager'));

drop function if exists public.blokkeer_contact(text, text, text, text, text);
create or replace function public.blokkeer_contact(p_email text, p_telefoon text, p_website text,
  p_bron text, p_reden text default null, p_naam text default null, p_list_id uuid default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_e text := public.blokkade_hash('email', public.norm_email(p_email));
  v_t text := public.blokkade_hash('telefoon', public.norm_telefoon(p_telefoon));
  v_d text := public.blokkade_hash('domein', public.norm_domein(p_website));
  v_n integer := 0;
begin
  perform set_config('leadgen.systeem', '1', true);
  if v_e is not null then insert into public.contact_blokkades (soort, hash, bron, reden, created_by)
    values ('email', v_e, p_bron, p_reden, auth.uid()) on conflict do nothing; end if;
  if v_t is not null then insert into public.contact_blokkades (soort, hash, bron, reden, created_by)
    values ('telefoon', v_t, p_bron, p_reden, auth.uid()) on conflict do nothing; end if;
  if v_d is not null then insert into public.contact_blokkades (soort, hash, bron, reden, created_by)
    values ('domein', v_d, p_bron, p_reden, auth.uid()) on conflict do nothing; end if;
  insert into public.afmeldingen (bedrijfsnaam, bron, reden, campaign_id, door)
  values (p_naam, p_bron, p_reden, (select campaign_id from public.lead_lists where id = p_list_id), auth.uid());
  update public.leads l set
    afgemeld_at = coalesce(l.afgemeld_at, now()),
    afgemeld_bron = coalesce(l.afgemeld_bron, p_bron),
    status = case when public.is_klant_status(l.status) then l.status else 'blacklist' end,
    next_contact_date = null,
    locked_by = null, locked_at = null
  where l.afgemeld_at is null
    and not public.lead_is_recruitment(l.lead_list_id)
    and (
      (v_e is not null and public.blokkade_hash('email', public.norm_email(l.email)) = v_e)
      or (v_t is not null and public.blokkade_hash('telefoon', public.norm_telefoon(l.phone)) = v_t)
      or (v_d is not null and public.blokkade_hash('domein', public.norm_domein(l.website)) = v_d)
    );
  get diagnostics v_n = row_count;
  delete from public.mail_queue q using public.leads l
  where q.lead_id = l.id and l.afgemeld_at is not null and q.status <> 'verzonden';
  perform set_config('leadgen.systeem', '', true);
  return v_n;
end $$;
revoke execute on function public.blokkeer_contact(text, text, text, text, text, text, uuid) from public, anon, authenticated;

create or replace function public.blokkeer_lead(p_lead_id uuid, p_bron text default 'handmatig', p_reden text default null)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare l public.leads;
begin
  if not exists (select 1 from public.leads where id = p_lead_id) then
    raise exception 'Lead niet gevonden' using errcode = '42501';
  end if;
  select * into l from public.leads where id = p_lead_id;
  perform set_config('leadgen.systeem', '1', true);
  update public.leads set afgemeld_at = coalesce(afgemeld_at, now()),
    afgemeld_bron = coalesce(afgemeld_bron, p_bron),
    status = case when public.is_klant_status(status) then status else 'blacklist' end,
    next_contact_date = null
  where id = p_lead_id;
  return public.blokkeer_contact(l.email, l.phone, l.website, p_bron, p_reden, l.name, l.lead_list_id) + 1;
end $$;

create or replace function public.leads_blacklist_afmelden()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if public.leadgen_systeem() then return null; end if;
  if new.status = 'blacklist' and old.status is distinct from 'blacklist'
     and not public.lead_is_recruitment(new.lead_list_id) then
    perform public.blokkeer_contact(new.email, new.phone, new.website, 'beller', 'Niet meer benaderen (afboeking)', new.name, new.lead_list_id);
  end if;
  return null;
end $$;
