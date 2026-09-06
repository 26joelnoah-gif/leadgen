-- LEADGEN v64 (06-09-2026): coordinaten op leads + automatisch geocoderen
-- Uitgevoerd op zboyxwwrbtpjnlgquhzs via MCP apply_migration.
-- lat/lng worden gevuld door Edge Function "geocode-leads" (PDOK Locatieserver, gratis).
-- De trigger hieronder roept die functie asynchroon aan via pg_net zodra adresvelden veranderen.

create extension if not exists pg_net with schema extensions;

alter table public.leads
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_status text; -- ok | approx:<type> | notfound

create index if not exists leads_latlng_idx on public.leads (lead_list_id, lat, lng) where lat is not null;

-- Adres gewijzigd => oude coordinaten weg (BEFORE, per rij)
create or replace function public.leads_reset_geocode()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (
       new.address is distinct from old.address
    or new.house_number is distinct from old.house_number
    or new.postal_code is distinct from old.postal_code
    or new.city is distinct from old.city) then
    new.lat := null; new.lng := null; new.geocoded_at := null; new.geocode_status := null;
  end if;
  return new;
end $$;

drop trigger if exists leads_reset_geocode_trg on public.leads;
create trigger leads_reset_geocode_trg
  before update of address, house_number, postal_code, city on public.leads
  for each row execute function public.leads_reset_geocode();

-- Na insert/adreswijziging: 1 call per statement (ook bij import van honderden leads)
create or replace function public.leads_geocode_enqueue()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
declare
  ids uuid[];
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpib3l4d3dyYnRwam5sZ3F1aHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYwMjUxMzMsImV4cCI6MjA5MTYwMTEzM30.1YWu29OCZlHQrijnVFFAU1T2W_lqDw0A9ImoaLbyM9U';
begin
  select array_agg(id) into ids
  from new_rows
  where lat is null and deleted_at is null
    and (coalesce(postal_code,'') <> '' or coalesce(city,'') <> '' or coalesce(address,'') <> '');
  if ids is null then return null; end if;
  perform net.http_post(
    url := 'https://zboyxwwrbtpjnlgquhzs.supabase.co/functions/v1/geocode-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', anon_key,
      'Authorization', 'Bearer ' || anon_key),
    body := jsonb_build_object('lead_ids', to_jsonb(ids[1:500])),
    timeout_milliseconds := 120000);
  return null;
end $$;

drop trigger if exists leads_geocode_insert_trg on public.leads;
create trigger leads_geocode_insert_trg
  after insert on public.leads
  referencing new table as new_rows
  for each statement execute function public.leads_geocode_enqueue();

drop trigger if exists leads_geocode_update_trg on public.leads;
create trigger leads_geocode_update_trg
  after update of address, house_number, postal_code, city on public.leads
  referencing new table as new_rows
  for each statement execute function public.leads_geocode_enqueue();

-- Afstand in meters (haversine), handig voor sorteren in SQL/RPC's
create or replace function public.lead_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select case when lat1 is null or lat2 is null or lng1 is null or lng2 is null then null else
    2 * 6371000 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
  end
$$;
