-- v59: offertes van de offerte-tool (bestelplatform ReachConnect), 2026-09-04.
-- Wens Noah: accountmanagers gebruiken vanaf zondag de offerte-tool via LeadGen
-- (tab Tools). Een getekende deal mag niet op een telefoon blijven hangen: de
-- statische tool (/tools/offerte-tool.html) slaat elke offerte hier op met de
-- LeadGen-login van de accountmanager. Prijzen/ROI/handtekening staan als
-- snapshot in jsonb, zodat een latere prijswijziging een getekende deal niet
-- verandert. Later verhuist dit naar de aparte dealtool; dit is de tussenstap.

create table if not exists public.offertes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.my_org_id(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  nummer text not null,                          -- RC-2026-xxxxP (prototype-reeks, uniek per org)
  status text not null default 'concept' check (status in ('concept','getekend','verzonden','geannuleerd')),
  prijsmodel_versie text,
  accountmanager text,
  zaak_naam text not null,
  contact_naam text, email text, telefoon text, adres text,
  pakket text,
  regels jsonb not null default '[]'::jsonb,
  upsell jsonb not null default '[]'::jsonb,
  korting numeric not null default 0,
  eenmalig_ex numeric not null default 0,
  btw numeric not null default 0,
  eenmalig_incl numeric not null default 0,
  maandbedrag_ex numeric not null default 0,
  roi jsonb,
  speclijst jsonb,
  notitie text,
  akkoord jsonb,                                 -- {door, functie, op, png, ua, tekst}
  getekend_op timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists offertes_org_nummer_uniq
  on public.offertes (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), nummer);
create index if not exists offertes_user_idx on public.offertes (user_id, created_at desc);

alter table public.offertes enable row level security;

-- Lezen: eigen offertes; admin/manager de hele org.
drop policy if exists offertes_select on public.offertes;
create policy offertes_select on public.offertes for select using (
  (not (organization_id is distinct from public.my_org_id()))
  and (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
  )
);

-- Aanmaken: alleen als jezelf.
drop policy if exists offertes_insert on public.offertes;
create policy offertes_insert on public.offertes for insert with check (
  (not (organization_id is distinct from public.my_org_id()))
  and user_id = auth.uid()
);

-- Bijwerken: eigen concept mag je bijwerken (autosave); een getekende offerte is
-- bevroren, behalve status/notitie door admin.
drop policy if exists offertes_update on public.offertes;
create policy offertes_update on public.offertes for update using (
  (not (organization_id is distinct from public.my_org_id()))
  and ((user_id = auth.uid() and status = 'concept') or public.is_admin())
);

-- Verwijderen: alleen admin.
drop policy if exists offertes_delete on public.offertes;
create policy offertes_delete on public.offertes for delete using (public.is_admin());

grant select, insert, update, delete on public.offertes to authenticated;

-- Getekende offerte: inhoud onveranderbaar (ook voor admin) - alleen status en notitie.
create or replace function public.offertes_freeze()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if old.status <> 'concept' then
    if new.regels is distinct from old.regels or new.upsell is distinct from old.upsell
       or new.eenmalig_ex is distinct from old.eenmalig_ex or new.maandbedrag_ex is distinct from old.maandbedrag_ex
       or new.akkoord is distinct from old.akkoord or new.korting is distinct from old.korting
       or new.zaak_naam is distinct from old.zaak_naam or new.getekend_op is distinct from old.getekend_op then
      raise exception 'Getekende offerte % kan niet meer worden gewijzigd', old.nummer;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tr_offertes_freeze on public.offertes;
create trigger tr_offertes_freeze before update on public.offertes
  for each row execute function public.offertes_freeze();
