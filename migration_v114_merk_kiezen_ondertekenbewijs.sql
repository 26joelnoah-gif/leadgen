-- ReachConnect v114 (30-09-2026): merk kiezen zonder lead + bewijs van ondertekening.
--
-- Aanleiding: als de offerte-tool los vanaf het tabblad Tools werd geopend (dus
-- zonder ?lead=), wist hij niet namens welk merk hij moest werken en stond er
-- ReachConnect linksboven in plaats van ProSell. En het ondertekenen moest
-- juridisch steviger: expliciet opt-in en een bewijs dat je kunt bewaren.

-- 1. Kenmerk van de ondertekening, zodat een akkoord later terug te vinden is.
alter table public.offertes
  add column if not exists ondertekening_id text;

create index if not exists idx_offertes_ondertekening on public.offertes(ondertekening_id) where ondertekening_id is not null;

comment on column public.offertes.ondertekening_id is
  'Kenmerk van de ondertekening (staat op de bevestiging en in de pdf), zodat een akkoord later terug te vinden is';

-- 2. Welke merken/projecten kan deze medewerker gebruiken als hij de offerte-tool
--    opent zonder lead? Alleen projecten waar een merk aan hangt. Branding is niet
--    gevoelig: het staat sowieso op de offerte die de klant krijgt.
create or replace function public.offerte_merken()
returns table (
  campaign_id uuid, campaign_naam text,
  org_id uuid, naam text, afzender_naam text, afzender_email text, logo_url text,
  kvk text, btw_nummer text, adres text, telefoon text, website text, iban text,
  btw_percentage numeric, offerte_geldigheid_dagen integer,
  offerte_akkoord_tekst text, offerte_voorwaarden jsonb,
  accent_kleur text, accent_tekst_kleur text,
  offerte_handtekening text, offerte_sjablonen jsonb
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name,
         o.id, o.name, o.afzender_naam, o.afzender_email, o.logo_url,
         o.kvk, o.btw_nummer, o.adres, o.telefoon, o.website, o.iban,
         o.btw_percentage, o.offerte_geldigheid_dagen,
         o.offerte_akkoord_tekst, o.offerte_voorwaarden,
         o.accent_kleur, o.accent_tekst_kleur,
         o.offerte_handtekening, o.offerte_sjablonen
  from public.campaigns c
  join public.organizations o on o.id = c.offerte_org_id
  where auth.uid() is not null
    and c.deleted_at is null
    and c.is_active is not false
  order by c.name;
$$;

revoke all on function public.offerte_merken() from anon, public;
grant execute on function public.offerte_merken() to authenticated;

-- 3. Geen schemawijziging nodig voor de rest:
--    - organizations.offerte_sjablonen krijgt er een veld "prijs" bij (jsonb).
--    - offertes.akkoord krijgt er ondertekening_id, akkoord_offerte,
--      akkoord_elektronisch en tijdstip_nl bij (jsonb).
--    Edge Function offerte-sign v9 eist bij de akkoordknop twee vinkjes:
--    akkoord met de offerte EN akkoord met elektronisch ondertekenen.
