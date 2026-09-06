-- v64: Outside (buitendienst) - coördinaten op leads, 2026-09-06.
-- GERUND op zboyxwwrbtpjnlgquhzs via Supabase MCP (apply_migration v64_outside_geocoding).
-- LET OP: parallel is migration_v64_geocode.sql (PDOK Edge Function + pg_net-triggers)
-- door een andere sessie uitgevoerd; de kolommen zijn identiek. De dubbele reset-trigger
-- tr_leads_reset_geocode uit dit bestand is daarna weer VERWIJDERD (leads_reset_geocode_trg
-- uit het andere bestand blijft). Alleen de kolommen + index hieronder zijn nog van dit bestand.
-- Kaart + lijst-met-afstand hebben lat/lng per lead nodig. Geocoding gebeurt
-- in de browser via Google Maps (google.maps.Geocoder, zelfde sleutel als de
-- kaart, src/lib/googleMaps.js) en wordt hier weggeschreven. geocode_status:
-- null = nog niet gedaan, 'ok' = gelukt, 'failed' = adres niet gevonden
-- (wordt niet eindeloos opnieuw geprobeerd), 'no_address' = lead heeft geen adres.
alter table public.leads
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists geocoded_at timestamptz,
  add column if not exists geocode_status text;

create index if not exists leads_geocode_pending_idx
  on public.leads (lead_list_id)
  where deleted_at is null and geocode_status is null;

-- Adres gewijzigd? Dan opnieuw geocoden. (Alleen als de wijziging niet zelf
-- de geocode-update is.)
create or replace function public.leads_reset_geocode()
returns trigger language plpgsql as $$
begin
  if (new.address is distinct from old.address
      or new.house_number is distinct from old.house_number
      or new.postal_code is distinct from old.postal_code
      or new.city is distinct from old.city)
     and new.lat is not distinct from old.lat
     and new.lng is not distinct from old.lng then
    new.lat := null; new.lng := null; new.geocoded_at := null; new.geocode_status := null;
  end if;
  return new;
end $$;
drop trigger if exists tr_leads_reset_geocode on public.leads;
create trigger tr_leads_reset_geocode before update on public.leads
  for each row execute function public.leads_reset_geocode();
