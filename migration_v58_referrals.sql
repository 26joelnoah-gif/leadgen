-- v58: referrals (verwijzingen) in recruitment. UITGEVOERD op zboyxwwrbtpjnlgquhzs (01-09-2026).
-- Wens Noah (01-09): de recruiter (Serge) moet een referral-overzicht hebben.
-- Een sollicitant kan door een bestaande medewerker zijn aangedragen
-- (referred_by). Na aanname wordt de sollicitant gekoppeld aan zijn eigen
-- medewerkersaccount (hired_profile_id), zodat de gewerkte roosterdagen uit
-- public.availability geteld kunnen worden. Bij 40 roosterdagen mag de
-- referralbonus worden goedgekeurd; die goedkeuring doet de recruiter (of admin).
-- Bewust geen nieuwe tabel: een referral IS een sollicitant met een verwijzer.

alter table public.leads
  add column if not exists referred_by uuid references public.profiles(id) on delete set null,
  add column if not exists hired_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists referral_bonus_approved_at timestamptz,
  add column if not exists referral_bonus_approved_by uuid references public.profiles(id) on delete set null;

create index if not exists leads_referred_by_idx on public.leads (referred_by) where referred_by is not null;
create index if not exists leads_hired_profile_idx on public.leads (hired_profile_id) where hired_profile_id is not null;

-- Alleen recruiter of admin mag de bonus-goedkeuring zetten/wijzigen.
-- leads_update is breed (bellers mogen hun eigen leads bijwerken), dus dit
-- zit in een trigger i.p.v. in de policy.
create or replace function public.guard_referral_bonus_approval()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.referral_bonus_approved_at is distinct from old.referral_bonus_approved_at)
     or (new.referral_bonus_approved_by is distinct from old.referral_bonus_approved_by) then
    if not exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'recruiter')
    ) then
      raise exception 'Alleen een recruiter of admin mag de referralbonus goedkeuren';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tr_guard_referral_bonus_approval on public.leads;
create trigger tr_guard_referral_bonus_approval
  before update on public.leads
  for each row execute function public.guard_referral_bonus_approval();

-- Gewerkte roosterdagen per medewerker: elke dag t/m vandaag waarop de
-- medewerker in Roosters op "beschikbaar" stond. Loopt via RLS van
-- availability (security invoker), dus je telt alleen wat je toch al mag zien.
create or replace function public.referral_roster_days(p_profile_ids uuid[])
returns table (profile_id uuid, days integer)
language sql stable security invoker set search_path = public as $$
  select a.user_id as profile_id,
         count(distinct (a.week_start + a.day_of_week))::integer as days
  from public.availability a
  where a.user_id = any (p_profile_ids)
    and a.available = true
    and (a.week_start + a.day_of_week) <= current_date
  group by a.user_id
$$;

grant execute on function public.referral_roster_days(uuid[]) to authenticated;
