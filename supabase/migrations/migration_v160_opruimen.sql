-- v160 (2026-11-22): openstaande klusjes, TOEGEPAST via de MCP-tool.
-- 1. v124: trigger tr_leads_google_agenda luistert nu ook op appointment_type
--    en appointment_meet_link (stond nog open sinds v124/v152).
-- 2. v134: oude RPC google_agenda_status() weg (frontend gebruikt _v2).
-- 3. v148: kolom-default profiles.ui_design = 'v2'.
set lock_timeout = '4s';
drop trigger if exists tr_leads_google_agenda on public.leads;
create trigger tr_leads_google_agenda
after insert or update of appointment_at, appointment_type, appointment_meet_link, assigned_to, status, deleted_at,
  appointment_outcome, name, contact_person, phone, address, house_number, postal_code, city
on public.leads for each row execute function public.leads_google_agenda_kick();

drop function if exists public.google_agenda_status();
alter table public.profiles alter column ui_design set default 'v2';
reset lock_timeout;
