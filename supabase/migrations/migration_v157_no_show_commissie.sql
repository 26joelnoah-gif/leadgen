-- v157 (2026-11-17): BeautyInfo-spec 17-11.
-- 1. afspraak_no_show: bron_afspraak_verwerken() zet de lead terug naar bellen
--    (zelfde als geannuleerd), met eigen notitie en melding.
-- 2. commissie_aangemaakt / commissie_vervallen: het bedrag van de bron voor
--    de setter komt als VOORSTEL op lead_mail_status. De uitbetaling zelf
--    (leads.appointment_commission) zet admin/manager nog steeds met de hand.

alter table public.lead_mail_status
  add column if not exists commissie_setter numeric(10,2),
  add column if not exists commissie_setter_stand text,
  add column if not exists commissie_setter_op timestamptz,
  add column if not exists commissie_setter_naam text;

alter table public.lead_mail_status drop constraint if exists lead_mail_status_commissie_stand_check;
alter table public.lead_mail_status add constraint lead_mail_status_commissie_stand_check
  check (commissie_setter_stand is null or commissie_setter_stand in ('aangemaakt','vervallen'));

alter table public.lead_mail_status drop constraint if exists lead_mail_status_afspraak_status_check;
alter table public.lead_mail_status add constraint lead_mail_status_afspraak_status_check
  check (afspraak_status is null or afspraak_status in ('gepland','verzet','geannuleerd','gehad','no_show'));

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
  if p_status not in ('afspraak_gepland','afspraak_verzet','afspraak_geannuleerd','afspraak_gehad','afspraak_no_show') then
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

  -- v157: no-show (closer meldt: klant kwam niet). Telt als geannuleerd:
  -- lead terug naar bellen. Staat de lead al op deal of iets anders, dan
  -- alleen vastleggen.
  if v_stand = 'no_show' then
    if v_lead.status = 'afspraak_gemaakt'
       and (p_start is null or v_lead.appointment_at is null
            or abs(extract(epoch from (v_lead.appointment_at - p_start))) < 60) then
      update public.leads set
        status = 'later_bellen',
        next_contact_date = now(),
        appointment_at = null,
        notes = coalesce(notes, '') || E'\n[' || to_char(now() at time zone 'Europe/Amsterdam', 'DD-MM-YYYY') || '] '
                || 'No-show: klant kwam niet naar het kennismakingsgesprek van ' || coalesce(v_tijd, '?')
                || coalesce(' met ' || v_closer, '') || ' (' || v_bron || '). Terugbellen.',
        updated_at = now()
      where id = p_lead;
      if v_lead.appointment_by is not null then
        insert into public.notifications (profile_id, actor_id, lead_id, type, title, body)
        values (v_lead.appointment_by, null, p_lead, 'afspraak_bron',
                v_klant || ' kwam niet naar het gesprek',
                'No-show bij ' || coalesce(v_tijd, 'het gesprek') || '. De lead staat weer klaar om te bellen.');
      end if;
      return jsonb_build_object('ok', true, 'no_show', true);
    end if;
    return jsonb_build_object('ok', true, 'no_show', false);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

