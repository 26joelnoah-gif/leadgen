-- v137 (2026-10-09): verklaringen
--  1. meerdere sjablonen, elk met eigen tekst + standaardbedragen
--  2. bedragen van een nog niet getekende verklaring aanpassen (link blijft gelijk)
--  3. verklaring via een link voor mensen die nog geen account hebben
-- TOEGEPAST op 09-10-2026 in losse statements via execute_sql (zonder de drop-regels).

-- 1. Sjablonen ---------------------------------------------------------------
create table if not exists public.overeenkomst_sjablonen (
  id uuid primary key default gen_random_uuid(),
  naam text not null,
  titel text not null default 'Verklaring zelfstandig appointment setter',
  opdrachtgever_naam text not null default 'ReachConnect',
  opdrachtgever_plaats text default 'Arnhem',
  opdrachtgever_kvk text,
  tekst text not null,
  tarieven jsonb not null default '[]'::jsonb,
  is_standaard boolean not null default false,
  versie integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create unique index if not exists overeenkomst_sjablonen_een_standaard
  on public.overeenkomst_sjablonen (is_standaard) where is_standaard;

drop trigger if exists tr_overeenkomst_sjablonen_versie on public.overeenkomst_sjablonen;
create trigger tr_overeenkomst_sjablonen_versie before update on public.overeenkomst_sjablonen
  for each row execute function public.overeenkomst_sjabloon_versie();

-- het bestaande sjabloon (v136) wordt "Standaard"
insert into public.overeenkomst_sjablonen (naam, titel, opdrachtgever_naam, opdrachtgever_plaats, opdrachtgever_kvk, tekst, is_standaard, versie)
select 'Standaard', titel, opdrachtgever_naam, opdrachtgever_plaats, opdrachtgever_kvk, tekst, true, versie
  from public.overeenkomst_sjabloon where id = 1
   and not exists (select 1 from public.overeenkomst_sjablonen);

alter table public.overeenkomst_sjablonen enable row level security;
drop policy if exists overeenkomst_sjablonen_select on public.overeenkomst_sjablonen;
create policy overeenkomst_sjablonen_select on public.overeenkomst_sjablonen for select to authenticated
  using ((select public.mag_overeenkomsten_versturen()));
drop policy if exists overeenkomst_sjablonen_insert on public.overeenkomst_sjablonen;
create policy overeenkomst_sjablonen_insert on public.overeenkomst_sjablonen for insert to authenticated
  with check ((select public.is_admin()));
drop policy if exists overeenkomst_sjablonen_update on public.overeenkomst_sjablonen;
create policy overeenkomst_sjablonen_update on public.overeenkomst_sjablonen for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
drop policy if exists overeenkomst_sjablonen_delete on public.overeenkomst_sjablonen;
create policy overeenkomst_sjablonen_delete on public.overeenkomst_sjablonen for delete to authenticated
  using ((select public.is_admin()) and not is_standaard);

-- 2. Verklaring via link -------------------------------------------------------
set lock_timeout = '5s';
alter table public.overeenkomsten alter column profile_id drop not null;
alter table public.overeenkomsten add column if not exists ontvanger_naam text;
alter table public.overeenkomsten add column if not exists ontvanger_email text;
alter table public.overeenkomsten add column if not exists token text;
alter table public.overeenkomsten add column if not exists sjabloon_id uuid
  references public.overeenkomst_sjablonen(id) on delete set null;
create unique index if not exists overeenkomsten_token_uniek on public.overeenkomsten (token) where token is not null;
alter table public.overeenkomsten drop constraint if exists overeenkomsten_ontvanger_check;
alter table public.overeenkomsten add constraint overeenkomsten_ontvanger_check
  check (profile_id is not null or (token is not null and nullif(trim(ontvanger_naam), '') is not null));
reset lock_timeout;

-- helpers
create or replace function public.overeenkomst_tarieven_schoon(p jsonb)
returns jsonb language sql immutable set search_path to 'public', 'pg_temp' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'project', left(trim(t->>'project'), 120),
           'afspraak', case when nullif(t->>'afspraak', '') is null then null else greatest(0, (t->>'afspraak')::numeric) end,
           'sale', case when nullif(t->>'sale', '') is null then null else greatest(0, (t->>'sale')::numeric) end)), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) t
   where nullif(trim(t->>'project'), '') is not null;
$$;

create or replace function public.overeenkomst_hash(p_titel text, p_opdr jsonb, p_tekst text, p_tarieven jsonb)
returns text language sql immutable set search_path to 'public', 'extensions', 'pg_temp' as $$
  select encode(extensions.digest(p_titel || '|' || p_opdr::text || '|' || p_tekst || '|' || p_tarieven::text, 'sha256'), 'hex');
$$;
revoke all on function public.overeenkomst_tarieven_schoon(jsonb) from public, anon;
revoke all on function public.overeenkomst_hash(text, jsonb, text, jsonb) from public, anon;
grant execute on function public.overeenkomst_tarieven_schoon(jsonb) to authenticated;
grant execute on function public.overeenkomst_hash(text, jsonb, text, jsonb) to authenticated;

-- versturen: naar een account (p_profile) of via link (p_profile leeg + p_naam/p_email), met een sjabloon
-- De oude versie overeenkomst_versturen(uuid, jsonb) bestaat nog (drop liep niet via de MCP-tool).
-- Hij hindert niet: de app roept altijd alle 5 parameters aan. Mag later weg:
-- drop function if exists public.overeenkomst_versturen(uuid, jsonb);
create or replace function public.overeenkomst_versturen(
  p_profile uuid, p_tarieven jsonb, p_sjabloon uuid default null,
  p_naam text default null, p_email text default null)
returns jsonb
language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare
  v_doel public.profiles;
  v_ik public.profiles;
  v_sj public.overeenkomst_sjablonen;
  v_id uuid;
  v_tarieven jsonb;
  v_opdr jsonb;
  v_token text;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if auth.uid() is null or not public.mag_overeenkomsten_versturen() then
    raise exception 'Je mag geen verklaringen versturen';
  end if;
  select * into v_ik from public.profiles where id = auth.uid();

  if p_profile is not null then
    if p_profile = auth.uid() then raise exception 'Je kunt jezelf geen verklaring sturen'; end if;
    select * into v_doel from public.profiles where id = p_profile and deleted_at is null;
    if v_doel.id is null then raise exception 'Medewerker niet gevonden'; end if;
    if v_doel.role not in ('employee', 'backoffice') then
      raise exception 'Een verklaring kan alleen naar een beller of backoffice';
    end if;
    if not public.is_admin() and v_ik.organization_id is not null
       and v_doel.organization_id is distinct from v_ik.organization_id then
      raise exception 'Deze medewerker valt niet onder jouw organisatie';
    end if;
  else
    if length(trim(coalesce(p_naam, ''))) < 2 then raise exception 'Vul de naam van de ontvanger in'; end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Dit e-mailadres klopt niet'; end if;
    if public.rate_limit_hit('verklaring-link:' || auth.uid()::text, 50, 3600) then
      raise exception 'Te veel links in korte tijd, probeer het over een uur opnieuw';
    end if;
    v_token := encode(gen_random_bytes(24), 'hex');
  end if;

  v_tarieven := public.overeenkomst_tarieven_schoon(p_tarieven);
  if jsonb_array_length(v_tarieven) = 0 then raise exception 'Vul minimaal een project met een bedrag in'; end if;

  if p_sjabloon is not null then
    select * into v_sj from public.overeenkomst_sjablonen where id = p_sjabloon;
  else
    select * into v_sj from public.overeenkomst_sjablonen order by is_standaard desc, created_at limit 1;
  end if;
  if v_sj.id is null then raise exception 'Sjabloon niet gevonden'; end if;
  v_opdr := jsonb_build_object('naam', v_sj.opdrachtgever_naam, 'plaats', v_sj.opdrachtgever_plaats, 'kvk', v_sj.opdrachtgever_kvk);

  if p_profile is not null then
    update public.overeenkomsten set status = 'ingetrokken', ingetrokken_op = now()
     where profile_id = p_profile and status = 'verstuurd';
  end if;

  insert into public.overeenkomsten (profile_id, ontvanger_naam, ontvanger_email, token, sjabloon_id,
      titel, opdrachtgever, tekst, tarieven, sjabloon_versie, inhoud_hash, verstuurd_door)
  values (p_profile,
      case when p_profile is null then left(trim(p_naam), 120) end,
      case when p_profile is null then v_email end,
      v_token, v_sj.id,
      v_sj.titel, v_opdr, v_sj.tekst, v_tarieven, v_sj.versie,
      public.overeenkomst_hash(v_sj.titel, v_opdr, v_sj.tekst, v_tarieven), auth.uid())
  returning id into v_id;

  if p_profile is not null then
    begin
      insert into public.notifications (profile_id, actor_id, type, title, body)
      values (p_profile, auth.uid(), 'overeenkomst', 'Teken je verklaring',
              'Er staat een verklaring voor je klaar. Lees en teken hem voordat je gaat bellen.');
    exception when others then null;
    end;
  end if;
  return jsonb_build_object('id', v_id, 'token', v_token);
end $function$;
revoke all on function public.overeenkomst_versturen(uuid, jsonb, uuid, text, text) from public, anon;
grant execute on function public.overeenkomst_versturen(uuid, jsonb, uuid, text, text) to authenticated;

-- bedragen aanpassen zolang er nog niet getekend is (zelfde id en link)
create or replace function public.overeenkomst_tarieven_wijzigen(p_id uuid, p_tarieven jsonb)
returns void language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare v public.overeenkomsten; v_t jsonb;
begin
  select * into v from public.overeenkomsten where id = p_id for update;
  if v.id is null or not (public.is_admin() or (v.verstuurd_door = auth.uid() and public.mag_overeenkomsten_versturen())) then
    raise exception 'Niet gevonden of geen rechten';
  end if;
  if v.status <> 'verstuurd' then raise exception 'Alleen een verklaring die nog niet getekend is kun je aanpassen'; end if;
  v_t := public.overeenkomst_tarieven_schoon(p_tarieven);
  if jsonb_array_length(v_t) = 0 then raise exception 'Vul minimaal een project met een bedrag in'; end if;
  update public.overeenkomsten
     set tarieven = v_t, inhoud_hash = public.overeenkomst_hash(v.titel, v.opdrachtgever, v.tekst, v_t)
   where id = p_id;
end $function$;
revoke all on function public.overeenkomst_tarieven_wijzigen(uuid, jsonb) from public, anon;
grant execute on function public.overeenkomst_tarieven_wijzigen(uuid, jsonb) to authenticated;

-- publiek: verklaring openen via link (token = 48 tekens, niet te raden)
create or replace function public.overeenkomst_via_link(p_token text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare v public.overeenkomsten;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  select * into v from public.overeenkomsten where token = p_token;
  if v.id is null then return null; end if;
  if v.status = 'verstuurd' and v.geopend_op is null then
    update public.overeenkomsten set geopend_op = now() where id = v.id;
  end if;
  return jsonb_build_object(
    'titel', v.titel, 'opdrachtgever', v.opdrachtgever, 'tekst', v.tekst, 'tarieven', v.tarieven,
    'status', v.status, 'ontvanger_naam', v.ontvanger_naam, 'akkoord', v.akkoord,
    'ondertekening_id', v.ondertekening_id, 'getekend_op', v.getekend_op, 'verstuurd_op', v.verstuurd_op);
end $function$;
revoke all on function public.overeenkomst_via_link(text) from public;
grant execute on function public.overeenkomst_via_link(text) to anon, authenticated;

-- publiek: tekenen via link
create or replace function public.overeenkomst_tekenen_link(p_token text, p_naam text, p_handelsnaam text, p_kvk text,
  p_akkoord boolean, p_zelfstandig boolean, p_verzekering boolean, p_elektronisch boolean, p_browser text default null)
returns text language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
declare
  v public.overeenkomsten;
  v_kvk text := regexp_replace(coalesce(p_kvk, ''), '\D', '', 'g');
  v_kenmerk text; v_ip text; v_hash text;
begin
  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := null; end;
  if public.rate_limit_hit('verklaring-teken:' || coalesce(nullif(trim(v_ip), ''), 'onbekend'), 30, 600) then
    raise exception 'Te veel pogingen, probeer het over een paar minuten opnieuw';
  end if;

  if p_token is null or length(p_token) < 32 then raise exception 'Verklaring niet gevonden'; end if;
  select * into v from public.overeenkomsten where token = p_token for update;
  if v.id is null then raise exception 'Verklaring niet gevonden'; end if;
  if v.status <> 'verstuurd' then raise exception 'Deze verklaring kan niet meer getekend worden'; end if;
  if length(trim(coalesce(p_naam, ''))) < 3 then raise exception 'naam_ontbreekt'; end if;
  if length(trim(coalesce(p_handelsnaam, ''))) < 2 then raise exception 'handelsnaam_ontbreekt'; end if;
  if length(v_kvk) <> 8 then raise exception 'kvk_ongeldig'; end if;
  if not coalesce(p_akkoord, false) then raise exception 'akkoord_ontbreekt'; end if;
  if not coalesce(p_zelfstandig, false) then raise exception 'zelfstandig_ontbreekt'; end if;
  if not coalesce(p_verzekering, false) then raise exception 'verzekering_ontbreekt'; end if;
  if not coalesce(p_elektronisch, false) then raise exception 'elektronisch_ontbreekt'; end if;

  v_hash := public.overeenkomst_hash(v.titel, v.opdrachtgever, v.tekst, v.tarieven);
  if v_hash <> v.inhoud_hash then raise exception 'De tekst is gewijzigd, vraag een nieuwe verklaring aan'; end if;

  v_kenmerk := 'VERK-' || to_char(now() at time zone 'Europe/Amsterdam', 'YYYY') || '-' || upper(encode(gen_random_bytes(3), 'hex'));

  update public.overeenkomsten set
    status = 'getekend', getekend_op = now(), geopend_op = coalesce(geopend_op, now()),
    ondertekening_id = v_kenmerk,
    akkoord = jsonb_build_object(
      'naam', trim(p_naam), 'handelsnaam', trim(p_handelsnaam), 'kvk', v_kvk,
      'akkoord', true, 'zelfstandig', true, 'verzekering', true, 'elektronisch', true,
      'tijdstip', now(), 'tijdstip_nl', to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI'),
      'ip', nullif(trim(v_ip), ''), 'browser', left(p_browser, 300), 'inhoud_hash', v_hash,
      'methode', 'link', 'email', v.ontvanger_email, 'account', auth.uid())
  where id = v.id;

  if v.verstuurd_door is not null then
    begin
      insert into public.notifications (profile_id, actor_id, type, title, body)
      values (v.verstuurd_door, null, 'overeenkomst', 'Verklaring getekend',
              coalesce(v.ontvanger_naam, trim(p_naam)) || ' heeft de verklaring getekend via de link (' || v_kenmerk || ').');
    exception when others then null;
    end;
  end if;
  return v_kenmerk;
end $function$;
revoke all on function public.overeenkomst_tekenen_link(text, text, text, text, boolean, boolean, boolean, boolean, text) from public;
grant execute on function public.overeenkomst_tekenen_link(text, text, text, text, boolean, boolean, boolean, boolean, text) to anon, authenticated;
