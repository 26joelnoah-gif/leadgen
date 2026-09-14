-- v71: foutlogboek (betrouwbaarheid)
-- Crashes en mislukte acties van gebruikers komen hier terecht, zodat Noah
-- ze ziet zonder dat een beller hoeft te bellen.

create table if not exists public.app_errors (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid default public.my_org_id(),
  context text not null,
  message text not null,
  stack text,
  path text,
  user_agent text,
  app_build text,
  extra jsonb
);

create index if not exists app_errors_created_idx on public.app_errors (created_at desc);
create index if not exists app_errors_org_idx on public.app_errors (organization_id, created_at desc);
create index if not exists app_errors_user_idx on public.app_errors (user_id);
create index if not exists app_errors_context_idx on public.app_errors (context);

alter table public.app_errors enable row level security;

-- Iedereen die is ingelogd mag zijn eigen fouten melden, niets anders.
drop policy if exists app_errors_insert_self on public.app_errors;
create policy app_errors_insert_self on public.app_errors
  for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Alleen de admin leest mee, en alleen binnen zijn eigen organisatie.
drop policy if exists app_errors_select_admin on public.app_errors;
create policy app_errors_select_admin on public.app_errors
  for select to authenticated
  using (
    public.is_admin()
    and (organization_id is null or organization_id = public.my_org_id())
  );

-- Opruimen: fouten ouder dan 30 dagen hebben geen waarde meer.
create or replace function public.purge_app_errors(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Alleen een admin mag het foutlogboek opruimen';
  end if;
  delete from public.app_errors
   where created_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_app_errors(integer) from public, anon;
grant execute on function public.purge_app_errors(integer) to authenticated;
