-- v56: beheerde bronnen (lead_sources).
-- Wens Noah (01-09): recruiter moet bronnen kunnen aanmaken waar sollicitanten uit
-- komen (bijhouden + filteren); admin ook, en iedereen die leads kan importeren of
-- aanmaken. Tot nu toe was leads.lead_source een los tekstveld met een datalist die
-- uit bestaande waarden werd afgeleid - een bron zonder leads "bestond" dus niet.
--
-- Ontwerp: leads.lead_source blijft gewoon tekst (geen FK), zodat bestaande data,
-- de import-parsers en de scoring in useLeads (cold/linkedin/referral) ongemoeid
-- blijven. lead_sources is de beheerde lijst die de dropdowns/filters voedt.
-- Rechten volgen leads_insert: iedereen in de org die een lead mag aanmaken mag ook
-- een bron aanmaken; hernoemen/verwijderen mag de maker zelf of admin/manager/recruiter.

create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.my_org_id(),
  name text not null check (length(trim(name)) between 1 and 60),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Uniek per org (case-insensitief); org kan null zijn, vandaar coalesce.
create unique index if not exists lead_sources_org_name_uniq
  on public.lead_sources (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name)));

alter table public.lead_sources enable row level security;

drop policy if exists lead_sources_select on public.lead_sources;
create policy lead_sources_select on public.lead_sources for select using (
  not (organization_id is distinct from public.my_org_id())
);

drop policy if exists lead_sources_insert on public.lead_sources;
create policy lead_sources_insert on public.lead_sources for insert with check (
  (not (organization_id is distinct from public.my_org_id()))
  and (created_by = auth.uid() or public.is_admin())
);

drop policy if exists lead_sources_update on public.lead_sources;
create policy lead_sources_update on public.lead_sources for update using (
  (not (organization_id is distinct from public.my_org_id()))
  and (
    public.is_admin()
    or created_by = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['manager','recruiter']))
  )
);

drop policy if exists lead_sources_delete on public.lead_sources;
create policy lead_sources_delete on public.lead_sources for delete using (
  (not (organization_id is distinct from public.my_org_id()))
  and (
    public.is_admin()
    or created_by = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = any (array['manager','recruiter']))
  )
);

grant select, insert, update, delete on public.lead_sources to authenticated;

-- Backfill: elke bron die al in gebruik is wordt een beheerde bron, zodat bestaande
-- filters/dropdowns niets kwijtraken. Per org, case-insensitief ontdubbeld.
insert into public.lead_sources (organization_id, name)
select organization_id, min(trim(lead_source))
from public.leads
where lead_source is not null and length(trim(lead_source)) > 0
group by organization_id, lower(trim(lead_source))
on conflict do nothing;
