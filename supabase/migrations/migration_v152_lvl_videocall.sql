-- v152 (21-10-2026): werkwijze LVL/bord + afspraaksoort videocall (30 min)
-- + goedkeuren (bestaande kolom appointment_approved) + meeting-link.
-- Toegepast via MCP in losse stappen (v152a t/m v152e), met lock_timeout.

-- a. werkwijze per project + videocall-duur in de DB
set lock_timeout = '5s';
alter table public.campaigns add column if not exists werkwijze text not null default 'bord';
alter table public.campaigns drop constraint if exists campaigns_werkwijze_check;
alter table public.campaigns add constraint campaigns_werkwijze_check check (werkwijze in ('bord','lvl'));
create or replace function public.afspraak_minuten(p_type text) returns integer language sql immutable as $f$
  select case when p_type = 'bezoek' then 60 when p_type = 'videocall' then 30 else 150 end;
$f$;

-- b. videocall toegestaan als soort
alter table public.leads drop constraint if exists leads_appointment_type_check;
alter table public.leads add constraint leads_appointment_type_check
  check (appointment_type is null or appointment_type in ('shoot','bezoek','videocall')) not valid;
alter table public.leads validate constraint leads_appointment_type_check;

-- c. werkwijze per medewerker (null = volg het project)
alter table public.profiles add column if not exists werkwijze text;
alter table public.profiles drop constraint if exists profiles_werkwijze_check;
alter table public.profiles add constraint profiles_werkwijze_check check (werkwijze is null or werkwijze in ('bord','lvl')) not valid;
alter table public.profiles validate constraint profiles_werkwijze_check;

-- d. meeting-link bij een videocall
alter table public.leads add column if not exists appointment_meet_link text;
alter table public.leads drop constraint if exists leads_appointment_meet_link_check;
alter table public.leads add constraint leads_appointment_meet_link_check
  check (appointment_meet_link is null or (appointment_meet_link ~* '^https://[^\s]+$' and length(appointment_meet_link) <= 500)) not valid;

-- e. leads_google_agenda_kick kijkt ook naar appointment_meet_link
--    (trigger-kolomlijst niet aangepast; de app stuurt appointment_at mee).
--    Zie de functie in de database voor de volledige tekst.
