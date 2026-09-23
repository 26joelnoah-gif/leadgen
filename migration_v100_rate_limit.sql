-- v100 (2026-09-24) rate limiting voor Edge Functions (TOEGEPAST op Supabase)
create table if not exists public.rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  n integer not null default 0,
  primary key (key, window_start)
);
alter table public.rate_limit_hits enable row level security;
revoke all on public.rate_limit_hits from anon, authenticated;

-- true = geblokkeerd (limiet overschreden), false = mag door. Vast venster.
create or replace function public.rate_limit_hit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_n integer;
begin
  insert into public.rate_limit_hits as r (key, window_start, n)
  values (p_key, v_start, 1)
  on conflict (key, window_start) do update set n = r.n + 1
  returning r.n into v_n;
  return v_n > p_max;
end $$;

revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

select cron.schedule('leadgen-rate-limit-cleanup', '17 * * * *',
  $$delete from public.rate_limit_hits where window_start < now() - interval '2 days'$$);
