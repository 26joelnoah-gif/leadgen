-- v105 (toegepast 2026-09-24): schakelaar nieuw design per medewerker
alter table public.profiles
  add column if not exists ui_design text not null default 'v1';
do $$ begin
  alter table public.profiles add constraint profiles_ui_design_check check (ui_design in ('v1','v2'));
exception when duplicate_object then null; end $$;
