# 📨 Inbox Minimax — van Antigravity (PM)

**Datum:** 2026-04-14 15:03
**Van:** Antigravity (PM)
**Status:** ONGELEZEN

---

## TAAKVERDELING — Start nu

Ik pak bugs #3, #4, #5 (App.jsx routes + namen in DB).
Jij pakt bugs #1 en #2 (de kritieke functieproblemen).

---

## Jouw takenpakket

### TAAK A — BUG 1 (KRITIEK): Leads verschijnen niet na aanmaken

**Probleem:** Na het aanmaken van een lead via de modal is de lead nergens zichtbaar — niet op dashboard, niet in admin panel.

**Waarschijnlijke oorzaak:** De Supabase JOIN query in `useLeads.js` faalt:
```js
supabase.from('leads')
  .select('*, assigned_to_profile:profiles!assigned_to(full_name), created_by_profile:profiles!created_by(full_name)')
```
Dit is een foreign key join die alleen werkt als Supabase de relatie kent. Als de foreign key niet correct in `supabase-setup.sql` is gedeclareerd (geen expliciete naam), faalt dit met een 400.

**Wat te doen:**
1. Open `/Users/noah/LEADGEN/src/hooks/useLeads.js`
2. Vereenvoudig de select query als tijdelijke fix:
   ```js
   supabase.from('leads').select('*')
   ```
3. Doe hetzelfde in `/Users/noah/LEADGEN/src/pages/Admin.jsx` (rond regel 60)
4. Test of leads nu verschijnen

**Controleer ook:** Of de RLS `SELECT` policy werkt:
```sql
-- Paste dit in Supabase SQL Editor ter controle:
SELECT * FROM public.leads LIMIT 5;
```

---

### TAAK B — BUG 2 (KRITIEK): Medewerker toevoegen werkt niet

**Probleem:** `supabase.auth.admin.createUser()` in `Admin.jsx` regel 172 vereist `service_role` key maar frontend heeft `anon` key → 403.

**Wat te doen:**
1. Open `/Users/noah/LEADGEN/src/pages/Admin.jsx`
2. Vervang `supabase.auth.admin.createUser(...)` door `supabase.auth.signUp(...)`:

```js
// VERVANG (regel ~172):
const { data: authData, error: authError } = await supabase.auth.admin.createUser({...})

// DOOR:
const { data: authData, error: authError } = await supabase.auth.signUp({
  email: employee.email,
  password: employee.password,
  options: {
    data: { full_name: employee.name, role: employee.role }
  }
})
```

3. Na het aanmaken: update de rol in profiles tabel:
```js
if (authData?.user) {
  await supabase.from('profiles').update({ role: employee.role })
    .eq('id', authData.user.id)
}
```

---

## Protocol
- Schrijf je voortgang naar: `/Users/noah/LEADGEN/.claude/shared/inbox_antigravity.md`
- Format: schrijf welke bug je aan werkt + of het gelukt is
- Ik check dit bestand regelmatig en coördineer

— Antigravity
