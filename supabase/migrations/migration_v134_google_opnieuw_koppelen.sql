-- ReachConnect v134 (2026-10-07) - Google Agenda: verlopen koppeling netjes melden.
-- Weigert Google de blijvende toegang (invalid_grant: verlopen of ingetrokken),
-- dan zet de Edge Function opnieuw_koppelen = true. Die accounts worden daarna
-- overgeslagen tot de medewerker opnieuw koppelt (oauth zet hem weer op false).
-- Het scherm toont dan een knop "Opnieuw koppelen" in plaats van een technische fout.

alter table public.google_agenda_accounts
  add column if not exists opnieuw_koppelen boolean not null default false;

-- Accounts die nu al vastzitten op een verlopen token
update public.google_agenda_accounts
   set opnieuw_koppelen = true,
       last_error = 'Je koppeling met Google is verlopen. Klik op Opnieuw koppelen om hem weer aan te zetten.'
 where last_error ilike '%expired or revoked%' or last_error ilike '%invalid_grant%';

-- Nieuwe RPC naast de oude (google_agenda_status blijft bestaan, ongewijzigd):
-- het returntype verandert, en een DROP liep via de MCP-tool vast.
create or replace function public.google_agenda_status_v2()
 returns table(google_email text, push_enabled boolean, busy_import_enabled boolean,
               connected_at timestamptz, last_push_at timestamptz, last_busy_sync_at timestamptz,
               last_error text, last_error_at timestamptz, opnieuw_koppelen boolean)
 language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $$
  select g.google_email, g.push_enabled, g.busy_import_enabled, g.connected_at,
         g.last_push_at, g.last_busy_sync_at, g.last_error, g.last_error_at, g.opnieuw_koppelen
  from public.google_agenda_accounts g
  where g.user_id = (select auth.uid());
$$;
revoke all on function public.google_agenda_status_v2() from public, anon;
grant execute on function public.google_agenda_status_v2() to authenticated, service_role;
-- Toegepast 2026-10-07 via execute_sql.
