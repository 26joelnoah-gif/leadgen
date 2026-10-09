-- v139 (09-10-2026): verklaringen met een percentage van de orderwaarde,
-- ook voor accountmanagers, plus twee sjablonen voor ProSell.
-- 1. Tariefregel kent nu ook sale_procent (0-100, % van de orderwaarde).
-- 2. overeenkomst_sjablonen.ontvanger_rol = label van de ontvanger in de
--    verklaring ("Appointment setter" / "Accountmanager"). Gaat bij versturen
--    mee in overeenkomsten.opdrachtgever->>'ontvanger_rol' (en dus in de hash).
-- 3. overeenkomst_versturen: ook rol accountmanager mag een verklaring krijgen.

alter table public.overeenkomst_sjablonen
  add column if not exists ontvanger_rol text not null default 'Appointment setter';

create or replace function public.overeenkomst_tarieven_schoon(p jsonb)
 returns jsonb language sql immutable set search_path to 'public', 'pg_temp' as $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'project', left(trim(t->>'project'), 120),
           'afspraak', case when nullif(t->>'afspraak', '') is null then null else greatest(0, (t->>'afspraak')::numeric) end,
           'sale', case when nullif(t->>'sale', '') is null then null else greatest(0, (t->>'sale')::numeric) end,
           'sale_procent', case when nullif(t->>'sale_procent', '') is null then null else least(100, greatest(0, (t->>'sale_procent')::numeric)) end)), '[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end) t
   where nullif(trim(t->>'project'), '') is not null;
$function$;

create or replace function public.overeenkomst_versturen(p_profile uuid, p_tarieven jsonb, p_sjabloon uuid default null::uuid, p_naam text default null::text, p_email text default null::text)
 returns jsonb language plpgsql security definer set search_path to 'public', 'extensions', 'pg_temp' as $function$
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
    if v_doel.role not in ('employee', 'backoffice', 'accountmanager') then
      raise exception 'Een verklaring kan alleen naar een beller, backoffice of accountmanager';
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
  v_opdr := jsonb_build_object('naam', v_sj.opdrachtgever_naam, 'plaats', v_sj.opdrachtgever_plaats, 'kvk', v_sj.opdrachtgever_kvk,
                               'ontvanger_rol', coalesce(nullif(trim(v_sj.ontvanger_rol), ''), 'Appointment setter'));

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
              'Er staat een verklaring voor je klaar. Lees en teken hem voordat je verder gaat.');
    exception when others then null;
    end;
  end if;
  return jsonb_build_object('id', v_id, 'token', v_token);
end $function$;

-- Twee sjablonen voor ProSell (alleen als ze er nog niet zijn)
insert into public.overeenkomst_sjablonen (naam, titel, ontvanger_rol, opdrachtgever_naam, opdrachtgever_plaats, opdrachtgever_kvk, tarieven, tekst, is_standaard)
select 'ProSell setter', 'Verklaring zelfstandig appointment setter', 'Appointment setter',
       s.opdrachtgever_naam, s.opdrachtgever_plaats, s.opdrachtgever_kvk,
       '[{"project":"PROSELL","afspraak":null,"sale":null,"sale_procent":10}]'::jsonb,
$t$## 1. Wat je doet
Je belt zelfstandig bedrijven voor ProSell, via ReachConnect. Je plant afspraken in voor de accountmanagers.

## 2. Wat je verdient
Je krijgt een percentage van de orderwaarde als een afspraak die jij hebt ingepland een netto order wordt:
{{tarieven}}
- De orderwaarde is het totaalbedrag van de getekende offerte, zonder btw.
- Staan er maandbedragen in de offerte, dan telt het bedrag over de looptijd die in de offerte staat.
- Een order is netto als de klant niet heeft geannuleerd. Heeft de klant bedenktijd, dan is de order pas netto als die bedenktijd voorbij is. Pas dan mag je hem factureren.
- Een afspraak die geen order wordt, levert niets op.
Wat je verdiend hebt, zie je in ReachConnect onder "Mijn afspraken".

## 3. Factureren en betalen
Je stuurt ons zelf een factuur. Wij betalen uiterlijk 30 dagen nadat we je factuur ontvangen hebben. Je bent zelf verantwoordelijk voor btw, inkomstenbelasting en premies.

## 4. Je werkt zelfstandig
- Je hebt een eigen onderneming, ingeschreven bij de KvK.
- Je bepaalt zelf wanneer, waar en hoeveel je werkt. Je roostert jezelf in.
- Je gebruikt je eigen spullen, zoals laptop, telefoon, headset en internet.
- De kosten van bellen en je andere kosten zijn voor jou.
- Je mag ook voor andere opdrachtgevers werken.
- Wij geven uitleg over de diensten en de regels van onze klanten. Hoe je je werk inricht, bepaal je zelf.

## 5. Verzekering
Je verklaart dat je een bedrijfsaansprakelijkheidsverzekering hebt. Arbeidsongeschiktheid en pensioen regel je zelf.

## 6. Geheimhouding en privacy
- Je gebruikt de gegevens van leads alleen voor dit werk.
- Je kopieert of bewaart ze niet buiten ReachConnect.
- Je houdt je aan de belregels. Zegt iemand "bel me niet meer", dan boek je af op Blacklist.

## 7. Klanten blijven van ons
Je benadert leads en klanten uit ReachConnect niet buiten ons om. Dat geldt ook tot 12 maanden nadat je gestopt bent.

## 8. Stoppen
Allebei kunnen we per direct stoppen. Wat je tot dan verdiend hebt en netto is, betalen we gewoon uit.

## 9. Welk recht geldt
Op deze overeenkomst is Nederlands recht van toepassing.$t$, false
from public.overeenkomst_sjablonen s
where s.is_standaard and not exists (select 1 from public.overeenkomst_sjablonen where naam = 'ProSell setter');

insert into public.overeenkomst_sjablonen (naam, titel, ontvanger_rol, opdrachtgever_naam, opdrachtgever_plaats, opdrachtgever_kvk, tarieven, tekst, is_standaard)
select 'ProSell accountmanager', 'Verklaring zelfstandig accountmanager', 'Accountmanager',
       s.opdrachtgever_naam, s.opdrachtgever_plaats, s.opdrachtgever_kvk,
       '[{"project":"PROSELL","afspraak":null,"sale":null,"sale_procent":20}]'::jsonb,
$t$## 1. Wat je doet
Je voert zelfstandig afspraken met bedrijven voor ProSell. Je legt de diensten uit, maakt offertes en sluit orders. Je afspraken staan in ReachConnect in je agenda.

## 2. Wat je verdient
Je krijgt een percentage van de orderwaarde van elke netto order die jij sluit:
{{tarieven}}
- De orderwaarde is het totaalbedrag van de getekende offerte, zonder btw.
- Staan er maandbedragen in de offerte, dan telt het bedrag over de looptijd die in de offerte staat.
- Een order is netto als de klant niet heeft geannuleerd. Heeft de klant bedenktijd, dan is de order pas netto als die bedenktijd voorbij is. Pas dan mag je hem factureren.
- Een afspraak die geen order wordt, levert niets op.

## 3. Factureren en betalen
Je stuurt ons zelf een factuur. Wij betalen uiterlijk 30 dagen nadat we je factuur ontvangen hebben. Je bent zelf verantwoordelijk voor btw, inkomstenbelasting en premies.

## 4. Je werkt zelfstandig
- Je hebt een eigen onderneming, ingeschreven bij de KvK.
- Je bepaalt zelf wanneer je beschikbaar bent. Tijden die je niet kunt, blokkeer je zelf in je agenda.
- Je gebruikt je eigen spullen, zoals laptop, telefoon en vervoer.
- Reiskosten en je andere kosten zijn voor jou.
- Je mag ook voor andere opdrachtgevers werken.
- Wij geven uitleg over de diensten, de prijzen en de regels van onze klanten. Hoe je je gesprekken voert, bepaal je zelf.

## 5. Verzekering
Je verklaart dat je een bedrijfsaansprakelijkheidsverzekering hebt. Arbeidsongeschiktheid en pensioen regel je zelf.

## 6. Geheimhouding en privacy
- Je gebruikt de gegevens van leads en klanten alleen voor dit werk.
- Je kopieert of bewaart ze niet buiten ReachConnect.
- Zegt iemand dat hij geen contact meer wil, dan geef je dat door in ReachConnect.

## 7. Klanten blijven van ons
Je benadert leads en klanten uit ReachConnect niet buiten ons om. Dat geldt ook tot 12 maanden nadat je gestopt bent.

## 8. Stoppen
Allebei kunnen we per direct stoppen. Wat je tot dan verdiend hebt en netto is, betalen we gewoon uit.

## 9. Welk recht geldt
Op deze overeenkomst is Nederlands recht van toepassing.$t$, false
from public.overeenkomst_sjablonen s
where s.is_standaard and not exists (select 1 from public.overeenkomst_sjablonen where naam = 'ProSell accountmanager');
