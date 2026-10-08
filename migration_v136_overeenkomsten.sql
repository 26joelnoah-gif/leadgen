-- v136 (08-10-2026): verklaring zelfstandig appointment setter.
-- Een admin (of een medewerker met het vinkje "Overeenkomsten versturen")
-- stuurt een beller handmatig een verklaring met tarieven per project. De
-- beller tekent in de app; zolang er een open verklaring staat kan hij niet
-- bellen (scherm OvereenkomstGate). Ondertekenen loopt via een RPC die het
-- bewijs vastlegt: naam, handelsnaam, KvK, vinkjes, tijd, ip, browser en een
-- hash van de tekst zoals hij getekend is.
-- Uitvoeren in losse stappen: profiles wordt continu gelezen, daarom
-- lock_timeout bij de stappen die profiles raken.

-- 1. Recht op het profiel ------------------------------------------------
set lock_timeout = '5s';
alter table public.profiles add column if not exists can_send_overeenkomsten boolean not null default false;
reset lock_timeout;

-- 2. Guard: rechten mag alleen een admin zetten (nu ook can_create_users,
--    dat ontbrak sinds v107, en het nieuwe can_send_overeenkomsten).
create or replace function public.guard_profile_privileges()
 returns trigger language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then return new; end if;
  if public.leadgen_systeem() then return new; end if;

  if (new.role is distinct from old.role
      or new.organization_id is distinct from old.organization_id)
     and not public.is_admin() then
    if not (new.role = old.role and old.organization_id is null) then
      raise exception 'Geen rechten om role of organization_id te wijzigen';
    end if;
  end if;

  if not public.is_admin() and (
    new.can_manage_leads IS DISTINCT FROM old.can_manage_leads or
    new.can_view_rates   IS DISTINCT FROM old.can_view_rates or
    new.can_manage_team  IS DISTINCT FROM old.can_manage_team or
    new.can_export_data  IS DISTINCT FROM old.can_export_data or
    new.can_edit_flows   IS DISTINCT FROM old.can_edit_flows or
    new.kpi_only         IS DISTINCT FROM old.kpi_only or
    new.can_manage_queue IS DISTINCT FROM old.can_manage_queue or
    new.is_active        IS DISTINCT FROM old.is_active or
    new.can_create_users IS DISTINCT FROM old.can_create_users or
    new.can_send_overeenkomsten IS DISTINCT FROM old.can_send_overeenkomsten
  ) then
    raise exception 'Geen rechten om rechten-instellingen te wijzigen';
  end if;

  return new;
end
$function$;

-- 3. Helper: mag de ingelogde gebruiker verklaringen versturen? -----------
create or replace function public.mag_overeenkomsten_versturen()
 returns boolean language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $$
  select coalesce(public.is_admin(), false) or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.can_send_overeenkomsten = true
      and coalesce(p.is_active, true) and p.deleted_at is null
  );
$$;

-- 4. Sjabloon (een rij) ----------------------------------------------------
create table if not exists public.overeenkomst_sjabloon (
  id int primary key default 1 check (id = 1),
  titel text not null default 'Verklaring zelfstandig appointment setter',
  opdrachtgever_naam text not null default 'ReachConnect',
  opdrachtgever_plaats text default 'Arnhem',
  opdrachtgever_kvk text,
  tekst text not null,
  versie int not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.overeenkomst_sjabloon enable row level security;

create or replace function public.overeenkomst_sjabloon_versie()
 returns trigger language plpgsql as $$
begin
  if new.tekst is distinct from old.tekst or new.titel is distinct from old.titel
     or new.opdrachtgever_naam is distinct from old.opdrachtgever_naam
     or new.opdrachtgever_plaats is distinct from old.opdrachtgever_plaats
     or new.opdrachtgever_kvk is distinct from old.opdrachtgever_kvk then
    new.versie := old.versie + 1;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists tr_overeenkomst_sjabloon_versie on public.overeenkomst_sjabloon;
create trigger tr_overeenkomst_sjabloon_versie before update on public.overeenkomst_sjabloon
  for each row execute function public.overeenkomst_sjabloon_versie();

drop policy if exists overeenkomst_sjabloon_select on public.overeenkomst_sjabloon;
create policy overeenkomst_sjabloon_select on public.overeenkomst_sjabloon for select to authenticated
  using ((select public.mag_overeenkomsten_versturen()));
drop policy if exists overeenkomst_sjabloon_update on public.overeenkomst_sjabloon;
create policy overeenkomst_sjabloon_update on public.overeenkomst_sjabloon for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 5. Verstuurde verklaringen ------------------------------------------------
create table if not exists public.overeenkomsten (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  titel text not null,
  opdrachtgever jsonb not null,
  tekst text not null,
  tarieven jsonb not null default '[]'::jsonb,
  sjabloon_versie int,
  inhoud_hash text not null,
  status text not null default 'verstuurd' check (status in ('verstuurd', 'getekend', 'ingetrokken')),
  verstuurd_door uuid,
  verstuurd_op timestamptz not null default now(),
  geopend_op timestamptz,
  getekend_op timestamptz,
  ingetrokken_op timestamptz,
  ondertekening_id text unique,
  akkoord jsonb
);
create index if not exists overeenkomsten_profile_status on public.overeenkomsten (profile_id, status);
alter table public.overeenkomsten enable row level security;

-- FK naar profiles apart en NOT VALID (lege tabel, korte lock).
set lock_timeout = '5s';
alter table public.overeenkomsten drop constraint if exists overeenkomsten_profile_fk;
alter table public.overeenkomsten add constraint overeenkomsten_profile_fk
  foreign key (profile_id) references public.profiles(id) on delete cascade not valid;
reset lock_timeout;
alter table public.overeenkomsten validate constraint overeenkomsten_profile_fk;

-- Lezen: admin alles, de beller zijn eigen, een verstuurder wat hij verstuurde.
drop policy if exists overeenkomsten_select on public.overeenkomsten;
create policy overeenkomsten_select on public.overeenkomsten for select to authenticated
  using (
    (select public.is_admin())
    or profile_id = (select auth.uid())
    or (verstuurd_door = (select auth.uid()) and (select public.mag_overeenkomsten_versturen()))
  );
-- Schrijven alleen via de RPC's hieronder; verwijderen alleen admin.
drop policy if exists overeenkomsten_delete on public.overeenkomsten;
create policy overeenkomsten_delete on public.overeenkomsten for delete to authenticated
  using ((select public.is_admin()));

-- 6. RPC's ------------------------------------------------------------------
-- Versturen: maakt een vaste kopie van het sjabloon met de tarieven erin.
-- Een eerdere open verklaring van dezelfde beller wordt ingetrokken.
create or replace function public.overeenkomst_versturen(p_profile uuid, p_tarieven jsonb)
 returns uuid language plpgsql security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v_doel public.profiles;
  v_ik public.profiles;
  v_sj public.overeenkomst_sjabloon;
  v_id uuid;
  v_tarieven jsonb;
  v_opdr jsonb;
begin
  if auth.uid() is null or not public.mag_overeenkomsten_versturen() then
    raise exception 'Je mag geen verklaringen versturen';
  end if;
  if p_profile = auth.uid() then raise exception 'Je kunt jezelf geen verklaring sturen'; end if;

  select * into v_ik from public.profiles where id = auth.uid();
  select * into v_doel from public.profiles where id = p_profile and deleted_at is null;
  if v_doel.id is null then raise exception 'Medewerker niet gevonden'; end if;
  if v_doel.role not in ('employee', 'backoffice') then
    raise exception 'Een verklaring kan alleen naar een beller of backoffice';
  end if;
  if not public.is_admin() and v_ik.organization_id is not null
     and v_doel.organization_id is distinct from v_ik.organization_id then
    raise exception 'Deze medewerker valt niet onder jouw organisatie';
  end if;

  -- tarieven opschonen: alleen project/afspraak/sale, bedragen >= 0
  select coalesce(jsonb_agg(jsonb_build_object(
           'project', left(trim(t->>'project'), 120),
           'afspraak', case when nullif(t->>'afspraak', '') is null then null else greatest(0, (t->>'afspraak')::numeric) end,
           'sale', case when nullif(t->>'sale', '') is null then null else greatest(0, (t->>'sale')::numeric) end)), '[]'::jsonb)
    into v_tarieven
    from jsonb_array_elements(coalesce(p_tarieven, '[]'::jsonb)) t
   where nullif(trim(t->>'project'), '') is not null;
  if jsonb_array_length(v_tarieven) = 0 then raise exception 'Vul minimaal een project met een bedrag in'; end if;

  select * into v_sj from public.overeenkomst_sjabloon where id = 1;
  if v_sj.id is null then raise exception 'Er is nog geen sjabloon'; end if;
  v_opdr := jsonb_build_object('naam', v_sj.opdrachtgever_naam, 'plaats', v_sj.opdrachtgever_plaats, 'kvk', v_sj.opdrachtgever_kvk);

  update public.overeenkomsten set status = 'ingetrokken', ingetrokken_op = now()
   where profile_id = p_profile and status = 'verstuurd';

  insert into public.overeenkomsten (profile_id, titel, opdrachtgever, tekst, tarieven, sjabloon_versie, inhoud_hash, verstuurd_door)
  values (p_profile, v_sj.titel, v_opdr, v_sj.tekst, v_tarieven, v_sj.versie,
          encode(digest(v_sj.titel || '|' || v_opdr::text || '|' || v_sj.tekst || '|' || v_tarieven::text, 'sha256'), 'hex'),
          auth.uid())
  returning id into v_id;

  -- Melding in eigen blok: gaat die mis, dan blijft de verklaring gewoon staan.
  begin
    insert into public.notifications (profile_id, actor_id, type, title, body)
    values (p_profile, auth.uid(), 'overeenkomst', 'Teken je verklaring',
            'Er staat een verklaring voor je klaar. Lees en teken hem voordat je gaat bellen.');
  exception when others then null;
  end;
  return v_id;
end $$;

create or replace function public.overeenkomst_intrekken(p_id uuid)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
begin
  update public.overeenkomsten set status = 'ingetrokken', ingetrokken_op = now()
   where id = p_id and status = 'verstuurd'
     and (public.is_admin() or (verstuurd_door = auth.uid() and public.mag_overeenkomsten_versturen()));
  if not found then raise exception 'Niet gevonden, al getekend, of geen rechten'; end if;
end $$;

create or replace function public.overeenkomst_geopend(p_id uuid)
 returns void language sql security definer
 set search_path to 'public', 'pg_temp'
as $$
  update public.overeenkomsten set geopend_op = now()
   where id = p_id and profile_id = auth.uid() and geopend_op is null and status = 'verstuurd';
$$;

create or replace function public.overeenkomst_tekenen(
  p_id uuid, p_naam text, p_handelsnaam text, p_kvk text,
  p_akkoord boolean, p_zelfstandig boolean, p_verzekering boolean, p_elektronisch boolean,
  p_browser text default null)
 returns text language plpgsql security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $$
declare
  v public.overeenkomsten;
  v_kvk text := regexp_replace(coalesce(p_kvk, ''), '\D', '', 'g');
  v_kenmerk text;
  v_ip text;
  v_hash text;
begin
  select * into v from public.overeenkomsten where id = p_id for update;
  if v.id is null or v.profile_id is distinct from auth.uid() then raise exception 'Verklaring niet gevonden'; end if;
  if v.status <> 'verstuurd' then raise exception 'Deze verklaring kan niet meer getekend worden'; end if;
  if length(trim(coalesce(p_naam, ''))) < 3 then raise exception 'naam_ontbreekt'; end if;
  if length(trim(coalesce(p_handelsnaam, ''))) < 2 then raise exception 'handelsnaam_ontbreekt'; end if;
  if length(v_kvk) <> 8 then raise exception 'kvk_ongeldig'; end if;
  if not coalesce(p_akkoord, false) then raise exception 'akkoord_ontbreekt'; end if;
  if not coalesce(p_zelfstandig, false) then raise exception 'zelfstandig_ontbreekt'; end if;
  if not coalesce(p_verzekering, false) then raise exception 'verzekering_ontbreekt'; end if;
  if not coalesce(p_elektronisch, false) then raise exception 'elektronisch_ontbreekt'; end if;

  v_hash := encode(digest(v.titel || '|' || v.opdrachtgever::text || '|' || v.tekst || '|' || v.tarieven::text, 'sha256'), 'hex');
  if v_hash <> v.inhoud_hash then raise exception 'De tekst is gewijzigd, vraag een nieuwe verklaring aan'; end if;

  begin
    v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := null; end;

  v_kenmerk := 'VERK-' || to_char(now() at time zone 'Europe/Amsterdam', 'YYYY') || '-' || upper(encode(gen_random_bytes(3), 'hex'));

  update public.overeenkomsten set
    status = 'getekend', getekend_op = now(), geopend_op = coalesce(geopend_op, now()),
    ondertekening_id = v_kenmerk,
    akkoord = jsonb_build_object(
      'naam', trim(p_naam), 'handelsnaam', trim(p_handelsnaam), 'kvk', v_kvk,
      'akkoord', true, 'zelfstandig', true, 'verzekering', true, 'elektronisch', true,
      'tijdstip', now(), 'tijdstip_nl', to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI'),
      'ip', nullif(trim(v_ip), ''), 'browser', left(p_browser, 300), 'inhoud_hash', v_hash,
      'methode', 'in_app', 'account', auth.uid())
  where id = p_id;
  return v_kenmerk;
end $$;

revoke all on function public.mag_overeenkomsten_versturen() from public, anon;
revoke all on function public.overeenkomst_versturen(uuid, jsonb) from public, anon;
revoke all on function public.overeenkomst_intrekken(uuid) from public, anon;
revoke all on function public.overeenkomst_geopend(uuid) from public, anon;
revoke all on function public.overeenkomst_tekenen(uuid, text, text, text, boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.mag_overeenkomsten_versturen() to authenticated;
grant execute on function public.overeenkomst_versturen(uuid, jsonb) to authenticated;
grant execute on function public.overeenkomst_intrekken(uuid) to authenticated;
grant execute on function public.overeenkomst_geopend(uuid) to authenticated;
grant execute on function public.overeenkomst_tekenen(uuid, text, text, text, boolean, boolean, boolean, boolean, text) to authenticated;

alter publication supabase_realtime add table public.overeenkomsten;

-- 7. Eerste versie van de tekst (goedgekeurd door Noah 06/08-10-2026).
--    Opmaak: "## " = kopje, "- " = opsomming, {{tarieven}} = tabel met bedragen.
insert into public.overeenkomst_sjabloon (id, tekst) values (1, $tekst$## 1. Wat je doet
Je belt zelfstandig bedrijven voor de projecten die wij je via ReachConnect geven. Je maakt afspraken en sluit deals.

## 2. Wat je verdient
Je krijgt een vast bedrag per netto sale of per afspraak:
{{tarieven}}
Een sale of afspraak is netto als de klant niet heeft geannuleerd. Heeft de klant bedenktijd, bijvoorbeeld 14 dagen, dan is hij pas netto als die bedenktijd voorbij is en de klant niet heeft geannuleerd. Pas dan mag je hem factureren. Annuleert de klant binnen de bedenktijd, dan krijg je er niets voor.
Wat je verdiend hebt, zie je in ReachConnect onder "Mijn afspraken".

## 3. Factureren en betalen
Je stuurt ons zelf een factuur. Wij betalen uiterlijk 30 dagen nadat we je factuur ontvangen hebben. Je bent zelf verantwoordelijk voor btw, inkomstenbelasting en premies.

## 4. Je werkt zelfstandig
- Je hebt een eigen onderneming, ingeschreven bij de KvK.
- Je bepaalt zelf wanneer, waar en hoeveel je werkt. Je roostert jezelf in.
- Je gebruikt je eigen spullen, zoals laptop, telefoon, headset en internet.
- De kosten van bellen en je andere kosten zijn voor jou.
- Je mag ook voor andere opdrachtgevers werken.
- Wij geven uitleg over de producten en de regels van onze klanten. Hoe je je werk inricht, bepaal je zelf.

## 5. Verzekering
Je verklaart dat je een bedrijfsaansprakelijkheidsverzekering hebt. Arbeidsongeschiktheid en pensioen regel je zelf.

## 6. Geheimhouding en privacy
- Je gebruikt de gegevens van leads alleen voor dit werk.
- Je kopieert of bewaart ze niet buiten ReachConnect.
- Je houdt je aan de belregels. Zegt iemand "bel me niet meer", dan boek je af op Blacklist.

## 7. Klanten blijven van ons
Je benadert leads en klanten uit ReachConnect niet buiten ons om. Dat geldt ook tot 12 maanden nadat je gestopt bent.

## 8. Stoppen
Allebei kunnen we per direct stoppen. Wat je tot dan verdiend hebt en netto is, betalen we gewoon uit.$tekst$)
on conflict (id) do nothing;
