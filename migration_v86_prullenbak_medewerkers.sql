-- v86 (2026-09-20): PRULLENBAK VOOR MEDEWERKERS
-- Aanleiding: Noah verwijderde per ongeluk drie medewerkers; rechten, teams en
-- roosterdagen waren meteen weg (cascade). Vanaf nu zet "Verwijderen" in
-- Admin > Team een medewerker in de prullenbak (deleted_at + is_active=false).
-- Alles blijft staan; terugzetten = deleted_at NULL + is_active true.
-- Na 30 dagen ruimt pg_cron definitief op (zelfde patroon als chat_cleanup v85).

-- 1. kolom
alter table public.profiles add column if not exists deleted_at timestamptz;
create index if not exists profiles_deleted_at_idx on public.profiles (deleted_at) where deleted_at is not null;

-- 2. opruimfunctie (alleen via cron / service role)
create or replace function public.profiles_trash_purge(p_days int default 30)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from public.profiles
  where deleted_at is not null
    and deleted_at < now() - make_interval(days => p_days);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.profiles_trash_purge(int) from public;
revoke all on function public.profiles_trash_purge(int) from anon, authenticated;

-- 3. elke nacht om 03:30 UTC opruimen wat langer dan 30 dagen in de prullenbak staat
select cron.unschedule('leadgen-profiles-trash-purge')
where exists (select 1 from cron.job where jobname = 'leadgen-profiles-trash-purge');
select cron.schedule('leadgen-profiles-trash-purge', '30 3 * * *', $$select public.profiles_trash_purge(30)$$);
