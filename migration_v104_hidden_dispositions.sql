-- v104 (toegepast 2026-09-24): per project afboekknoppen uitzetten in het belscherm.
-- Sleutels van standaardknoppen ('deal', 'afspraak_gemaakt', ...) en eigen
-- redenen als 'custom:<uuid>'. Leeg = alles zichtbaar.
alter table public.campaigns
  add column if not exists hidden_dispositions text[] not null default '{}';
