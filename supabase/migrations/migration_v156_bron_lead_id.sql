-- v156 (2026-11-09): koppeling BeautyInfo volgens hun spec van 09-11.
--
-- 1. leads.bron_lead_id: het vaste ID van de bron (BeautyInfo: "bi-<uuid>"
--    uit de kolom lead_id van hun export). Gaat ongewijzigd mee in /mail,
--    /stop en /afspraken. Leeg = we sturen onze eigen lead-uuid, zoals
--    voorheen. Statusupdates met een bi-ID vindt mailstatus via deze kolom
--    terug. leads.bron_profiel = de kolom "Profiel op BeautyInfo" (link).
-- 2. mail_geblokkeerd(): na een spam_melding van de bron niet meer mailen.
-- 3. bron_afspraak_verwerken():
--    - annuleert de beller zelf (p_beller gevuld), dan geen melding aan hem;
--    - een kennismakingsgesprek telt per lead + beller maar 1x in call_logs,
--      ook als het geannuleerd en opnieuw ingepland wordt (verzetten =
--      annuleren + opnieuw boeken).
--
-- Uitvoeren met een korte lock_timeout: leads wordt continu gelezen.

set lock_timeout = '5s';

alter table public.leads
  add column if not exists bron_lead_id text,
  add column if not exists bron_profiel text;

alter table public.leads drop constraint if exists leads_bron_lead_id_check;
alter table public.leads add constraint leads_bron_lead_id_check
  check (bron_lead_id is null or bron_lead_id ~ '^[A-Za-z0-9._:-]{1,100}$');

alter table public.leads drop constraint if exists leads_bron_profiel_check;
alter table public.leads add constraint leads_bron_profiel_check
  check (bron_profiel is null or (bron_profiel ~* '^https://[^\s]+$' and length(bron_profiel) <= 500));

reset lock_timeout;

create index if not exists leads_bron_lead_id_idx
  on public.leads (bron_lead_id) where bron_lead_id is not null;

-- 2. Spam-melding = niet meer mailen, alleen bellen.
create or replace function public.mail_geblokkeerd(p_lead_id uuid, p_email text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
    when exists (select 1 from public.lead_mail_events e where e.lead_id = l.id and e.status = 'spam_melding')
      then 'De klant heeft de mail als spam gemeld. Niet meer mailen, alleen bellen.'
  end
  from public.leads l where l.id = p_lead_id
$function$;

-- 3. Afspraken van de bron verwerken (v154, aangepast).
create or replace function public.bron_afspraak_verwerken(
  p_lead uuid, p_source text, p_status text, p_op timestamptz,
  p_start timestamptz, p_eind timestamptz, p_closer text, p_meet text,
  p_door text, p_beller uuid default null, p_notitie text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_lead public.leads%rowtype;
  v_oud timestamptz;
  v_stand text;
  v_beller uuid;
  v_meet text := case when p_meet ~* '^https://[^\s]+$' and length(p_meet) <= 500 then p_meet else null end;
  v_closer text := nullif(left(coalesce(p_closer, ''), 80), '');
  v_tijd text;
  v_regel text;
  v_bron text := case p_source when 'BEAUTYINFO' then 'BeautyInfo' when 'MARKETINGKIEZER' then 'MarketingKiezer' else initcap(lower(p_source)) end;
  v_klant text;
  v_al_geteld boolean;
begin
  if p_status not in ('afspraak_gepland','afspraak_verzet','afspraak_geannuleerd','afspraak_gehad') then
    return jsonb_build_object('genegeerd', 'onbekende afspraakstatus');
  end if;
  v_stand := substr(p_status, 10);

  select * into v_lead from public.leads where id = p_lead for update;
  if not found or v_lead.deleted_at is not null then
    return jsonb_build_object('genegeerd', 'lead onbekend');
  end if;
  v_klant := coalesce(v_lead.name, 'Lead');

  select max(afspraak_op) into v_oud from public.lead_mail_status
   where lead_id = p_lead and source = p_source;
  if p_beller is null and v_oud is not null and p_op < v_oud then
    return jsonb_build_object('oud', true);
  end if;

  update public.lead_mail_status set
    afspraak_status = v_stand,
    afspraak_start = coalesce(p_start, afspraak_start),
    afspraak_eind = coalesce(p_eind, afspraak_eind),
    afspraak_closer = coalesce(v_closer, afspraak_closer),
    afspraak_meet_url = coalesce(v_meet, afspraak_meet_url),
    afspraak_door = coalesce(nullif(p_door, ''), afspraak_door),
    afspraak_op = case when p_beller is null then p_op else afspraak_op end,
    updated_at = now()
  where lead_id = p_lead and source = p_source;

  v_tijd := to_char(p_start at time zone 'Europe/Amsterdam', 'DD-MM-YYYY HH24:MI');

  if v_stand in ('gepland','verzet') and p_start is not null then
    if v_lead.status = 'afspraak_gemaakt' then
      update public.leads set
        appointment_at = p_start,
        appointment_meet_link = coalesce(v_meet, appointment_meet_link),
        appointment_by = coalesce(appointment_by, p_beller),
        updated_at = now()
      where id = p_lead;
      if v_stand = 'verzet' and v_lead.appointment_by is not null
         and v_lead.appointment_at is distinct from p_start then
        insert into public.notifications (profile_id, actor_id, lead_id, type, title, body)
        values (v_lead.appointment_by, null, p_lead, 'afspraak_bron',
                'Gesprek met ' || v_klant || ' is verzet',
                'Nieuwe tijd: ' || v_tijd || coalesce(' met ' || v_closer, '') || '.');
      end if;
      return jsonb_build_object('ok', true, 'bijgewerkt', true);
    end if;

    v_beller := p_beller;
    if v_beller is null then
      select agent_id into v_beller from public.mailservice_logs
       where lead_id = p_lead and ok is true and agent_id is not null
       order by created_at desc limit 1;
    end if;

    v_regel := 'Kennismakingsgesprek ' || v_tijd || coalesce(' met ' || v_closer, '')
      || ' ingepland via ' || v_bron
      || case when p_beller is not null then ' (door beller)'
              when p_door = 'klant' then ' (klant plande zelf na de mail)'
              else '' end
      || coalesce('. ' || nullif(trim(p_notitie), ''), '');

    update public.leads set
      status = 'afspraak_gemaakt',
      appointment_at = p_start,
      appointment_type = 'videocall',
      appointment_meet_link = coalesce(v_meet, appointment_meet_link),
      appointment_by = v_beller,
      next_contact_date = null,
      locked_by = null, locked_at = null,
      call_status = 'available',
      overgenomen_van = null, overgenomen_op = null,
      notes = coalesce(notes, '') || E'\n[' || to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM-YYYY') || '] ' || v_regel,
      updated_at = now()
    where id = p_lead;

    if v_beller is not null then
      -- v156: verzetten = annuleren + opnieuw boeken. Telt maar 1x per lead + beller.
      select exists (select 1 from public.call_logs
                      where lead_id = p_lead and agent_id = v_beller
                        and source = 'bron_afspraak' and disposition = 'afspraak_gemaakt')
        into v_al_geteld;
      if not v_al_geteld then
        insert into public.call_logs (organization_id, agent_id, lead_id, lead_list_id, disposition,
                                      started_at, disposed_at, duration_seconds, notes, source)
        values (v_lead.organization_id, v_beller, p_lead, v_lead.lead_list_id, 'afspraak_gemaakt',
                now(), now(), 0, v_regel, 'bron_afspraak');
      end if;
      if p_beller is null then
        insert into public.notifications (profile_id, actor_id, lead_id, type, title, body)
        values (v_beller, null, p_lead, 'afspraak_bron',
                v_klant || ' heeft zelf een gesprek ingepland',
                v_tijd || coalesce(' met ' || v_closer, '') || '. Telt als jouw afspraak (na jouw mail).');
      end if;
    end if;
    return jsonb_build_object('ok', true, 'afspraak', true, 'beller', v_beller, 'al_geteld', coalesce(v_al_geteld, false));
  end if;

  if v_stand = 'geannuleerd' then
    if v_lead.status = 'afspraak_gemaakt'
       and (p_start is null or v_lead.appointment_at is null
            or abs(extract(epoch from (v_lead.appointment_at - p_start))) < 60) then
      update public.leads set
        status = 'later_bellen',
        next_contact_date = now(),
        appointment_at = null,
        notes = coalesce(notes, '') || E'\n[' || to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM-YYYY') || '] '
                || 'Kennismakingsgesprek van ' || coalesce(v_tijd, '?') || ' geannuleerd'
                || case when p_beller is not null then ' door de beller' else ' via ' || v_bron end
                || coalesce(': ' || nullif(trim(p_notitie), ''), '') || '. Terugbellen.',
        updated_at = now()
      where id = p_lead;
      -- v156: annuleert de beller zelf, dan hoeft hij geen melding.
      if v_lead.appointment_by is not null and v_lead.appointment_by is distinct from p_beller then
        insert into public.notifications (profile_id, actor_id, lead_id, type, title, body)
        values (v_lead.appointment_by, null, p_lead, 'afspraak_bron',
                'Gesprek met ' || v_klant || ' is geannuleerd',
                'Was ' || coalesce(v_tijd, 'gepland') || '. De lead staat weer klaar om te bellen.');
      end if;
      return jsonb_build_object('ok', true, 'geannuleerd', true);
    end if;
    return jsonb_build_object('ok', true, 'geannuleerd', false);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.bron_afspraak_verwerken(uuid, text, text, timestamptz, timestamptz, timestamptz, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.bron_afspraak_verwerken(uuid, text, text, timestamptz, timestamptz, timestamptz, text, text, text, uuid, text) to service_role;
