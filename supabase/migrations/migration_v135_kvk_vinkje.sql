-- ReachConnect v135 (2026-10-08) - KvK-check simpeler: vinkje of kruisje.
-- De beller kiest niet meer uit 9 rechtsvormen, alleen:
--   'rechtspersoon'      = mag bellen (bv, nv, stichting, vereniging, cooperatie)
--   'geen_rechtspersoon' = alleen met toestemming (eenmanszaak, vof, cv, maatschap)
-- De oude waarden blijven geldig (import en naamherkenning gebruiken ze nog).

set lock_timeout = '5s';

alter table public.leads drop constraint if exists leads_rechtsvorm_check;
alter table public.leads add constraint leads_rechtsvorm_check check (
  rechtsvorm is null or rechtsvorm in
  ('bv','nv','stichting','vereniging','cooperatie','eenmanszaak','vof','cv','maatschap','particulier','onbekend',
   'rechtspersoon','geen_rechtspersoon')) not valid;

create or replace function public.lead_belstatus_basis(
  p_afgemeld_at timestamptz, p_opt_in_at timestamptz, p_rechtsvorm text,
  p_doelgroep text, p_modus text)
returns text language sql immutable as $$
  select case
    when p_afgemeld_at is not null then 'afgemeld'
    when p_opt_in_at is not null then 'ok'
    when p_doelgroep is null or p_doelgroep = 'geen_telemarketing' then 'ok'
    when p_doelgroep = 'particulier' then 'toestemming_nodig'
    when p_rechtsvorm in ('bv','nv','stichting','vereniging','cooperatie','rechtspersoon') then 'ok'
    when p_rechtsvorm in ('eenmanszaak','vof','cv','maatschap','particulier','geen_rechtspersoon') then 'toestemming_nodig'
    when coalesce(p_modus, 'waarschuwen') = 'streng' then 'toestemming_nodig'
    else 'kvk_check'
  end
$$;
