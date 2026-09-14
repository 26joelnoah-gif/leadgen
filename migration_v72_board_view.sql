-- LEADGEN v72: bordweergave (kanban) per project
--
-- Aanleiding: de leads van MarketingKiezer moeten op hetzelfde soort bord kunnen
-- staan als de sollicitanten van een recruiter. Het bord is geen aparte pagina en
-- geen aparte data: het is een tweede manier om de leads van een lijst te tonen op
-- /leads. Per project aan te zetten via het tandwiel (ProjectSettingsModal).
--
-- Toegepast op zboyxwwrbtpjnlgquhzs op 14-09-2026.
alter table public.campaigns
  add column if not exists board_view_enabled boolean not null default false;

comment on column public.campaigns.board_view_enabled is
  'v72: als dit aanstaat kunnen gebruikers de leads van dit project ook als bord (kanban) bekijken op /leads';
