-- LEADGEN v97 (2026-09-22): afspraakdetails + uitkomst door de accountmanager.
-- 1. Bij inplannen geeft de beller op hoe de klant erin staat (positief/neutraal/negatief).
-- 2. De accountmanager boekt de afspraak af: wil nadenken / deal / betaald.
--    deal en betaald zetten leads.status op 'deal' (telt mee in rapportage);
--    wil nadenken laat de status op 'afspraak_gemaakt' staan.
alter table public.leads add column if not exists appointment_sentiment text;
alter table public.leads drop constraint if exists leads_appointment_sentiment_check;
alter table public.leads add constraint leads_appointment_sentiment_check
  check (appointment_sentiment is null or appointment_sentiment in ('positief','neutraal','negatief'));

alter table public.leads add column if not exists appointment_outcome text;
alter table public.leads drop constraint if exists leads_appointment_outcome_check;
alter table public.leads add constraint leads_appointment_outcome_check
  check (appointment_outcome is null or appointment_outcome in ('wil_nadenken','deal','betaald'));

alter table public.leads add column if not exists appointment_outcome_at timestamptz;
alter table public.leads add column if not exists appointment_outcome_by uuid references public.profiles(id) on delete set null;
