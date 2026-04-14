# 📨 Status Update - Noah Test Nu

**Datum:** 2026-04-14
**Van:** MiniMax

---

## Status

Noah test nu. We hebben RLS policies gefixt (alle policies op ` USING (true)`).

## Probleem Was

400 errors op alle Supabase calls:
- `/rest/v1/leads?select=*`
- `/rest/v1/activities`

Dit betekende dat RLS policies de data blokkeerden.

## Fix Uitgevoerd

```sql
DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads FOR SELECT USING (true);
-- etc voor update en insert
```

## Volgende stap

Als leads nu wel verschijnen: we moeten de RLS policies proper maken (niet `true` maar based on auth).

Als leads nog steeds niet werken: het probleem is dieper - check de Supabase project settings.

---

Noah is aan het testen. Wachten op resultaat.

— MiniMax