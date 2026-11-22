-- v159 (2026-11-22): Settertool ProSell (brief 22-11).
-- Setter leert (onboarding + weekchecklist), belt met het script op het scherm
-- en legt per gesprek vast: haak, bezwaren, wat viel op, interesse, beslisser,
-- WhatsApp-bevestiging. De STATUS van de lead blijft lopen via de gewone
-- afboeking (useLeads.handleLeadDisposition) - geen tweede statussysteem.
-- Teksten (script, haken, bezwaren, onboarding) staan in
-- src/content/settertool.js, niet in de database.
--
-- TOEGEPAST op 2026-11-22 (in stappen v159a-g via de MCP-tool). Dit bestand
-- is de eindstand. Organisatie wordt null-veilig vergeleken (is not distinct
-- from), want veel profielen en leads hebben organization_id leeg.

-- 1. Welke projecten gebruiken de settertool (sleutel uit src/content/settertool.js)
alter table public.campaigns add column if not exists setter_tool text
  check (setter_tool is null or setter_tool ~ '^[a-z0-9_]{1,40}$');

-- 2. Eén rij per gesprek met een uitkomst
create table if not exists public.setter_gesprekken (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid default public.my_org_id() references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null, -- FK hieronder apart (NOT VALID + validate), anders lock op leads
  setter_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tool text not null check (length(tool) between 1 and 40),
  uitkomst text not null check (uitkomst in ('afspraak', 'terugbellen', 'niet_eigenaar', 'geen_interesse', 'niet_bereikt', 'anders')),
  status text check (status is null or length(status) <= 60),           -- de gewone leadstatus van de afboeking
  haak text check (haak is null or length(haak) <= 40),
  bezwaren text[] not null default '{}',
  wat_viel_op text check (wat_viel_op is null or length(wat_viel_op) <= 500),
  interesse text[] not null default '{}' check (interesse <@ array['social_media', 'advertenties', 'website', 'anders']::text[]),
  interesse_anders text check (interesse_anders is null or length(interesse_anders) <= 200),
  afspraak_vorm text check (afspraak_vorm is null or afspraak_vorm in ('fysiek', 'online')),
  afspraak_op timestamptz,
  closer_id uuid references public.profiles(id) on delete set null,
  beslisser_aanwezig boolean,
  mede_beslisser text check (mede_beslisser is null or length(mede_beslisser) <= 120),
  whatsapp_bevestigd boolean not null default false,
  whatsapp_bevestigd_op timestamptz,
  referentie_gevraagd boolean not null default false,
  notitie text check (notitie is null or length(notitie) <= 2000),
  melding_24u_op timestamptz,
  melding_morgen_op timestamptz,
  created_at timestamptz not null default now(),
  -- Bij een afspraak zijn deze velden verplicht (brief 4.3)
  constraint setter_gesprekken_afspraak_compleet check (
    uitkomst <> 'afspraak' or (
      afspraak_op is not null and afspraak_vorm is not null and closer_id is not null
      and cardinality(interesse) > 0 and beslisser_aanwezig is not null
      and ('anders' <> all(interesse) or length(trim(coalesce(interesse_anders, ''))) > 0)
    )
  )
);

set lock_timeout = '5s';
alter table public.setter_gesprekken drop constraint if exists setter_gesprekken_lead_id_fkey;
alter table public.setter_gesprekken add constraint setter_gesprekken_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete cascade not valid;
alter table public.setter_gesprekken validate constraint setter_gesprekken_lead_id_fkey;
reset lock_timeout;

create index if not exists setter_gesprekken_campaign_idx on public.setter_gesprekken (campaign_id, created_at desc);
create index if not exists setter_gesprekken_setter_idx on public.setter_gesprekken (setter_id, created_at desc);
create index if not exists setter_gesprekken_lead_idx on public.setter_gesprekken (lead_id, created_at desc);
create index if not exists setter_gesprekken_open_wa_idx on public.setter_gesprekken (created_at)
  where uitkomst = 'afspraak' and whatsapp_bevestigd = false;

alter table public.setter_gesprekken enable row level security;

-- Lezen: eigen gesprekken, admin, of manager van het project. Altijd binnen de org.
drop policy if exists setter_gesprekken_select on public.setter_gesprekken;
create policy setter_gesprekken_select on public.setter_gesprekken for select to authenticated using (
  organization_id is not distinct from (select public.my_org_id()) and (
    setter_id = (select auth.uid())
    or (select public.is_admin())
    or exists (select 1 from public.campaign_managers cm
               where cm.campaign_id = setter_gesprekken.campaign_id and cm.manager_id = (select auth.uid()))
  )
);

-- Schrijven: alleen op eigen naam, alleen voor een lead die je via RLS mag zien
-- en die echt in dat project zit, en alleen in een project met de settertool.
drop policy if exists setter_gesprekken_insert on public.setter_gesprekken;
create policy setter_gesprekken_insert on public.setter_gesprekken for insert to authenticated with check (
  setter_id = (select auth.uid())
  and organization_id is not distinct from (select public.my_org_id())
  and exists (
    select 1 from public.leads l
    join public.lead_lists ll on ll.id = l.lead_list_id
    join public.campaigns c on c.id = ll.campaign_id
    where l.id = setter_gesprekken.lead_id
      and c.id = setter_gesprekken.campaign_id
      and c.setter_tool = setter_gesprekken.tool
  )
);

-- Bijwerken (alleen WhatsApp-bevestiging achteraf): eigen rij, of admin/manager.
-- Kolomrechten beperken wat er aangepast mag worden.
drop policy if exists setter_gesprekken_update on public.setter_gesprekken;
create policy setter_gesprekken_update on public.setter_gesprekken for update to authenticated using (
  organization_id is not distinct from (select public.my_org_id()) and (
    setter_id = (select auth.uid())
    or (select public.is_admin())
    or exists (select 1 from public.campaign_managers cm
               where cm.campaign_id = setter_gesprekken.campaign_id and cm.manager_id = (select auth.uid()))
  )
) with check (organization_id is not distinct from (select public.my_org_id()));

revoke update on public.setter_gesprekken from authenticated;
revoke all on public.setter_gesprekken from anon;
grant update (whatsapp_bevestigd, whatsapp_bevestigd_op) on public.setter_gesprekken to authenticated;
-- Geen delete-policy: gesprekken blijven staan (verdwijnen mee met de lead).

-- 3. Onboarding-afvinklijst per setter
create table if not exists public.setter_onboarding (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  tool text not null check (length(tool) between 1 and 40),
  item text not null check (length(item) between 1 and 40),
  afgevinkt_op timestamptz not null default now(),
  primary key (user_id, tool, item)
);
alter table public.setter_onboarding enable row level security;

drop policy if exists setter_onboarding_eigen on public.setter_onboarding;
create policy setter_onboarding_eigen on public.setter_onboarding for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists setter_onboarding_beheer on public.setter_onboarding;
create policy setter_onboarding_beheer on public.setter_onboarding for select to authenticated using (
  (select public.is_admin())
  or exists (select 1 from public.profiles p where p.id = setter_onboarding.user_id
             and p.organization_id is not distinct from (select public.my_org_id())
             and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.role = 'manager'))
);

-- 4. Overzicht voor Noah: per setter en per haak, uit echte data.
-- Gebeld/bereikt komt uit call_logs (geen bord-acties), afspraken/bevestigd
-- uit setter_gesprekken. Alleen admin of manager van het project.
create or replace function public.settertool_overzicht(p_campaign uuid, p_van timestamptz, p_tot timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_mag boolean;
  v_setters jsonb;
  v_haken jsonb;
begin
  select exists (
    select 1 from public.campaigns c
    where c.id = p_campaign and c.organization_id is not distinct from public.my_org_id()
      and (public.is_admin() or exists (select 1 from public.campaign_managers cm
                                        where cm.campaign_id = c.id and cm.manager_id = auth.uid()))
  ) into v_mag;
  if not coalesce(v_mag, false) then
    raise exception 'Geen toegang tot dit overzicht';
  end if;

  with logs as (
    select cl.agent_id, cl.disposition
    from public.call_logs cl
    join public.lead_lists ll on ll.id = cl.lead_list_id
    where ll.campaign_id = p_campaign
      and cl.disposed_at >= p_van and cl.disposed_at < p_tot
      and coalesce(cl.source, '') <> 'bord'
  ), g as (
    select * from public.setter_gesprekken
    where campaign_id = p_campaign and created_at >= p_van and created_at < p_tot
  ), ids as (
    select agent_id as id from logs union select setter_id from g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'setter_id', i.id,
      'naam', coalesce(p.full_name, p.email, 'Onbekend'),
      'gebeld', (select count(*) from logs where agent_id = i.id),
      'bereikt', (select count(*) from logs where agent_id = i.id
                  and disposition not in ('geen_gehoor', 'voicemail', 'verkeerd_nummer')),
      'afspraken', (select count(*) from g where setter_id = i.id and uitkomst = 'afspraak'),
      'bevestigd', (select count(*) from g where setter_id = i.id and uitkomst = 'afspraak' and whatsapp_bevestigd)
    ) order by coalesce(p.full_name, p.email)), '[]'::jsonb)
  into v_setters
  from ids i left join public.profiles p on p.id = i.id
  where i.id is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
      'haak', haak, 'gebruikt', gebruikt, 'afspraken', afspraken) order by gebruikt desc), '[]'::jsonb)
  into v_haken
  from (
    select coalesce(haak, 'onbekend') as haak, count(*) as gebruikt,
           count(*) filter (where uitkomst = 'afspraak') as afspraken
    from public.setter_gesprekken
    where campaign_id = p_campaign and created_at >= p_van and created_at < p_tot
      and uitkomst <> 'niet_bereikt'
    group by 1
  ) h;

  return jsonb_build_object('setters', v_setters, 'haken', v_haken);
end $$;
revoke execute on function public.settertool_overzicht(uuid, timestamptz, timestamptz) from anon, public;
grant execute on function public.settertool_overzicht(uuid, timestamptz, timestamptz) to authenticated;

-- 5. Meldingen (brief 4.4), elk uur via pg_cron:
--    a) afspraak 24 uur na vastleggen nog niet bevestigd via WhatsApp
--    b) afspraak is morgen: herinnering sturen
-- Elke melding gaat 1 keer (melding_24u_op / melding_morgen_op).
create or replace function public.settertool_meldingen()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select g.id, g.setter_id, g.lead_id, coalesce(l.name, l.contact_person, 'een lead') as naam
    from public.setter_gesprekken g join public.leads l on l.id = g.lead_id
    where g.uitkomst = 'afspraak' and not g.whatsapp_bevestigd and g.melding_24u_op is null
      and g.created_at < now() - interval '24 hours'
      and (g.afspraak_op is null or g.afspraak_op > now())
      and l.status = 'afspraak_gemaakt'
  loop
    insert into public.notifications (profile_id, lead_id, type, title, body)
    values (r.setter_id, r.lead_id, 'setter_niet_bevestigd', 'Afspraak nog niet bevestigd',
            'De afspraak met ' || r.naam || ' is na 24 uur nog niet bevestigd via WhatsApp. Bel 1 keer.');
    update public.setter_gesprekken set melding_24u_op = now() where id = r.id;
    n := n + 1;
  end loop;

  for r in
    select g.id, g.setter_id, g.lead_id, coalesce(l.name, l.contact_person, 'een lead') as naam,
           to_char(l.appointment_at at time zone 'Europe/Amsterdam', 'HH24:MI') as tijd
    from public.setter_gesprekken g join public.leads l on l.id = g.lead_id
    where g.uitkomst = 'afspraak' and g.melding_morgen_op is null
      and l.status = 'afspraak_gemaakt' and l.appointment_at is not null
      and (l.appointment_at at time zone 'Europe/Amsterdam')::date
          = ((now() at time zone 'Europe/Amsterdam')::date + 1)
      and g.id = (select g2.id from public.setter_gesprekken g2
                  where g2.lead_id = g.lead_id and g2.uitkomst = 'afspraak'
                  order by g2.created_at desc limit 1)
  loop
    insert into public.notifications (profile_id, lead_id, type, title, body)
    values (r.setter_id, r.lead_id, 'setter_afspraak_morgen', 'Afspraak morgen',
            'Morgen om ' || r.tijd || ' de afspraak met ' || r.naam || '. Stuur een herinnering via WhatsApp.');
    update public.setter_gesprekken set melding_morgen_op = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.settertool_meldingen() from anon, public, authenticated;

select cron.schedule('reachconnect-settertool-meldingen', '7 * * * *', $$select public.settertool_meldingen()$$);

-- 6. Aanzetten voor ProSell
update public.campaigns set setter_tool = 'prosell' where id = '593bba6c-e0e1-429e-b8f8-187d06a15860';
