-- v155 (2026-11-05): personeelsoverzicht + recruiter-verdiensten.
-- Wens Noah: bij admin zien wie bij welk project / welke plek werkt, en per
-- recruiter de verdiensten invullen. Een recruiter verdient per sale van de
-- mensen die hij/zij plaatste. Keuzes Noah: het bedrag per sale staat per
-- geplaatste persoon, en het aantal sales vult de admin zelf per maand in
-- (ook voor mensen bij Rocher of in de buitendienst, die niet in ReachConnect
-- staan).
--
-- 1. plaatsingen.recruiter_id  = wie deze persoon plaatste
--    plaatsingen.bedrag_per_sale = wat die recruiter per sale van deze persoon krijgt
--    Alleen een admin mag die twee zetten of wijzigen (trigger). Plaatst een
--    recruiter iemand, dan wordt hij/zij automatisch de recruiter. Bij
--    verplaatsen (nieuwe rij) gaan recruiter en bedrag mee van de vorige rij.
-- 2. public.plaatsing_sales: per plaatsing per maand het aantal sales, met het
--    bedrag en de recruiter van dat moment (zodat oude maanden niet veranderen
--    als het bedrag later anders wordt) en uitbetaald_op. Alleen admin.

alter table public.plaatsingen
  add column if not exists recruiter_id uuid references public.profiles(id) on delete set null,
  add column if not exists bedrag_per_sale numeric(10,2) check (bedrag_per_sale is null or bedrag_per_sale between 0 and 100000);

create index if not exists plaatsingen_recruiter_idx on public.plaatsingen (recruiter_id);

create or replace function public.plaatsingen_recruiter_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rol text;
  v_admin boolean;
  v_prev record;
begin
  select role into v_rol from public.profiles
   where id = auth.uid() and is_active is not false and deleted_at is null;
  v_admin := auth.uid() is null or v_rol = 'admin';

  if tg_op = 'INSERT' then
    select recruiter_id, bedrag_per_sale into v_prev
      from public.plaatsingen
     where id is distinct from new.id
       and ((new.profile_id is not null and profile_id = new.profile_id)
         or (new.lead_id is not null and lead_id = new.lead_id))
     order by created_at desc
     limit 1;
    if v_admin then
      new.recruiter_id := coalesce(new.recruiter_id, v_prev.recruiter_id);
      new.bedrag_per_sale := coalesce(new.bedrag_per_sale, v_prev.bedrag_per_sale);
    else
      new.recruiter_id := coalesce(v_prev.recruiter_id, case when v_rol = 'recruiter' then auth.uid() end);
      new.bedrag_per_sale := v_prev.bedrag_per_sale;
    end if;
  elsif not v_admin then
    new.recruiter_id := old.recruiter_id;
    new.bedrag_per_sale := old.bedrag_per_sale;
  end if;
  return new;
end;
$$;
revoke execute on function public.plaatsingen_recruiter_guard() from anon, public;

drop trigger if exists tr_plaatsingen_recruiter_guard on public.plaatsingen;
create trigger tr_plaatsingen_recruiter_guard before insert or update on public.plaatsingen
  for each row execute function public.plaatsingen_recruiter_guard();

create table if not exists public.plaatsing_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.my_org_id() references public.organizations(id) on delete cascade,
  plaatsing_id uuid not null references public.plaatsingen(id) on delete restrict,
  maand date not null check (extract(day from maand) = 1),
  aantal integer not null default 0 check (aantal between 0 and 10000),
  bedrag_per_sale numeric(10,2) not null default 0 check (bedrag_per_sale between 0 and 100000),
  recruiter_id uuid references public.profiles(id) on delete set null,
  uitbetaald_op date,
  notitie text check (notitie is null or length(notitie) <= 500),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plaatsing_sales_uniek unique (plaatsing_id, maand)
);
create index if not exists plaatsing_sales_maand_idx on public.plaatsing_sales (maand);

drop trigger if exists tr_plaatsing_sales_updated_at on public.plaatsing_sales;
create trigger tr_plaatsing_sales_updated_at before update on public.plaatsing_sales
  for each row execute function public.update_updated_at();

alter table public.plaatsing_sales enable row level security;
drop policy if exists plaatsing_sales_admin on public.plaatsing_sales;
create policy plaatsing_sales_admin on public.plaatsing_sales for all to authenticated
  using ((select public.is_admin()) and not (organization_id is distinct from (select public.my_org_id())))
  with check ((select public.is_admin()) and not (organization_id is distinct from (select public.my_org_id())));
