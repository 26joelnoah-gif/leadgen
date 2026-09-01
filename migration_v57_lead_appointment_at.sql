-- v57: gespreksdatum per lead (recruitment-agenda). UITGEVOERD op zboyxwwrbtpjnlgquhzs (01-09-2026).
-- Wens Noah (01-09): recruiter en admin moeten in een agenda kunnen zien wanneer
-- sollicitanten ingepland staan. Tot nu toe had "Gesprek gepland" (afspraak_gemaakt)
-- geen datum: next_contact_date is het terugbelmoment (TBA/later bellen) en wordt
-- door de wachtrij gelezen, dus die kon niet hergebruikt worden.
-- Losse kolom, geen nieuwe status: bord/wachtrij/rapportage blijven identiek.
alter table public.leads
  add column if not exists appointment_at timestamptz;

create index if not exists leads_appointment_at_idx
  on public.leads (appointment_at)
  where appointment_at is not null;
