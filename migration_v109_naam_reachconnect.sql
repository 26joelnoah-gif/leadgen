-- migration_v109_naam_reachconnect.sql  (28-09-2026)  TOEGEPAST
-- De naam LEADGEN wordt ReachConnect.
--
-- In de database hoeft daar bijna niets voor te gebeuren: er zijn geen tabellen
-- of kolommen met "leadgen" in de naam. Alleen de NAMEN van de pg_cron-jobs
-- veranderen. Schema, commando, rol en database blijven exact hetzelfde, dus
-- er verandert niets aan wat ze doen of wanneer ze draaien.
--
-- BEWUST NIET MEEGENOMEN: de interne systeemvlag set_config('leadgen.systeem')
-- en de functie public.leadgen_systeem(). Die zit in 11 functies, waaronder
-- leads_compliance_guard, leads_lock_guard en leads_owner_on_status. Omzetten
-- levert niets op (niemand ziet die naam) en als er een plek wordt gemist
-- blokkeren die triggers systeemupdates, met stille fouten bij afmelden en
-- lead-eigenaarschap als gevolg. Laten staan is hier de veilige keuze.
--
-- Idempotent: staat de nieuwe naam er al, dan wordt de oude alleen opgeruimd.
do $$
declare r record; nieuwe_naam text;
begin
  for r in select jobname, schedule, command from cron.job where jobname like 'leadgen-%'
  loop
    nieuwe_naam := 'reachconnect-' || substring(r.jobname from 9);
    if not exists (select 1 from cron.job where jobname = nieuwe_naam) then
      perform cron.schedule(nieuwe_naam, r.schedule, r.command);
      raise notice 'aangemaakt: % (%: %)', nieuwe_naam, r.schedule, r.command;
    end if;
    perform cron.unschedule(r.jobname);
    raise notice 'verwijderd: %', r.jobname;
  end loop;
end $$;
