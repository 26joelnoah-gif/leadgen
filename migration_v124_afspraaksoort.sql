-- ReachConnect v124 (2026-10-05): soort afspraak - Shoot (2,5 uur) of Bezoek (1 uur).
-- Tot nu toe was elke afspraak een shoot met een vaste duur in de app
-- (src/lib/appointmentConfig.js). Nu kiest de beller bij "Afspraak gemaakt"
-- welke soort het is; de duur per soort staat in de app en in de Edge Function
-- google-agenda-push, niet in de database.

alter table public.leads add column if not exists appointment_type text;
alter table public.leads drop constraint if exists leads_appointment_type_check;
alter table public.leads add constraint leads_appointment_type_check
  check (appointment_type is null or appointment_type in ('shoot','bezoek'));
comment on column public.leads.appointment_type is
  'v124: soort afspraak (shoot = 2,5 uur, bezoek = 1 uur). Leeg = shoot (afspraken van voor v124).';

-- Google Agenda (v114): ook bij een andere soort het event bijwerken (eindtijd + titel).
-- Functie-update (05-10) IS toegepast. De trigger-herdefinitie hieronder NIET:
-- 'drop trigger' op leads bleef via de MCP-koppeling hangen (lock). Zelf draaien
-- in de SQL-editor van Supabase (op een rustig moment). Tot die tijd werkt het
-- toch: elke plek die appointment_type schrijft, schrijft appointment_at mee,
-- en daar luistert de trigger al op.
create or replace function public.leads_google_agenda_kick()
returns trigger language plpgsql security definer set search_path = public, extensions, vault as $$
declare lijst uuid;
begin
  lijst := new.lead_list_id;
  if not public.lead_is_afspraak_project(lijst) then return null; end if;
  if tg_op = 'UPDATE'
     and new.appointment_at is not distinct from old.appointment_at
     and new.appointment_type is not distinct from old.appointment_type
     and new.assigned_to is not distinct from old.assigned_to
     and new.status is not distinct from old.status
     and new.deleted_at is not distinct from old.deleted_at
     and new.appointment_outcome is not distinct from old.appointment_outcome
     and new.name is not distinct from old.name
     and new.contact_person is not distinct from old.contact_person
     and new.phone is not distinct from old.phone
     and new.address is not distinct from old.address
     and new.house_number is not distinct from old.house_number
     and new.postal_code is not distinct from old.postal_code
     and new.city is not distinct from old.city then
    return null;
  end if;
  if new.appointment_at is null
     and not exists (select 1 from public.google_agenda_events where lead_id = new.id) then
    return null;
  end if;
  perform public.google_agenda_push(new.id);
  return null;
end $$;

drop trigger if exists tr_leads_google_agenda on public.leads;
create trigger tr_leads_google_agenda
after insert or update of appointment_at, appointment_type, assigned_to, status, deleted_at,
  appointment_outcome, name, contact_person, phone, address, house_number, postal_code, city
on public.leads for each row execute function public.leads_google_agenda_kick();
