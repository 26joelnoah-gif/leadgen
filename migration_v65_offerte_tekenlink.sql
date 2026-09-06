-- LEADGEN v65 (2026-09-06): offertes op afstand tekenen + status per offerte.
-- Spec: docs/OFFERTE_TEKENLINK_SPEC.md
-- Het tekenen (Edge Functions offerte-send / offerte-sign, pagina /tekenen/:token)
-- werkt uitsluitend met de kolommen van public.offertes; afzender en branding
-- komen uit organizations/profiles. Nooit anon-RLS op offertes: alles via
-- service-role in de functies.

-- 1. offertes: koppeling aan lead + tekenlink-velden
alter table public.offertes
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists akkoord_tekst text,
  add column if not exists sign_token_hash text,
  add column if not exists sign_token_expires_at timestamptz,
  add column if not exists verzonden_op timestamptz,
  add column if not exists verzonden_naar text,
  add column if not exists verzonden_door uuid references public.profiles(id) on delete set null,
  add column if not exists geopend_op timestamptz,
  add column if not exists geopend_aantal integer not null default 0,
  add column if not exists herinnering_op timestamptz,
  add column if not exists afgewezen_reden text,
  add column if not exists inhoud_hash text;

create index if not exists idx_offertes_lead on public.offertes(lead_id);
create unique index if not exists idx_offertes_token on public.offertes(sign_token_hash) where sign_token_hash is not null;

alter table public.offertes drop constraint if exists offertes_status_check;
alter table public.offertes add constraint offertes_status_check
  check (status in ('concept','verzonden','geopend','getekend','verlopen','afgewezen','geannuleerd'));

-- 2. organisatie: afzender + instellingen (fase-2-proof, per tenant)
alter table public.organizations
  add column if not exists afzender_naam text,
  add column if not exists afzender_email text,
  add column if not exists logo_url text,
  add column if not exists offerte_geldigheid_dagen integer not null default 14,
  add column if not exists offerte_opvolg_dagen integer not null default 3,
  add column if not exists offerte_herinnering_dag integer not null default 5;

-- 3. profiles: telefoon van de AM voor "Vragen? Bel me"
alter table public.profiles add column if not exists phone text;

-- 4. call_logs: bron van een automatische afboeking (null = belscherm)
alter table public.call_logs add column if not exists source text;

-- 5. Freeze-trigger: na versturen is de inhoud bevroren, maar de handtekening
--    (akkoord/getekend_op) mag er nog bij zolang hij niet getekend is.
create or replace function public.offertes_freeze()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if old.status <> 'concept' then
    if new.regels is distinct from old.regels or new.upsell is distinct from old.upsell
       or new.eenmalig_ex is distinct from old.eenmalig_ex or new.maandbedrag_ex is distinct from old.maandbedrag_ex
       or new.korting is distinct from old.korting
       or new.zaak_naam is distinct from old.zaak_naam then
      raise exception 'Verzonden of getekende offerte % kan niet meer worden gewijzigd', old.nummer;
    end if;
  end if;
  if old.status = 'getekend' then
    if new.akkoord is distinct from old.akkoord or new.getekend_op is distinct from old.getekend_op then
      raise exception 'Handtekening van offerte % kan niet meer worden gewijzigd', old.nummer;
    end if;
  end if;
  return new;
end $$;

-- 6. Lezen: ook de beller die de gekoppelde lead toegewezen heeft of de lijst mag zien.
drop policy if exists offertes_select on public.offertes;
create policy offertes_select on public.offertes for select using (
  (not (organization_id is distinct from public.my_org_id()))
  and (
    user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'manager')
    or (lead_id is not null and exists (
      select 1 from public.leads l
      where l.id = offertes.lead_id
        and (l.assigned_to = auth.uid() or l.lead_list_id = any (public.my_list_ids()))
    ))
  )
);

-- 7. Bijwerken: eigenaar mag concept bewerken en een verzonden/geopende/verlopen
--    offerte intrekken; admin alles. Token-velden worden alleen door de functies gezet.
drop policy if exists offertes_update on public.offertes;
create policy offertes_update on public.offertes for update using (
  (not (organization_id is distinct from public.my_org_id()))
  and ((user_id = auth.uid() and status in ('concept','verzonden','geopend','verlopen')) or public.is_admin())
);

-- 8. Realtime op offertes (toast bij tekenen, belscherm live)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'offertes') then
    alter publication supabase_realtime add table public.offertes;
  end if;
end $$;
