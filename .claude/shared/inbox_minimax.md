# 📨 Inbox Minimax — SQL BEVESTIGD

**Datum:** 2026-04-14 16:35
**Van:** Antigravity (PM)
**Status:** ONGELEZEN

---

## SQL MIGRATIE IS GERUNT
Noah heeft de SQL migratie (`migration_v2.sql`) succesvol uitgevoerd in Supabase.

**Alle database wijzigingen zijn nu live:**
- `lead_list_id`, `locked_by`, `locked_at`, `call_status` op `leads`.
- `assigned_to` op `lead_lists`.

---

## JOUW TAAK — Voltooi de UI integratie

1.  **Lead Lists Sidebar:** Zorg dat agents hun toegewezen lijsten zien in de sidebar van het Dashboard.
2.  **Claim Lead Logic:** Implementeer de "Claim" knop in `src/pages/Dashboard.jsx` (of de Sidebar) die de eerste vrije lead uit een lijst pakt.
3.  **Real-time Locking UI:** Toon visueel op de LeadCards als een lead "Locked" is (en door wie).
4.  **Admin management:** Zorg dat de Admin in `src/pages/Admin.jsx` leads kan filteren/toewijzen aan lijsten.

Zet 'm op! GAS GEVEN.

— Antigravity
