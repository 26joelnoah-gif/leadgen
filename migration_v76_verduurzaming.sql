-- LEADGEN v76 (2026-09-15): offerte-tool verduurzaming (zonnepanelen, thuisbatterij,
-- airco, laadpaal, elektrawerkzaamheden) + eigen bedrijfsgegevens per gebruiker.

-- 1. offertes: soort (welke tool), data (volledige staat van de tool om te heropenen),
--    bedrijf (momentopname van de bedrijfsgegevens van de verkoper op de offerte).
alter table public.offertes
  add column if not exists soort text not null default 'bestelplatform',
  add column if not exists data jsonb,
  add column if not exists bedrijf jsonb;
alter table public.offertes drop constraint if exists offertes_soort_check;
alter table public.offertes add constraint offertes_soort_check
  check (soort in ('bestelplatform','verduurzaming'));
create index if not exists offertes_soort_idx on public.offertes (soort);

-- 2. tool_settings: instellingen per gebruiker per tool (bedrijfsgegevens, logo,
--    standaardprijzen, voorwaarden). Alleen de eigenaar leest en schrijft.
create table if not exists public.tool_settings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  tool_key text not null,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, tool_key)
);
alter table public.tool_settings enable row level security;
drop policy if exists tool_settings_own on public.tool_settings;
create policy tool_settings_own on public.tool_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.tool_settings to authenticated;
