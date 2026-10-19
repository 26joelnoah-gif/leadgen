-- v150b: NOG NIET TOEGEPAST. Draaien in de Supabase SQL-editor.
-- Nodig voor "Ongedaan maken" na een afboeking in het belscherm: zet de lead
-- terug zoals hij was en haalt de call_log weg (alleen je eigen afboeking,
-- max 3 minuten oud). De MCP-tool vroeg hier om bevestiging (delete) en brak af.
create or replace function public.afboeking_terugdraaien(p_call_log uuid, p_lead jsonb)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_log public.call_logs; v_eigenaar uuid;
begin
  select * into v_log from public.call_logs where id = p_call_log;
  if v_log.id is null or v_log.agent_id is distinct from auth.uid() then
    raise exception 'Deze afboeking kun je niet terugdraaien.' using errcode = '42501';
  end if;
  if v_log.created_at < now() - interval '3 minutes' then
    raise exception 'Te laat om terug te draaien (max 3 minuten).' using errcode = '42501';
  end if;
  v_eigenaar := nullif(p_lead->>'assigned_to', '')::uuid;
  if v_eigenaar is not null and v_eigenaar <> auth.uid() then
    select assigned_to into v_eigenaar from public.leads where id = v_log.lead_id;
  end if;
  perform set_config('leadgen.systeem', '1', true);
  update public.leads set
    status = coalesce(nullif(p_lead->>'status', ''), status),
    next_contact_date = nullif(p_lead->>'next_contact_date', '')::timestamptz,
    notes = p_lead->>'notes',
    assigned_to = v_eigenaar,
    contact_attempts = coalesce((p_lead->>'contact_attempts')::int, 0),
    geen_gehoor_reeks = coalesce((p_lead->>'geen_gehoor_reeks')::int, 0),
    overgenomen_van = nullif(p_lead->>'overgenomen_van', '')::uuid,
    overgenomen_op = nullif(p_lead->>'overgenomen_op', '')::timestamptz,
    locked_by = auth.uid(), locked_at = now(), call_status = 'calling', updated_at = now()
  where id = v_log.lead_id;
  delete from public.call_logs where id = p_call_log;
  perform set_config('leadgen.systeem', '', true);
  return true;
end $$;
revoke all on function public.afboeking_terugdraaien(uuid, jsonb) from public, anon;
grant execute on function public.afboeking_terugdraaien(uuid, jsonb) to authenticated;
