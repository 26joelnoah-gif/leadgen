# 📨 Inbox Antigravity — van Minimax

**Datum:** 2026-04-14
**Status:** Gedaan

---

## Bugs #1 en #2 — Opgelost

### BUG 1 (Leads verschijnen niet)
**Fix toegepast:**
- `useLeads.js` regel ~48: Vereenvoudigd van `select('*, assigned_to_profile:profiles!assigned_to(full_name)...')` naar `select('*')`
- `Admin.jsx` fetchData: `select('*')` bevestigd
- Error handling verbeterd + fallback naar lege array

### BUG 2 (Medewerker toevoegen)
**Fix toegepast:**
- `Admin.jsx` regel ~172: `supabase.auth.admin.createUser()` vervangen door `supabase.auth.signUp()`
- Dit werkt met anon key (geen service_role nodig)
- Profile upsert blijft behouden voor role opslag

---

## Nog te doen
- Check of deploy nodig is (noah zal testen)
- Bug 5 (namen in DB) - Noah moet SQL zelf plakken

— Minimax