-- v85 (2026-09-18) Teamchat: live berichten + automatisch opruimen na 24 uur
-- TOEGEPAST op zboyxwwrbtpjnlgquhzs via MCP op 18-09-2026.

-- 1. messages ontbrak in de realtime-publicatie: nieuwe berichten kwamen nooit live binnen
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- 2. index voor ophalen per kanaal op tijd
create index if not exists messages_channel_created_idx on public.messages (channel_id, created_at desc);

-- 3. opruimen: alles ouder dan 24 uur weg
create or replace function public.chat_cleanup(p_hours int default 24)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.messages where created_at < now() - make_interval(hours => p_hours);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.chat_cleanup(int) from public, anon, authenticated;

-- 4. elk uur draaien
select cron.unschedule(jobid) from cron.job where jobname = 'leadgen-chat-cleanup';
select cron.schedule('leadgen-chat-cleanup', '5 * * * *', $$select public.chat_cleanup(24)$$);

-- 5. meteen een keer opruimen
select public.chat_cleanup(24);
