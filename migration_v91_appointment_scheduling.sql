-- v91: afspraken met een echt datum/tijd-moment, ook buiten recruitment
-- (bv. ProSell: beller maakt een afspraak, accountmanager loopt hem na en
-- boekt af als deal (betaald) of afgewezen (niet betaald)). Losse vlag per
-- project, geen nieuwe status: bestaande STATUS_MAP, bord en wachtrij
-- blijven identiek voor projecten die de vlag niet aanzetten.
-- UITGEVOERD op zboyxwwrbtpjnlgquhzs (22-09-2026, vanuit Cowork).
alter table public.campaigns
  add column if not exists appointment_scheduling_enabled boolean not null default false;

comment on column public.campaigns.appointment_scheduling_enabled is
  'Bij afboekreden afspraak_gemaakt vraagt het belscherm om datum/tijd (leads.appointment_at), zichtbaar op het bord.';
