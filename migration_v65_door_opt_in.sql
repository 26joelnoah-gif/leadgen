-- v65: opt-in aan de deur (Outside), 2026-09-06.
-- GERUND op zboyxwwrbtpjnlgquhzs via Supabase MCP (apply_migration v65_door_opt_in).
-- Bewoner geeft aan de deur toestemming om gebeld te worden. Toestemming
-- wordt apart vastgelegd (AVG: wanneer, door wie, via welk kanaal) naast de
-- gewone afboeking (status terugbelafspraak + call_log, via handleLeadDisposition).
alter table public.leads
  add column if not exists opt_in_at timestamptz,
  add column if not exists opt_in_by uuid references public.profiles(id) on delete set null,
  add column if not exists opt_in_source text,   -- 'door' | 'phone' | 'web'
  add column if not exists opt_in_slot text;     -- 'morning' | 'afternoon' | 'evening' | 'any'

create index if not exists leads_opt_in_idx on public.leads (opt_in_at) where opt_in_at is not null;
