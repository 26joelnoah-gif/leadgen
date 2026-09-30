-- ReachConnect v115 (30-09-2026): wie tekent, en toestemming voor bellen en mailen.
--
-- Bij het ondertekenen vult de klant nu ook de bedrijfsnaam in en vinkt hij aan
-- dat hij eigenaar is of bevoegd om namens dat bedrijf te tekenen. Daarnaast een
-- losstaand, vrijwillig vinkje: mogen wij je bellen en mailen over andere
-- diensten. Dat vinkje is niet nodig om te kunnen tekenen.
--
-- Geen schemawijziging: alles komt in offertes.akkoord (jsonb) te staan, met de
-- velden bedrijfsnaam, bevoegd en contact_optin.
--
-- Op afstand tekenen loopt via Edge Function offerte-sign (v10). Die draait als
-- service role, dus de compliance-guard van v98 laat een opt_in gewoon door en
-- de functie zet hem zelf op de lead.
--
-- Op locatie tekenen loopt via de offerte-tool, met de sessie van de beller.
-- Volgens v98 mag alleen een admin of manager een opt_in vastleggen. Deze
-- functie doet dat voor hem, maar alleen op basis van een offerte die echt
-- getekend is en waarin het vinkje staat: het bewijs zit dus altijd in de
-- offerte zelf en je kunt er geen toestemming mee verzinnen.
create or replace function public.offerte_contact_optin(p_offerte uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_off record;
  v_lead record;
begin
  if auth.uid() is null then return false; end if;

  select o.id, o.nummer, o.lead_id, o.status, o.akkoord, o.ondertekening_id
    into v_off
  from public.offertes o
  where o.id = p_offerte;

  if not found then return false; end if;
  if v_off.status <> 'getekend' then return false; end if;
  if coalesce((v_off.akkoord ->> 'contact_optin')::boolean, false) is not true then return false; end if;
  if v_off.lead_id is null then return false; end if;

  select l.id, l.opt_in_at into v_lead from public.leads l where l.id = v_off.lead_id;
  if not found then return false; end if;
  if v_lead.opt_in_at is not null then return true; end if;

  -- systeemvlag: de lock- en eigenaar-triggers laten een systeemupdate door
  perform set_config('leadgen.systeem', '1', true);
  update public.leads
     set opt_in_at = now(),
         opt_in_source = 'offerte',
         opt_in_bewijs = 'Offerte ' || v_off.nummer || ', ondertekend door ' ||
                         coalesce(v_off.akkoord ->> 'door', 'onbekend') ||
                         ' (' || coalesce(v_off.ondertekening_id, '-') || ')'
   where id = v_off.lead_id;
  perform set_config('leadgen.systeem', '', true);
  return true;
end $$;

revoke all on function public.offerte_contact_optin(uuid) from anon, public;
grant execute on function public.offerte_contact_optin(uuid) to authenticated;
