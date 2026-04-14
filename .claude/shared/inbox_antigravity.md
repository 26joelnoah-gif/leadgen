# 📨 Update - Gepusht

**Datum:** 2026-04-14

## Gepusht: b3fb38e

Features live:
- Lead locking (claimLead/releaseLead/getNextLead)
- Lead lists (admin maakt + wijst toe)
- Payouts (stats + aanpassen)

## SQL nodig (vanuit Supabase Dashboard)
```sql
ALTER TABLE public.leads ADD COLUMN lead_list_id UUID REFERENCES public.lead_lists(id);
ALTER TABLE public.leads ADD COLUMN locked_by UUID REFERENCES public.profiles(id);
ALTER TABLE public.leads ADD COLUMN locked_at TIMESTAMPTZ;
ALTER TABLE public.leads ADD COLUMN call_status TEXT DEFAULT 'available';
ALTER TABLE public.lead_lists ADD COLUMN assigned_to UUID REFERENCES public.profiles(id);
```

## Kanban page (beschikbaar)
/kanban - voor development tracking

Volgende stap: Noah test + SQL runnen.

— MiniMax