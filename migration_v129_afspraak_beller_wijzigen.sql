-- v129 (06-10-2026): admin/manager kan "Ingepland door" (leads.appointment_by)
-- van een afspraak op een andere medewerker zetten (AppointmentModal).
-- De guard bewaakt dat alleen een admin of manager van het project een afspraak
-- op naam van IEMAND ANDERS zet. Een beller die zelf een afspraak inplant
-- (appointment_by = zichzelf) blijft gewoon werken.
create or replace function public.leads_commissie_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null or public.leadgen_systeem() then return new; end if;

  if new.appointment_commission is distinct from old.appointment_commission
     or new.appointment_approved is distinct from old.appointment_approved
     or (new.appointment_by is distinct from old.appointment_by
         and new.appointment_by is distinct from auth.uid()) then
    if not (
      public.is_admin()
      or new.lead_list_id = any ((public.my_managed_list_ids())::uuid[])
    ) then
      raise exception 'Alleen een admin of een manager van dit project mag de uitbetaling of de beller van een afspraak aanpassen.'
        using errcode = '42501';
    end if;
  end if;

  if new.appointment_commission is distinct from old.appointment_commission then
    new.appointment_commission_at := now();
    new.appointment_commission_by := auth.uid();
  end if;

  return new;
end;
$$;
