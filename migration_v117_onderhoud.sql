-- ReachConnect v117 (01-10-2026): onderhoudsmodus. TOEGEPAST op Supabase 01-10-2026.
--
-- Noah wil de software tijdelijk op slot kunnen zetten met de melding
-- "We zijn bezig met onderhoud", bijvoorbeeld tijdens een migratie of een
-- grote release. Eén schakelaar, verder niets in te vullen.
--
-- Regels:
--  - Alleen een echte admin (profiles.role = 'admin') komt er dan nog in.
--  - De publieke tekenpagina (/tekenen/<token>) blijft WEL werken, zodat
--    klanten hun offerte kunnen blijven ondertekenen.
--  - De stand mag iedereen lezen (ook zonder account), want de inlogpagina
--    moet hem kunnen opvragen. Er staat geen gevoelige informatie in.
--  - Schrijven kan alleen via de RPC onderhoud_zetten(), die zelf controleert
--    of de aanroeper admin is. Er is bewust GEEN update-policy.

create table if not exists public.app_onderhoud (
  id smallint primary key default 1,
  actief boolean not null default false,
  gewijzigd_op timestamptz not null default now(),
  gewijzigd_door uuid references public.profiles(id) on delete set null,
  constraint app_onderhoud_een_rij check (id = 1)
);

comment on table public.app_onderhoud is
  'Eén rij (id=1): staat de onderhoudsmodus aan? Alleen admins kunnen er dan nog in. Schrijven via public.onderhoud_zetten().';

insert into public.app_onderhoud (id, actief)
values (1, false)
on conflict (id) do nothing;

alter table public.app_onderhoud enable row level security;

-- Lezen mag iedereen: de app moet dit ook vóór het inloggen kunnen opvragen.
drop policy if exists app_onderhoud_select on public.app_onderhoud;
create policy app_onderhoud_select on public.app_onderhoud
  for select to anon, authenticated
  using (true);

-- Aan- of uitzetten. Security definer, want er is geen schrijf-policy.
create or replace function public.onderhoud_zetten(p_actief boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and coalesce(is_active, true) = true
      and deleted_at is null
  ) then
    raise exception 'Alleen een admin mag de onderhoudsmodus aan- of uitzetten';
  end if;

  update public.app_onderhoud
     set actief = coalesce(p_actief, false),
         gewijzigd_op = now(),
         gewijzigd_door = (select auth.uid())
   where id = 1;

  return coalesce(p_actief, false);
end;
$$;

-- v101-regel: definer-functies niet uitvoerbaar door anon/public.
revoke all on function public.onderhoud_zetten(boolean) from anon, public;
grant execute on function public.onderhoud_zetten(boolean) to authenticated;

-- Realtime, zodat open tabbladen binnen een paar seconden op slot gaan
-- (de app pollt er daarnaast elke 60 seconden op, als vangnet).
do $$
begin
  alter publication supabase_realtime add table public.app_onderhoud;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
